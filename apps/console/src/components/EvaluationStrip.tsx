interface RaceReport {
  totalAttempts: number;
  approvedActions: number;
  duplicateApprovedActions: number;
  consentViolations: number;
  transactionRetries: number;
  p95AuthorizationLatencyMs: number;
}

interface FaultsReport {
  scenarios: { name: string; recovered: boolean }[];
  allRecovered: boolean;
}

interface MemoryReport {
  precisionAtK: number;
  recallAtK: number;
  citedFactValidityRate: number;
  unsupportedClaimRate: number;
}

export interface EvaluationLatest {
  race: RaceReport | null;
  faults: FaultsReport | null;
  memory: MemoryReport | null;
}

export function EvaluationStrip({ evaluation }: { evaluation: EvaluationLatest | null }) {
  if (!evaluation || (!evaluation.race && !evaluation.faults && !evaluation.memory)) {
    return (
      <section className="panel evaluation" aria-label="Evaluation results">
        <h2 className="panel__title">Evaluation</h2>
        <p className="evaluation__empty">
          No evaluation run yet. Run <code className="mono">pnpm eval:race</code>,{" "}
          <code className="mono">pnpm eval:faults</code>, and <code className="mono">pnpm eval:memory</code> to
          populate this panel from real measured results.
        </p>
      </section>
    );
  }

  return (
    <section className="panel evaluation" aria-label="Evaluation results">
      <h2 className="panel__title">Evaluation -- measured, not asserted</h2>
      <div className="evaluation__grid">
        {evaluation.race && (
          <div className="evaluation__stat">
            <span className="evaluation__stat-value mono">
              {evaluation.race.totalAttempts.toLocaleString()} &rarr; {evaluation.race.approvedActions}
            </span>
            <span className="evaluation__stat-label">concurrent/retried attempts &rarr; approved actions</span>
            <span className="evaluation__stat-sub">
              {evaluation.race.duplicateApprovedActions} duplicates &middot; {evaluation.race.consentViolations}{" "}
              consent violations &middot; p95 {evaluation.race.p95AuthorizationLatencyMs}ms
            </span>
          </div>
        )}
        {evaluation.faults && (
          <div className="evaluation__stat">
            <span className="evaluation__stat-value mono">
              {evaluation.faults.scenarios.filter((s) => s.recovered).length}/{evaluation.faults.scenarios.length}
            </span>
            <span className="evaluation__stat-label">fault-injection scenarios recovered</span>
          </div>
        )}
        {evaluation.memory && (
          <div className="evaluation__stat">
            <span className="evaluation__stat-value mono">
              {(evaluation.memory.precisionAtK * 100).toFixed(0)}% / {(evaluation.memory.recallAtK * 100).toFixed(0)}%
            </span>
            <span className="evaluation__stat-label">promise-recall precision / recall</span>
            <span className="evaluation__stat-sub">
              {(evaluation.memory.citedFactValidityRate * 100).toFixed(0)}% cited-fact validity
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
