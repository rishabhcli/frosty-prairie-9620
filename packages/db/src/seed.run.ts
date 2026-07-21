import { createPool } from "./pool.js";
import { runMigrations } from "./migrate.js";
import { seed } from "./seed.js";

const pool = createPool();
await runMigrations(pool);
const result = await seed(pool);
console.log("seeded", result);
await pool.end();
