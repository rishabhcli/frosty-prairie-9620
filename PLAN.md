# ContactSafe Technical Plan

## 1. Acceptance statement

Build a deployed AWS agent workflow with CockroachDB-backed durable memory and transactional authorization. Under duplicate delivery and concurrent workers, one logical outreach action creates at most one approved outbox record; current consent and policy are rechecked in the same serializable transaction. The system must demonstrate distributed vector recall and at least one additional eligible CockroachDB agent capability under the current event rules.

## 2. Scope

### Must ship

- synthetic contact/consent/promise/attempt memory model;
- CockroachDB Serverless/Cloud deployment and migrations;
- append-only authoritative consent and promise provenance;
- distributed vector index for semantic memory retrieval;
- CockroachDB Managed MCP integration and/or reusable Agent Skill as required;
- Bedrock structured planning/summarization;
- deterministic policy engine;
- fenced contact lease, serializable authorization, transactional outbox;
- Lambda/SQS/EventBridge retry/recovery path;
- sandbox sender with provider-style idempotency;
- concurrency/failure evaluation and sub-three-minute demo;
- public open-source repository and live app.

### Deferred

- production CRM/ESP integration, legal policy packs, real customers, multi-channel voice/SMS, campaign UI, billing.

## 3. Repository layout

```text
apps/console/                    demo and audit UI
services/api/                   task/consent/promise endpoints
services/agent-worker/          recall, Bedrock plan, policy, authorization
services/outbox-worker/         sandbox delivery and recovery
packages/db/                    migrations, queries, retry transaction helper
packages/memory/                vector ingest/retrieval and citation assembly
packages/policy/                deterministic versioned authorization rules
packages/bedrock/               structured planning/summarization adapter
packages/contracts/             event/API/model schemas
skills/contact-safe/            reusable Agent Skill if selected
infra/                          AWS and Cockroach configuration templates
eval/                           race, fault, recall, policy scenarios
fixtures/                       synthetic contacts/memories/messages
docs/                           threat model, runbook, demo, submission
```

Use TypeScript strict mode, pnpm, AWS CDK/SAM or Terraform, CockroachDB migrations, Zod, Vitest, Playwright, and k6 or a controlled concurrency harness. Avoid an overlarge framework; transaction correctness lives in explicit queries.

## 4. Data schema

All tables include `tenant_id`. Representative schema:

```sql
CREATE TABLE consent_events (
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

CREATE TABLE contact_leases (
  tenant_id UUID NOT NULL,
  contact_id UUID NOT NULL,
  channel STRING NOT NULL,
  owner_id STRING NOT NULL,
  fencing_token INT8 NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, contact_id, channel)
);

CREATE TABLE transactional_outbox (
  tenant_id UUID NOT NULL,
  outbox_id UUID NOT NULL DEFAULT gen_random_uuid(),
  logical_action_key STRING NOT NULL,
  contact_id UUID NOT NULL,
  channel STRING NOT NULL,
  lease_fencing_token INT8 NOT NULL,
  policy_decision_id UUID NOT NULL,
  payload JSONB NOT NULL,
  state STRING NOT NULL,
  provider_idempotency_key STRING NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  UNIQUE (tenant_id, logical_action_key),
  PRIMARY KEY (tenant_id, outbox_id)
);
```

`promises` stores promised action/window/status/source quote/source event and optional vector. `memory_chunks` stores text summary, source type/ref, effective time, superseded flag, metadata, embedding vector, and checksum. `policy_decisions` stores inputs/fact IDs, rule version, outcome/reasons, plan hash, and timestamp. Addresses should be synthetic/encrypted in any non-demo system.

Use indexes for latest consent by contact/channel/effective time, due promises, recent attempts, outbox state, and vector similarity. Apply TTL only to derived/transient rows, never authoritative consent without a retention policy.

## 5. Authoritative memory vs semantic memory

Authoritative queries determine current consent, promise status, attempts/frequency, suppression, and lease. Vector search retrieves candidate context only. Every retrieved chunk carries a source reference and effective/superseded state; join it to authoritative tables before prompting.

Embedding text must be synthetic in the demo. Use Bedrock embeddings or a documented compatible model if permitted; pin dimension/model. CockroachDB vector index query uses tenant filter and top-k, then reranks/filters by recency, active promise, and source validity. Evaluation includes near-duplicate irrelevant memories.

## 6. Agent plan contract

Bedrock receives a bounded evidence packet with fact IDs and produces JSON:

```ts
type OutreachPlan = {
  intent: "follow_up" | "fulfill_promise" | "clarify" | "do_not_contact";
  channel: "email";
  citedFactIds: string[];
  proposedSubject: string;
  proposedBody: string;
  proposedNotBefore: string;
  uncertainties: string[];
};
```

