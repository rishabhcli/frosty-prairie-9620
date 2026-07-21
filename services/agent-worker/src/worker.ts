import { createServer } from "node:http";
import { createPool, runMigrations } from "@contactsafe/db";
import { createOutreachPlanner } from "@contactsafe/bedrock";
import { DEMO_TENANT_ID } from "@contactsafe/contracts";
import { claimNextPendingTask } from "./tasks.js";
import { runAgentAttempt } from "./authorize.js";

const POLL_INTERVAL_MS = 1000;
const PORT = Number(process.env.PORT_AGENT_WORKER ?? 14902);
const WORKER_ID = `agent-worker-${process.pid}`;

async function main() {
  const pool = createPool();
  await runMigrations(pool);
  const planner = createOutreachPlanner();

  let lastOutcome = "idle";
  const server = createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok", workerId: WORKER_ID, lastOutcome }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`[agent-worker] ${WORKER_ID} health server on http://127.0.0.1:${PORT}`);
  });

  let stopped = false;
  process.on("SIGTERM", () => {
    stopped = true;
  });
  process.on("SIGINT", () => {
    stopped = true;
  });

  while (!stopped) {
    const task = await claimNextPendingTask(pool, DEMO_TENANT_ID);
    if (!task) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      continue;
    }
    const outcome = await runAgentAttempt({
      pool,
      tenantId: DEMO_TENANT_ID,
      contactId: task.contactId,
      taskId: task.taskId,
      workerId: WORKER_ID,
      planner,
    });
    lastOutcome = outcome.kind;
    console.log(`[agent-worker] task=${task.taskId} outcome=${outcome.kind}`);
  }

  server.close();
  await pool.end();
}

main().catch((err) => {
  console.error("[agent-worker] fatal", err);
  process.exit(1);
});
