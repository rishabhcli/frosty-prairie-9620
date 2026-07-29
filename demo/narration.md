# ContactSafe — Narration Script

Written for speech, not for reading. Short sentences. Natural pauses marked with `//`. Target pace: 135–155 wpm. Each scene is generated as its own clip (see `demo/scripts/narrate.py`) so pacing can be tuned per scene without time-stretching the whole track.

Voice direction column notes the emotional register for that line — passed to the human doing take selection, not spoken aloud.

---

## Scene 1 — The problem (0:00–0:15, ~13 words/9s of speech + 6s silent hook)

**Direction:** calm, slightly urgent — naming a real failure mode, not selling.

> Two agents. One customer. // Both remember the conversation. // Neither one knows what the other's about to do.

## Scene 2 — Two workers race (0:15–0:48, ~78 words)

**Direction:** engaged, explaining while it happens on screen — present tense, like narrating a demo live.

> Here's Jordan. // Jordan got a promise last week: "I'll email the revised quote after Tuesday." // Now two agents both pick up the follow-up task at the same instant. // Agent A and Agent B each query CockroachDB for the same thing — Jordan's consent, the open promise, and anything similar in vector memory. // Both get the same answer back, with citations. // Both are about to act. // That's the moment most systems get this wrong.

## Scene 3 — Transaction result (0:48–1:18, ~68 words)

**Direction:** confident, a little relieved — the payoff beat.

> Watch the lease. // Agent B gets there first — one serializable transaction, one fenced lease, one outbox row, committed. // Agent A retries a beat later, sees a newer fencing token, and backs off cleanly. // No duplicate email. // No coin flip. // CockroachDB didn't just store the memory — it decided, transactionally, who gets to act on it.

## Scene 4 — Revoke consent (1:18–1:43, ~52 words)

**Direction:** serious, a step slower — this is the trust-boundary moment.

> Now Jordan revokes email consent. // The email from a moment ago is still sitting in the queue, waiting to send. // Doesn't matter that it was already approved. // Before delivery, the worker rechecks consent one more time — and this time it's revoked. // The send gets canceled, not sent, before anything goes out.

## Scene 5 — Crash and recovery (1:43–2:08, ~55 words)

**Direction:** even, procedural — showing the system holding up under failure.

> One more test: kill the outbox worker mid-delivery. // On restart, it doesn't guess. // It rechecks consent, rechecks the fencing token, and finds the one pending row it already approved. // It resumes that — and only that. // No second send. No lost task.

## Scene 6 — Feature proof and metrics (2:08–2:35, ~62 words)

**Direction:** matter-of-fact, precise — this is the evidence section, let the numbers carry it.

> Under the hood, CockroachDB's distributed vector index really runs for recall. // Managed MCP and AWS Bedrock are target integrations only; neither ran in this demo. // We ran one thousand concurrent, retried attempts at this exact local race. // One approved action. // Zero duplicates. // Zero consent violations. // The sponsor integration minimum remains unfinished.

## Scene 7 — Honest limitation (2:35–2:48, ~28 words)

**Direction:** grounded, no spin — say the limit plainly.

> This demo sends through a sandbox provider, not a live inbox. // And ContactSafe enforces the policy you configure — it isn't a compliance review on its own.

## Scene 8 — Closing outcome (2:48–2:53, ~11 words)

**Direction:** warm, brief — a clean landing, not a sales close.

> Shared memory made two agents safe to run together. // That's ContactSafe.

---

## Word-count / pacing check

| Scene | Window | Duration | Words | Target wpm |
|---|---|---|---|---|
| 1 | 0:00–0:15 | 15s | 21 | ~84 (deliberately slower — it's the hook) |
| 2 | 0:15–0:48 | 33s | 78 | ~142 |
| 3 | 0:48–1:18 | 30s | 68 | ~136 |
| 4 | 1:18–1:43 | 25s | 52 | ~125 |
| 5 | 1:43–2:08 | 25s | 55 | ~132 |
| 6 | 2:08–2:35 | 27s | 62 | ~138 |
| 7 | 2:35–2:48 | 13s | 28 | ~129 |
| 8 | 2:48–2:53 | 5s | 11 | ~132 |

Total spoken runtime target: ~2:53, five seconds under the 3:00 hard limit — see `demo/demo.yaml` for the authoritative scene timing and `docs/CURRENT_SOURCES.md` for the live event's video-length rule.
