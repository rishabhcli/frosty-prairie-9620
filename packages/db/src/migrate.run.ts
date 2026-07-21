import { createPool } from "./pool.js";
import { runMigrations } from "./migrate.js";

const pool = createPool();
await runMigrations(pool);
console.log("migrations applied");
await pool.end();
