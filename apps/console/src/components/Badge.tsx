import type { LedgerSignal } from "../ledger.js";

const SIGNAL_LABEL_CLASS: Record<LedgerSignal, string> = {
  allow: "badge badge--allow",
  block: "badge badge--block",
  review: "badge badge--review",
  fencing: "badge badge--fencing",
  neutral: "badge badge--neutral",
};

export function Badge({ signal, children }: { signal: LedgerSignal; children: React.ReactNode }) {
  return <span className={SIGNAL_LABEL_CLASS[signal]}>{children}</span>;
}
