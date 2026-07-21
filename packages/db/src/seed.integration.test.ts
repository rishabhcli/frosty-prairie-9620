import { describe, it, expect } from "vitest";
import { createPool } from "./pool.js";
import { runMigrations } from "./migrate.js";
import { seed } from "./seed.js";
import { reset } from "./reset.js";

describe("seed/reset", () => {
  it("seeds one consent event and one open promise for Jordan, and reset clears it", async () => {
    const pool = createPool();
    await runMigrations(pool);
    await reset(pool);
    const { jordanContactId } = await seed(pool);

    const { rows: consents } = await pool.query(
      `SELECT * FROM consent_events WHERE contact_id = $1`,
      [jordanContactId]
    );
    expect(consents.length).toBe(1);
    expect(consents[0].status).toBe("granted");

    const { rows: promises } = await pool.query(
      `SELECT * FROM promises WHERE contact_id = $1`,
      [jordanContactId]
    );
    expect(promises.length).toBe(1);
    expect(promises[0].status).toBe("open");

    await reset(pool);
    const { rows: after } = await pool.query(`SELECT * FROM consent_events`);
    expect(after.length).toBe(0);
    await pool.end();
  });
});
