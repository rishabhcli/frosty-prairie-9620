import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";

const migrationsDir =
  process.env.MIGRATIONS_DIR ?? join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

export async function runMigrations(pool: Pool): Promise<void> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (name STRING PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`
  );
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const { rows } = await pool.query(`SELECT 1 FROM schema_migrations WHERE name = $1`, [file]);
    if (rows.length > 0) continue;
    const sql = await readFile(join(migrationsDir, file), "utf8");
    await pool.query(sql);
    await pool.query(`UPSERT INTO schema_migrations (name) VALUES ($1)`, [file]);
  }
}
