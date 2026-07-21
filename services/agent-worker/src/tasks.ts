import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

export async function createAgentTask(
  pool: Pool,
  params: { tenantId: string; contactId: string; taskType?: string }
): Promise<{ taskId: string }> {
  const taskId = randomUUID();
  await pool.query(
    `INSERT INTO agent_tasks (tenant_id, task_id, contact_id, task_type, state)
     VALUES ($1, $2, $3, $4, 'pending')`,
    [params.tenantId, taskId, params.contactId, params.taskType ?? "follow_up"]
  );
  return { taskId };
}

export async function claimNextPendingTask(
  pool: Pool,
  tenantId: string
): Promise<{ taskId: string; contactId: string } | null> {
  const { rows } = await pool.query(
    `SELECT task_id, contact_id FROM agent_tasks
     WHERE tenant_id = $1 AND state = 'pending'
     ORDER BY created_at ASC LIMIT 1`,
    [tenantId]
  );
  if (rows.length === 0) return null;
  return { taskId: rows[0].task_id, contactId: rows[0].contact_id };
}
