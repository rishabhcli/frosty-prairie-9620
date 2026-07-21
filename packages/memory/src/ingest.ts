import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { embedText, toVectorLiteral } from "./embed.js";

export interface MemoryChunkInput {
  tenantId: string;
  contactId: string;
  sourceType: string;
  sourceRef: string;
  textSummary: string;
  effectiveAt: string;
  checksum: string;
}

export async function ingestMemoryChunk(pool: Pool, chunk: MemoryChunkInput): Promise<void> {
  const embedding = embedText(chunk.textSummary);
  await pool.query(
    `INSERT INTO memory_chunks
       (tenant_id, chunk_id, contact_id, source_type, source_ref, text_summary, effective_at, checksum, embedding)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::VECTOR)`,
    [
      chunk.tenantId,
      randomUUID(),
      chunk.contactId,
      chunk.sourceType,
      chunk.sourceRef,
      chunk.textSummary,
      chunk.effectiveAt,
      chunk.checksum,
      toVectorLiteral(embedding),
    ]
  );
}
