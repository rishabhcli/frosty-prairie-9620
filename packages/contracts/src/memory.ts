import { z } from "zod";

export const MemoryChunkSchema = z.object({
  tenantId: z.string().uuid(),
  chunkId: z.string().uuid(),
  contactId: z.string().uuid(),
  sourceType: z.string().min(1),
  sourceRef: z.string().min(1),
  textSummary: z.string().min(1),
  effectiveAt: z.string(),
  superseded: z.boolean(),
  checksum: z.string().min(1),
  embedding: z.array(z.number()).length(384),
  createdAt: z.string(),
});
export type MemoryChunk = z.infer<typeof MemoryChunkSchema>;

export const MEMORY_EMBEDDING_DIMENSIONS = 384;
