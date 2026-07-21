import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeEach } from "vitest";
import { createPool, runMigrations, reset } from "@contactsafe/db";
import { DEMO_TENANT_ID } from "@contactsafe/contracts";
import { claimAndDeliverOne, sandboxSend } from "./deliver.js";

const pool = createPool();

async function seedContact(contactId: string, consentStatus: "granted" | "revoked") {
  await pool.query(
    `INSERT INTO contacts (tenant_id, contact_id, display_name, email_address) VALUES ($1, $2, $3, $4)`,
    [DEMO_TENANT_ID, contactId, "Outbox Test Contact", "outbox-test@sandbox.contactsafe.invalid"]
  );
  await pool.query(
    `INSERT INTO consent_events (tenant_id, contact_id, channel, status, effective_at, source_type, source_ref, actor)
     VALUES ($1, $2, 'email', $3, now(), 'test_seed', 'test:consent', 'test')`,
    [DEMO_TENANT_ID, contactId, consentStatus]
  );
}

async function seedOutboxRow(
  contactId: string,
  opts: { state?: string; claimedAt?: string; logicalActionKey?: string; providerIdempotencyKey?: string } = {}
): Promise<string> {
  const outboxId = randomUUID();
  const policyDecisionId = randomUUID();
  const logicalActionKey = opts.logicalActionKey ?? `key-${outboxId}`;
  await pool.query(
    `INSERT INTO policy_decisions
       (tenant_id, policy_decision_id, contact_id, rule_version, outcome, reason_codes, evidence_fact_ids, plan_hash)
     VALUES ($1, $2, $3, 'policy-v1', 'allow', ARRAY['ok'], ARRAY[]::STRING[], 'test-hash')`,
    [DEMO_TENANT_ID, policyDecisionId, contactId]
  );
  await pool.query(
    `INSERT INTO transactional_outbox
       (tenant_id, outbox_id, logical_action_key, contact_id, channel, lease_fencing_token,
        policy_decision_id, payload, state, provider_idempotency_key, claimed_at)
     VALUES ($1, $2, $3, $4, 'email', 1, $5, $6, $7, $8, $9)`,
    [
      DEMO_TENANT_ID,
      outboxId,
      logicalActionKey,
      contactId,
      policyDecisionId,
      JSON.stringify({ subject: "test" }),
      opts.state ?? "pending",
      opts.providerIdempotencyKey ?? logicalActionKey,
      opts.claimedAt ?? null,
    ]
  );
  return outboxId;
}

describe("claimAndDeliverOne", () => {
  beforeEach(async () => {
    await runMigrations(pool);
    await reset(pool);
  });

  it("delivers a pending row exactly once when consent is granted", async () => {
    const contactId = randomUUID();
    await seedContact(contactId, "granted");
    const outboxId = await seedOutboxRow(contactId);

    const outcome = await claimAndDeliverOne(pool, DEMO_TENANT_ID);
    expect(outcome).toEqual({ kind: "delivered", outboxId, alreadySent: false });

    const { rows } = await pool.query(`SELECT state, delivered_at FROM transactional_outbox WHERE outbox_id = $1`, [
      outboxId,
    ]);
    expect(rows[0].state).toBe("delivered");
    expect(rows[0].delivered_at).not.toBeNull();

    const { rows: deliveries } = await pool.query(`SELECT * FROM sandbox_deliveries WHERE outbox_id = $1`, [outboxId]);
    expect(deliveries).toHaveLength(1);
  });

  it("cancels a pending row instead of sending when consent has been revoked", async () => {
    const contactId = randomUUID();
    await seedContact(contactId, "revoked");
    const outboxId = await seedOutboxRow(contactId);

    const outcome = await claimAndDeliverOne(pool, DEMO_TENANT_ID);
    expect(outcome).toEqual({ kind: "canceled_policy", outboxId });

    const { rows } = await pool.query(`SELECT state FROM transactional_outbox WHERE outbox_id = $1`, [outboxId]);
    expect(rows[0].state).toBe("canceled_policy");

    const { rows: deliveries } = await pool.query(`SELECT * FROM sandbox_deliveries WHERE outbox_id = $1`, [outboxId]);
    expect(deliveries).toHaveLength(0);
  });

  it("resumes a stale claimed row left by a crashed worker and delivers it exactly once", async () => {
    const contactId = randomUUID();
    await seedContact(contactId, "granted");
    const outboxId = await seedOutboxRow(contactId, {
      state: "claimed",
      claimedAt: new Date(Date.now() - 10_000).toISOString(),
    });

    const outcome = await claimAndDeliverOne(pool, DEMO_TENANT_ID);
    expect(outcome).toEqual({ kind: "delivered", outboxId, alreadySent: false });

    const second = await claimAndDeliverOne(pool, DEMO_TENANT_ID);
    expect(second).toEqual({ kind: "empty" });

    const { rows: deliveries } = await pool.query(`SELECT * FROM sandbox_deliveries WHERE outbox_id = $1`, [outboxId]);
    expect(deliveries).toHaveLength(1);
  });

  it("does not resend when sandboxSend is retried with the same idempotency key", async () => {
    const contactId = randomUUID();
    await seedContact(contactId, "granted");
    const outboxId = randomUUID();
    const key = `retry-key-${outboxId}`;

    const first = await sandboxSend(pool, DEMO_TENANT_ID, outboxId, key, { subject: "test" });
    expect(first.alreadySent).toBe(false);

    const retry = await sandboxSend(pool, DEMO_TENANT_ID, outboxId, key, { subject: "test" });
    expect(retry.alreadySent).toBe(true);

    const { rows } = await pool.query(`SELECT * FROM sandbox_deliveries WHERE tenant_id = $1 AND provider_idempotency_key = $2`, [
      DEMO_TENANT_ID,
      key,
    ]);
    expect(rows).toHaveLength(1);
  });
});
