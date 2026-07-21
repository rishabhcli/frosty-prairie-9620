import type { Pool } from "pg";
import { withSerializableRetry } from "@contactsafe/db";

const STALE_CLAIM_SECONDS = 5;

export type ClaimResult =
  | { kind: "empty" }
  | { kind: "canceled_policy"; outboxId: string }
  | {
      kind: "claimed";
      outboxId: string;
      contactId: string;
      channel: string;
      payload: unknown;
      providerIdempotencyKey: string;
    };

export type DeliveryOutcome =
  | { kind: "empty" }
  | { kind: "canceled_policy"; outboxId: string }
  | { kind: "delivered"; outboxId: string; alreadySent: boolean };

/**
 * Claims the next pending/retryable row (or a stale 'claimed' row left behind by a crashed
 * worker), rechecking consent authoritatively before claiming -- a revocation that arrives
 * after authorization still cancels a queued send (PLAN.md section 10).
 */
export async function claimNextOutboxRow(pool: Pool, tenantId: string): Promise<ClaimResult> {
  return withSerializableRetry(pool, async (client) => {
    const { rows } = await client.query(
      `SELECT outbox_id, contact_id, channel, payload, provider_idempotency_key
       FROM transactional_outbox
       WHERE tenant_id = $1
         AND (state IN ('pending', 'retryable')
              OR (state = 'claimed' AND claimed_at < now() - interval '${STALE_CLAIM_SECONDS} seconds'))
       ORDER BY created_at ASC
       LIMIT 1
       FOR UPDATE`,
      [tenantId]
    );
    if (rows.length === 0) return { kind: "empty" };
    const row = rows[0] as {
      outbox_id: string;
      contact_id: string;
      channel: string;
      payload: unknown;
      provider_idempotency_key: string;
    };

    const { rows: consentRows } = await client.query(
      `SELECT status FROM consent_events WHERE tenant_id = $1 AND contact_id = $2 AND channel = $3
       ORDER BY effective_at DESC LIMIT 1`,
      [tenantId, row.contact_id, row.channel]
    );
    const consentGranted = consentRows.length > 0 && consentRows[0].status === "granted";

    if (!consentGranted) {
      await client.query(
        `UPDATE transactional_outbox SET state = 'canceled_policy' WHERE tenant_id = $1 AND outbox_id = $2`,
        [tenantId, row.outbox_id]
      );
      return { kind: "canceled_policy", outboxId: row.outbox_id };
    }

    await client.query(
      `UPDATE transactional_outbox SET state = 'claimed', claimed_at = now() WHERE tenant_id = $1 AND outbox_id = $2`,
      [tenantId, row.outbox_id]
    );
    return {
      kind: "claimed",
      outboxId: row.outbox_id,
      contactId: row.contact_id,
      channel: row.channel,
      payload: row.payload,
      providerIdempotencyKey: row.provider_idempotency_key,
    };
  });
}

/**
 * Idempotent sandbox "send" -- a single INSERT ... ON CONFLICT DO NOTHING keyed by the
 * provider idempotency key, so resuming a crashed delivery can never send twice.
 */
export async function sandboxSend(
  pool: Pool,
  tenantId: string,
  outboxId: string,
  providerIdempotencyKey: string,
  payload: unknown
): Promise<{ alreadySent: boolean }> {
  const result = await pool.query(
    `INSERT INTO sandbox_deliveries (tenant_id, provider_idempotency_key, outbox_id, delivered_payload)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant_id, provider_idempotency_key) DO NOTHING`,
    [tenantId, providerIdempotencyKey, outboxId, JSON.stringify(payload)]
  );
  return { alreadySent: result.rowCount === 0 };
}

export async function markDelivered(pool: Pool, tenantId: string, outboxId: string): Promise<void> {
  await pool.query(
    `UPDATE transactional_outbox SET state = 'delivered', delivered_at = now() WHERE tenant_id = $1 AND outbox_id = $2`,
    [tenantId, outboxId]
  );
}

export async function claimAndDeliverOne(pool: Pool, tenantId: string): Promise<DeliveryOutcome> {
  const claim = await claimNextOutboxRow(pool, tenantId);
  if (claim.kind !== "claimed") return claim;

  const sendResult = await sandboxSend(pool, tenantId, claim.outboxId, claim.providerIdempotencyKey, claim.payload);
  await markDelivered(pool, tenantId, claim.outboxId);
  return { kind: "delivered", outboxId: claim.outboxId, alreadySent: sendResult.alreadySent };
}
