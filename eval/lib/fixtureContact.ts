import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { DEMO_TENANT_ID } from "@contactsafe/contracts";

export const EVAL_TENANT_ID = DEMO_TENANT_ID;

export interface FixtureContact {
  contactId: string;
  promiseId: string;
}

/** A synthetic, isolated (tenant, contact) pair for eval runs -- never a real recipient. */
export async function createFixtureContact(
  pool: Pool,
  opts: { consent?: "granted" | "revoked"; namePrefix?: string } = {}
): Promise<FixtureContact> {
  const contactId = randomUUID();
  const promiseId = randomUUID();
  const label = opts.namePrefix ?? "eval";

  await pool.query(
    `INSERT INTO contacts (tenant_id, contact_id, display_name, email_address) VALUES ($1, $2, $3, $4)`,
    [EVAL_TENANT_ID, contactId, `${label} synthetic contact`, `${label}-${contactId}@sandbox.contactsafe.invalid`]
  );
  await pool.query(
    `INSERT INTO consent_events (tenant_id, contact_id, channel, status, effective_at, source_type, source_ref, actor)
     VALUES ($1, $2, 'email', $3, now() - interval '1 day', 'eval_fixture', $4, 'eval-harness')`,
    [EVAL_TENANT_ID, contactId, opts.consent ?? "granted", `eval:consent:${contactId}`]
  );
  await pool.query(
    `INSERT INTO promises (tenant_id, contact_id, promise_id, owner, promised_action, due_window_start, due_window_end, status, source_quote, source_event_ref)
     VALUES ($1, $2, $3, 'agent-a', 'email_revised_quote', now(), now() + interval '2 days', 'open',
             'email the revised quote after Tuesday', $4)`,
    [EVAL_TENANT_ID, contactId, promiseId, `eval:promise:${contactId}`]
  );

  return { contactId, promiseId };
}

export async function createAgentTaskFor(pool: Pool, contactId: string): Promise<string> {
  const taskId = randomUUID();
  await pool.query(
    `INSERT INTO agent_tasks (tenant_id, task_id, contact_id, task_type, state) VALUES ($1, $2, $3, 'follow_up', 'pending')`,
    [EVAL_TENANT_ID, taskId, contactId]
  );
  return taskId;
}
