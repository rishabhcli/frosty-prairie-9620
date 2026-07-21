const API_BASE = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:14901";

export interface ConsentEventRow {
  event_id: string;
  status: "granted" | "revoked" | "unknown";
  effective_at: string;
  recorded_at: string;
  source_type: string;
  source_ref: string;
  actor: string;
}

export interface PromiseRow {
  promise_id: string;
  promised_action: string;
  due_window_start: string;
  due_window_end: string;
  status: string;
  source_quote: string;
}

export interface LeaseRow {
  channel: string;
  owner_id: string;
  fencing_token: number;
  expires_at: string;
  updated_at: string;
}

export interface OutboxRow {
  outbox_id: string;
  logical_action_key: string;
  channel: string;
  lease_fencing_token: number;
  policy_decision_id: string;
  payload: { proposedSubject?: string; proposedBody?: string; intent?: string };
  state: string;
  provider_idempotency_key: string;
  created_at: string;
  claimed_at: string | null;
  delivered_at: string | null;
}

export interface PolicyDecisionRow {
  policy_decision_id: string;
  rule_version: string;
  outcome: "allow" | "block" | "review";
  reason_codes: string[];
  evidence_fact_ids: string[];
  plan_hash: string;
  decided_at: string;
}

export interface MemoryChunkRow {
  chunk_id: string;
  source_type: string;
  source_ref: string;
  text_summary: string;
  effective_at: string;
  superseded: boolean;
}

export interface AttemptRow {
  attempt_id: string;
  channel: string;
  campaign_id: string;
  attempted_at: string;
  worker_id: string;
}

export interface ContactState {
  consentEvents: ConsentEventRow[];
  promises: PromiseRow[];
  leases: LeaseRow[];
  outbox: OutboxRow[];
  policyDecisions: PolicyDecisionRow[];
  memoryChunks: MemoryChunkRow[];
  attempts: AttemptRow[];
}

export type AgentAttemptOutcome =
  | { kind: "authorized"; outboxId: string; fencingToken: number; policyDecisionId: string }
  | { kind: "idempotent_replay"; outboxId: string }
  | { kind: "blocked"; reasonCodes: string[]; policyDecisionId: string }
  | { kind: "review"; reasonCodes: string[]; policyDecisionId: string }
  | { kind: "conflict"; message: string };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: init?.body ? { "content-type": "application/json" } : {},
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${init?.method ?? "GET"} ${path} failed: ${res.status} ${body}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<{ status: string }>("/health"),
  resetDemo: () => request<{ contactId: string }>("/demo/reset", { method: "POST" }),
  getContactState: (contactId: string) => request<ContactState>(`/contacts/${contactId}/state`),
  setConsent: (contactId: string, status: "granted" | "revoked" | "unknown") =>
    request<{ eventId: string; status: string }>("/consent", {
      method: "POST",
      body: JSON.stringify({ contactId, status }),
    }),
  createTask: (contactId: string) =>
    request<{ taskId: string }>("/tasks", { method: "POST", body: JSON.stringify({ contactId }) }),
  race: (contactId: string, taskId: string) =>
    request<{ agentA: AgentAttemptOutcome; agentB: AgentAttemptOutcome }>("/demo/race", {
      method: "POST",
      body: JSON.stringify({ contactId, taskId }),
    }),
  processOneOutboxRow: () => request<{ kind: string; outboxId?: string }>("/outbox/process-one", { method: "POST" }),
  getEvaluationLatest: () => request<import("./components/EvaluationStrip.js").EvaluationLatest>("/evaluation/latest"),
};
