import { randomUUID, createHash } from "node:crypto";
import type { Pool } from "pg";
import { withSerializableRetry } from "@contactsafe/db";
import { evaluatePolicy, type PolicyEvaluationInput } from "@contactsafe/policy";
import type { OutreachPlanner } from "@contactsafe/bedrock";
import type { OutreachPlan, PolicyReasonCode } from "@contactsafe/contracts";
import { recallEvidence, buildEvidencePacket } from "./evidence.js";
import { computeAvailableFactIds } from "./facts.js";
import { tryAcquireLease, readOutboxByLogicalKey } from "./leaseAndOutbox.js";

const CHANNEL = "email" as const;
const FREQUENCY_CAP = { maxAttempts: 5, windowHours: 24 };

export type AgentAttemptOutcome =
  | { kind: "authorized"; outboxId: string; fencingToken: number; policyDecisionId: string; plan: OutreachPlan }
  | { kind: "idempotent_replay"; outboxId: string }
  | { kind: "blocked"; reasonCodes: PolicyReasonCode[]; policyDecisionId: string }
  | { kind: "review"; reasonCodes: PolicyReasonCode[]; policyDecisionId: string }
  | { kind: "conflict"; message: string };

export interface RunAgentAttemptParams {
  pool: Pool;
  tenantId: string;
  contactId: string;
  taskId: string;
  workerId: string;
  planner: OutreachPlanner;
  goal?: "follow_up" | "fulfill_promise" | "clarify";
}

function planHash(plan: OutreachPlan): string {
  return createHash("sha256").update(JSON.stringify(plan)).digest("hex").slice(0, 32);
}

function logicalActionKeyFor(tenantId: string, contactId: string, plan: OutreachPlan): string {
  const promiseId = plan.citedFactIds.find((id) => id.startsWith("promise:"))?.slice("promise:".length) ?? "no-promise";
  return `${tenantId}:${contactId}:${CHANNEL}:${plan.intent}:${promiseId}`;
}

