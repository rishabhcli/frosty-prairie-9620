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
- [x] One qualifying CockroachDB feature: **Distributed Vector Indexing** (real, running —
      `packages/memory`, `packages/db/migrations/002_vector_index.sql`).
- [ ] A second qualifying CockroachDB tool. The Managed MCP endpoint has not been run; a
      local contract or inactive adapter does not satisfy this requirement.
- [ ] At least one AWS service used in the working project. The Amazon Bedrock Converse
      adapter is implemented and unit-tested, but the demonstrated planner is a fixture and
      no AWS credentials or deployment are configured.
- [x] Video under 3 minutes — corrected final render is 149.952s (2:30), 30+ seconds under
      the limit.
- [x] Video uploaded unlisted first with custom thumbnail, timed English captions, HD
      processing, and clear initial checks: <https://youtu.be/vHthteCZzjk>.
- [x] No fabricated users, customers, metrics, or sponsor-integration claims — every number
      in the video/console comes from a committed `eval/reports/*.json` file that was
      actually produced by running the harness against live CockroachDB.

## Still required before a truthful final submission

The entrant authorized autonomous upload and submission work on 2026-07-29. The remaining
items are technical or account-state blockers, not approval blockers.

- [ ] **Provision CockroachDB Cloud** (Serverless or Dedicated) and update `DATABASE_URL`.
      No code changes needed — `packages/db/migrations/` runs unmodified against Cloud.
- [ ] **Enable Cloud Managed MCP** on that cluster and set `COCKROACH_MANAGED_MCP_ENDPOINT`
      / `_API_KEY` (see `.env.example`).
- [ ] **Provision AWS credentials** with Bedrock model access, set `BEDROCK_MODE=live`,
      `AWS_REGION`, `AWS_BEDROCK_MODEL_ID`. Run one real smoke test through
      `packages/bedrock`'s `BedrockOutreachPlanner` before recording anything described as
      "live."
- [ ] **Deploy the live app publicly** (console + API) and record the public URL.
- [ ] **Change the verified upload to public** only after the sponsor integrations and public
      deployment are real; the event requires a public YouTube/Vimeo video.
- [ ] **Re-check the live hackathon rules page** for any changes since 2026-07-20 before
      final submission (per `docs/CURRENT_SOURCES.md`'s own instruction to re-verify close to
      the deadline).
- [ ] **Confirm entrant/team eligibility facts** with Devpost directly — this build never
      alters or asserts eligibility information.
- [ ] **Submit** via the Devpost form.

## Explicitly not done

- Real Cloud/AWS integration and deployment — no configured CockroachDB Cloud cluster, AWS
  credentials, or deploy target exists in this environment.
- Public video — held unlisted so an ineligible sponsor-integration state is not presented as
  a final entry.
- Devpost final submission — blocked by the missing qualifying integrations, AWS deployment,
  functional public URL, and public video.
