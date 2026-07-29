# ContactSafe

ContactSafe is a safety boundary for customer-outreach agents. It gives multiple agents durable, shared memory of consent, promises, contact attempts, leases, and task state—then enforces those facts transactionally before any message can be sent.

In the demo, two agents race to follow up with the same customer. Both can plan, but only one
obtains the CockroachDB contact lease and approved outbox record. The winner recalls the
customer's prior promise ("email the revised quote after Tuesday"), while a consent
revocation immediately blocks all later sends. The deployed release uses a deterministic,
evidence-grounded planner because Bedrock is denied by the AWS organization; CockroachDB
decides what is allowed.

## Hackathon target

ContactSafe targets the **CockroachDB × AWS Agentic Memory Hackathon**:
<https://cockroachdb-ai.devpost.com/>. The live release runs on AWS Lambda against a
CockroachDB Cloud Basic cluster. It demonstrates two qualifying CockroachDB tools:
**Distributed Vector Indexing** in the working memory path and the official **`ccloud` CLI**
used to inspect the organization, create the SQL identity and database, and verify the
cluster/network configuration. AWS Lambda serves the public judge console and API; AWS
Secrets Manager holds the database connection string and S3 stores immutable deployment
bundles.

Managed MCP is not used. The Bedrock Converse adapter is implemented and tested, but this
AWS organization explicitly denies Bedrock actions through a service control policy, so the
deployed planner remains the deterministic, evidence-grounded fixture. Bedrock is not counted
as a live sponsor integration.

## Problem

An agent with a chat history can still be unsafe. In production, retries and concurrent workers create duplicate outreach. A stale summary can miss revoked consent. Vector similarity may retrieve a promise but cannot enforce frequency caps or atomic ownership. If one worker crashes after approval but before delivery, another may either duplicate the message or abandon it.

ContactSafe treats memory as several different things:

- **immutable facts:** consent events and human-approved promises;
- **derived semantic memory:** embeddings/summaries used for recall, never authorization;
- **coordination state:** time-bounded contact leases and task versions;
- **side effects:** transactional outbox entries with idempotency keys;
- **audit evidence:** why a contact was allowed or blocked, with policy version.

## Core workflow

1. A new outreach task arrives through the API running on AWS Lambda.
2. The worker queries CockroachDB for current consent, frequency history, active promises, previous attempts, and semantically similar memories.
3. The configured planner produces a structured draft using only retrieved/cited facts. The
   release demo uses `FixtureOutreachPlanner`; the Bedrock Converse adapter is implemented and
   tested but cannot run in the deployed AWS organization because of an explicit Bedrock SCP
   deny.
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

## Deployed cloud architecture

- A public AWS Lambda Function URL serves the React judge console and Fastify API from one
  Node.js 22 deployment.
- Lambda reads the CockroachDB connection string from AWS Secrets Manager, runs idempotent
  migrations on cold start, and executes recall, policy, transactional authorization, and
  sandbox outbox delivery.
- CockroachDB Cloud stores consent, promises, leases, tasks, decisions, the transactional
  outbox, and vector memory. Its distributed vector index retrieves relevant promises with
  authoritative fact joins and citations.
- The official `ccloud` CLI v0.8.23 provisioned and verified the cluster database, SQL
  identity, connection string, and IP allowlist.
- S3 stores commit-addressed Lambda bundles; CloudFormation owns the role, function, Function
  URL, permissions, and 14-day log retention.
- The Bedrock adapter stays server-side and schema-validates plans, but the live stack selects
  `BEDROCK_MODE=fixture` because Bedrock is denied by the AWS organization SCP.

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

Metrics include duplicate approved actions/sends, consent-violation count, promise-recall
precision/recall on a labeled fixture, transaction retry rate, policy latency, outbox
recovery time, and unsupported-claim rate in structured plans.

## Demo

Two agent workers race on “follow up with Jordan.” Both retrieve the same promise, but
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

**Built, deployed, and browser-verified.** The full vertical slice runs at
<https://6zg2vtgwt7ncw5bh6737cytl6y0nlysh.lambda-url.us-east-1.on.aws/> against CockroachDB
Cloud: seed → race two workers → one fenced outbox action → evidence-grounded fixture draft →
consent revocation → crash-safe sandbox outbox handling. The public console and
`/evaluation/latest` endpoint were exercised through the deployed Lambda URL.

[PLAN.md](PLAN.md) defines schemas, transactions, feature requirements, and tests.
[AGENTS.md](AGENTS.md) defines safety and submission rules.
[docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) separates the live Cloud/Lambda/vector/`ccloud`
paths from inactive or fixture-backed paths such as Managed MCP and Bedrock.

### Live deployment

```text
Judge console:
https://6zg2vtgwt7ncw5bh6737cytl6y0nlysh.lambda-url.us-east-1.on.aws/

Health:
https://6zg2vtgwt7ncw5bh6737cytl6y0nlysh.lambda-url.us-east-1.on.aws/health
```

The deploy is reproducible from `main`:

```bash
DATABASE_URL_SECRET_ARN=<existing-secret-arn> bash infra/aws/deploy.sh
```

The script builds the monorepo, creates a deterministic Lambda zip, uploads it to a
commit-addressed S3 key, deploys `infra/aws/template.yaml`, and prints the Function URL.

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

Real, measured results are committed under `eval/reports/*.json` (not asserted from memory).
The latest 1,000-attempt race ran from the development host against the managed CockroachDB
Cloud cluster: 1 approved action, 999 idempotent replays, 0 duplicates, and 0 consent
violations. All 6 fault-injection scenarios recovered; cited-fact validity was 100% with 0%
unsupported plan claims. The console's "Evaluation" panel and the deployed
`/evaluation/latest` endpoint read these same files.

### Demo video

`demo/final/frosty-prairie-9620-demo.mp4` — Remotion composition (`demo/animation/`) built
from real captured product footage/screenshots, real Qwen3-TTS narration
(`mlx-community/Qwen3-TTS-12Hz-1.7B-Base-8bit`, `demo/audio/narration/provenance.json`),
original scripted music (`demo/scripts/generate_music.py`), and captions generated from real
Whisper timestamps (`demo/captions/`). Reproducible via `python3 demo/scripts/render_with_lock.py`
after generating narration/music once. See `demo/demo.yaml` and `demo/narration.md` for the
scene-by-scene script.

Verified public upload: <https://youtu.be/iAy-5f8dMYw>. YouTube lists the 143.600-second
render as 2:24. It was uploaded unlisted first, has the committed custom thumbnail and timed
English (United States) captions, and passed YouTube's initial copyright and Community
Guidelines checks. Its description names the live CockroachDB Cloud and AWS Lambda paths
while preserving the fixture-backed Bedrock boundary. The completed Devpost entry is
<https://devpost.com/software/frosty-prairie-9620>.
