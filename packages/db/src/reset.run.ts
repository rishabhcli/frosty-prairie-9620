import { createPool } from "./pool.js";
import { reset } from "./reset.js";

const pool = createPool();
await reset(pool);
console.log("reset complete");
await pool.end();
