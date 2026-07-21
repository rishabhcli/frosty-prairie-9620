import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeEach } from "vitest";
import { createPool, runMigrations, reset } from "@contactsafe/db";
import { DEMO_TENANT_ID } from "@contactsafe/contracts";
import { FixtureOutreachPlanner } from "@contactsafe/bedrock";
import { createAgentTask } from "./tasks.js";
import { runAgentAttempt } from "./authorize.js";

const pool = createPool();
const planner = new FixtureOutreachPlanner();

async function seedContactWithPromise(contactId: string) {
  await pool.query(
    `INSERT INTO contacts (tenant_id, contact_id, display_name, email_address) VALUES ($1, $2, $3, $4)`,
    [DEMO_TENANT_ID, contactId, "Race Test Contact", "race-test@sandbox.contactsafe.invalid"]
  );
  await pool.query(
    `INSERT INTO consent_events (tenant_id, contact_id, channel, status, effective_at, source_type, source_ref, actor)
     VALUES ($1, $2, 'email', 'granted', now() - interval '1 day', 'test_seed', 'test:consent:1', 'test')`,
    [DEMO_TENANT_ID, contactId]
  );
  await pool.query(
    `INSERT INTO promises (tenant_id, contact_id, owner, promised_action, due_window_start, due_window_end, status, source_quote, source_event_ref)
     VALUES ($1, $2, 'agent-a', 'email_revised_quote', now(), now() + interval '2 days', 'open',
             'email the revised quote after Tuesday', 'test:promise:1')`,
    [DEMO_TENANT_ID, contactId]
  );
}

describe("runAgentAttempt", () => {
  beforeEach(async () => {
    await runMigrations(pool);
    await reset(pool);
  });

  it("authorizes exactly one of two workers racing the same task; the loser safely discovers the same result, never a duplicate", async () => {
    const contactId = randomUUID();
    await seedContactWithPromise(contactId);
    const { taskId } = await createAgentTask(pool, { tenantId: DEMO_TENANT_ID, contactId });

    const [resultA, resultB] = await Promise.all([
      runAgentAttempt({ pool, tenantId: DEMO_TENANT_ID, contactId, taskId, workerId: "agent-a", planner }),
      runAgentAttempt({ pool, tenantId: DEMO_TENANT_ID, contactId, taskId, workerId: "agent-b", planner }),
    ]);

    // Both workers target the identical logical action (same contact/intent/promise), so
    // the loser's retried transaction finds the winner's outbox row via the idempotency
    // check (readOutboxByLogicalKey) before it ever contends on the lease. Either way,
    // exactly one worker performs the real work and the other only ever observes it.
    const kinds = [resultA.kind, resultB.kind].sort();
    expect(kinds).toEqual(["authorized", "idempotent_replay"]);

    const winner = resultA.kind === "authorized" ? resultA : (resultB as Extract<typeof resultB, { kind: "authorized" }>);
    const loser = resultA.kind === "idempotent_replay" ? resultA : (resultB as Extract<typeof resultB, { kind: "idempotent_replay" }>);
    expect(loser.outboxId).toBe(winner.outboxId);

    const { rows: outboxRows } = await pool.query(
      `SELECT outbox_id FROM transactional_outbox WHERE tenant_id = $1 AND contact_id = $2`,
      [DEMO_TENANT_ID, contactId]
    );
    expect(outboxRows).toHaveLength(1);

    const { rows: leaseRows } = await pool.query(
      `SELECT fencing_token FROM contact_leases WHERE tenant_id = $1 AND contact_id = $2`,
      [DEMO_TENANT_ID, contactId]
    );
    expect(leaseRows).toHaveLength(1);
    expect(leaseRows[0].fencing_token).toBe(1);
  });

  it("blocks with consent_revoked when consent was revoked before the transaction runs", async () => {
    const contactId = randomUUID();
    await seedContactWithPromise(contactId);
    await pool.query(
      `INSERT INTO consent_events (tenant_id, contact_id, channel, status, effective_at, source_type, source_ref, actor)
       VALUES ($1, $2, 'email', 'revoked', now(), 'test_seed', 'test:consent:2', 'test')`,
      [DEMO_TENANT_ID, contactId]
    );
    const { taskId } = await createAgentTask(pool, { tenantId: DEMO_TENANT_ID, contactId });

    const result = await runAgentAttempt({
      pool,
      tenantId: DEMO_TENANT_ID,
      contactId,
      taskId,
      workerId: "agent-a",
      planner,
    });

    expect(result.kind).toBe("blocked");
    if (result.kind === "blocked") {
      expect(result.reasonCodes).toContain("consent_revoked");
    }
    const { rows: outboxRows } = await pool.query(
      `SELECT outbox_id FROM transactional_outbox WHERE tenant_id = $1 AND contact_id = $2`,
      [DEMO_TENANT_ID, contactId]
    );
    expect(outboxRows).toHaveLength(0);
  });

  it("returns an idempotent replay for a retried attempt against an already-authorized task", async () => {
    const contactId = randomUUID();
    await seedContactWithPromise(contactId);
    const { taskId } = await createAgentTask(pool, { tenantId: DEMO_TENANT_ID, contactId });

    const first = await runAgentAttempt({
      pool,
      tenantId: DEMO_TENANT_ID,
      contactId,
      taskId,
      workerId: "agent-a",
      planner,
    });
    expect(first.kind).toBe("authorized");

    const retry = await runAgentAttempt({
      pool,
      tenantId: DEMO_TENANT_ID,
      contactId,
      taskId,
      workerId: "agent-a",
      planner,
    });
    expect(retry.kind).toBe("idempotent_replay");
    if (retry.kind === "idempotent_replay" && first.kind === "authorized") {
      expect(retry.outboxId).toBe(first.outboxId);
    }

    const { rows: outboxRows } = await pool.query(
      `SELECT outbox_id FROM transactional_outbox WHERE tenant_id = $1 AND contact_id = $2`,
      [DEMO_TENANT_ID, contactId]
    );
    expect(outboxRows).toHaveLength(1);
  });
});
