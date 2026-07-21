import { MEMORY_EMBEDDING_DIMENSIONS } from "@contactsafe/contracts";

/**
 * Deterministic local fixture embedding — no Bedrock embeddings credentials exist in this
 * environment (docs/CURRENT_SOURCES.md). Same text always maps to the same unit vector, so
 * retrieval/citation behavior is reproducible for tests and the demo. Swap for a real
 * BedrockEmbeddingProvider by implementing the same `embed(text): Promise<number[]>` shape.
 */
export function embedText(text: string): number[] {
  const vector = new Array<number>(MEMORY_EMBEDDING_DIMENSIONS);
  let h1 = 0x811c9dc5;
  for (let dim = 0; dim < MEMORY_EMBEDDING_DIMENSIONS; dim++) {
    // FNV-1a-style rolling hash seeded per-dimension so each component is a
    // different (but deterministic) function of the input text.
    let h = h1 ^ dim;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h1 = h;
    // Map the 32-bit hash into [-1, 1].
    vector[dim] = ((h >>> 0) / 0xffffffff) * 2 - 1;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  return magnitude === 0 ? vector : vector.map((v) => v / magnitude);
}

export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}
