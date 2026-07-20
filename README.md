# ContactSafe

ContactSafe is a safety boundary for customer-outreach agents. It gives multiple agents durable, shared memory of consent, promises, contact attempts, leases, and task state—then enforces those facts transactionally before any message can be sent.

In the demo, two agents race to follow up with the same customer. Both can plan, but only one obtains the CockroachDB contact lease and approved outbox record. The winner recalls the customer's prior promise (“email the revised quote after Tuesday”), while a consent revocation immediately blocks all later sends. Bedrock helps plan and summarize; CockroachDB decides what is allowed.

## Hackathon target

ContactSafe is tailored to the **CockroachDB × AWS Agentic Memory Hackathon**: <https://cockroachdb-ai.devpost.com/>. CockroachDB is the persistent coordination and memory substrate, and AWS runs the agent workflow. The build intentionally demonstrates the distributed vector index plus CockroachDB Managed MCP (or a current permitted third feature such as Agent Skills/ccloud capability) so it satisfies the requirement to use at least two named CockroachDB agent features, not merely a SQL database.

## Problem

An agent with a chat history can still be unsafe. In production, retries and concurrent workers create duplicate outreach. A stale summary can miss revoked consent. Vector similarity may retrieve a promise but cannot enforce frequency caps or atomic ownership. If one worker crashes after approval but before delivery, another may either duplicate the message or abandon it.

ContactSafe treats memory as several different things:

- **immutable facts:** consent events and human-approved promises;
- **derived semantic memory:** embeddings/summaries used for recall, never authorization;
- **coordination state:** time-bounded contact leases and task versions;
- **side effects:** transactional outbox entries with idempotency keys;
- **audit evidence:** why a contact was allowed or blocked, with policy version.

## Core workflow

1. A new outreach task arrives through an API or AWS event.
2. The worker queries CockroachDB for current consent, frequency history, active promises, previous attempts, and semantically similar memories.
3. Amazon Bedrock produces a structured plan and draft using only retrieved/cited facts.
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

## AWS and agent architecture

- API Gateway or a small web API receives tasks and consent changes.
- AWS Lambda workers perform recall, Bedrock structured planning/summarization, policy evaluation, and transactional authorization.
- SQS/EventBridge drives retries and outbox delivery with dead-letter handling.
- Bedrock model access stays server-side and returns schema-constrained JSON.
- CockroachDB Managed MCP provides judge-visible exploration/agent access to memory in an allowlisted, read-focused workflow.
- CockroachDB's distributed vector index retrieves relevant promise and interaction memories, with authoritative fact joins and citations.
- A reusable Agent Skill describes the safe contact workflow if selected as the second/third qualifying feature.

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

Two Lambda/agent workers race on “follow up with Jordan.” Both retrieve the same promise, but CockroachDB grants a fenced lease and outbox action to only one; the other shows a safe conflict result. The message cites the promised Tuesday timing. Then the user revokes email consent, and a queued/retried attempt is blocked despite an older vector memory suggesting follow-up. Finally a worker is stopped between authorization and delivery; the outbox resumes once without a second approved action.

## Honest limits

- The hackathon build uses a non-delivering sandbox transport or a consenting test recipient.
- ContactSafe enforces configured policy; it is not a substitute for legal/compliance review.
- Vector recall can miss context and is never authoritative for consent.
- Exactly-once delivery cannot be guaranteed without provider idempotency; the system guarantees one approved outbox action and records ambiguous provider outcomes.
- Demo contacts and messages are synthetic.

## Status

The first vertical slice will seed one consent event and promise, race two workers, create one fenced outbox action in CockroachDB, draft through Bedrock, and block after revocation. [PLAN.md](PLAN.md) defines schemas, transactions, feature requirements, and tests. [AGENTS.md](AGENTS.md) defines safety and submission rules.

