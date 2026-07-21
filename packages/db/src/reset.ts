import type { Pool } from "pg";

const TABLES = [
  "sandbox_deliveries",
  "transactional_outbox",
  "contact_leases",
  "agent_tasks",
  "policy_decisions",
  "memory_chunks",
  "contact_attempts",
  "promises",
  "consent_events",
  "contacts",
];

export async function reset(pool: Pool): Promise<void> {
  for (const table of TABLES) {
    await pool.query(`DELETE FROM ${table}`);
  }
}
