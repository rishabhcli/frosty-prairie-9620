import type { PoolClient } from "pg";

/** Re-derives whether a cited fact ID is still current, reading fresh inside the authorization transaction. */
export async function isFactCurrentlyValid(
  client: PoolClient,
  tenantId: string,
  contactId: string,
  factId: string
): Promise<boolean> {
  const [kind, id] = factId.split(":", 2) as [string, string | undefined];
  if (!id) return false;

  if (kind === "promise") {
    const { rows } = await client.query(`SELECT status FROM promises WHERE tenant_id = $1 AND promise_id = $2`, [
      tenantId,
      id,
    ]);
    return rows.length > 0 && rows[0].status === "open";
  }

  if (kind === "consent") {
    const { rows } = await client.query(
      `SELECT status FROM consent_events WHERE tenant_id = $1 AND contact_id = $2 AND channel = $3
       ORDER BY effective_at DESC LIMIT 1`,
      [tenantId, contactId, id]
    );
    return rows.length > 0 && rows[0].status === "granted";
  }

  if (kind === "memory") {
    const { rows } = await client.query(
      `SELECT source_type, source_ref, superseded FROM memory_chunks WHERE tenant_id = $1 AND chunk_id = $2`,
      [tenantId, id]
    );
    if (rows.length === 0 || rows[0].superseded) return false;
    const chunk = rows[0] as { source_type: string; source_ref: string };
    if (chunk.source_type === "promise") {
      return isFactCurrentlyValid(client, tenantId, contactId, `promise:${chunk.source_ref}`);
    }
    if (chunk.source_type === "consent") {
      return isFactCurrentlyValid(client, tenantId, contactId, `consent:${chunk.source_ref}`);
    }
    return true;
  }

  return false;
}

export async function computeAvailableFactIds(
  client: PoolClient,
  tenantId: string,
  contactId: string,
  citedFactIds: readonly string[]
): Promise<Set<string>> {
  const available = new Set<string>();
  for (const factId of citedFactIds) {
    if (await isFactCurrentlyValid(client, tenantId, contactId, factId)) {
      available.add(factId);
    }
  }
  return available;
}
