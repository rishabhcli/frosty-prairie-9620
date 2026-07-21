import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { runMigrations, reset } from "@contactsafe/db";
import { embedText, ingestMemoryChunk, retrieveRelevantMemory } from "@contactsafe/memory";
import { FixtureOutreachPlanner, type EvidencePacket } from "@contactsafe/bedrock";
import { EVAL_TENANT_ID } from "../lib/fixtureContact.js";
import { writeReport } from "../lib/report.js";

/**
 * Labeled fixture: N synthetic contacts, each with one OPEN promise (the fact that
 * should be recalled and cited), one EXPIRED promise (a stale fact that must not be
 * cited as current), and two unrelated "background note" memory chunks (irrelevant to
 * the query, but not themselves stale/invalid). This measures the property this product
 * actually depends on for safety: does retrieval correctly flag which candidates are
 * still authoritative, and does the planner only ever cite the currentlyValid ones?
 *
 * Caveat, stated plainly: packages/memory's embedText() is a deterministic *fixture*
 * (no Bedrock embeddings credentials exist in this environment -- see
 * docs/CURRENT_SOURCES.md), not a semantic embedding model. It reliably places identical
 * text at distance zero from itself, but does not encode real semantic similarity between
 * different strings. precisionAtK/recallAtK below are therefore computed against the
 * currentlyValid signal (an authoritative-validity property, which is what matters for
 * this product's core safety claim), not against topical/semantic relevance -- that
 * caveat carries over once a real embedding provider is wired in for BEDROCK_MODE=live.
 */

const CONTACT_COUNT = 5;
const TOP_K = 2;

interface FixtureLabels {
  contactId: string;
  openPromiseId: string;
  expiredPromiseId: string;
  openChunkId?: string;
}

