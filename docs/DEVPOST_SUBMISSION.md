# ContactSafe Devpost submission

This is the source of truth for the CockroachDB x AWS Hackathon entry. Keep the video
unlisted while the draft is being assembled, then make it public immediately before the
final Devpost submission.

## Project overview

**Name:** ContactSafe

**Tagline:** Transactional memory for outreach agents: shared promises, current consent, and
one fenced action even when workers race or retry.

**Live demo:** <https://6zg2vtgwt7ncw5bh6737cytl6y0nlysh.lambda-url.us-east-1.on.aws/>

**Source:** <https://github.com/rishabhcli/frosty-prairie-9620>

**Video:** <https://youtu.be/iAy-5f8dMYw>

**Built with:** CockroachDB Cloud, CockroachDB Distributed Vector Indexing, ccloud CLI,
AWS Lambda, AWS Secrets Manager, Amazon S3, AWS CloudFormation, TypeScript, Node.js,
Fastify, React, PostgreSQL, Zod, Vitest, Playwright, Remotion, Qwen3-TTS

## Story

### Inspiration

An outreach agent can remember a customer conversation and still behave unsafely. Two
workers can retrieve the same promise, both decide to follow up, and send twice. A stale
summary can also miss that consent was revoked after planning. ContactSafe started from a
simple question: what if shared agent memory were treated as a safety boundary, not just a
better prompt?

### What it does

ContactSafe gives multiple outreach agents one durable record of consent, promises, contact
attempts, task state, leases, decisions, and side effects. Agents can use vector search to
recall relevant context with citations, but recalled text never authorizes a send.

Before any action, ContactSafe re-reads current consent and policy inside a CockroachDB
serializable transaction. It grants one fenced lease and inserts one idempotent
transactional-outbox row. A second worker or retry sees the committed action and resolves as
an idempotent replay. The delivery worker checks consent and fencing again immediately
before delivery, so a late revocation can still cancel an approved but unsent action.

The public judge console lets reviewers run the synthetic race, revoke consent, deliver to a
non-sending sandbox ledger, and inspect the audit trail. No real customer or inbox is used.

### How we built it

CockroachDB Cloud is the system of record for both semantic and authoritative memory. A
distributed vector index retrieves cited promise context, while ordinary relational tables
hold append-only consent events, leases, task versions, policy decisions, and the
transactional outbox. Keeping these records together avoids a consistency gap between a
separate vector store and the database that controls side effects.

The official ccloud CLI v0.8.23 provisioned and verified the Cloud database, SQL identity,
connection details, and network allowlist. AWS Lambda runs the Node.js 22 API and React judge
console. AWS Secrets Manager supplies the database URL, Amazon S3 stores commit-addressed
deployment bundles, and CloudFormation owns the deployed stack.

The Bedrock Converse adapter is implemented and schema-tested, but this AWS organization
explicitly denies Bedrock actions through an Organizations service control policy. The
deployed planner therefore uses a deterministic, evidence-grounded fixture. We do not claim
Bedrock as a live integration. Managed MCP is also not used or claimed.

### Challenges

The hardest part was keeping model output and vector recall outside the authorization
boundary. Similar text can help an agent find a promise, but it cannot prove current consent
or ownership. The transaction had to stay short, retry safely on CockroachDB serialization
conflicts, fence stale workers, and create the audit decision and outbox action atomically.

Crash recovery created another subtle boundary. A worker can stop after approval but before
delivery, or after a provider accepts an idempotency key but before the response is recorded.
ContactSafe makes those states inspectable and resumes only the original sandbox action.

### Accomplishments

The release ran 1,000 concurrent and retried authorization attempts against CockroachDB
Cloud. The measured result was one approved action, 999 idempotent replays, zero duplicate
approved actions, and zero consent violations. All six injected fault scenarios recovered.
The memory evaluation reported 100% cited-fact validity and a 0% unsupported-plan-claim rate
on the checked-in synthetic corpus.

The same build is publicly deployed on AWS Lambda, and every number shown in the console and
video comes from committed JSON evaluation reports.

### What we learned

Agent memory needs types. A promise recalled through embeddings is useful evidence; a current
consent event is authority; a lease is coordination state; and an outbox row is a side-effect
commitment. Treating all four as chat history hides the exact failures production systems
need to prevent.

We also learned that an honest unavailable-integration boundary is more useful than a
simulated success. The live AWS organization denies Bedrock, so the product records that
fact, keeps the tested adapter, and demonstrates the working CockroachDB and Lambda paths
without overstating them.

### What's next

The next production step is a provider with a documented idempotency contract and a
consenting pilot workspace. We would also add tenant-scoped service accounts, richer
observability for ambiguous provider outcomes, and a live Bedrock deployment in an AWS
organization where the service is permitted. ContactSafe will continue to keep model
planning separate from transactional authorization.

## Gallery

Use `demo/thumbnail/thumbnail.png` as the submission thumbnail.

1. `demo/screenshots/08-live-aws.png`
   **Live AWS judge console.** The public Lambda app runs against CockroachDB Cloud after a
   full race, revocation, and sandbox-delivery flow.
2. `demo/screenshots/01-recall-citations.png`
   **Shared memory with evidence.** Two agents retrieve the same synthetic promise and
   current consent from CockroachDB, with source citations visible before either can act.
3. `demo/screenshots/02-transaction-result.png`
   **One transactional winner.** A serializable transaction gives a fenced lease and outbox
   row to one worker; the other resolves without creating a duplicate.
4. `demo/screenshots/03-consent-revoked.png`
   **Revocation remains authoritative.** Jordan revokes email consent while the older promise
   stays visible as non-authoritative context.
5. `demo/screenshots/04-delivery-canceled.png`
   **Recheck before the side effect.** The delivery worker sees the new consent state and
   cancels an already-approved sandbox row before anything is sent.
6. `demo/screenshots/05-outbox-claimed.png`
   **Inspectable crash state.** A sandbox outbox item is claimed before an injected worker
   crash, preserving the exact recovery point.
7. `demo/screenshots/06-resumed-delivered.png`
   **Idempotent recovery.** After restart, the worker resumes the same action key and records
   exactly one sandbox delivery.
8. `demo/screenshots/07-evaluation.png`
   **Measured cloud results.** The committed evaluation reports show one approval, 999
   replays, zero duplicates, zero consent violations, and six recovered fault scenarios.

## Submission boundaries

- All contacts, messages, and corpora are synthetic.
- Delivery writes only to an idempotent sandbox ledger.
- ContactSafe enforces configured policy; it is not legal or compliance advice.
- Exactly-once external delivery still depends on a provider idempotency contract.
- Bedrock is fixture-backed because of an explicit AWS Organizations SCP deny.
- Managed MCP is unused; Distributed Vector Indexing and ccloud are the two qualifying
  CockroachDB tools.
