import { useCallback, useEffect, useRef, useState } from "react";
import { api, type ContactState, type AgentAttemptOutcome } from "./api.js";
import { buildLedger } from "./ledger.js";
import { TopBar } from "./components/TopBar.js";
import { LeasePanel } from "./components/LeasePanel.js";
import { Ledger } from "./components/Ledger.js";
import { OperatorControls } from "./components/OperatorControls.js";
import { EvaluationStrip } from "./components/EvaluationStrip.js";
import type { EvaluationLatest } from "./components/EvaluationStrip.js";

type Busy = "race" | "outbox" | "reset" | "consent" | null;

export function App() {
  const [contactId, setContactId] = useState<string | null>(null);
  const [state, setState] = useState<ContactState | null>(null);
  const [evaluation, setEvaluation] = useState<EvaluationLatest | null>(null);
  const [apiHealthy, setApiHealthy] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [raceResult, setRaceResult] = useState<{ agentA: AgentAttemptOutcome; agentB: AgentAttemptOutcome } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const refreshState = useCallback(async (id: string) => {
    const next = await api.getContactState(id);
    setState(next);
  }, []);

  const refreshEvaluation = useCallback(async () => {
    try {
      setEvaluation(await api.getEvaluationLatest());
    } catch {
      setEvaluation(null);
    }
  }, []);

  const handleReset = useCallback(async () => {
    setBusy("reset");
    setError(null);
    try {
      const { contactId: id } = await api.resetDemo();
      setContactId(id);
      setRaceResult(null);
      await refreshState(id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }, [refreshState]);

  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    api
      .health()
      .then(() => setApiHealthy(true))
      .catch(() => setApiHealthy(false));
    handleReset();
    refreshEvaluation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRace = useCallback(async () => {
    if (!contactId) return;
    setBusy("race");
    setError(null);
    try {
      const { taskId } = await api.createTask(contactId);
      const result = await api.race(contactId, taskId);
      setRaceResult(result);
      await refreshState(contactId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }, [contactId, refreshState]);

  const handleToggleConsent = useCallback(async () => {
    if (!contactId || !state) return;
    setBusy("consent");
    setError(null);
    try {
      const current = state.consentEvents[0]?.status;
      const next = current === "revoked" ? "granted" : "revoked";
      await api.setConsent(contactId, next);
      await refreshState(contactId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }, [contactId, state, refreshState]);

  const handleProcessOutbox = useCallback(async () => {
    setBusy("outbox");
    setError(null);
    try {
      await api.processOneOutboxRow();
      if (contactId) await refreshState(contactId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }, [contactId, refreshState]);

  const lease = state?.leases.find((l) => l.channel === "email");
  const consent = state?.consentEvents[0];
  const promise = state?.promises.find((p) => p.status === "open");
  const ledgerEntries = state ? buildLedger(state) : [];

  return (
    <div className="app">
      <TopBar contactId={contactId} apiHealthy={apiHealthy} />
      {error && (
        <div className="banner banner--error" role="alert">
          {error}
        </div>
      )}
      <main className="layout">
        <div className="layout__main">
          <OperatorControls
            consentStatus={consent?.status}
            raceResult={raceResult}
            busy={busy}
            onReset={handleReset}
            onRace={handleRace}
            onToggleConsent={handleToggleConsent}
            onProcessOutbox={handleProcessOutbox}
          />
          <Ledger entries={ledgerEntries} />
        </div>
        <div className="layout__side">
          <LeasePanel lease={lease} consent={consent} promise={promise} />
          <EvaluationStrip evaluation={evaluation} />
        </div>
      </main>
    </div>
  );
}
