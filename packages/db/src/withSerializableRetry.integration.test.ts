import { describe, it, expect, beforeAll } from "vitest";
import { createPool } from "./pool.js";
import { withSerializableRetry } from "./withSerializableRetry.js";
import { runMigrations } from "./migrate.js";

describe("withSerializableRetry", () => {
  const pool = createPool();

  beforeAll(async () => {
    await runMigrations(pool);
    await pool.query(`CREATE TABLE IF NOT EXISTS retry_counter (id INT PRIMARY KEY, value INT NOT NULL)`);
    await pool.query(`UPSERT INTO retry_counter (id, value) VALUES (1, 0)`);
  });

  it("retries on serialization conflict and both increments land", async () => {
    const bump = () =>
      withSerializableRetry(pool, async (client) => {
        const { rows } = await client.query(`SELECT value FROM retry_counter WHERE id = 1`);
        const current = rows[0].value as number;
        await new Promise((r) => setTimeout(r, 10));
        await client.query(`UPDATE retry_counter SET value = $1 WHERE id = 1`, [current + 1]);
      });

    await Promise.all([bump(), bump()]);

    const { rows } = await pool.query(`SELECT value FROM retry_counter WHERE id = 1`);
    expect(rows[0].value).toBe(2);
  });
});
