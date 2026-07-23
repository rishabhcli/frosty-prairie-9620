export function LoadingState() {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <div className="loading-state__spinner" aria-hidden="true" />
      <p className="loading-state__label">Seeding deterministic demo state…</p>
    </div>
  );
}
