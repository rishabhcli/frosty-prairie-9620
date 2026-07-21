import type { OutreachPlan } from "@contactsafe/contracts";

export interface EvidenceFact {
  factId: string;
  kind: "promise" | "consent" | "memory";
  text: string;
  effectiveAt: string;
  current: boolean;
}

export interface EvidencePacket {
  contactId: string;
  facts: EvidenceFact[];
  goal: "follow_up" | "fulfill_promise" | "clarify";
}

/**
 * Plans a draft outreach action from a read-only evidence packet. Implementations must
 * never accept a DB pool or an outbox writer -- this is a planning-only boundary
 * (AGENTS.md non-negotiable #4: Bedrock cannot call the sender or mutate consent/policy/
 * leases directly).
 */
export interface OutreachPlanner {
  plan(evidence: EvidencePacket): Promise<OutreachPlan>;
}
