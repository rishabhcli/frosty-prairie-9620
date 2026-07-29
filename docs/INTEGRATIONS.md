# Integration matrix: production vs. fixture

The release is deployed on AWS Lambda and backed by CockroachDB Cloud. This matrix
distinguishes integrations that were actually exercised from adapters and future paths.
Configuration compatibility is never counted as sponsor usage.

| Capability | Interface | What actually runs in the release | Inactive or alternate path | Evidence / activation |
|---|---|---|---|---|
| Persistent agent memory | `packages/db` | CockroachDB Cloud Basic cluster `contactsafe`, full schema and idempotent migrations | Local Docker remains available for development | The public Lambda console reads/writes this cluster; the 2026-07-29 release gates also ran against it. |
| Distributed vector index | `packages/memory` | Real CockroachDB `VECTOR` columns and `VECTOR INDEX`, queried with `<->` on CockroachDB Cloud | Same schema works in local Docker | Qualifying tool 1. DDL: `packages/db/migrations/002_vector_index.sql`. |
| CockroachDB `ccloud` CLI | provisioning / verification | Official `ccloud` v0.8.23 authenticated to the Cloud organization; used to list the cluster, create `contactsafe_app`, create the `contactsafe` database, and verify SQL users, connection details, and the IP allowlist | Managed MCP and Agent Skills Repo were not needed | Qualifying tool 2. Cluster ID: `689a24df-4cca-4124-b68d-ea405e8c5f2b`. |
| Vector embeddings | `packages/memory/src/embed.ts` | Deterministic hash fixture (`embedText`); same text maps to the same unit vector. This is not a trained semantic model. | A trained embedding provider can implement the same `(text: string) => number[]` contract | The evaluation report labels this limitation and measures retrieval against authoritative validity, not topical semantics. |
| AWS deployment | `services/api/src/lambda.ts`, `infra/aws/` | AWS Lambda Node.js 22 serves the console and API; Secrets Manager supplies `DATABASE_URL`; S3 stores bundles; CloudFormation owns the stack and log retention | SQS/EventBridge triggers are a future scaling path | Working public URL: `https://6zg2vtgwt7ncw5bh6737cytl6y0nlysh.lambda-url.us-east-1.on.aws/`. |
| Bedrock planning/drafting | `packages/bedrock` | `FixtureOutreachPlanner`: deterministic, evidence-grounded, and limited to cited facts | `BedrockOutreachPlanner` uses `ConverseCommand` and the same validated `OutreachPlan` schema | Bedrock is explicitly denied by AWS Organizations SCP `p-srvmeg1f`; no live Bedrock output is claimed. |
| CockroachDB Managed MCP | no running adapter | Not run or claimed | Could be connected to the existing Cloud cluster later | Not required for this submission because Distributed Vector Indexing and `ccloud` satisfy the two-tool rule. |
| Outbound delivery | `services/outbox-worker/src/deliver.ts` | `sandboxSend()` — idempotent insert into `sandbox_deliveries`, no real recipient, ever | Real ESP/CRM provider call (e.g. SES, SendGrid) behind the same idempotency-key contract | Replace the body of `sandboxSend` with a real provider call, keeping the `INSERT ... ON CONFLICT DO NOTHING` idempotency ledger pattern (or the provider's own idempotency key). |
| Qwen3-TTS narration | `demo/scripts/narrate.py` | **Real** — `mlx-community/Qwen3-TTS-12Hz-1.7B-Base-8bit` via MLX-Audio, run locally, no fixture | *(N/A — already the real, required local model)* | N/A. This is the mandated model; there is no "production" alternative to activate. |
| Demo video render | `demo/animation` (Remotion) | Real — actual captured product footage/screenshots, real narration audio, real generated music, rendered locally | *(N/A — local rendering is the permanent mechanism, not a stand-in for anything)* | N/A. |

## What is genuinely live vs. simulated, stated plainly

- **Live and real:** CockroachDB Cloud, Distributed Vector Indexing, `ccloud` provisioning,
  AWS Lambda, Secrets Manager, S3 deployment bundles, CloudFormation, the public console/API,
  the serializable authorization pipeline, the policy engine, outbox recovery, and the
  Cloud-backed evaluation run.
- **Fixture or inactive:** Bedrock planning uses `BEDROCK_MODE=fixture`; embeddings are
  deterministic hashes rather than a trained model; Managed MCP is not implemented or run;
  delivery goes only to the sandbox ledger.
- **Evidence boundary:** cloud and evaluation claims map to browser-visible deployed behavior,
  AWS/Cockroach control-plane readback, executed code, and committed reports. The repository
  does not claim Managed MCP, live Bedrock inference, real customer data, or real outbound
  delivery.
