import { z } from "zod";

export const PolicyOutcome = z.enum(["allow", "block", "review"]);
export type PolicyOutcome = z.infer<typeof PolicyOutcome>;

export const PolicyReasonCode = z.enum([
  "consent_missing",
  "consent_revoked",
  "quiet_hours",
  "frequency_cap_exceeded",
  "promise_timing_not_yet_due",
  "campaign_suppressed",
  "missing_cited_facts",
  "stale_cited_facts",
  "task_already_completed",
  "lease_unavailable",
  "ok",
]);
export type PolicyReasonCode = z.infer<typeof PolicyReasonCode>;

export const PolicyDecisionSchema = z.object({
  tenantId: z.string().uuid(),
  policyDecisionId: z.string().uuid(),
  contactId: z.string().uuid(),
  ruleVersion: z.string().min(1),
  outcome: PolicyOutcome,
  reasonCodes: z.array(PolicyReasonCode),
  evidenceFactIds: z.array(z.string()),
  planHash: z.string().min(1),
  decidedAt: z.string(),
});
export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;

export const POLICY_RULE_VERSION = "policy-v1";
