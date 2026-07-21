import { POLICY_RULE_VERSION, type PolicyReasonCode } from "@contactsafe/contracts";
import type { PolicyEvaluationInput, PolicyEvaluationResult } from "./types.js";

function isQuietHours(quietHours: PolicyEvaluationInput["quietHours"]): boolean {
  if (!quietHours) return false;
  const { startHourLocal: start, endHourLocal: end, nowHourLocal: now } = quietHours;
  if (start === end) return false;
  if (start < end) return now >= start && now < end;
  // wraparound window, e.g. 21 -> 8 means quiet from 21:00 through 07:59
  return now >= start || now < end;
}

function countRecentAttempts(input: PolicyEvaluationInput): number {
  const windowStart = input.now.getTime() - input.frequencyCap.windowHours * 60 * 60 * 1000;
  return input.recentAttempts.filter((a) => a.attemptedAt.getTime() >= windowStart).length;
}

export function evaluatePolicy(input: PolicyEvaluationInput): PolicyEvaluationResult {
  const reasons: PolicyReasonCode[] = [];

  if (input.taskAlreadyCompleted) {
    reasons.push("task_already_completed");
  }

  if (!input.consent || input.consent.status !== "granted") {
    reasons.push(input.consent?.status === "revoked" ? "consent_revoked" : "consent_missing");
  }

  if (input.campaignSuppressed) {
    reasons.push("campaign_suppressed");
  }

  if (isQuietHours(input.quietHours)) {
    reasons.push("quiet_hours");
  }

  if (countRecentAttempts(input) >= input.frequencyCap.maxAttempts) {
    reasons.push("frequency_cap_exceeded");
  }

  if (
    input.activePromise &&
    input.activePromise.status === "open" &&
    input.now.getTime() < input.activePromise.dueWindowStart.getTime()
  ) {
    reasons.push("promise_timing_not_yet_due");
  }

  if (input.plan.citedFactIds.length === 0) {
    reasons.push("missing_cited_facts");
  } else if (!input.plan.citedFactIds.every((id) => input.availableFactIds.has(id))) {
    reasons.push("stale_cited_facts");
  }

  if (reasons.length > 0) {
    return { outcome: "block", reasonCodes: reasons, ruleVersion: POLICY_RULE_VERSION };
  }

  if (!input.leaseAvailable) {
    return { outcome: "review", reasonCodes: ["lease_unavailable"], ruleVersion: POLICY_RULE_VERSION };
  }

  return { outcome: "allow", reasonCodes: ["ok"], ruleVersion: POLICY_RULE_VERSION };
}
