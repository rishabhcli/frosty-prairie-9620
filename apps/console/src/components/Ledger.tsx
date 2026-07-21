import type { LedgerEntry } from "../ledger.js";
import { Badge } from "./Badge.js";

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour12: false }) + "." + String(d.getMilliseconds()).padStart(3, "0");
}

export function Ledger({ entries }: { entries: LedgerEntry[] }) {
  return (
    <section className="panel ledger" aria-label="Audit ledger">
      <h2 className="panel__title">Ledger — append-only, most recent first</h2>
      {entries.length === 0 ? (
        <p className="ledger__empty">No evidence yet. Reset the demo or run the race to populate the ledger.</p>
      ) : (
        <ol className="ledger__list" aria-live="polite">
          {entries.map((entry) => (
            <li key={entry.id} className="ledger__entry">
              <span className={`ledger__rail ledger__rail--${entry.signal}`} aria-hidden="true" />
              <div className="ledger__body">
                <div className="ledger__meta">
                  <time className="mono ledger__time">{formatTime(entry.at)}</time>
                  <span className="ledger__actor mono">{entry.actor}</span>
                </div>
                <p className="ledger__headline">
                  <Badge signal={entry.signal}>{entry.headline}</Badge>
                </p>
                {entry.detail && <p className="ledger__detail">{entry.detail}</p>}
                {entry.citation && <blockquote className="citation citation--inline">&ldquo;{entry.citation}&rdquo;</blockquote>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
