import { describe, it, expect } from "vitest";
import { FixtureOutreachPlanner } from "./fixturePlanner.js";
import type { EvidencePacket } from "./planner.js";

describe("FixtureOutreachPlanner", () => {
  const planner = new FixtureOutreachPlanner();

  it("cites the current fact and quotes its text when one current fact is present", async () => {
    const evidence: EvidencePacket = {
      contactId: "contact-1",
      goal: "fulfill_promise",
      facts: [
        {
          factId: "promise:1",
          kind: "promise",
          text: "email the revised quote after Tuesday",
          effectiveAt: "2026-07-15T00:00:00.000Z",
          current: true,
        },
      ],
    };

    const plan = await planner.plan(evidence);
    expect(plan.intent).toBe("fulfill_promise");
    expect(plan.citedFactIds).toEqual(["promise:1"]);
    expect(plan.proposedBody).toContain("email the revised quote after Tuesday");
  });

  it("declines and cites the stale fact when no current fact exists, without fabricating an ID", async () => {
    const evidence: EvidencePacket = {
      contactId: "contact-1",
      goal: "follow_up",
      facts: [
        {
          factId: "promise:expired-1",
          kind: "promise",
          text: "follow up next week",
          effectiveAt: "2026-06-01T00:00:00.000Z",
          current: false,
        },
      ],
    };

    const plan = await planner.plan(evidence);
    expect(plan.intent).toBe("do_not_contact");
    expect(plan.citedFactIds).toEqual(["promise:expired-1"]);
    expect(plan.uncertainties.length).toBeGreaterThan(0);
  });

  it("never cites a fact ID absent from the evidence packet", async () => {
    const evidence: EvidencePacket = {
      contactId: "contact-1",
      goal: "clarify",
      facts: [
        { factId: "memory:a", kind: "memory", text: "some note", effectiveAt: "2026-07-01T00:00:00.000Z", current: true },
        { factId: "memory:b", kind: "memory", text: "another note", effectiveAt: "2026-07-10T00:00:00.000Z", current: false },
      ],
    };

    const plan = await planner.plan(evidence);
    const knownIds = new Set(evidence.facts.map((f) => f.factId));
    for (const id of plan.citedFactIds) {
      expect(knownIds.has(id)).toBe(true);
    }
  });
});
