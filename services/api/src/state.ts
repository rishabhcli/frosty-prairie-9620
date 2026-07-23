import type { Pool } from "pg";

export async function getContactState(pool: Pool, tenantId: string, contactId: string) {
  const [contact, consent, promises, leases, outbox, policyDecisions, memory, attempts] = await Promise.all([
    pool.query(
      `SELECT display_name, email_address FROM contacts WHERE tenant_id = $1 AND contact_id = $2`,
      [tenantId, contactId]
    ),
    pool.query(
      `SELECT event_id, status, effective_at, recorded_at, source_type, source_ref, actor
       FROM consent_events WHERE tenant_id = $1 AND contact_id = $2 ORDER BY effective_at DESC`,
      [tenantId, contactId]
    ),
    pool.query(
      `SELECT promise_id, promised_action, due_window_start, due_window_end, status, source_quote
       FROM promises WHERE tenant_id = $1 AND contact_id = $2 ORDER BY created_at DESC`,
      [tenantId, contactId]
    ),
    pool.query(
      `SELECT channel, owner_id, fencing_token, expires_at, updated_at
       FROM contact_leases WHERE tenant_id = $1 AND contact_id = $2`,
      [tenantId, contactId]
    ),
    pool.query(
      `SELECT outbox_id, logical_action_key, channel, lease_fencing_token, policy_decision_id, payload, state,
              provider_idempotency_key, created_at, claimed_at, delivered_at
       FROM transactional_outbox WHERE tenant_id = $1 AND contact_id = $2 ORDER BY created_at DESC`,
      [tenantId, contactId]
    ),
    pool.query(
      `SELECT policy_decision_id, rule_version, outcome, reason_codes, evidence_fact_ids, plan_hash, decided_at
       FROM policy_decisions WHERE tenant_id = $1 AND contact_id = $2 ORDER BY decided_at DESC`,
      [tenantId, contactId]
    ),
    pool.query(
      `SELECT chunk_id, source_type, source_ref, text_summary, effective_at, superseded
       FROM memory_chunks WHERE tenant_id = $1 AND contact_id = $2 ORDER BY created_at DESC`,
      [tenantId, contactId]
    ),
    pool.query(
      `SELECT attempt_id, channel, campaign_id, attempted_at, worker_id
       FROM contact_attempts WHERE tenant_id = $1 AND contact_id = $2 ORDER BY attempted_at DESC`,
      [tenantId, contactId]
    ),
  ]);

  return {
    contact: contact.rows[0] ?? null,
    consentEvents: consent.rows,
    promises: promises.rows,
    leases: leases.rows,
    outbox: outbox.rows,
    policyDecisions: policyDecisions.rows,
    memoryChunks: memory.rows,
    attempts: attempts.rows,
  };
}