async function seedLabeledContact(pool: Pool, i: number): Promise<FixtureLabels> {
  const contactId = randomUUID();
  const openPromiseId = randomUUID();
  const expiredPromiseId = randomUUID();

  await pool.query(
    `INSERT INTO contacts (tenant_id, contact_id, display_name, email_address) VALUES ($1, $2, $3, $4)`,
    [EVAL_TENANT_ID, contactId, `memory-eval-${i}`, `memory-eval-${i}@sandbox.contactsafe.invalid`]
  );
  await pool.query(
    `INSERT INTO consent_events (tenant_id, contact_id, channel, status, effective_at, source_type, source_ref, actor)
     VALUES ($1, $2, 'email', 'granted', now() - interval '1 day', 'eval_fixture', $3, 'eval-harness')`,
    [EVAL_TENANT_ID, contactId, `eval:consent:${contactId}`]
  );
  await pool.query(
    `INSERT INTO promises (tenant_id, contact_id, promise_id, owner, promised_action, due_window_start, due_window_end, status, source_quote, source_event_ref)
     VALUES ($1, $2, $3, 'agent-a', 'email_revised_quote', now(), now() + interval '2 days', 'open',
             $4, $5)`,
    [EVAL_TENANT_ID, contactId, openPromiseId, `email the revised quote after Tuesday (contact ${i})`, `eval:promise:open:${contactId}`]
  );
  await pool.query(
    `INSERT INTO promises (tenant_id, contact_id, promise_id, owner, promised_action, due_window_start, due_window_end, status, source_quote, source_event_ref)
     VALUES ($1, $2, $3, 'agent-a', 'email_follow_up', now() - interval '10 days', now() - interval '8 days', 'expired',
             $4, $5)`,
    [EVAL_TENANT_ID, contactId, expiredPromiseId, `follow up next week (contact ${i})`, `eval:promise:expired:${contactId}`]
  );

  await ingestMemoryChunk(pool, {
    tenantId: EVAL_TENANT_ID,
    contactId,
    sourceType: "promise",
    sourceRef: openPromiseId,
    textSummary: `email the revised quote after Tuesday (contact ${i})`,
    effectiveAt: new Date().toISOString(),
    checksum: `open-${i}`,
  });
  await ingestMemoryChunk(pool, {
    tenantId: EVAL_TENANT_ID,
    contactId,
    sourceType: "promise",
    sourceRef: expiredPromiseId,
    textSummary: `follow up next week (contact ${i})`,
    effectiveAt: new Date().toISOString(),
    checksum: `expired-${i}`,
  });
  await ingestMemoryChunk(pool, {
    tenantId: EVAL_TENANT_ID,
    contactId,
    sourceType: "note",
    sourceRef: `note-a-${i}`,
    textSummary: `unrelated background note A for contact ${i}`,
    effectiveAt: new Date().toISOString(),
    checksum: `note-a-${i}`,
  });
  await ingestMemoryChunk(pool, {
    tenantId: EVAL_TENANT_ID,
    contactId,
    sourceType: "note",
    sourceRef: `note-b-${i}`,
    textSummary: `unrelated background note B for contact ${i}`,
    effectiveAt: new Date().toISOString(),
    checksum: `note-b-${i}`,
  });

  return { contactId, openPromiseId, expiredPromiseId };
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  await runMigrations(pool);
  await reset(pool);
  const planner = new FixtureOutreachPlanner();

  const precisions: number[] = [];
  const recalls: number[] = [];
  let citedFactCount = 0;
  let citedFactValidCount = 0;
  let unsupportedClaimCount = 0;
  let planCount = 0;

  for (let i = 0; i < CONTACT_COUNT; i++) {
    const labels = await seedLabeledContact(pool, i);

    const queryText = `email the revised quote after Tuesday (contact ${i})`;
    const retrieved = await retrieveRelevantMemory(pool, {
      tenantId: EVAL_TENANT_ID,
      contactId: labels.contactId,
      queryEmbedding: embedText(queryText),
      topK: TOP_K,
    });

    const { rows: allChunks } = await pool.query(
      `SELECT chunk_id, superseded FROM memory_chunks WHERE tenant_id = $1 AND contact_id = $2`,
      [EVAL_TENANT_ID, labels.contactId]
    );
    const totalValidInContact = allChunks.filter((c) => !c.superseded).length;

    const validInTopK = retrieved.filter((r) => r.currentlyValid).length;
    precisions.push(retrieved.length > 0 ? validInTopK / retrieved.length : 0);
    recalls.push(totalValidInContact > 0 ? Math.min(1, validInTopK / totalValidInContact) : 0);

    const evidence: EvidencePacket = {
      contactId: labels.contactId,
      goal: "fulfill_promise",
      facts: [
        {
          factId: `promise:${labels.openPromiseId}`,
          kind: "promise",
          text: queryText,
          effectiveAt: new Date().toISOString(),
          current: true,
        },
        {
          factId: `promise:${labels.expiredPromiseId}`,
          kind: "promise",
          text: `follow up next week (contact ${i})`,
          effectiveAt: new Date().toISOString(),
          current: false,
        },
      ],
    };
    const plan = await planner.plan(evidence);
    planCount += 1;
    const knownFactIds = new Set(evidence.facts.map((f) => f.factId));
    const currentFactIds = new Set(evidence.facts.filter((f) => f.current).map((f) => f.factId));
    for (const factId of plan.citedFactIds) {
      citedFactCount += 1;
      if (currentFactIds.has(factId)) citedFactValidCount += 1;
      if (!knownFactIds.has(factId)) unsupportedClaimCount += 1;
    }
    if (plan.intent !== "do_not_contact" && !plan.citedFactIds.every((id) => currentFactIds.has(id))) {
      unsupportedClaimCount += 1;
    }
  }

  const avg = (values: number[]) => (values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0);

  const report = {
    contactCount: CONTACT_COUNT,
    topK: TOP_K,
    precisionAtK: avg(precisions),
    recallAtK: avg(recalls),
    citedFactValidityRate: citedFactCount > 0 ? citedFactValidCount / citedFactCount : 1,
    unsupportedClaimRate: planCount > 0 ? unsupportedClaimCount / planCount : 0,
    methodologyNote:
      "precisionAtK/recallAtK measure retrieval quality against the currentlyValid authoritative signal, not semantic topicality -- embedText() is a deterministic fixture, not a trained embedding model. See eval/memory/run.ts header comment and docs/CURRENT_SOURCES.md.",
  };

  const path = await writeReport("memory.json", report);
  console.log(`[eval:memory] wrote ${path}`);
  console.log(JSON.stringify(report, null, 2));

  const passed = report.citedFactValidityRate === 1 && report.unsupportedClaimRate === 0;
  if (!passed) {
    console.error("[eval:memory] RELEASE GATE FAILED: citations must always resolve to current facts");
    process.exitCode = 1;
  } else {
    console.log("[eval:memory] release gate passed: all plan citations resolve to current facts, zero unsupported claims");
  }

  await pool.end();
}

main().catch((err) => {
  console.error("[eval:memory] fatal", err);
  process.exit(1);
});
