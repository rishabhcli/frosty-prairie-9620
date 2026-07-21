import type { PoolClient } from "pg";

const LEASE_DURATION_SECONDS = 30;

export interface LeaseAcquisition {
  fencingToken: number;
  leaseAvailable: boolean;
}

/** Acquires or renews the (tenant, contact, channel) lease inside the caller's transaction. */
export async function tryAcquireLease(
  client: PoolClient,
  tenantId: string,
  contactId: string,
  channel: string,
  workerId: string
): Promise<LeaseAcquisition> {
  const { rows } = await client.query(
    `SELECT owner_id, fencing_token, expires_at FROM contact_leases
     WHERE tenant_id = $1 AND contact_id = $2 AND channel = $3 FOR UPDATE`,
    [tenantId, contactId, channel]
  );

  let fencingToken = 1;
  let leaseAvailable = true;

  if (rows.length > 0) {
    const existing = rows[0] as { owner_id: string; fencing_token: number; expires_at: string };
    const expired = new Date(existing.expires_at).getTime() < Date.now();
    if (expired || existing.owner_id === workerId) {
      fencingToken = existing.fencing_token + 1;
      leaseAvailable = true;
    } else {
      fencingToken = existing.fencing_token;
      leaseAvailable = false;
    }
  }

  if (leaseAvailable) {
    await client.query(
      `UPSERT INTO contact_leases (tenant_id, contact_id, channel, owner_id, fencing_token, expires_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, now() + interval '${LEASE_DURATION_SECONDS} seconds', now())`,
      [tenantId, contactId, channel, workerId, fencingToken]
    );
  }

  return { fencingToken, leaseAvailable };
}

export async function readOutboxByLogicalKey(
  client: PoolClient,
  tenantId: string,
  logicalActionKey: string
): Promise<{ outboxId: string } | null> {
  const { rows } = await client.query(
    `SELECT outbox_id FROM transactional_outbox WHERE tenant_id = $1 AND logical_action_key = $2`,
    [tenantId, logicalActionKey]
  );
  return rows.length > 0 ? { outboxId: rows[0].outbox_id } : null;
}
