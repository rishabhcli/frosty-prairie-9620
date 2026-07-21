import { createServer } from "node:http";
import { createPool, runMigrations } from "@contactsafe/db";
import { DEMO_TENANT_ID } from "@contactsafe/contracts";
import { claimAndDeliverOne } from "./deliver.js";

const POLL_INTERVAL_MS = 500;
const PORT = Number(process.env.PORT_OUTBOX_WORKER ?? 14903);
// Demo/recording only -- see claimAndDeliverOne's postClaimDelayMs doc comment. 0 in production.
const DEMO_DELAY_MS = Number(process.env.OUTBOX_WORKER_DEMO_DELAY_MS ?? 0);

async function main() {
  const pool = createPool();
  await runMigrations(pool);

  let lastOutcome = "idle";
  let processedCount = 0;
  const server = createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok", pid: process.pid, lastOutcome, processedCount }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`[outbox-worker] pid=${process.pid} health server on http://127.0.0.1:${PORT}`);
  });

  let stopped = false;
  process.on("SIGTERM", () => {
    stopped = true;
  });
  process.on("SIGINT", () => {
    stopped = true;
  });

  while (!stopped) {
    const outcome = await claimAndDeliverOne(pool, DEMO_TENANT_ID, DEMO_DELAY_MS);
    lastOutcome = outcome.kind;
    if (outcome.kind !== "empty") {
      processedCount += 1;
      console.log(`[outbox-worker] ${JSON.stringify(outcome)}`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  server.close();
  await pool.end();
}

main().catch((err) => {
  console.error("[outbox-worker] fatal", err);
  process.exit(1);
});
