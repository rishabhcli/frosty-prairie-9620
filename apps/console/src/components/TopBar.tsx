interface TopBarProps {
  contactId: string | null;
  apiHealthy: boolean | null;
}

export function TopBar({ contactId, apiHealthy }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="topbar__brand">
        <span className="topbar__mark">CONTACTSAFE</span>
        <span className="topbar__tag">agentic memory console</span>
      </div>
      <div className="topbar__status">
        <span className="topbar__contact">
          contact <span className="mono">{contactId ?? "—"}</span>
        </span>
        <span className={`status-dot ${apiHealthy ? "status-dot--ok" : "status-dot--down"}`} aria-hidden="true" />
        <span className="visually-hidden">API status: {apiHealthy ? "connected" : "disconnected"}</span>
      </div>
    </header>
  );
}
