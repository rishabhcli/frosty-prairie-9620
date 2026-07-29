# Hackathon submission checklist — CockroachDB × AWS Agentic Memory Hackathon

Source of truth for live rules: <https://cockroachdb-ai.devpost.com/> (last checked
2026-07-29 — re-check again immediately before submitting, per `docs/CURRENT_SOURCES.md`). Deadline:
**August 18, 2026, 5:00pm EDT**.

## Done in this repository (no further action needed)

- [x] Public open-source repository with a license file — `LICENSE` (Apache-2.0, matches
      `package.json`'s `"license": "Apache-2.0"`).
- [x] Clear README with setup/run instructions — [README.md](../README.md) "Local setup".
- [x] Video demonstrates the CockroachDB memory layer at work — real footage of the
      transactional lease/outbox mechanism, the distributed vector index, and crash recovery.
- [x] Documentation identifying which CockroachDB and AWS tools were used —
      [docs/INTEGRATIONS.md](INTEGRATIONS.md).
- [x] Human-readable Devpost story, technology list, links, and eight gallery captions —
      [docs/DEVPOST_SUBMISSION.md](DEVPOST_SUBMISSION.md).
- [x] One qualifying CockroachDB feature: **Distributed Vector Indexing** (real, running —
      `packages/memory`, `packages/db/migrations/002_vector_index.sql`).
- [x] A second qualifying CockroachDB tool: official **`ccloud` CLI v0.8.23**, used against
      the live organization to inspect the cluster, create the SQL user and database, and
      verify connection/network state.
- [x] At least one AWS service used in the working project: **AWS Lambda** serves the public
      judge console and API. Secrets Manager and S3 are also part of the deployed stack.
- [x] Video under 3 minutes — final Cloud/Lambda render is 143.600s (shown as 2:24 by
      YouTube), more than 36 seconds under
      the limit.
- [x] Original video uploaded unlisted first with custom thumbnail, timed English captions,
      HD processing, and clear initial checks: <https://youtu.be/vHthteCZzjk>.
- [x] Updated Cloud/Lambda video uploaded unlisted first with its custom thumbnail, timed
      English (United States) captions, human-readable details, and clear initial checks:
      <https://youtu.be/iAy-5f8dMYw>.
- [x] No fabricated users, customers, metrics, or sponsor-integration claims — every number
      in the video/console comes from a committed `eval/reports/*.json` file that was
      actually produced by running the harness against live CockroachDB.

## Still required before a truthful final submission

The entrant authorized autonomous upload and submission work on 2026-07-29. The remaining
items are technical or account-state blockers, not approval blockers.

- [x] **Provision CockroachDB Cloud** and run migrations/evaluations against it.
- [x] **Use a second qualifying CockroachDB tool** (`ccloud`), without claiming Managed MCP.
- [x] **Deploy the live app publicly** on AWS Lambda and record/read back the URL.
- [ ] **Change the verified unlisted video to public immediately before final submission.**
      The event requires a public YouTube/Vimeo video.
- [x] **Re-check the live hackathon rules page** on 2026-07-29.
- [x] **Confirm entrant eligibility facts** through the authenticated Devpost Preferences &
      Eligibility page: current United States location, college-student status, and an age of
      18 on 2026-07-29 satisfy the event's displayed requirements.
- [ ] **Create the Devpost project** — the normal event and portfolio creation paths both
      present simultaneous image reCAPTCHA challenges. No challenge was bypassed. A verified
      support request was sent to the event manager on 2026-07-29.
- [ ] **Submit** via the Devpost form after the protected creation gate is restored.

## Explicitly not done

- Live Bedrock inference — the adapter exists, but AWS Organizations SCP `p-srvmeg1f`
  explicitly denies Bedrock actions in this account.
- Managed MCP — unused and unclaimed; `ccloud` is the second qualifying CockroachDB tool.
- Real outbound messaging — the release deliberately delivers only to the idempotent sandbox
  ledger, never to a customer.
