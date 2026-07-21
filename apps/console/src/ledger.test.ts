import { describe, it, expect } from "vitest";
import { buildLedger } from "./ledger.js";
import type { ContactState } from "./api.js";

function emptyState(overrides: Partial<ContactState> = {}): ContactState {
  return {
    consentEvents: [],
    promises: [],
    leases: [],
    outbox: [],
    policyDecisions: [],
    memoryChunks: [],
    attempts: [],
    ...overrides,
  };
}

describe("buildLedger", () => {
  it("sorts entries most-recent-first across different fact types", () => {
    const state = emptyState({
      consentEvents: [
        {
          event_id: "e1",
          status: "granted",
          effective_at: "2026-01-01T00:00:00.000Z",
          recorded_at: "2026-01-01T00:00:00.000Z",
          source_type: "seed",
          source_ref: "seed:1",
          actor: "seed",
        },
      ],
      policyDecisions: [
        {
          policy_decision_id: "p1",
          rule_version: "policy-v1",
          outcome: "allow",
          reason_codes: ["ok"],
          evidence_fact_ids: [],
          plan_hash: "hash",
          decided_at: "2026-01-02T00:00:00.000Z",
        },
      ],
    });

    const entries = buildLedger(state);
    expect(entries.map((e) => e.id)).toEqual(["policy:p1", "consent:e1"]);
  });

  it("marks a revoked consent event with a block signal and a granted one with allow", () => {
    const state = emptyState({
      consentEvents: [
        {
          event_id: "e1",
          status: "revoked",
          effective_at: "2026-01-02T00:00:00.000Z",
          recorded_at: "2026-01-02T00:00:00.000Z",
          source_type: "console",
          source_ref: "console:1",
          actor: "operator",
        },
        {
          event_id: "e2",
          status: "granted",
          effective_at: "2026-01-01T00:00:00.000Z",
          recorded_at: "2026-01-01T00:00:00.000Z",
          source_type: "seed",
          source_ref: "seed:1",
          actor: "seed",
        },
      ],
    });

    const entries = buildLedger(state);
    expect(entries.find((e) => e.id === "consent:e1")?.signal).toBe("block");
    expect(entries.find((e) => e.id === "consent:e2")?.signal).toBe("allow");
  });

  it("shortens long fact IDs in policy decision citations while keeping the kind prefix", () => {
    const state = emptyState({
      policyDecisions: [
        {
          policy_decision_id: "p1",
          rule_version: "policy-v1",
          outcome: "allow",
          reason_codes: ["ok"],
          evidence_fact_ids: ["promise:755cc8fa-1b92-456b-8d79-21bdd07706bc"],
          plan_hash: "hash",
          decided_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    const entries = buildLedger(state);
    expect(entries[0]?.citation).toBe("promise:755cc8fa");
  });

  it("adds a canceled-delivery entry when an outbox row was canceled by policy", () => {
    const state = emptyState({
      outbox: [
        {
          outbox_id: "o1",
          logical_action_key: "key-1",
          channel: "email",
          lease_fencing_token: 1,
          policy_decision_id: "p1",
          payload: {},
          state: "canceled_policy",
          provider_idempotency_key: "key-1",
          created_at: "2026-01-01T00:00:00.000Z",
          claimed_at: null,
          delivered_at: null,
        },
      ],
    });

    const entries = buildLedger(state);
    const canceled = entries.find((e) => e.id === "outbox-canceled:o1");
    expect(canceled).toBeDefined();
    expect(canceled?.signal).toBe("block");
  });
});
