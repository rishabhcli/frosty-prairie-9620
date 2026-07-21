import type { ConsentStatus, OutreachPlan, PolicyOutcome, PolicyReasonCode, PromiseStatus } from "@contactsafe/contracts";

export interface PolicyEvaluationInput {
  now: Date;
  consent: { status: ConsentStatus; effectiveAt: Date } | null;
  campaignSuppressed: boolean;
  /** Local-time quiet hours boundary; caller resolves timezone before calling. */
  quietHours: { startHourLocal: number; endHourLocal: number; nowHourLocal: number } | null;
  recentAttempts: { attemptedAt: Date }[];
  frequencyCap: { maxAttempts: number; windowHours: number };
  activePromise: { dueWindowStart: Date; dueWindowEnd: Date; status: PromiseStatus } | null;
  plan: OutreachPlan;
  /** Fact IDs that currently exist and are current (joined from authoritative tables). */
  availableFactIds: ReadonlySet<string>;
  taskAlreadyCompleted: boolean;
  leaseAvailable: boolean;
}

export interface PolicyEvaluationResult {
  outcome: PolicyOutcome;
  reasonCodes: PolicyReasonCode[];
  ruleVersion: string;
}
