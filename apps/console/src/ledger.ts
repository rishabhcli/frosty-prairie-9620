import type { ContactState } from "./api.js";

export type LedgerSignal = "allow" | "block" | "review" | "fencing" | "neutral";

export interface LedgerEntry {
  id: string;
  at: string;
  actor: string;
  headline: string;
  detail?: string;
  citation?: string;
  signal: LedgerSignal;
}

const OUTCOME_SIGNAL: Record<string, LedgerSignal> = {
  allow: "allow",
  block: "block",
  review: "review",
};

/** Shortens a `kind:uuid` fact ID to `kind:uuid-prefix` for display -- still the real ID, just legible. */
function shortenFactId(factId: string): string {
  const [kind, id] = factId.split(":", 2);
  if (!id) return factId;
  return `${kind}:${id.slice(0, 8)}`;
}

export function buildLedger(state: ContactState): LedgerEntry[] {
  const entries: LedgerEntry[] = [];

  for (const c of state.consentEvents) {
    entries.push({
      id: `consent:${c.event_id}`,
      at: c.effective_at,
      actor: c.actor,
      headline: c.status === "granted" ? "Consent granted (email)" : `Consent ${c.status} (email)`,
      detail: `source: ${c.source_type} / ${c.source_ref}`,
      signal: c.status === "granted" ? "allow" : c.status === "revoked" ? "block" : "neutral",
    });
  }

  for (const p of state.promises) {
    entries.push({
      id: `promise:${p.promise_id}`,
      at: p.due_window_start,
      actor: "recall",
      headline: `Promise recorded: ${p.promised_action.replaceAll("_", " ")}`,
      citation: p.source_quote,
      signal: p.status === "open" ? "allow" : "neutral",
    });
  }

  for (const d of state.policyDecisions) {
    entries.push({
      id: `policy:${d.policy_decision_id}`,
      at: d.decided_at,
      actor: `policy ${d.rule_version}`,
      headline: `Policy decision: ${d.outcome.toUpperCase()}`,
      detail: d.reason_codes.join(", "),
      ...(d.evidence_fact_ids.length > 0
        ? { citation: d.evidence_fact_ids.map(shortenFactId).join(", ") }
        : {}),
      signal: OUTCOME_SIGNAL[d.outcome] ?? "neutral",
    });
  }

  for (const o of state.outbox) {
    entries.push({
      id: `outbox-created:${o.outbox_id}`,
      at: o.created_at,
      actor: "authorization tx",
      headline: `Outbox row created (fencing token ${o.lease_fencing_token})`,
      ...(o.payload?.proposedSubject ? { detail: `subject: ${o.payload.proposedSubject}` } : {}),
      signal: "fencing",
    });
    if (o.delivered_at) {
      entries.push({
        id: `outbox-delivered:${o.outbox_id}`,
        at: o.delivered_at,
        actor: "outbox-worker",
        headline: "Sandbox delivery recorded",
        detail: `state: ${o.state}`,
        signal: "allow",
      });
    }
    if (o.state === "canceled_policy") {
      entries.push({
        id: `outbox-canceled:${o.outbox_id}`,
        at: o.claimed_at ?? o.created_at,
        actor: "outbox-worker",
        headline: "Delivery canceled -- consent no longer granted",
        signal: "block",
      });
    }
  }

  for (const a of state.attempts) {
    entries.push({
      id: `attempt:${a.attempt_id}`,
      at: a.attempted_at,
      actor: a.worker_id,
      headline: `Contact attempt recorded (${a.channel})`,
      signal: "neutral",
    });
  }

  return entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}
