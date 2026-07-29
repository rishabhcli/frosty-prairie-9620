# ContactSafe

ContactSafe is a safety boundary for customer-outreach agents. It gives multiple agents durable, shared memory of consent, promises, contact attempts, leases, and task state—then enforces those facts transactionally before any message can be sent.

In the demo, two agents race to follow up with the same customer. Both can plan, but only one obtains the CockroachDB contact lease and approved outbox record. The winner recalls the customer's prior promise (“email the revised quote after Tuesday”), while a consent revocation immediately blocks all later sends. Bedrock helps plan and summarize; CockroachDB decides what is allowed.

## Hackathon target

ContactSafe targets the **CockroachDB × AWS Agentic Memory Hackathon**:
<https://cockroachdb-ai.devpost.com/>. The current local release genuinely demonstrates
CockroachDB as the persistent coordination and memory substrate, including its distributed
vector index. It does **not** yet satisfy the event's sponsor-integration minimum: Managed MCP
has not been run, no second qualifying CockroachDB agent tool has been demonstrated, and the
AWS/Bedrock path remains fixture-backed until credentials and a deployment exist.

## Problem

An agent with a chat history can still be unsafe. In production, retries and concurrent workers create duplicate outreach. A stale summary can miss revoked consent. Vector similarity may retrieve a promise but cannot enforce frequency caps or atomic ownership. If one worker crashes after approval but before delivery, another may either duplicate the message or abandon it.

ContactSafe treats memory as several different things:

- **immutable facts:** consent events and human-approved promises;
- **derived semantic memory:** embeddings/summaries used for recall, never authorization;
- **coordination state:** time-bounded contact leases and task versions;
- **side effects:** transactional outbox entries with idempotency keys;
- **audit evidence:** why a contact was allowed or blocked, with policy version.

## Core workflow

1. A new outreach task arrives through the local API; the production design can replace this
   with an AWS event.
2. The worker queries CockroachDB for current consent, frequency history, active promises, previous attempts, and semantically similar memories.
3. The configured planner produces a structured draft using only retrieved/cited facts. The
   release demo uses `FixtureOutreachPlanner`; the Bedrock Converse adapter is implemented and
   tested but has not been called with AWS credentials.
4. A deterministic policy engine evaluates channel consent, quiet hours, contact cap, promise timing, campaign suppression, and required fields.
5. In one CockroachDB serializable transaction, the worker re-reads authoritative state, acquires/renews a lease, records the decision, and inserts an idempotent transactional-outbox row.
6. A separate sender processes the outbox and records provider response. Retries use the same idempotency key.
7. A new consent event invalidates future authorization immediately. Semantic memories cannot override it.

## CockroachDB design

Core tables:

- `contacts` and channel addresses with tenant isolation;
- append-only `consent_events` with source and effective time;
- `promises` with quoted source, owner, due window, status, and embedding;
- `contact_attempts` and `policy_decisions`;
- `contact_leases` with owner, fencing token, and expiration;
- `agent_tasks` with state/version;
- `transactional_outbox` with unique action/idempotency key;
- `memory_chunks` with source citations and CockroachDB vector embeddings.

Serializable transactions and retry loops provide correctness under races. Lease fencing tokens prevent a stale worker from committing after a newer owner takes over. Unique indexes prevent duplicate approved actions even when requests are delivered repeatedly.

## Target AWS and agent architecture

- API Gateway or a small web API can receive tasks and consent changes.
- AWS Lambda workers can run recall, Bedrock structured planning/summarization, policy
  evaluation, and transactional authorization.
- SQS/EventBridge can drive retries and outbox delivery with dead-letter handling.
- The implemented Bedrock adapter keeps model access server-side and validates
  schema-constrained JSON; it is inactive in this release.
- CockroachDB Managed MCP is a planned Cloud integration and has not been run in this release.
- CockroachDB's distributed vector index retrieves relevant promise and interaction memories, with authoritative fact joins and citations.
- A qualifying second CockroachDB tool still needs to be implemented and demonstrated.

## Evaluation

The release test launches 1,000 concurrent/retried authorization attempts for the same contact/action. Required result: one approved outbox action and zero duplicate sends. Additional cases cover:

