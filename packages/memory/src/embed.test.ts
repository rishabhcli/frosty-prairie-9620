import { describe, it, expect } from "vitest";
import { embedText } from "./embed.js";
import { MEMORY_EMBEDDING_DIMENSIONS } from "@contactsafe/contracts";

describe("embedText", () => {
  it("is deterministic for the same input", () => {
    expect(embedText("email the revised quote after Tuesday")).toEqual(
      embedText("email the revised quote after Tuesday")
    );
  });

  it("produces different vectors for different inputs", () => {
    expect(embedText("hello")).not.toEqual(embedText("goodbye"));
  });

  it("produces a unit-length vector of the contracted dimensionality", () => {
    const vector = embedText("some memory text");
    expect(vector).toHaveLength(MEMORY_EMBEDDING_DIMENSIONS);
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    expect(magnitude).toBeCloseTo(1, 5);
  });
});
