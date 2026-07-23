interface TopBarProps {
  contactId: string | null;
  contactName: string | null;
  apiHealthy: boolean | null;
}

function shortId(id: string): string {
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

/** "Jordan (synthetic demo contact)" -> { name: "Jordan", qualifier: "synthetic demo contact" } */
function splitContactName(fullName: string): { name: string; qualifier: string | null } {
  const match = fullName.match(/^(.*?)\s*\((.+)\)\s*$/);
  if (!match) return { name: fullName, qualifier: null };
  return { name: match[1] ?? fullName, qualifier: match[2] ?? null };
}

export function TopBar({ contactId, contactName, apiHealthy }: TopBarProps) {
  const { name, qualifier } = contactName ? splitContactName(contactName) : { name: "contact", qualifier: null };

  return (
    <header className="topbar">
      <div className="topbar__brand">
        <h1 className="topbar__mark">CONTACTSAFE</h1>
        <span className="topbar__tag">agentic memory console</span>
      </div>
      <div className="topbar__status">
        {contactId && (
          <span className="topbar__contact" title={contactId}>
            <span className="topbar__contact-name">{name}</span>
            {qualifier && <span className="topbar__contact-qualifier">{qualifier}</span>}
            <span className="mono topbar__contact-id">{shortId(contactId)}</span>
          </span>
        )}
        <span className="topbar__live" title="Ledger polls the API every 3 seconds">
          <span className={`status-dot ${apiHealthy ? "status-dot--ok" : "status-dot--down"}`} aria-hidden="true" />
          {apiHealthy ? "live" : "disconnected"}
        </span>
        <span className="visually-hidden">API status: {apiHealthy ? "connected" : "disconnected"}</span>
      </div>
    </header>
  );
}
