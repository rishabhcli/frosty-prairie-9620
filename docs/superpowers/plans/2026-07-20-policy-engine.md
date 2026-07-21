# Policy Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development to implement this plan. Write the failing test before each rule, run it, then implement.

**Goal:** A pure, deterministic, versioned policy engine (`packages/policy`) that decides `allow` / `block` / `review` for a proposed outreach action, per PLAN.md §7 and AGENTS.md non-negotiables #2/#3/#7.

**Architecture:** One pure function, `evaluatePolicy(input): PolicyEvaluationResult`. No I/O, no `Date.now()` internally (caller passes `now`), no network calls — so it is safe to call synchronously inside a CockroachDB serializable transaction (AGENTS.md: "Network/model calls never occur inside the CockroachDB authorization transaction"). Bedrock's plan is an *input*, never an authority: the function must be able to reach `block`/`review` even when the plan itself looks fine, purely from consent/lease/frequency/citation facts.

**Tech Stack:** TypeScript strict, Zod (reuse `@contactsafe/contracts`), Vitest.

## Global Constraints

- Reuse types from `@contactsafe/contracts`: `PolicyOutcome`, `PolicyReasonCode`, `POLICY_RULE_VERSION`, `OutreachPlan`, `ConsentStatus`, `PromiseStatus` — do not redefine these enums.
- `evaluatePolicy` must be a pure, synchronous function (no `async`, no imports of `pg`/`@contactsafe/db`).
- Package layout matches siblings: `packages/policy/package.json` (name `@contactsafe/policy`, scripts `build`/`typecheck`/`test`), `packages/policy/tsconfig.json` (extends `../../tsconfig.base.json`).
- AGENTS.md non-negotiable #3: "Vector memories and model summaries never authorize contact" — the function must never `allow` based on `plan.uncertainties` being empty or the plan "looking confident"; only authoritative facts (consent/lease/frequency/promise/citation availability) can produce `allow`.

## Required Interface (other packages will import this exact shape)

```typescript
// packages/policy/src/types.ts
import type { ConsentStatus, OutreachPlan, PolicyOutcome, PolicyReasonCode, PromiseStatus } from "@contactsafe/contracts";

export interface PolicyEvaluationInput {
  now: Date;
  consent: { status: ConsentStatus; effectiveAt: Date } | null;
  campaignSuppressed: boolean;
  /** Local-time quiet hours boundary; caller resolves timezone before calling. */
  quietHours: { startHourLocal: number; endHourLocal: number; nowHourLocal: number } | null;
  recentAttempts: { attemptedAt: Date }[];
  frequencyCap: { maxAttempts: number; windowHours: number };
  activePromise: { dueWindowStart: Date; dueWindowEnd: Date; status: PromiseStatus } | null;
  plan: OutreachPlan;
  /** Fact IDs that currently exist and are current (joined from authoritative tables). */
  availableFactIds: ReadonlySet<string>;
  taskAlreadyCompleted: boolean;
  leaseAvailable: boolean;
}

export interface PolicyEvaluationResult {
  outcome: PolicyOutcome;
  reasonCodes: PolicyReasonCode[];
  ruleVersion: string;
}
```

```typescript
// packages/policy/src/evaluate.ts
export function evaluatePolicy(input: PolicyEvaluationInput): PolicyEvaluationResult;
```

## Rule order (evaluate in this order; first disqualifying rule short-circuits to `block`, except `review` cases noted)

1. `taskAlreadyCompleted` → `block`, reason `task_already_completed` (idempotent no-op, not an error).
2. `consent` is `null` or `status !== "granted"` → `block`, reason `consent_missing` (null/unknown) or `consent_revoked` (explicitly revoked).
3. `campaignSuppressed` → `block`, reason `campaign_suppressed`.
4. `quietHours` present and `nowHourLocal` outside `[startHourLocal, endHourLocal)` (handle wraparound, e.g. start=21,end=8) → `block`, reason `quiet_hours`.
5. `recentAttempts` within `frequencyCap.windowHours` of `now` count `>= frequencyCap.maxAttempts` → `block`, reason `frequency_cap_exceeded`.
6. `activePromise` exists, `status === "open"`, and `now < activePromise.dueWindowStart` → `block`, reason `promise_timing_not_yet_due`.
7. Any `plan.citedFactIds` not present in `availableFactIds` → `block`, reason `stale_cited_facts` (if `availableFactIds` is non-empty but doesn't cover all cited IDs) or `missing_cited_facts` (if `plan.citedFactIds` is empty — Zod already forbids this, but defend anyway).
8. `!leaseAvailable` → `review`, reason `lease_unavailable` (not `block`: a concurrent worker may hold it briefly; caller decides whether to retry).
9. Otherwise → `allow`, reason `["ok"]`.

Each result includes **all** applicable reason codes for that outcome, not just the first (e.g. a blocked case failing both consent and quiet-hours should report both) — but if `taskAlreadyCompleted` or consent block early rules fire, still evaluate and append any other independently-true block reasons from rules 3–7 for auditability (rule 8 is only reached if nothing in 1–7 blocked).

## Required tests (`packages/policy/src/evaluate.test.ts`) — one boundary case per numbered rule above, plus:

- happy path: all facts good → `allow`, `["ok"]`, `ruleVersion === POLICY_RULE_VERSION`.
- quiet-hours wraparound (e.g. quiet 21:00–08:00, `nowHourLocal = 23` → blocked; `nowHourLocal = 9` → not blocked by this rule).
- frequency cap exact boundary: attempts count `=== maxAttempts` blocks, `maxAttempts - 1` does not.
- promise due-window boundary: `now === dueWindowStart` does NOT block (>= is due), `now = dueWindowStart - 1ms` does block.
- multiple simultaneous block reasons appear together in `reasonCodes`.
- a plan with high "confidence" (empty `uncertainties`) still blocks when consent is revoked — proves the model never overrides policy.

## Self-review checklist for the implementer

- [ ] Every `PolicyReasonCode` enum value from `@contactsafe/contracts` (`packages/contracts/src/policy.ts`) is reachable by at least one test.
- [ ] No `any`, no network/DB imports.
- [ ] `pnpm --filter @contactsafe/policy typecheck && pnpm --filter @contactsafe/policy test` both pass.
- [ ] Commit with message `feat(policy): add deterministic outreach authorization rules`.