The system prompt forbids invented facts and requires citations. Validate schema, citations, channel, content length, and unsafe claims. A deterministic fallback can produce a minimal template for the demo. Model output never determines consent or authorizes a send.

## 7. Policy engine

Pure, versioned rules evaluate:

- latest effective consent is granted for exact channel;
- no global/campaign suppression;
- within allowed local hours based on explicitly stored timezone/source;
- frequency cap across agents/campaigns;
- plan timing respects active promise;
- required cited facts exist and are current;
- no unresolved/contradictory consent;
- task/action is not already approved/completed;
- lease/action key can be acquired.

Return allow/block/review with reason codes and evidence IDs. The hackathon sender handles only `allow`; `review` requires visible human approval or remains unsent.

## 8. Serializable authorization transaction

Implement CockroachDB's recommended transaction retry loop. Inside one transaction:

1. Re-read latest consent and current policy-relevant attempts/promises.
2. Check existing outbox row by logical action key; return it idempotently if present.
3. Insert/update lease only if expired or already owned, incrementing fencing token.
4. Recompute/validate deterministic policy using transactional facts and prevalidated plan.
5. Insert immutable policy decision.
6. Insert outbox row with unique logical action key and fencing token.
7. Update agent task version/state.
8. Commit; publish/dispatch from outbox afterward.

Do not hold the transaction open across Bedrock or network calls. A consent event with an earlier effective time but later recorded time needs explicit precedence semantics. New revocation after commit cannot erase an already delivered message; queued outbox delivery should recheck current consent before sending and cancel if revoked.

## 9. Lease and fencing

Lease key is tenant/contact/channel (or stricter contact-wide policy). Acquisition uses database time, not Lambda clock. Every takeover increments `fencing_token`. Any update/delivery attempt must match current token and unexpired lease. Lease expiry permits recovery; stale workers fail cleanly.

The unique logical action key should be derived from tenant, contact, campaign/task, promise/action type, and policy-defined window—not the model's wording. Document collision/version behavior.

## 10. Transactional outbox and delivery semantics

Outbox workers claim rows with safe concurrent locking/update pattern, recheck consent/suppression, send through a sandbox provider with idempotency key, and record result. States: pending, claimed, delivered, canceled_policy, retryable, ambiguous, terminal_failed. Crashes:

- before commit: no action exists, task retries;
- after commit/before send: pending row recovers;
- during provider call: idempotency prevents duplicate if supported; otherwise mark ambiguous and do not blindly resend;
- after send/before record: retrieve provider status where possible.

Never state exactly-once external delivery more strongly than the provider contract permits.

## 11. AWS architecture

- API Gateway + Lambda for demo API/consent updates.
- SQS queues for agent tasks/outbox with DLQs; visibility timeouts exceed worker max.
- EventBridge optional for scheduled due promises.
- Bedrock for plan/summary and embeddings if chosen.
- Secrets Manager/Parameter Store for Cockroach and provider credentials.
- CloudWatch structured metrics/logs with redaction.
- Least-privilege IAM per function; reserved concurrency and cost alarms.

VPC/network choices must preserve Cockroach connectivity and cold-start performance. Provide local/test adapters for repeatable evaluation.

## 12. Managed MCP and Agent Skill

Demonstrate CockroachDB Managed MCP using a read-only/allowlisted connection to inspect a contact's memory/audit or let the agent retrieve structured context. Never expose arbitrary production SQL in the public UI. Record exact configuration and qualifying event feature.

If implementing Agent Skills, `skills/contact-safe/SKILL.md` describes retrieval, fact typing, policy-before-action, transaction flow, approvals, and failure semantics with scripts/tests. Confirm current event category requirements and clearly list which two-or-more qualifying CockroachDB features are satisfied.

## 13. Evaluation

### Concurrency

Run 1,000 simultaneous/retried attempts with identical logical action key and varied worker IDs. Assert one outbox/action decision, at most one sandbox provider delivery, valid fencing, and no stuck leases. Report transaction retries and p95 authorization latency.

### Fault injection

Kill at each boundary: planning, pre-transaction, post-commit, claimed outbox, provider response, record update. Test consent revocation before plan, during plan, after authorization/before delivery, and after delivery. Test duplicate SQS messages and expired/stale workers.

### Memory/policy

Labeled fixture of promises/revocations/irrelevant similarities. Report recall/precision@k, cited-fact validity, unsupported plan claims, consent/policy violation count, quiet-hours/frequency boundaries.

### Release gates

