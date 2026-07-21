# Memory (Vector) + Bedrock Adapter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development. Write failing tests first for each function.

**Goal:** Two packages: `packages/memory` (vector ingest/retrieval joined to authoritative facts, per PLAN.md §5) and `packages/bedrock` (the `OutreachPlanner` contract with a real Converse API adapter and a deterministic fixture adapter, per PLAN.md §6 and docs/CURRENT_SOURCES.md).

**Architecture:** `packages/memory` never authorizes anything — it only retrieves candidate context and joins it to current authoritative rows, tagging each chunk with whether it's still current. `packages/bedrock` defines one `OutreachPlanner` interface implemented two ways (`fixture`, `live`); callers select via `BEDROCK_MODE` env var so swapping to the real API is a config change, not a rewrite (mega-prompt requirement — see AGENTS.md "no AWS credentials exist in this environment").

**Tech Stack:** TypeScript strict, `@contactsafe/contracts`, `@contactsafe/db` (`withSerializableRetry`/`pool` are NOT used here — memory retrieval reads happen *before* the authorization transaction, per PLAN.md §8 "Do not hold the transaction open across Bedrock or network calls"), `pg` for read queries, `@aws-sdk/client-bedrock-runtime` (only imported by the live adapter), Vitest.

## Global Constraints

