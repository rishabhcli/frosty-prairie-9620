import { describe, it, expect } from "vitest";
import { OutreachPlanSchema } from "./plan.js";

describe("OutreachPlanSchema", () => {
  it("accepts a valid plan citing at least one fact", () => {
    const result = OutreachPlanSchema.safeParse({
      intent: "fulfill_promise",
      channel: "email",
      citedFactIds: ["promise:123"],
      proposedSubject: "Your revised quote",
      proposedBody: "As promised, here is the revised quote.",
      proposedNotBefore: "2026-07-22T00:00:00.000Z",
      uncertainties: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a plan with zero cited facts", () => {
    const result = OutreachPlanSchema.safeParse({
      intent: "follow_up",
      channel: "email",
      citedFactIds: [],
      proposedSubject: "Hi",
      proposedBody: "Following up.",
      proposedNotBefore: "2026-07-22T00:00:00.000Z",
      uncertainties: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid intent", () => {
    const result = OutreachPlanSchema.safeParse({
      intent: "cold_call",
      channel: "email",
      citedFactIds: ["promise:123"],
      proposedSubject: "Hi",
      proposedBody: "Hi",
      proposedNotBefore: "2026-07-22T00:00:00.000Z",
      uncertainties: [],
    });
    expect(result.success).toBe(false);
  });
});
