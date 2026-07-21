import type { LeaseRow, ConsentEventRow, PromiseRow } from "../api.js";
import { Badge } from "./Badge.js";

interface LeasePanelProps {
  lease: LeaseRow | undefined;
  consent: ConsentEventRow | undefined;
  promise: PromiseRow | undefined;
}

export function LeasePanel({ lease, consent, promise }: LeasePanelProps) {
  const expired = lease ? new Date(lease.expires_at).getTime() < Date.now() : true;

  return (
    <section className="panel lease-panel" aria-label="Current coordination state">
      <h2 className="panel__title">Live state</h2>

      <div className="lease-panel__row">
        <span className="lease-panel__label">Consent (email)</span>
        {consent ? (
          <Badge signal={consent.status === "granted" ? "allow" : consent.status === "revoked" ? "block" : "neutral"}>
            {consent.status}
          </Badge>
        ) : (
          <Badge signal="neutral">none on file</Badge>
        )}
      </div>

      <div className="lease-panel__row">
        <span className="lease-panel__label">Active promise</span>
        {promise ? (
          <span className="lease-panel__value">{promise.status}</span>
        ) : (
          <span className="lease-panel__value lease-panel__value--muted">none open</span>
        )}
      </div>

      <div className="fencing-token" aria-live="polite">
        <span className="fencing-token__label">Contact lease fencing token</span>
        <span className="fencing-token__value mono">{lease ? lease.fencing_token : "—"}</span>
        <span className="fencing-token__meta">
          {lease ? (
            <>
              owner <span className="mono">{lease.owner_id}</span> &middot; {expired ? "expired" : "active"}
            </>
          ) : (
            "no lease acquired yet"
          )}
        </span>
      </div>

      {promise && <blockquote className="citation">&ldquo;{promise.source_quote}&rdquo;</blockquote>}
    </section>
  );
}
