import { describe, it, expect } from "vitest";
import { percentile } from "./report.js";

describe("percentile", () => {
  it("returns 0 for an empty array", () => {
    expect(percentile([], 95)).toBe(0);
  });

  it("returns the max for p100", () => {
    expect(percentile([1, 5, 3, 2, 4], 100)).toBe(5);
  });

  it("returns the min for a small p", () => {
    expect(percentile([10, 20, 30], 1)).toBe(10);
  });

  it("computes p95 correctly for a known set", () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    expect(percentile(values, 95)).toBe(95);
  });
});
