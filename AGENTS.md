# AGENTS.md — ContactSafe

Read `README.md` and `PLAN.md` before work. This system sits on a side-effect boundary. Correctness under races, consent changes, retries, and crashes is more important than how intelligent the message sounds.

## Mission

Prove that multiple AWS agents can share durable CockroachDB memory and coordinate one policy-compliant outreach action without duplicates. Bedrock plans from cited evidence; deterministic policy and a serializable transaction authorize; the outbox delivers safely.

## Non-negotiables

1. No real unsolicited outreach. Use synthetic contacts and a sandbox/consenting test address.
2. Consent is append-only authoritative state and must be rechecked transactionally and before delivery.
3. Vector memories and model summaries never authorize contact.
4. Bedrock cannot call the sender or mutate consent/policy/leases directly.
5. Network/model calls never occur inside the CockroachDB authorization transaction.
6. Every side effect has a stable logical action key and provider idempotency key.
7. Stale lease owners cannot write/send after a higher fencing token exists.
8. Do not claim exactly-once external delivery beyond demonstrated provider semantics.

## Engineering rules

- TypeScript strict mode, validated event/API/model schemas, migration review.
- Use CockroachDB's recommended serializable transaction retry pattern.
- Use database time for leases and explicit effective/recorded-time semantics.
- Keep authoritative and derived/semantic memory types separate in code/schema/UI.
- Tenant scope every query, vector search, MCP operation, job, and log.
- Prompt/memory text is untrusted; citations must resolve to current facts.
- Server-side secrets, least-privilege IAM/DB users, redacted logs.
- Fault injection and concurrency tests are required for state-machine changes.
- Qualifying CockroachDB feature claims must map to real code/config/demo evidence.

## Required workflow

For schema/transaction changes, add race, retry, duplicate, and rollback tests. For policy changes, add boundary and revocation cases. For Bedrock prompts/models, rerun unsupported-claim/citation evaluation. For outbox changes, kill workers at each boundary and verify ambiguous semantics. For MCP/vector/Skill changes, update feature-evidence docs and judge demo.

Expected commands:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm eval:race
pnpm eval:faults
pnpm eval:memory
pnpm build
```

Never run a load/fault test against an unscoped production tenant or real delivery provider. Name exact isolated resources and cost caps.

## Definition of done

- Real CockroachDB Cloud and AWS/Bedrock deployed path works.
- At least two current qualifying CockroachDB agent features are documented and demonstrated.
- 1,000-race test creates one logical outbox action and no duplicate sandbox send.
- Revocation before delivery cancels pending action.
- Crash points recover or enter explicit ambiguous/manual state.
- Memory facts are cited; irrelevant/stale vectors cannot override policy.
- Public OSS repository, license, live app, setup, video, and screenshots are reviewer-accessible.
- No real contact data, secrets, unredacted connection strings, or unconsented sends.

## CockroachDB × AWS Agentic Memory submission quirks

Treat <https://cockroachdb-ai.devpost.com/> as authoritative and re-check on submission day. Working brief:

- Target deadline: **August 18, 2026 at 5:00 PM EDT**.
- Use CockroachDB as persistent agent memory and at least **two** currently listed capabilities among Managed MCP, distributed vector index, ccloud/third current option, and/or Agent Skills as the rules define them. Confirm exact categories.
- Use at least one AWS service; this plan uses Lambda/SQS/EventBridge/Bedrock.
- Provide a public open-source repository with an explicit license, live app, and demo under three minutes.
- Name all CockroachDB/AWS/models/services and identify synthetic/sandbox components.
- Present evidence for agent memory, implementation, impact, production readiness, and originality.
- Record only human-verified entrant/team facts; never alter identity/eligibility representations.

Agents may repair cloud/integration/config/license/deployment/media/form blockers. They may not bypass service or event controls, fabricate qualifying-feature usage, misstate entrant facts, or contact real recipients to make the demo seem authentic.

## Required demo video

Keep it at 2:20–2:55.

| Time | Scene | Proof |
|---:|---|---|
| 0:00–0:15 | Duplicate-agent risk | Why chat history is insufficient memory |
| 0:15–0:48 | Two workers race for Jordan | Same task, CockroachDB promise/consent recall with citations |
| 0:48–1:18 | Transaction result | One fenced lease/policy decision/outbox; loser safely conflicts |
| 1:18–1:43 | Revoke email consent and retry | Authoritative event immediately blocks stale semantic memory |
| 1:43–2:08 | Kill/recover outbox worker | Once-approved sandbox delivery resumes without duplicate action |
| 2:08–2:35 | Feature proof and 1,000-race metrics | Vector index + Managed MCP/Skill + AWS, zero policy violations |
| 2:35–2:48 | Honest boundary | Sandbox delivery; compliance policy must be configured/reviewed |

Show real run IDs/action keys and a visible sandbox label. If replaying a previously captured load test, label it as results/replay. Captions and readable audit evidence are mandatory.

## Submission assets

- public licensed repo and live/resettable sandbox app;
- under-three-minute video/master/captions/thumbnail;
- screenshots: memory/audit, race, policy decision, revocation, recovery, evaluation;
- schema/transaction/lease/outbox architecture;
- exact CockroachDB qualifying features and AWS services;
- 1,000-race/fault/memory evaluation reports;
- threat model, consent/policy semantics, delivery limitation;
- local/cloud setup, migrations, env example, cost/cleanup runbook, attribution.

## Anti-slop gate

Reject work that:

- calls a vector store “memory safety” without transactional enforcement;
- lets a model decide consent or send directly;
- demo-races two animations without concurrent database evidence;
- claims exactly once while ignoring provider ambiguity;
- fabricates Managed MCP/vector/Skill usage;
- adds a generic CRM/copilot UI before race/revocation/recovery tests pass;
- uses real customer data or sends to an unconsenting address.

## Priority order

Protect authoritative consent, transaction/retry, fencing, unique action, outbox, pre-delivery recheck, real Cockroach/AWS features, and evaluation. Cut multi-channel, fancy console, campaign workflows, and broad CRM integrations first.

## Human approval boundary

The human entrant approves cloud provisioning/cost, any test recipient, policies, credentials, public deployment/data, feature claims, final media, and submission. Agents never invent consent, eligibility, integration evidence, or send authority.

