# Build evidence: skills used and what they changed

Per the run's instructions, this records which available skills were materially used during
this build and what they actually changed (not just mentioned).

## superpowers:writing-plans

Used before implementing the foundation subsystem (monorepo, contracts, CockroachDB schema,
serializable-retry helper). Produced `docs/superpowers/plans/2026-07-20-foundation.md` and
`docs/superpowers/plans/2026-07-20-policy-engine.md`, with concrete file paths, full SQL/TS
code per step, and TDD ordering (failing test → implementation → passing test → commit).
Later subsystems (memory/bedrock, services, console, eval) were planned more lightly inline
given the same agent was both planner and sole implementer — the skill's own guidance to
break multi-subsystem specs into separate per-subsystem plans was followed for the two
highest-risk subsystems (transactional core, policy rules) where getting the design wrong
would have been most expensive to unwind.

## superpowers:test-driven-development

Applied throughout: `packages/policy`'s 17 boundary-case tests, `packages/db`'s serializable-
retry integration test (two concurrent transactions incrementing the same counter),
`services/agent-worker`'s race/idempotency/consent tests, and `services/outbox-worker`'s
crash-recovery test were all written before or alongside the implementation, run to a real
pass/fail against a live CockroachDB instance — not asserted from reading the code.

## superpowers:systematic-debugging

Used to root-cause several real failures rather than patching symptoms:
- The initial 1000-race fault-injection scenarios failed; root cause was that
  `claimAndDeliverOne()` is correctly a tenant-wide queue drain, so scenarios that created
  outbox rows without draining between steps picked up each other's rows. Fixed the test
  harness (`eval/faults/run.ts`), not the product.
- A revoked-consent race produced one "blocked" and one "conflict" outcome instead of two
  "blocked" outcomes. Root cause: `runAgentAttempt()` acquired the contact lease *before*
  evaluating policy, so the loser's lease contention masked the real reason. Reordered to
  evaluate policy optimistically first, only contending for the lease once policy would
  actually allow (`services/agent-worker/src/authorize.ts`).
- The demo capture script's "kill the outbox worker" step silently didn't kill anything;
  root cause was `pnpm --filter ... start` spawning tsx as a grandchild process, so
  `child.kill()` only killed the pnpm wrapper. Fixed by spawning tsx directly.
- Video pixel format came out as `yuvj420p` instead of the required `yuv420p`; traced to
  Remotion's JPEG frame-capture format tagging full-range color. Switched to PNG capture.
- The rendered mix was flat-volume with no real ducking and ~7 LU under the -16 LUFS
  target; added a real per-frame volume envelope keyed to actual narration Sequence
  placement, then a two-pass ffmpeg `loudnorm` for exact compliance.

## superpowers:verification-before-completion

No package was marked done without running its actual test command and reading the output.
The 1000-race, 6-scenario fault-injection, and memory evaluations were run against live
CockroachDB, not asserted from code review. The final MP4 was validated with `ffprobe`
(resolution/codec/pixel-format/duration) and `ffmpeg loudnorm` (integrated loudness/true
peak), and inspected frame-by-frame (beginning, middle, critical-result, ending) rather than
trusting a successful render-command exit code.

## frontend-design:frontend-design

Used before building `apps/console`. Produced a token system (dark control-room palette,
Fragment Mono + IBM Plex Sans pairing, the fencing-token panel as the signature element)
deliberately avoiding the three generic-AI-design defaults the skill warns about (cream/serif,
near-black/single-accent dashboard, broadsheet-hairline layout) in favor of a ledger/audit-
trail metaphor grounded in the product's actual mechanism (append-only facts, fencing
tokens, policy decisions) rather than a generic dashboard-card grid.

## Browser verification (preview_* tools)

Used throughout, not just at the end: initial manual walkthrough of the judge journey,
axe-core accessibility scans against every reachable UI state (initial, racing, revoked,
delivery-canceled, empty-outbox-queue) at desktop/tablet/mobile viewports — which is how the
two real WCAG contrast failures and the missing `<h1>` were actually found, not assumed absent.

## What this build does NOT claim

No skill for a domain absent from this repository (no native macOS/SwiftUI work, no Figma,
no Stripe, no other sponsor products) was invoked, because none applied.
