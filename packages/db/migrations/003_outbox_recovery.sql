ALTER TABLE transactional_outbox ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

-- Idempotent sandbox delivery ledger: the outbox worker's "send" step is a single
-- INSERT ... ON CONFLICT DO NOTHING keyed by provider_idempotency_key, so a crash
-- between sending and recording delivery can never cause a second sandbox send.
CREATE TABLE IF NOT EXISTS sandbox_deliveries (
  tenant_id UUID NOT NULL,
  provider_idempotency_key STRING NOT NULL,
  outbox_id UUID NOT NULL,
  delivered_payload JSONB NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, provider_idempotency_key)
);
