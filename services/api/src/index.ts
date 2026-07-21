import { createPool, runMigrations } from "@contactsafe/db";
import { buildServer } from "./server.js";

const PORT = Number(process.env.PORT_API ?? 14901);

async function main() {
  const pool = createPool();
  await runMigrations(pool);
  const app = await buildServer(pool);
  await app.listen({ port: PORT, host: "127.0.0.1" });
  console.log(`[api] listening on http://127.0.0.1:${PORT}`);
}

main().catch((err) => {
  console.error("[api] fatal", err);
  process.exit(1);
});
