import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { runMigrations, reset, withSerializableRetry } from "@contactsafe/db";
import { runAgentAttempt, tryAcquireLease } from "@contactsafe/agent-worker";
import { claimAndDeliverOne, sandboxSend } from "@contactsafe/outbox-worker";
import { FixtureOutreachPlanner } from "@contactsafe/bedrock";
import { EVAL_TENANT_ID, createFixtureContact, createAgentTaskFor } from "../lib/fixtureContact.js";
import { writeReport } from "../lib/report.js";

interface ScenarioResult {
  name: string;
  recovered: boolean;
  detail: string;
}

/**
 * claimAndDeliverOne() is a tenant-wide queue drain (the oldest pending/claimed row wins,
 * regardless of which contact it belongs to) -- that's the correct, realistic behavior for
 * a real outbox worker. Fault scenarios that create outbox rows must therefore drain the
 * queue fully between steps, or they can end up processing a different scenario's row.
 */
async function drainOutboxQueue(pool: Pool): Promise<Awaited<ReturnType<typeof claimAndDeliverOne>>[]> {
  const outcomes: Awaited<ReturnType<typeof claimAndDeliverOne>>[] = [];
  for (;;) {
    const outcome = await claimAndDeliverOne(pool, EVAL_TENANT_ID);
    if (outcome.kind === "empty") break;
    outcomes.push(outcome);
  }
  return outcomes;
}

