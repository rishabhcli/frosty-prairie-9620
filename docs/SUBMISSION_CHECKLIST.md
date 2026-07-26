# Hackathon submission checklist — CockroachDB × AWS Agentic Memory Hackathon

Source of truth for live rules: <https://cockroachdb-ai.devpost.com/> (last checked
2026-07-20 — re-check before submitting, per `docs/CURRENT_SOURCES.md`). Deadline:
**August 18, 2026, 5:00pm EDT**.

## Done in this repository (no further action needed)

- [x] Public open-source repository with a license file — `LICENSE` (Apache-2.0, matches
      `package.json`'s `"license": "Apache-2.0"`).
- [x] Clear README with setup/run instructions — [README.md](../README.md) "Local setup".
- [x] Video demonstrates the CockroachDB memory layer at work — real footage of the
      transactional lease/outbox mechanism, the distributed vector index, and crash recovery.
- [x] Documentation identifying which CockroachDB and AWS tools were used —
      [docs/INTEGRATIONS.md](INTEGRATIONS.md).
- [x] At least two CockroachDB qualifying features: **Distributed Vector Indexing** (real,
      running — `packages/memory`, `packages/db/migrations/002_vector_index.sql`) +
      **Cloud Managed MCP Server contract** (code-complete adapter, inactive pending a Cloud
      cluster — see INTEGRATIONS.md for why and how to activate).
- [x] At least one AWS service: **Amazon Bedrock** (Converse API adapter implemented and
      unit-tested; runs in disclosed fixture mode pending AWS credentials).
- [x] Video under 3 minutes — final render is 2:27 (147.8s), 32+ seconds under the limit.
- [x] No fabricated users, customers, metrics, or sponsor-integration claims — every number
      in the video/console comes from a committed `eval/reports/*.json` file that was
      actually produced by running the harness against live CockroachDB.

## Requires the human entrant's action before submitting

These are exactly the items [AGENTS.md](../AGENTS.md)'s "Human approval boundary" reserves
for the human entrant — cloud provisioning/cost, credentials, public deployment, and the
submission itself. None of them were performed autonomously in this build.

- [ ] **Provision CockroachDB Cloud** (Serverless or Dedicated) and update `DATABASE_URL`.
      No code changes needed — `packages/db/migrations/` runs unmodified against Cloud.
- [ ] **Enable Cloud Managed MCP** on that cluster and set `COCKROACH_MANAGED_MCP_ENDPOINT`
      / `_API_KEY` (see `.env.example`).
- [ ] **Provision AWS credentials** with Bedrock model access, set `BEDROCK_MODE=live`,
      `AWS_REGION`, `AWS_BEDROCK_MODEL_ID`. Run one real smoke test through
      `packages/bedrock`'s `BedrockOutreachPlanner` before recording anything described as
      "live."
- [ ] **Deploy the live app publicly** (console + API) and record the public URL.
- [ ] **Upload `demo/final/frosty-prairie-9620-demo.mp4`** to YouTube or Vimeo, set to public,
      and paste the link into the submission form.
- [ ] **Re-check the live hackathon rules page** for any changes since 2026-07-20 before
      final submission (per `docs/CURRENT_SOURCES.md`'s own instruction to re-verify close to
      the deadline).
- [ ] **Confirm entrant/team eligibility facts** with Devpost directly — this build never
      alters or asserts eligibility information.
- [ ] **Submit** via the Devpost form.

## Explicitly not done, and why

- Real cloud deployment and spend — reserved for the human entrant (cost/credentials
  decision), per the local-only decision recorded in `docs/CURRENT_SOURCES.md`.
- Uploading the video publicly — a publish action requiring explicit human authorization.
- Submitting the Devpost form — the actual submission action.
