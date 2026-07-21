import { Pool, types } from "pg";

// CockroachDB's INT/INT8/BIGINT (OID 20) is 64-bit; node-postgres returns it as a
// string by default to avoid silent precision loss above Number.MAX_SAFE_INTEGER.
// This app's counters (fencing tokens, task versions) never approach that range, and
// leaving them as strings causes `current + 1` to silently do string concatenation
// instead of arithmetic. Parse int8 as a JS number for every pool in this process.
types.setTypeParser(20, (value: string) => parseInt(value, 10));

export function createPool(connectionString = process.env.DATABASE_URL): Pool {
  if (!connectionString) throw new Error("DATABASE_URL is required");
  return new Pool({ connectionString });
}
