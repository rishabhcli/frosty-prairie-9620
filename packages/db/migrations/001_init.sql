CREATE TABLE IF NOT EXISTS contacts (
  tenant_id UUID NOT NULL,
  contact_id UUID NOT NULL DEFAULT gen_random_uuid(),
  display_name STRING NOT NULL,
  email_address STRING NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, contact_id)
);

CREATE TABLE IF NOT EXISTS consent_events (
  tenant_id UUID NOT NULL,
  contact_id UUID NOT NULL,
  event_id UUID NOT NULL DEFAULT gen_random_uuid(),
  channel STRING NOT NULL,
  status STRING NOT NULL CHECK (status IN ('granted','revoked','unknown')),
  effective_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_type STRING NOT NULL,
  source_ref STRING NOT NULL,
  actor STRING NOT NULL,
  PRIMARY KEY (tenant_id, contact_id, event_id)
);
CREATE INDEX IF NOT EXISTS consent_latest_idx ON consent_events (tenant_id, contact_id, channel, effective_at DESC);

CREATE TABLE IF NOT EXISTS promises (
  tenant_id UUID NOT NULL,
  promise_id UUID NOT NULL DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL,
  owner STRING NOT NULL,
  promised_action STRING NOT NULL,
  due_window_start TIMESTAMPTZ NOT NULL,
  due_window_end TIMESTAMPTZ NOT NULL,
  status STRING NOT NULL CHECK (status IN ('open','fulfilled','expired','superseded')),
  source_quote STRING NOT NULL,
  source_event_ref STRING NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, promise_id)
);
CREATE INDEX IF NOT EXISTS promises_due_idx ON promises (tenant_id, contact_id, status, due_window_start);

CREATE TABLE IF NOT EXISTS contact_attempts (
  tenant_id UUID NOT NULL,
  attempt_id UUID NOT NULL DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL,
  channel STRING NOT NULL,
  campaign_id STRING NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  worker_id STRING NOT NULL,
  PRIMARY KEY (tenant_id, attempt_id)
);
CREATE INDEX IF NOT EXISTS attempts_recent_idx ON contact_attempts (tenant_id, contact_id, channel, attempted_at DESC);

CREATE TABLE IF NOT EXISTS policy_decisions (
  tenant_id UUID NOT NULL,
  policy_decision_id UUID NOT NULL DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL,
  rule_version STRING NOT NULL,
  outcome STRING NOT NULL CHECK (outcome IN ('allow','block','review')),
  reason_codes STRING[] NOT NULL,
  evidence_fact_ids STRING[] NOT NULL,
  plan_hash STRING NOT NULL,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, policy_decision_id)
);

CREATE TABLE IF NOT EXISTS contact_leases (
  tenant_id UUID NOT NULL,
  contact_id UUID NOT NULL,
  channel STRING NOT NULL,
  owner_id STRING NOT NULL,
  fencing_token INT8 NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, contact_id, channel)
);

CREATE TABLE IF NOT EXISTS agent_tasks (
  tenant_id UUID NOT NULL,
  task_id UUID NOT NULL DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL,
  task_type STRING NOT NULL,
  state STRING NOT NULL CHECK (state IN ('pending','claimed','authorized','blocked','completed','failed')),
  version INT8 NOT NULL DEFAULT 1,
  worker_id STRING,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, task_id)
);
CREATE INDEX IF NOT EXISTS tasks_pending_idx ON agent_tasks (tenant_id, state, created_at);

CREATE TABLE IF NOT EXISTS transactional_outbox (
  tenant_id UUID NOT NULL,
  outbox_id UUID NOT NULL DEFAULT gen_random_uuid(),
  logical_action_key STRING NOT NULL,
  contact_id UUID NOT NULL,
  channel STRING NOT NULL,
  lease_fencing_token INT8 NOT NULL,
  policy_decision_id UUID NOT NULL,
  payload JSONB NOT NULL,
  state STRING NOT NULL CHECK (state IN ('pending','claimed','delivered','canceled_policy','retryable','ambiguous','terminal_failed')),
  provider_idempotency_key STRING NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  UNIQUE (tenant_id, logical_action_key),
  PRIMARY KEY (tenant_id, outbox_id)
);
CREATE INDEX IF NOT EXISTS outbox_pending_idx ON transactional_outbox (tenant_id, state, created_at);
