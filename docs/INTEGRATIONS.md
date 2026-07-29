# Integration matrix: production vs. fixture

This build runs entirely local-first. The entrant authorized autonomous submission work on
2026-07-29, but no CockroachDB Cloud cluster, AWS credentials, or deploy target is configured.
The table distinguishes code-complete adapters from integrations that have actually run;
configuration compatibility is not counted as sponsor usage.

| Capability | Interface | Fixture mode (what actually runs here) | Production adapter (code-complete, inactive) | Activation |
|---|---|---|---|---|
| Persistent agent memory | `packages/db` | Local single-node CockroachDB (Docker, `cockroachdb/cockroach:latest-v26.1`), full schema + migrations | CockroachDB Cloud (Serverless/Dedicated) | Point `DATABASE_URL` at the Cloud connection string; run `pnpm db:migrate`. No code changes. |
| Distributed vector index | `packages/memory` | Real: CockroachDB's `VECTOR` column + `VECTOR INDEX`, queried with the `<->` operator against the local cluster (this is the actual qualifying feature, not simulated) | Same — vector indexing works identically on CockroachDB Cloud | None needed once `DATABASE_URL` points at Cloud; the index DDL is in `packages/db/migrations/002_vector_index.sql`. |
| Vector embeddings | `packages/memory/src/embed.ts` | Deterministic local hash-based fixture (`embedText`) — same string always maps to the same unit vector; **not** a trained semantic model (see `docs/CURRENT_SOURCES.md` and `eval/memory/run.ts`'s methodology note) | Bedrock embeddings (e.g. Titan Text Embeddings) | Swap the body of `embedText`/add a `BedrockEmbeddingProvider` implementing the same `(text: string) => number[]` shape used by `ingestMemoryChunk`/`retrieveRelevantMemory`. |
| CockroachDB Managed MCP | *(no local equivalent — Cloud-only feature; not implemented as a running adapter in this build)* | Not run. The Managed MCP endpoint only exists for CockroachDB Cloud clusters, and this build has none. | Point a Managed MCP client at the Cloud cluster's MCP endpoint (URL + OAuth/service-account key) | Requires a CockroachDB Cloud cluster before it can be activated. `COCKROACH_MANAGED_MCP_ENDPOINT`/`_API_KEY` in `.env.example` are placeholders only. The sole qualifying CockroachDB feature demonstrated in this build is **Distributed Vector Indexing** (above). |
| Bedrock planning/drafting | `packages/bedrock` | `FixtureOutreachPlanner` — deterministic, evidence-grounded, cites only facts present in the evidence packet, never invents a fact ID | `BedrockOutreachPlanner` — real `@aws-sdk/client-bedrock-runtime` `ConverseCommand` call, same `OutreachPlanner` interface, schema-validated against `OutreachPlanSchema` | Set `BEDROCK_MODE=live`, provide AWS credentials via the standard SDK credential chain (env/profile/role), and `AWS_REGION`/`AWS_BEDROCK_MODEL_ID`. `createOutreachPlanner()` picks the adapter based on `BEDROCK_MODE` — no call-site changes anywhere in `services/agent-worker`. |
| Task queue / retry trigger | `services/agent-worker`, `services/outbox-worker` | Local polling: each worker polls its own CockroachDB table (`agent_tasks`, `transactional_outbox`) directly | AWS Lambda triggered by SQS/EventBridge, same `runAgentAttempt`/`claimAndDeliverOne` business logic invoked per message | Replace the `while` polling loop in `worker.ts` with a Lambda handler that calls the same exported function per invocation. The authorization/delivery logic itself is already environment-agnostic (pure functions over a `Pool`). |
| Outbound delivery | `services/outbox-worker/src/deliver.ts` | `sandboxSend()` — idempotent insert into `sandbox_deliveries`, no real recipient, ever | Real ESP/CRM provider call (e.g. SES, SendGrid) behind the same idempotency-key contract | Replace the body of `sandboxSend` with a real provider call, keeping the `INSERT ... ON CONFLICT DO NOTHING` idempotency ledger pattern (or the provider's own idempotency key). |
| Qwen3-TTS narration | `demo/scripts/narrate.py` | **Real** — `mlx-community/Qwen3-TTS-12Hz-1.7B-Base-8bit` via MLX-Audio, run locally, no fixture | *(N/A — already the real, required local model)* | N/A. This is the mandated model; there is no "production" alternative to activate. |
| Demo video render | `demo/animation` (Remotion) | Real — actual captured product footage/screenshots, real narration audio, real generated music, rendered locally | *(N/A — local rendering is the permanent mechanism, not a stand-in for anything)* | N/A. |

## What is genuinely live vs. simulated, stated plainly

- **Live and real in this build:** CockroachDB (local), the distributed vector index, the
  full serializable-transaction authorization pipeline, the policy engine, the outbox
  crash-recovery mechanism, the console, the 1,000-race/fault/memory evaluation harness,
  the Qwen3-TTS narration, the original music, and the final rendered video.
- **Fixture or inactive:** Bedrock planning uses `BEDROCK_MODE=fixture`; vector embeddings are
  deterministic hashes, not a trained model; Managed MCP is not implemented or run.
- **Evidence boundary:** the CockroachDB and evaluation claims map to executed code and
  committed reports. No Managed MCP call, live Bedrock output, or AWS deployment is claimed.