- one logical action under 1,000 race attempts;
- zero delivered sandbox messages after pre-delivery revocation;
- zero policy decisions authorized from vector memory alone;
- all plan fact citations resolve/current or plan is rejected;
- every fault case recovers or reaches explicit ambiguous/manual state;
- at least two current qualifying CockroachDB agent features are real and demonstrable;
- no actual non-consenting recipient is contacted.

## 14. Security and privacy

- Synthetic data and sandbox delivery only for public demo.
- Tenant filter/authorization in every query/tool; row-level tests.
- Encrypt addresses/connection strings and minimize message logging.
- Prompt-injection-resistant evidence assembly; memory text is untrusted data.
- Server-side schemas/policy/tool boundaries; Bedrock cannot call sender directly.
- IAM/DB least privilege, secret scanning, rotation runbook.
- Audit access and deletion/retention behavior; consent history retention is policy-controlled.
- Rate/cost limits and circuit breakers.

## 15. Milestones, demo, and risks

M0: Cockroach/AWS/Bedrock/feature spike and migrations. M1: seed consent/promise, vector recall, plan, single serializable outbox. M2: race-safe lease, retries, outbox recovery/revocation. M3: Managed MCP/Skill, console/audit, 1,000-race/fault evaluation. M4: public OSS repo/live app/<3-minute video/screenshots.

Demo target: race view (35s), Cockroach memory/promise recall (25s), one lease/outbox result (30s), consent revocation blocks stale retry (25s), crash/recovery (25s), feature architecture/evaluation/limits (25s).

Risks: provider exactly-once gap → sandbox idempotency and ambiguous state; transaction contention → short transactions/recommended retries; vector staleness → authoritative joins; AWS/Cockroach demo outage → recorded real run/replay clearly labeled; scope → cut multi-channel/UI breadth before consent, transaction, outbox, qualifying features, and evaluation.

## 16. Actual completion status (updated 2026-07-29)

Recorded here rather than editing the sections above, so the original spec stays intact for
comparison against what shipped.

**Implemented and verified (real, running, tested):**
- `packages/contracts`, `packages/db` (CockroachDB schema/migrations, serializable-retry
  helper), `packages/policy` (17 boundary tests), `packages/memory` (real distributed vector
  index queries), `packages/bedrock` (fixture + live-adapter interface).
- `services/api`, `services/agent-worker` (recall → plan → policy → transaction), `services/
  outbox-worker` (crash-safe sandbox delivery) — all with integration tests against live
  CockroachDB, including the exact race/idempotency/consent/crash-recovery scenarios M1–M2
  describe.
- `apps/console` — the judge-facing audit UI (M3), keyboard-operable, axe-clean at every
  reachable state, responsive to mobile.
- `eval/` — 1,000-race, 6-scenario fault-injection, and memory/citation evaluation harnesses,
  all run against real CockroachDB with committed JSON reports (M3). The latest release-gate
  run used the managed CockroachDB Cloud cluster.
- CockroachDB Cloud Basic cluster `contactsafe`, provisioned and verified with the official
  `ccloud` CLI v0.8.23. Distributed Vector Indexing and `ccloud` are the two qualifying
  CockroachDB tools demonstrated by this release.
- AWS Lambda public judge console/API, AWS Secrets Manager database configuration, S3
  commit-addressed bundles, and CloudFormation deployment under `infra/aws/` (M4). The live
  Function URL is recorded in `README.md`.
- Full demo package (M4): Remotion video, real Qwen3-TTS narration, original music, captions,
  screenshots, thumbnail — see `demo/README.md` and `docs/BUILD_EVIDENCE.md`.

**Deferred exactly as planned in §2 "Deferred":** production CRM/ESP integration, legal policy
packs, real customers, multi-channel voice/SMS, campaign UI, billing. None of these were
started; none are implied as done anywhere in this repository.

**Cloud/live boundary:**
- CockroachDB Cloud, Distributed Vector Indexing, the `ccloud` CLI, AWS Lambda, Secrets
  Manager, S3, and CloudFormation are live and were exercised on 2026-07-29.
- Bedrock remains fixture-backed (`BEDROCK_MODE=fixture`). The real `ConverseCommand` adapter
  is implemented and unit-tested, but `bedrock:ListFoundationModels` is explicitly denied by
  this AWS organization's service control policy even for the account root. No live Bedrock
  output is claimed or counted.
- CockroachDB Managed MCP is not used or claimed. It is unnecessary for the event minimum
  because the working release demonstrates both Distributed Vector Indexing and the official
  `ccloud` CLI.

Full production-vs-fixture matrix, and the exact one-line change needed to flip each fixture
to live: [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md).
