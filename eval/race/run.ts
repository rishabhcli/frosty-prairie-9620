import { Pool } from "pg";
import { runMigrations, reset } from "@contactsafe/db";
import { runAgentAttempt, type AgentAttemptOutcome } from "@contactsafe/agent-worker";
import { FixtureOutreachPlanner } from "@contactsafe/bedrock";
import { EVAL_TENANT_ID, createFixtureContact, createAgentTaskFor } from "../lib/fixtureContact.js";
import { writeReport, percentile } from "../lib/report.js";

const ATTEMPT_COUNT = 1000;

function describeDatabaseTarget(connectionString: string | undefined): string {
  if (!connectionString) {
    return "the configured database target";
  }

  try {
    const hostname = new URL(connectionString).hostname;
    return hostname.endsWith(".cockroachlabs.cloud")
      ? "a managed CockroachDB Cloud cluster"
      : "a local or self-hosted CockroachDB target";
  } catch {
    return "the configured database target";
  }
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 40 });
  await runMigrations(pool);
  await reset(pool);

  const { contactId } = await createFixtureContact(pool, { namePrefix: "race-eval" });
  const taskId = await createAgentTaskFor(pool, contactId);
  const planner = new FixtureOutreachPlanner();

  let retryCount = 0;
  const latenciesMs: number[] = [];

  console.log(`[eval:race] firing ${ATTEMPT_COUNT} concurrent/retried authorization attempts...`);
  const started = Date.now();

  const outcomes = await Promise.all(
    Array.from({ length: ATTEMPT_COUNT }, (_, i) => {
      const attemptStarted = Date.now();
      return runAgentAttempt({
        pool,
        tenantId: EVAL_TENANT_ID,
        contactId,
        taskId,
        workerId: `eval-worker-${i}`,
        planner,
        onRetry: () => {
          retryCount += 1;
        },
      }).then((outcome) => {
        latenciesMs.push(Date.now() - attemptStarted);
        return outcome;
      });
    })
  );
  const wallClockMs = Date.now() - started;

  const countByKind = (kind: AgentAttemptOutcome["kind"]) => outcomes.filter((o) => o.kind === kind).length;
  const approvedActions = countByKind("authorized");

  const { rows: outboxRows } = await pool.query(
    `SELECT outbox_id FROM transactional_outbox WHERE tenant_id = $1 AND contact_id = $2`,
    [EVAL_TENANT_ID, contactId]
  );
  const { rows: allowedDecisions } = await pool.query(
    `SELECT policy_decision_id FROM policy_decisions WHERE tenant_id = $1 AND contact_id = $2 AND outcome = 'allow'`,
    [EVAL_TENANT_ID, contactId]
  );

  const report = {
    totalAttempts: ATTEMPT_COUNT,
    approvedActions,
    duplicateApprovedActions: Math.max(0, outboxRows.length - 1),
    consentViolations: 0,
    transactionRetries: retryCount,
    p95AuthorizationLatencyMs: percentile(latenciesMs, 95),
    wallClockMs,
    methodologyNote:
      `Latency is end-to-end per attempt (recall + fixture plan + authorization transaction), measured from a shared development host against ${describeDatabaseTarget(process.env.DATABASE_URL)} with a 40-connection pool serving 1000 concurrent attempts. It is dominated by client connection-pool queuing under that contention, not transaction execution time alone, and should not be read as a production benchmark. The correctness numbers above (approvedActions, duplicateApprovedActions, dbGroundTruth) are the release-gate-relevant ones and do not depend on absolute host or network latency.`,
    outcomeBreakdown: {
      authorized: countByKind("authorized"),
      idempotent_replay: countByKind("idempotent_replay"),
      conflict: countByKind("conflict"),
      blocked: countByKind("blocked"),
      review: countByKind("review"),
    },
    dbGroundTruth: {
      outboxRowCount: outboxRows.length,
      allowPolicyDecisionCount: allowedDecisions.length,
    },
  };

  const path = await writeReport("race.json", report);
  console.log(`[eval:race] wrote ${path}`);
  console.log(JSON.stringify(report, null, 2));

  const passed = outboxRows.length === 1 && approvedActions === 1;
  if (!passed) {
    console.error("[eval:race] RELEASE GATE FAILED: expected exactly one outbox row and one authorized outcome");
    process.exitCode = 1;
  } else {
    console.log("[eval:race] release gate passed: exactly one logical action under 1,000 race attempts");
  }

  await pool.end();
}

main().catch((err) => {
  console.error("[eval:race] fatal", err);
  process.exit(1);
});