export async function runAgentAttempt(params: RunAgentAttemptParams): Promise<AgentAttemptOutcome> {
  const { pool, tenantId, contactId, taskId, workerId, planner } = params;
  const goal = params.goal ?? "fulfill_promise";

  // Recall + plan happen outside the transaction (AGENTS.md: network/model calls never
  // occur inside the CockroachDB authorization transaction).
  const recalled = await recallEvidence(pool, { tenantId, contactId });
  const evidence = await buildEvidencePacket(pool, { tenantId, contactId, recalled, goal });
  const plan = await planner.plan(evidence);
  const logicalActionKey = logicalActionKeyFor(tenantId, contactId, plan);

  return withSerializableRetry(pool, async (client) => {
    // 1. Re-read authoritative facts fresh, and lock the task row.
    const { rows: taskRows } = await client.query(
      `SELECT state FROM agent_tasks WHERE tenant_id = $1 AND task_id = $2 FOR UPDATE`,
      [tenantId, taskId]
    );
    const taskState = taskRows[0]?.state as string | undefined;

    const { rows: consentRows } = await client.query(
      `SELECT status, effective_at FROM consent_events
       WHERE tenant_id = $1 AND contact_id = $2 AND channel = $3 ORDER BY effective_at DESC LIMIT 1`,
      [tenantId, contactId, CHANNEL]
    );
    const consent = consentRows.length > 0
      ? { status: consentRows[0].status, effectiveAt: new Date(consentRows[0].effective_at) }
      : null;

    const citedPromiseId = plan.citedFactIds
      .find((id) => id.startsWith("promise:"))
      ?.slice("promise:".length);
    let activePromise: PolicyEvaluationInput["activePromise"] = null;
    if (citedPromiseId) {
      const { rows } = await client.query(
        `SELECT due_window_start, due_window_end, status FROM promises WHERE tenant_id = $1 AND promise_id = $2`,
        [tenantId, citedPromiseId]
      );
      if (rows.length > 0) {
        activePromise = {
          dueWindowStart: new Date(rows[0].due_window_start),
          dueWindowEnd: new Date(rows[0].due_window_end),
          status: rows[0].status,
        };
      }
    }

    const { rows: attemptRows } = await client.query(
      `SELECT attempted_at FROM contact_attempts WHERE tenant_id = $1 AND contact_id = $2 AND channel = $3`,
      [tenantId, contactId, CHANNEL]
    );
    const recentAttempts = attemptRows.map((r) => ({ attemptedAt: new Date(r.attempted_at) }));

    // 2. Idempotent replay: a duplicate/retried request for the same logical action.
    const existingOutbox = await readOutboxByLogicalKey(client, tenantId, logicalActionKey);
    if (existingOutbox) {
      return { kind: "idempotent_replay", outboxId: existingOutbox.outboxId };
    }

    // 3a. Preliminary policy check assuming the lease *would* be available. This decides
    // whether it's even worth contending for the lease: a revoked-consent or otherwise
    // policy-blocked attempt should report *why* it's blocked, not an incidental lease
    // conflict with whichever worker happens to reach the lease row first.
    const availableFactIds = await computeAvailableFactIds(client, tenantId, contactId, plan.citedFactIds);
    const taskAlreadyCompleted = taskState === "authorized" || taskState === "completed";
    const basePolicyInput: PolicyEvaluationInput = {
      now: new Date(),
      consent,
      campaignSuppressed: false,
      quietHours: null,
      recentAttempts,
      frequencyCap: FREQUENCY_CAP,
      activePromise,
      plan,
      availableFactIds,
      taskAlreadyCompleted,
      leaseAvailable: true,
    };
    const preliminaryResult = evaluatePolicy(basePolicyInput);

    await client.query(
      `INSERT INTO contact_attempts (tenant_id, contact_id, channel, campaign_id, worker_id)
       VALUES ($1, $2, $3, 'default', $4)`,
      [tenantId, contactId, CHANNEL, workerId]
    );

    if (preliminaryResult.outcome !== "allow") {
      const policyDecisionId = randomUUID();
      await client.query(
        `INSERT INTO policy_decisions
           (tenant_id, policy_decision_id, contact_id, rule_version, outcome, reason_codes, evidence_fact_ids, plan_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          tenantId,
          policyDecisionId,
          contactId,
          preliminaryResult.ruleVersion,
          preliminaryResult.outcome,
          preliminaryResult.reasonCodes,
          plan.citedFactIds,
          planHash(plan),
        ]
      );
      await client.query(
        `UPDATE agent_tasks SET state = $1, version = version + 1, updated_at = now(), worker_id = $2
         WHERE tenant_id = $3 AND task_id = $4`,
        [preliminaryResult.outcome === "block" ? "blocked" : "claimed", workerId, tenantId, taskId]
      );
      return preliminaryResult.outcome === "block"
        ? { kind: "blocked", reasonCodes: preliminaryResult.reasonCodes, policyDecisionId }
        : { kind: "review", reasonCodes: preliminaryResult.reasonCodes, policyDecisionId };
    }

    // 3b. Everything else checks out -- now contend for the lease, the coordination
    // point two racing workers actually fight over.
    const { fencingToken, leaseAvailable } = await tryAcquireLease(client, tenantId, contactId, CHANNEL, workerId);
    if (!leaseAvailable) {
      return { kind: "conflict", message: `contact lease for ${contactId} is held by another worker` };
    }

    // 4. Final policy decision (identical to the preliminary one since leaseAvailable was
    // already assumed true and just got confirmed) is what gets persisted as authoritative.
    const policyResult = preliminaryResult;

    // 5. Insert the immutable policy decision.
    const policyDecisionId = randomUUID();
    await client.query(
      `INSERT INTO policy_decisions
         (tenant_id, policy_decision_id, contact_id, rule_version, outcome, reason_codes, evidence_fact_ids, plan_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        tenantId,
        policyDecisionId,
        contactId,
        policyResult.ruleVersion,
        policyResult.outcome,
        policyResult.reasonCodes,
        plan.citedFactIds,
        planHash(plan),
      ]
    );

    // 6. Insert the outbox row -- the one durable side effect this attempt is allowed to cause.
    const outboxId = randomUUID();
    await client.query(
      `INSERT INTO transactional_outbox
         (tenant_id, outbox_id, logical_action_key, contact_id, channel, lease_fencing_token,
          policy_decision_id, payload, state, provider_idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9)`,
      [
        tenantId,
        outboxId,
        logicalActionKey,
        contactId,
        CHANNEL,
        fencingToken,
        policyDecisionId,
        JSON.stringify(plan),
        logicalActionKey,
      ]
    );

    // 7. Update task state/version.
    await client.query(
      `UPDATE agent_tasks SET state = 'authorized', version = version + 1, updated_at = now(), worker_id = $1
       WHERE tenant_id = $2 AND task_id = $3`,
      [workerId, tenantId, taskId]
    );

    return { kind: "authorized", outboxId, fencingToken, policyDecisionId, plan };
  });
}