async function run(pool: Pool, planner: FixtureOutreachPlanner): Promise<ScenarioResult[]> {
  const results: ScenarioResult[] = [];

  // 1. Duplicate/retried authorization request for the same task (simulates a duplicate
  // SQS delivery): the second attempt must not create a second outbox row.
  {
    const { contactId } = await createFixtureContact(pool, { namePrefix: "fault-dup" });
    const taskId = await createAgentTaskFor(pool, contactId);
    const first = await runAgentAttempt({ pool, tenantId: EVAL_TENANT_ID, contactId, taskId, workerId: "w1", planner });
    const retry = await runAgentAttempt({ pool, tenantId: EVAL_TENANT_ID, contactId, taskId, workerId: "w1", planner });
    const { rows } = await pool.query(
      `SELECT outbox_id FROM transactional_outbox WHERE tenant_id = $1 AND contact_id = $2`,
      [EVAL_TENANT_ID, contactId]
    );
    const recovered = first.kind === "authorized" && retry.kind === "idempotent_replay" && rows.length === 1;
    results.push({
      name: "duplicate_sqs_message_idempotent_replay",
      recovered,
      detail: `first=${first.kind} retry=${retry.kind} outboxRows=${rows.length}`,
    });
  }

  // 2. Consent revoked before planning even starts: the attempt must block, not authorize.
  {
    const { contactId } = await createFixtureContact(pool, { namePrefix: "fault-revoke-before", consent: "revoked" });
    const taskId = await createAgentTaskFor(pool, contactId);
    const outcome = await runAgentAttempt({ pool, tenantId: EVAL_TENANT_ID, contactId, taskId, workerId: "w1", planner });
    const recovered = outcome.kind === "blocked" && outcome.reasonCodes.includes("consent_revoked");
    results.push({
      name: "consent_revoked_before_plan",
      recovered,
      detail: `outcome=${outcome.kind}${outcome.kind === "blocked" ? ` reasons=${outcome.reasonCodes.join(",")}` : ""}`,
    });
  }

  // 3. Consent revoked after authorization but before delivery: the outbox worker must
  // cancel the pending send rather than deliver it. Drain any earlier scenario's leftover
  // queued rows first so this scenario's own row is unambiguously the one under test.
  {
    await drainOutboxQueue(pool);
    const { contactId } = await createFixtureContact(pool, { namePrefix: "fault-revoke-after" });
    const taskId = await createAgentTaskFor(pool, contactId);
    const authorized = await runAgentAttempt({ pool, tenantId: EVAL_TENANT_ID, contactId, taskId, workerId: "w1", planner });
    const outboxId = authorized.kind === "authorized" ? authorized.outboxId : null;
    await pool.query(
      `INSERT INTO consent_events (tenant_id, contact_id, channel, status, effective_at, source_type, source_ref, actor)
       VALUES ($1, $2, 'email', 'revoked', now(), 'eval_fixture', $3, 'eval-harness')`,
      [EVAL_TENANT_ID, contactId, `eval:consent:revoke:${contactId}`]
    );
    await drainOutboxQueue(pool);
    const { rows: outboxRows } = await pool.query(`SELECT state FROM transactional_outbox WHERE outbox_id = $1`, [
      outboxId,
    ]);
    const { rows: deliveries } = await pool.query(`SELECT * FROM sandbox_deliveries WHERE outbox_id = $1`, [
      outboxId,
    ]);
    const recovered =
      authorized.kind === "authorized" && outboxRows[0]?.state === "canceled_policy" && deliveries.length === 0;
    results.push({
      name: "consent_revoked_after_authorization_before_delivery",
      recovered,
      detail: `authorized=${authorized.kind} finalState=${outboxRows[0]?.state} sandboxDeliveries=${deliveries.length}`,
    });
  }

  // 4. Expired/stale lease: a new owner must be able to take over with an incremented
  // fencing token once the previous lease has expired.
  {
    const { contactId } = await createFixtureContact(pool, { namePrefix: "fault-stale-lease" });
    await withSerializableRetry(pool, (client) => tryAcquireLease(client, EVAL_TENANT_ID, contactId, "email", "stale-worker"));
    await pool.query(
      `UPDATE contact_leases SET expires_at = now() - interval '1 second' WHERE tenant_id = $1 AND contact_id = $2`,
      [EVAL_TENANT_ID, contactId]
    );
    const takeover = await withSerializableRetry(pool, (client) =>
      tryAcquireLease(client, EVAL_TENANT_ID, contactId, "email", "fresh-worker")
    );
    const recovered = takeover.leaseAvailable === true && takeover.fencingToken === 2;
    results.push({
      name: "expired_stale_lease_takeover",
      recovered,
      detail: `fencingToken=${takeover.fencingToken} leaseAvailable=${takeover.leaseAvailable}`,
    });
  }

  // 5. Crashed outbox worker: a row left in 'claimed' state (worker died between claim and
  // send) must resume to delivered exactly once on the next poll, never duplicating the send.
  // Drain first so this staged row is unambiguously the only claimable work in the tenant.
  {
    await drainOutboxQueue(pool);
    const { contactId } = await createFixtureContact(pool, { namePrefix: "fault-crash-claimed" });
    const outboxId = randomUUID();
    const policyDecisionId = randomUUID();
    const logicalActionKey = `crash-test:${outboxId}`;
    await pool.query(
      `INSERT INTO policy_decisions (tenant_id, policy_decision_id, contact_id, rule_version, outcome, reason_codes, evidence_fact_ids, plan_hash)
       VALUES ($1, $2, $3, 'policy-v1', 'allow', ARRAY['ok'], ARRAY[]::STRING[], 'test-hash')`,
      [EVAL_TENANT_ID, policyDecisionId, contactId]
    );
    await pool.query(
      `INSERT INTO transactional_outbox
         (tenant_id, outbox_id, logical_action_key, contact_id, channel, lease_fencing_token, policy_decision_id, payload, state, provider_idempotency_key, claimed_at)
       VALUES ($1, $2, $3, $4, 'email', 1, $5, $6, 'claimed', $7, $8)`,
      [
        EVAL_TENANT_ID,
        outboxId,
        logicalActionKey,
        contactId,
        policyDecisionId,
        JSON.stringify({ subject: "crash test" }),
        logicalActionKey,
        new Date(Date.now() - 10_000).toISOString(),
      ]
    );
    const resumed = await claimAndDeliverOne(pool, EVAL_TENANT_ID);
    const second = await claimAndDeliverOne(pool, EVAL_TENANT_ID);
    const { rows: deliveries } = await pool.query(
      `SELECT * FROM sandbox_deliveries WHERE tenant_id = $1 AND outbox_id = $2`,
      [EVAL_TENANT_ID, outboxId]
    );
    const recovered =
      resumed.kind === "delivered" &&
      "alreadySent" in resumed &&
      resumed.alreadySent === false &&
      second.kind === "empty" &&
      deliveries.length === 1;
    results.push({
      name: "crashed_outbox_worker_resumes_exactly_once",
      recovered,
      detail: `resumed=${resumed.kind} second=${second.kind} sandboxDeliveries=${deliveries.length}`,
    });
  }

  // 6. Idempotent sandbox send retried directly (simulates a crash between send and
  // record-update): must never produce a second delivery record for the same key.
  {
    const outboxId = randomUUID();
    const key = `retry-key:${outboxId}`;
    const first = await sandboxSend(pool, EVAL_TENANT_ID, outboxId, key, { subject: "retry test" });
    const retry = await sandboxSend(pool, EVAL_TENANT_ID, outboxId, key, { subject: "retry test" });
    const { rows } = await pool.query(
      `SELECT * FROM sandbox_deliveries WHERE tenant_id = $1 AND provider_idempotency_key = $2`,
      [EVAL_TENANT_ID, key]
    );
    const recovered = first.alreadySent === false && retry.alreadySent === true && rows.length === 1;
    results.push({
      name: "post_send_crash_idempotent_retry",
      recovered,
      detail: `first.alreadySent=${first.alreadySent} retry.alreadySent=${retry.alreadySent} rows=${rows.length}`,
    });
  }

  return results;
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  await runMigrations(pool);
  await reset(pool);
  const planner = new FixtureOutreachPlanner();

  console.log("[eval:faults] running fault-injection scenarios...");
  const scenarios = await run(pool, planner);
  const allRecovered = scenarios.every((s) => s.recovered);

  const report = { scenarios, allRecovered };
  const path = await writeReport("faults.json", report);
  console.log(`[eval:faults] wrote ${path}`);
  for (const s of scenarios) {
    console.log(`  ${s.recovered ? "PASS" : "FAIL"} ${s.name} -- ${s.detail}`);
  }

  if (!allRecovered) {
    console.error("[eval:faults] RELEASE GATE FAILED: not every fault case recovered");
    process.exitCode = 1;
  } else {
    console.log("[eval:faults] release gate passed: every fault case recovered");
  }

  await pool.end();
}

main().catch((err) => {
  console.error("[eval:faults] fatal", err);
  process.exit(1);
});
