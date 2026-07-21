import type { Pool } from "pg";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEMO_TENANT_ID } from "@contactsafe/contracts";

const fixturesPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "fixtures",
  "contacts.json"
);

export async function seed(pool: Pool): Promise<{ jordanContactId: string }> {
  const fixture = JSON.parse(await readFile(fixturesPath, "utf8")) as {
    contacts: { contactId: string; displayName: string; emailAddress: string }[];
  };
  const jordan = fixture.contacts[0];
  if (!jordan) throw new Error("fixtures/contacts.json has no contacts");

  await pool.query(
    `UPSERT INTO contacts (tenant_id, contact_id, display_name, email_address) VALUES ($1, $2, $3, $4)`,
    [DEMO_TENANT_ID, jordan.contactId, jordan.displayName, jordan.emailAddress]
  );
  await pool.query(
    `INSERT INTO consent_events (tenant_id, contact_id, channel, status, effective_at, source_type, source_ref, actor)
     VALUES ($1, $2, 'email', 'granted', now() - interval '30 days', 'demo_seed', 'seed:consent:1', 'seed-script')`,
    [DEMO_TENANT_ID, jordan.contactId]
  );
  await pool.query(
    `INSERT INTO promises (tenant_id, contact_id, owner, promised_action, due_window_start, due_window_end, status, source_quote, source_event_ref)
     VALUES ($1, $2, 'agent-a', 'email_revised_quote', now(), now() + interval '2 days', 'open',
             'email the revised quote after Tuesday', 'seed:promise:1')`,
    [DEMO_TENANT_ID, jordan.contactId]
  );
  return { jordanContactId: jordan.contactId };
}
