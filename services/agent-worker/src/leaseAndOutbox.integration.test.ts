import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeEach } from "vitest";
import { createPool, runMigrations, reset, withSerializableRetry } from "@contactsafe/db";
import { DEMO_TENANT_ID } from "@contactsafe/contracts";
import { tryAcquireLease } from "./leaseAndOutbox.js";

const pool = createPool();

describe("tryAcquireLease", () => {
  beforeEach(async () => {
    await runMigrations(pool);
    await reset(pool);
  });

  it("grants a fresh lease with fencing_token 1 and lets the same owner renew it", async () => {
    const contactId = randomUUID();

    const first = await withSerializableRetry(pool, (client) =>
      tryAcquireLease(client, DEMO_TENANT_ID, contactId, "email", "worker-a")
    );
    expect(first).toEqual({ fencingToken: 1, leaseAvailable: true });

    const renewal = await withSerializableRetry(pool, (client) =>
      tryAcquireLease(client, DEMO_TENANT_ID, contactId, "email", "worker-a")
    );
    expect(renewal).toEqual({ fencingToken: 2, leaseAvailable: true });
  });

  it("refuses a different owner while the lease is held and unexpired", async () => {
    const contactId = randomUUID();

    await withSerializableRetry(pool, (client) => tryAcquireLease(client, DEMO_TENANT_ID, contactId, "email", "worker-a"));

    const conflicting = await withSerializableRetry(pool, (client) =>
      tryAcquireLease(client, DEMO_TENANT_ID, contactId, "email", "worker-b")
    );
    expect(conflicting.leaseAvailable).toBe(false);

    const { rows } = await pool.query(
      `SELECT owner_id, fencing_token FROM contact_leases WHERE tenant_id = $1 AND contact_id = $2`,
      [DEMO_TENANT_ID, contactId]
    );
    expect(rows[0].owner_id).toBe("worker-a");
    expect(rows[0].fencing_token).toBe(1);
  });

  it("grants an expired lease to a new owner with an incremented fencing token", async () => {
    const contactId = randomUUID();
    await withSerializableRetry(pool, (client) => tryAcquireLease(client, DEMO_TENANT_ID, contactId, "email", "worker-a"));
    // Force the lease into the past to simulate expiry without waiting 30s.
    await pool.query(
      `UPDATE contact_leases SET expires_at = now() - interval '1 second' WHERE tenant_id = $1 AND contact_id = $2`,
      [DEMO_TENANT_ID, contactId]
    );

    const takeover = await withSerializableRetry(pool, (client) =>
      tryAcquireLease(client, DEMO_TENANT_ID, contactId, "email", "worker-b")
    );
    expect(takeover).toEqual({ fencingToken: 2, leaseAvailable: true });
  });
});
