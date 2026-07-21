import type { Pool } from "pg";
import type { EvidenceFact, EvidencePacket } from "@contactsafe/bedrock";
import { embedText, retrieveRelevantMemory } from "@contactsafe/memory";
import type { ConsentStatus, PromiseStatus } from "@contactsafe/contracts";

export interface RecalledPromise {
  promiseId: string;
  dueWindowStart: Date;
  dueWindowEnd: Date;
  status: PromiseStatus;
  sourceQuote: string;
}

export interface RecalledEvidence {
  consent: { status: ConsentStatus; effectiveAt: Date } | null;
  activePromise: RecalledPromise | null;
  recentAttempts: { attemptedAt: Date }[];
}

const CHANNEL = "email" as const;

export async function recallEvidence(
  pool: Pool,
  params: { tenantId: string; contactId: string }
): Promise<RecalledEvidence> {
  const { tenantId, contactId } = params;

  const { rows: consentRows } = await pool.query(
    `SELECT status, effective_at FROM consent_events
     WHERE tenant_id = $1 AND contact_id = $2 AND channel = $3
     ORDER BY effective_at DESC LIMIT 1`,
    [tenantId, contactId, CHANNEL]
  );
  const consent = consentRows.length > 0 ? { status: consentRows[0].status, effectiveAt: new Date(consentRows[0].effective_at) } : null;

  const { rows: promiseRows } = await pool.query(
    `SELECT promise_id, due_window_start, due_window_end, status, source_quote FROM promises
     WHERE tenant_id = $1 AND contact_id = $2 AND status = 'open'
     ORDER BY due_window_start ASC LIMIT 1`,
    [tenantId, contactId]
  );
  const activePromise: RecalledPromise | null =
    promiseRows.length > 0
      ? {
          promiseId: promiseRows[0].promise_id,
          dueWindowStart: new Date(promiseRows[0].due_window_start),
          dueWindowEnd: new Date(promiseRows[0].due_window_end),
          status: promiseRows[0].status,
          sourceQuote: promiseRows[0].source_quote,
        }
      : null;

  const { rows: attemptRows } = await pool.query(
    `SELECT attempted_at FROM contact_attempts WHERE tenant_id = $1 AND contact_id = $2 AND channel = $3
     ORDER BY attempted_at DESC LIMIT 50`,
    [tenantId, contactId, CHANNEL]
  );
  const recentAttempts = attemptRows.map((r) => ({ attemptedAt: new Date(r.attempted_at) }));

  return { consent, activePromise, recentAttempts };
}

export async function buildEvidencePacket(
  pool: Pool,
  params: { tenantId: string; contactId: string; recalled: RecalledEvidence; goal: EvidencePacket["goal"] }
): Promise<EvidencePacket> {
  const { tenantId, contactId, recalled, goal } = params;
  const facts: EvidenceFact[] = [];

  if (recalled.activePromise) {
    facts.push({
      factId: `promise:${recalled.activePromise.promiseId}`,
      kind: "promise",
      text: recalled.activePromise.sourceQuote,
      effectiveAt: recalled.activePromise.dueWindowStart.toISOString(),
      current: recalled.activePromise.status === "open",
    });
  }

  const queryText = recalled.activePromise?.sourceQuote ?? "follow up";
  const memoryChunks = await retrieveRelevantMemory(pool, {
    tenantId,
    contactId,
    queryEmbedding: embedText(queryText),
    topK: 5,
  });
  for (const chunk of memoryChunks) {
    facts.push({
      factId: `memory:${chunk.chunkId}`,
      kind: "memory",
      text: chunk.textSummary,
      effectiveAt: chunk.effectiveAt,
      current: chunk.currentlyValid,
    });
  }

  if (facts.length === 0) {
    // No promise and no memory: fall back to the consent fact itself so the planner
    // always has at least one fact to reason (and abstain) from.
    facts.push({
      factId: `consent:${CHANNEL}`,
      kind: "consent",
      text: recalled.consent ? `consent status: ${recalled.consent.status}` : "no consent on file",
      effectiveAt: (recalled.consent?.effectiveAt ?? new Date()).toISOString(),
      current: recalled.consent?.status === "granted",
    });
  }

  return { contactId, facts, goal };
}
