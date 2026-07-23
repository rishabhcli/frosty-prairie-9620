import type { AgentAttemptOutcome } from "../api.js";
import { Badge } from "./Badge.js";

function outcomeSignal(outcome: AgentAttemptOutcome) {
  if (outcome.kind === "authorized") return "allow" as const;
  if (outcome.kind === "blocked") return "block" as const;
  if (outcome.kind === "review") return "review" as const;
  return "neutral" as const;
}

function outcomeLabel(outcome: AgentAttemptOutcome): string {
  switch (outcome.kind) {
    case "authorized":
      return `authorized (fencing token ${outcome.fencingToken})`;
    case "idempotent_replay":
      return "already handled -- same outbox row";
    case "blocked":
      return `blocked: ${outcome.reasonCodes.join(", ")}`;
    case "review":
      return `needs review: ${outcome.reasonCodes.join(", ")}`;
    case "conflict":
      return "conflict: lease held by the other worker";
  }
}

const OUTBOX_RESULT_COPY: Record<string, { label: string; signal: "allow" | "block" | "neutral" }> = {
  delivered: { label: "delivered to sandbox provider", signal: "allow" },
  canceled_policy: { label: "canceled -- consent no longer granted", signal: "block" },
  empty: { label: "queue is empty -- nothing pending to deliver", signal: "neutral" },
};

interface OperatorControlsProps {
  consentStatus: "granted" | "revoked" | "unknown" | undefined;
  raceResult: { agentA: AgentAttemptOutcome; agentB: AgentAttemptOutcome } | null;
  outboxResult: string | null;
  busy: string | null;
  onReset(): void;
  onRace(): void;
  onToggleConsent(): void;
  onProcessOutbox(): void;
}

export function OperatorControls({
  consentStatus,
  raceResult,
  outboxResult,
  busy,
  onReset,
  onRace,
  onToggleConsent,
  onProcessOutbox,
}: OperatorControlsProps) {
  return (
    <section className="panel operator" aria-label="Operator controls">
      <h2 className="panel__title">Operator controls</h2>
      <div className="operator__buttons">
        <button className="btn btn--primary" onClick={onRace} disabled={busy !== null}>
          {busy === "race" ? "Racing two workers…" : "Race two workers for this contact"}
        </button>
        <button className="btn" onClick={onToggleConsent} disabled={busy !== null}>
          {busy === "consent"
            ? "Updating consent…"
            : consentStatus === "revoked"
              ? "Grant email consent"
              : "Revoke email consent"}
        </button>
        <button className="btn" onClick={onProcessOutbox} disabled={busy !== null}>
          {busy === "outbox" ? "Processing…" : "Process one outbox delivery"}
        </button>
        <button className="btn btn--ghost" onClick={onReset} disabled={busy !== null}>
          {busy === "reset" ? "Resetting…" : "Reset demo state"}
        </button>
      </div>

      {raceResult && (
        <div className="operator__result" aria-live="polite">
          <div className="operator__result-row">
            <span className="operator__result-actor mono">agent-a</span>
            <Badge signal={outcomeSignal(raceResult.agentA)}>{outcomeLabel(raceResult.agentA)}</Badge>
          </div>
          <div className="operator__result-row">
            <span className="operator__result-actor mono">agent-b</span>
            <Badge signal={outcomeSignal(raceResult.agentB)}>{outcomeLabel(raceResult.agentB)}</Badge>
          </div>
        </div>
      )}

      {outboxResult && (
        <div className="operator__result" aria-live="polite">
          <div className="operator__result-row">
            <span className="operator__result-actor mono">outbox-worker</span>
            <Badge signal={OUTBOX_RESULT_COPY[outboxResult]?.signal ?? "neutral"}>
              {OUTBOX_RESULT_COPY[outboxResult]?.label ?? outboxResult}
            </Badge>
          </div>
        </div>
      )}
    </section>
  );
}
