import { describe, it, expect } from "vitest";
import { POLICY_RULE_VERSION, type OutreachPlan } from "@contactsafe/contracts";
import { evaluatePolicy } from "./evaluate.js";
import type { PolicyEvaluationInput } from "./types.js";

const NOW = new Date("2026-07-21T12:00:00.000Z");

const BASE_PLAN: OutreachPlan = {
  intent: "fulfill_promise",
  channel: "email",
  citedFactIds: ["promise:1"],
  proposedSubject: "Your revised quote",
  proposedBody: "As promised, here is the revised quote.",
  proposedNotBefore: NOW.toISOString(),
  uncertainties: [],
};

function baseInput(overrides: Partial<PolicyEvaluationInput> = {}): PolicyEvaluationInput {
  return {
    now: NOW,
    consent: { status: "granted", effectiveAt: new Date("2026-07-01T00:00:00.000Z") },
    campaignSuppressed: false,
    quietHours: null,
    recentAttempts: [],
    frequencyCap: { maxAttempts: 3, windowHours: 24 },
    activePromise: null,
    plan: BASE_PLAN,
    availableFactIds: new Set(["promise:1"]),
    taskAlreadyCompleted: false,
    leaseAvailable: true,
    ...overrides,
  };
}

describe("evaluatePolicy", () => {
  it("allows when every fact checks out (happy path)", () => {
    const result = evaluatePolicy(baseInput());
    expect(result).toEqual({ outcome: "allow", reasonCodes: ["ok"], ruleVersion: POLICY_RULE_VERSION });
  });

  it("blocks an already-completed task", () => {
    const result = evaluatePolicy(baseInput({ taskAlreadyCompleted: true }));
    expect(result.outcome).toBe("block");
    expect(result.reasonCodes).toContain("task_already_completed");
  });

  it("blocks with consent_missing when consent is null", () => {
    const result = evaluatePolicy(baseInput({ consent: null }));
    expect(result.outcome).toBe("block");
    expect(result.reasonCodes).toContain("consent_missing");
  });

  it("blocks with consent_missing when consent status is unknown", () => {
    const result = evaluatePolicy(
      baseInput({ consent: { status: "unknown", effectiveAt: NOW } })
    );
    expect(result.outcome).toBe("block");
    expect(result.reasonCodes).toContain("consent_missing");
  });

  it("blocks with consent_revoked when consent was explicitly revoked", () => {
    const result = evaluatePolicy(
      baseInput({ consent: { status: "revoked", effectiveAt: NOW } })
    );
    expect(result.outcome).toBe("block");
    expect(result.reasonCodes).toContain("consent_revoked");
  });

  it("blocks a suppressed campaign", () => {
    const result = evaluatePolicy(baseInput({ campaignSuppressed: true }));
    expect(result.outcome).toBe("block");
    expect(result.reasonCodes).toContain("campaign_suppressed");
  });

  it("blocks inside a same-day quiet-hours window", () => {
    const result = evaluatePolicy(
      baseInput({ quietHours: { startHourLocal: 9, endHourLocal: 17, nowHourLocal: 12 } })
    );
    expect(result.outcome).toBe("block");
    expect(result.reasonCodes).toContain("quiet_hours");
  });

  it("handles quiet-hours wraparound: blocked at 23:00 for a 21:00-08:00 window", () => {
    const result = evaluatePolicy(
      baseInput({ quietHours: { startHourLocal: 21, endHourLocal: 8, nowHourLocal: 23 } })
    );
    expect(result.outcome).toBe("block");
    expect(result.reasonCodes).toContain("quiet_hours");
  });

  it("handles quiet-hours wraparound: not blocked at 09:00 for a 21:00-08:00 window", () => {
    const result = evaluatePolicy(
      baseInput({ quietHours: { startHourLocal: 21, endHourLocal: 8, nowHourLocal: 9 } })
    );
    expect(result.reasonCodes).not.toContain("quiet_hours");
  });

  it("blocks at the exact frequency cap boundary (count === maxAttempts)", () => {
    const recentAttempts = [
      { attemptedAt: new Date("2026-07-21T00:00:00.000Z") },
      { attemptedAt: new Date("2026-07-21T02:00:00.000Z") },
      { attemptedAt: new Date("2026-07-21T04:00:00.000Z") },
    ];
    const result = evaluatePolicy(
      baseInput({ recentAttempts, frequencyCap: { maxAttempts: 3, windowHours: 24 } })
    );
    expect(result.outcome).toBe("block");
    expect(result.reasonCodes).toContain("frequency_cap_exceeded");
  });

  it("does not block one below the frequency cap boundary (count === maxAttempts - 1)", () => {
    const recentAttempts = [
      { attemptedAt: new Date("2026-07-21T00:00:00.000Z") },
      { attemptedAt: new Date("2026-07-21T02:00:00.000Z") },
    ];
    const result = evaluatePolicy(
      baseInput({ recentAttempts, frequencyCap: { maxAttempts: 3, windowHours: 24 } })
    );
    expect(result.reasonCodes).not.toContain("frequency_cap_exceeded");
  });

  it("blocks 1ms before an open promise's due window start", () => {
    const dueWindowStart = new Date(NOW.getTime() + 1);
    const result = evaluatePolicy(
      baseInput({
        activePromise: { dueWindowStart, dueWindowEnd: new Date(NOW.getTime() + 86400000), status: "open" },
      })
    );
    expect(result.outcome).toBe("block");
    expect(result.reasonCodes).toContain("promise_timing_not_yet_due");
  });

  it("does not block exactly at an open promise's due window start", () => {
    const dueWindowStart = NOW;
    const result = evaluatePolicy(
      baseInput({
        activePromise: { dueWindowStart, dueWindowEnd: new Date(NOW.getTime() + 86400000), status: "open" },
      })
    );
    expect(result.reasonCodes).not.toContain("promise_timing_not_yet_due");
  });

  it("blocks with stale_cited_facts when a cited fact is no longer available", () => {
    const result = evaluatePolicy(baseInput({ availableFactIds: new Set(["promise:999"]) }));
    expect(result.outcome).toBe("block");
    expect(result.reasonCodes).toContain("stale_cited_facts");
  });

  it("returns review with lease_unavailable when every fact is fine but the lease can't be acquired", () => {
    const result = evaluatePolicy(baseInput({ leaseAvailable: false }));
    expect(result).toEqual({
      outcome: "review",
      reasonCodes: ["lease_unavailable"],
      ruleVersion: POLICY_RULE_VERSION,
    });
  });

  it("reports multiple simultaneous block reasons together", () => {
    const result = evaluatePolicy(
      baseInput({
        consent: { status: "revoked", effectiveAt: NOW },
        quietHours: { startHourLocal: 9, endHourLocal: 17, nowHourLocal: 12 },
      })
    );
    expect(result.outcome).toBe("block");
    expect(result.reasonCodes).toContain("consent_revoked");
    expect(result.reasonCodes).toContain("quiet_hours");
  });

  it("still blocks on revoked consent even when the plan reports zero uncertainties", () => {
    const confidentPlan: OutreachPlan = { ...BASE_PLAN, uncertainties: [] };
    const result = evaluatePolicy(
      baseInput({ consent: { status: "revoked", effectiveAt: NOW }, plan: confidentPlan })
    );
    expect(result.outcome).toBe("block");
    expect(result.reasonCodes).toContain("consent_revoked");
  });
});
