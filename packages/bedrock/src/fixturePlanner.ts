import type { OutreachPlan, OutreachIntent } from "@contactsafe/contracts";
import type { EvidenceFact, EvidencePacket, OutreachPlanner } from "./planner.js";

const GOAL_TO_INTENT: Record<EvidencePacket["goal"], OutreachIntent> = {
  follow_up: "follow_up",
  fulfill_promise: "fulfill_promise",
  clarify: "clarify",
};

function pickHighestPriorityFact(facts: EvidenceFact[]): EvidenceFact | undefined {
  return [...facts].sort((a, b) => new Date(b.effectiveAt).getTime() - new Date(a.effectiveAt).getTime())[0];
}

/**
 * Deterministic stand-in for the real Bedrock Converse call. Every citedFactIds entry is
 * always drawn from the evidence packet it was given -- it never invents a fact ID, even in
 * the abstention path below.
 */
export class FixtureOutreachPlanner implements OutreachPlanner {
  async plan(evidence: EvidencePacket): Promise<OutreachPlan> {
    if (evidence.facts.length === 0) {
      throw new Error("FixtureOutreachPlanner requires at least one evidence fact to plan from");
    }

    const currentFacts = evidence.facts.filter((f) => f.current);
    const now = new Date().toISOString();

    if (currentFacts.length === 0) {
      // Safe-failure / abstention path: nothing current supports contact, so decline and
      // cite the stale fact(s) as the reason rather than fabricating supporting evidence.
      const staleFacts = evidence.facts;
      return {
        intent: "do_not_contact",
        channel: "email",
        citedFactIds: staleFacts.map((f) => f.factId),
        proposedSubject: "No outreach recommended",
        proposedBody: `No current evidence supports contacting this person. The only available facts (${staleFacts
          .map((f) => f.factId)
          .join(", ")}) are no longer current.`,
        proposedNotBefore: now,
        uncertainties: ["no current evidence supports contact"],
      };
    }

    const primaryFact = pickHighestPriorityFact(currentFacts) as EvidenceFact;
    const intent = GOAL_TO_INTENT[evidence.goal];
    const subject =
      intent === "fulfill_promise" ? "Your revised quote, as promised" : "Following up";
    const body =
      intent === "fulfill_promise"
        ? `As promised: ${primaryFact.text}`
        : `Following up on: ${primaryFact.text}`;

    return {
      intent,
      channel: "email",
      citedFactIds: currentFacts.map((f) => f.factId),
      proposedSubject: subject,
      proposedBody: body,
      proposedNotBefore: now,
      uncertainties: [],
    };
  }
}
