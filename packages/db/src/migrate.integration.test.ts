import { describe, it, expect } from "vitest";
import { createPool } from "./pool.js";
import { runMigrations } from "./migrate.js";

describe("runMigrations", () => {
  it("creates all core tables idempotently", async () => {
    const pool = createPool();
    await runMigrations(pool);
    await runMigrations(pool);
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
    );
    const names = rows.map((r) => r.table_name);
    for (const t of [
      "contacts",
      "consent_events",
      "promises",
      "contact_leases",
      "transactional_outbox",
      "memory_chunks",
    ]) {
      expect(names).toContain(t);
    }
    await pool.end();
  });
});