- `packages/memory` and `packages/bedrock` follow the same package shape as `packages/policy` (package.json with `build`/`typecheck`/`test`/`test:integration` scripts as applicable, tsconfig extending `../../tsconfig.base.json`).
- Embeddings: no Bedrock credentials exist in this environment (docs/CURRENT_SOURCES.md). Implement a deterministic local `embedText(text: string): number[]` fixture — a seeded hash-based pseudo-embedding, dimension `MEMORY_EMBEDDING_DIMENSIONS` (384, from `@contactsafe/contracts`) — clearly named/commented as a fixture, with a `BedrockEmbeddingProvider` real-adapter stub (Bedrock embeddings model) sharing the same `embed(text): Promise<number[]>` interface so swapping later is a config change.
- Every memory chunk carries `sourceType`/`sourceRef`/`effectiveAt`/`superseded` — retrieval must join against `promises`/`consent_events` to mark a chunk `superseded=true` if the fact it cites is no longer current (AGENTS.md non-negotiable #3).
- `packages/bedrock`'s system prompt (for the live adapter) forbids invented facts and requires citations, per PLAN.md §6. The fixture adapter must ALSO only cite fact IDs actually present in the evidence packet it's given — it should not hardcode fake fact IDs.
- Bedrock adapter never calls the sender or mutates consent/policy/leases (AGENTS.md non-negotiable #4) — enforce this structurally by giving `OutreachPlanner.plan()` a read-only `EvidencePacket` input and an `OutreachPlan` output; it must have no access to a DB pool or outbox writer.

## `packages/memory` interface

```typescript
// packages/memory/src/embed.ts
export function embedText(text: string): number[]; // deterministic fixture, 384-dim, unit-length normalized

// packages/memory/src/retrieve.ts
import type { Pool } from "pg";
import type { MemoryChunk } from "@contactsafe/contracts";

export interface RetrievedMemoryChunk extends MemoryChunk {
  currentlyValid: boolean; // false if the cited promise/consent no longer matches current authoritative state
}

export async function retrieveRelevantMemory(
  pool: Pool,
  params: { tenantId: string; contactId: string; queryEmbedding: number[]; topK: number }
): Promise<RetrievedMemoryChunk[]>;

// packages/memory/src/ingest.ts
export async function ingestMemoryChunk(
  pool: Pool,
  chunk: { tenantId: string; contactId: string; sourceType: string; sourceRef: string; textSummary: string; effectiveAt: string; checksum: string }
): Promise<void>; // embeds textSummary via embedText, inserts into memory_chunks
```

`retrieveRelevantMemory` SQL: use CockroachDB's vector distance operator (`<->` for L2 or `<=>` for cosine — confirm current operator name against `docs/CURRENT_SOURCES.md` / re-check `https://www.cockroachlabs.com/docs/stable/vector` if unclear) ordered by distance to `queryEmbedding`, `LIMIT topK`, filtered by `tenant_id`/`contact_id`. After retrieval, for each chunk whose `sourceType === 'promise'`, join `promises` by `sourceRef` and set `currentlyValid = (status === 'open')`; for `sourceType === 'consent'`, join `consent_events`/derive latest status and set `currentlyValid` accordingly.

## `packages/bedrock` interface

```typescript
// packages/bedrock/src/planner.ts
import type { OutreachPlan } from "@contactsafe/contracts";

export interface EvidenceFact { factId: string; kind: "promise" | "consent" | "memory"; text: string; effectiveAt: string; current: boolean }
export interface EvidencePacket { contactId: string; facts: EvidenceFact[]; goal: "follow_up" | "fulfill_promise" | "clarify" }

export interface OutreachPlanner {
  plan(evidence: EvidencePacket): Promise<OutreachPlan>;
}

export function createOutreachPlanner(mode: "fixture" | "live", opts?: { region?: string; modelId?: string }): OutreachPlanner;
```

- `FixtureOutreachPlanner`: builds a deterministic plan from `evidence.facts` — cites every `current === true` fact's `factId`, picks `intent` from `evidence.goal`, drafts subject/body referencing the highest-priority current fact's `text` (e.g. quoting a promise verbatim per README's "email the revised quote after Tuesday" scenario), sets `proposedNotBefore` to `evidence.facts` promise due window start if present else now, and — critically — if **no** fact has `current === true`, returns `intent: "do_not_contact"` with `uncertainties: ["no current evidence supports contact"]` rather than fabricating one (this is the abstention/safe-failure path required by the mega-prompt's completion gates).
- `BedrockOutreachPlanner`: uses `@aws-sdk/client-bedrock-runtime`'s `ConverseCommand` with a `toolConfig` whose input schema is `OutreachPlanSchema` converted to JSON Schema (write this conversion by hand for the ~8 fields; do not add a new dependency for zod-to-json-schema unless already needed elsewhere), system prompt forbidding invented facts and requiring `citedFactIds` to be a subset of the evidence packet's fact IDs, and parses+validates the tool-use response through `OutreachPlanSchema.parse()` before returning — a validation failure throws (caller falls back to the fixture planner; document this fallback in `packages/bedrock/src/createOutreachPlanner.ts`).
- `createOutreachPlanner("live", ...)` must NOT throw at construction time just because AWS credentials are absent (construction only builds the SDK client; the actual call would fail at request time) — but the factory function selects `fixture` by default when `process.env.BEDROCK_MODE !== "live"`, matching `.env.example`.

## Required tests

`packages/memory`:
- `embed.test.ts`: `embedText` is deterministic (same input → same output), different inputs → different vectors, output length === 384.
- `retrieve.integration.test.ts` (against local CockroachDB, reuse `@contactsafe/db`'s `createPool`/`runMigrations`/`reset`): seed one `memory_chunks` row citing an open promise, one citing a superseded/expired promise; assert `retrieveRelevantMemory` marks them `currentlyValid` accordingly and orders by vector distance.

`packages/bedrock`:
- `fixturePlanner.test.ts`: given an evidence packet with one current promise fact, the plan cites exactly that fact ID and quotes its text; given zero current facts, `intent === "do_not_contact"` and `citedFactIds` is still non-empty only if `OutreachPlanSchema` requires it — if no fact can be honestly cited, cite the fact(s) explaining *why* contact is being declined (e.g. the stale/superseded fact ID) rather than violating the "at least one citation" schema rule with a fabricated ID.
- `createOutreachPlanner.test.ts`: `BEDROCK_MODE` unset or `"fixture"` → returns a `FixtureOutreachPlanner` instance; `"live"` → returns a `BedrockOutreachPlanner` instance without throwing even with no AWS credentials present.

## Self-review checklist

- [ ] No package here ever imports `packages/db`'s `withSerializableRetry` (reads happen outside the authorization transaction).
- [ ] Fixture planner never invents a `factId` not present in the evidence packet it received.
- [ ] `pnpm --filter @contactsafe/memory typecheck && test && test:integration` and `pnpm --filter @contactsafe/bedrock typecheck && test` all pass.
- [ ] Commit `packages/memory` and `packages/bedrock` as two separate commits.