- consent revoked during planning;
- two campaigns contacting the same person;
- expired lease and stale fencing token;
- crash before authorization, after outbox insert, and after provider send;
- missing/contradictory promise memories;
- vector recall with irrelevant similar text;
- quiet hours and frequency cap boundaries;
- multi-region latency/retry behavior where feasible.

Metrics include duplicate approved actions/sends, consent-violation count, promise-recall precision/recall on a labeled fixture, transaction retry rate, policy latency, outbox recovery time, and unsupported-claim rate in Bedrock plans.

## Demo

Two local agent workers race on “follow up with Jordan.” Both retrieve the same promise, but
CockroachDB grants a fenced lease and outbox action to only one; the other shows a safe
conflict result. The message cites the promised Tuesday timing. Then the user revokes email
consent, and a queued/retried attempt is blocked despite an older vector memory suggesting
follow-up. Finally a worker is stopped between authorization and delivery; the outbox resumes
once without a second approved action.

## Honest limits

- The hackathon build uses a non-delivering sandbox transport or a consenting test recipient.
- ContactSafe enforces configured policy; it is not a substitute for legal/compliance review.
- Vector recall can miss context and is never authoritative for consent.
- Exactly-once delivery cannot be guaranteed without provider idempotency; the system guarantees one approved outbox action and records ambiguous provider outcomes.
- Demo contacts and messages are synthetic.

## Status

**Built and verified, running locally.** The full vertical slice works end to end against a
real CockroachDB instance: seed → race two workers → one fenced outbox action → Bedrock draft
(fixture mode) → consent revocation cancels the pending send → a genuinely killed and
restarted outbox-worker process resumes exactly once. [PLAN.md](PLAN.md) defines schemas,
transactions, feature requirements, and tests (status section there records what shipped
vs. deferred). [AGENTS.md](AGENTS.md) defines safety and submission rules — all non-negotiables
hold in the current implementation. [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) lists exactly
which parts run for real locally (CockroachDB, the distributed vector index, the transactional
core, the evaluation harness, the narration/music/video pipeline) vs. which are inactive or
fixture-backed (Bedrock and Managed MCP). No AWS deployment or CockroachDB Cloud cluster is
configured in this environment, so this release is not yet eligible for final submission.

### Local setup

```bash
pnpm install
pnpm db:up          # local CockroachDB in Docker, port 14910
pnpm db:migrate
pnpm --filter @contactsafe/api start        # http://127.0.0.1:14901
pnpm --filter @contactsafe/console dev       # http://127.0.0.1:14900
```

Copy `.env.example` to `.env` and adjust if needed (defaults work for the local-only setup
above). Port block `14900–14999` is this repository's assigned range; see the table below.

| Port | Service |
|---|---|
| 14900 | Console (judge-facing UI) |
| 14901 | API |
| 14902 | Agent-worker health check |
| 14903 | Outbox-worker health check |
| 14910 | CockroachDB SQL |
| 14911 | CockroachDB admin UI |
| 14920 | E2E/Playwright test server |

### Verification commands actually run

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm test:e2e
pnpm eval:race && pnpm eval:faults && pnpm eval:memory
```

Real, measured results are committed under `eval/reports/*.json` (not asserted from memory):
1,000 concurrent/retried authorization attempts → 1 approved action, 0 duplicates, 0 consent
violations; 6/6 fault-injection scenarios recovered; 100% cited-fact validity, 0% unsupported
plan claims. The console's "Evaluation" panel reads these same files live.

### Demo video

`demo/final/frosty-prairie-9620-demo.mp4` — Remotion composition (`demo/animation/`) built
from real captured product footage/screenshots, real Qwen3-TTS narration
(`mlx-community/Qwen3-TTS-12Hz-1.7B-Base-8bit`, `demo/audio/narration/provenance.json`),
original scripted music (`demo/scripts/generate_music.py`), and captions generated from real
Whisper timestamps (`demo/captions/`). Reproducible via `python3 demo/scripts/render_with_lock.py`
after generating narration/music once. See `demo/demo.yaml` and `demo/narration.md` for the
scene-by-scene script.

Verified unlisted upload: <https://youtu.be/vHthteCZzjk>. It is 2:30, has the committed custom
thumbnail and timed English (United States) captions, completed HD processing, and passed
YouTube's initial copyright and Community Guidelines checks. Its description explicitly
records the fixture/cloud boundary. The video remains unlisted because the event requires a
public video only for an otherwise eligible final submission.
