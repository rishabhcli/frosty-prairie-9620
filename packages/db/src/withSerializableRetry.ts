import type { Pool, PoolClient } from "pg";

const RETRY_SQLSTATE = "40001";

export async function withSerializableRetry<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
  opts: { maxRetries?: number; onRetry?: () => void } = {}
): Promise<T> {
  const maxRetries = opts.maxRetries ?? 8;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (let attempt = 0; ; attempt++) {
      await client.query("SAVEPOINT cockroach_restart");
      try {
        const result = await fn(client);
        await client.query("RELEASE SAVEPOINT cockroach_restart");
        await client.query("COMMIT");
        return result;
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === RETRY_SQLSTATE && attempt < maxRetries) {
          await client.query("ROLLBACK TO SAVEPOINT cockroach_restart");
          opts.onRetry?.();
          const backoffMs = Math.min(2 ** attempt * 10, 500);
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }
        await client.query("ROLLBACK").catch(() => undefined);
        throw err;
      }
    }
  } finally {
    client.release();
  }
}
