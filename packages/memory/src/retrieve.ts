import type { Pool } from "pg";
import type { MemoryChunk } from "@contactsafe/contracts";
import { toVectorLiteral } from "./embed.js";

export interface RetrievedMemoryChunk extends MemoryChunk {
  /** False if the authoritative fact this chunk was derived from is no longer current. */
  currentlyValid: boolean;
}

interface MemoryChunkRow {
  tenant_id: string;
  chunk_id: string;
  contact_id: string;
  source_type: string;
  source_ref: string;
  text_summary: string;
  effective_at: string;
  superseded: boolean;
  checksum: string;
  embedding: string;
  created_at: string;
}

function parseVector(literal: string): number[] {
  return literal
    .slice(1, -1)
    .split(",")
    .map((n) => Number(n));
}

async function isPromiseCurrentlyOpen(pool: Pool, tenantId: string, promiseId: string): Promise<boolean> {
  const { rows } = await pool.query(`SELECT status FROM promises WHERE tenant_id = $1 AND promise_id = $2`, [
    tenantId,
    promiseId,
  ]);
  return rows.length > 0 && rows[0].status === "open";
}

async function isConsentCurrentlyGranted(
  pool: Pool,
  tenantId: string,
  contactId: string,
  channel: string
): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT status FROM consent_events
     WHERE tenant_id = $1 AND contact_id = $2 AND channel = $3
     ORDER BY effective_at DESC LIMIT 1`,
    [tenantId, contactId, channel]
  );
  return rows.length > 0 && rows[0].status === "granted";
}

export async function retrieveRelevantMemory(
  pool: Pool,
  params: { tenantId: string; contactId: string; queryEmbedding: number[]; topK: number }
): Promise<RetrievedMemoryChunk[]> {
  const { rows } = await pool.query<MemoryChunkRow>(
    `SELECT tenant_id, chunk_id, contact_id, source_type, source_ref, text_summary,
            effective_at, superseded, checksum, embedding::STRING AS embedding, created_at
     FROM memory_chunks
     WHERE tenant_id = $1 AND contact_id = $2
     ORDER BY embedding <-> $3::VECTOR
     LIMIT $4`,
    [params.tenantId, params.contactId, toVectorLiteral(params.queryEmbedding), params.topK]
  );

  const results: RetrievedMemoryChunk[] = [];
  for (const row of rows) {
    let currentlyValid = !row.superseded;
    if (currentlyValid && row.source_type === "promise") {
      currentlyValid = await isPromiseCurrentlyOpen(pool, row.tenant_id, row.source_ref);
    } else if (currentlyValid && row.source_type === "consent") {
      currentlyValid = await isConsentCurrentlyGranted(pool, row.tenant_id, row.contact_id, row.source_ref);
    }

    results.push({
      tenantId: row.tenant_id,
      chunkId: row.chunk_id,
      contactId: row.contact_id,
      sourceType: row.source_type,
      sourceRef: row.source_ref,
      textSummary: row.text_summary,
      effectiveAt: row.effective_at,
      superseded: row.superseded,
      checksum: row.checksum,
      embedding: parseVector(row.embedding),
      createdAt: row.created_at,
      currentlyValid,
    });
  }
  return results;
}
