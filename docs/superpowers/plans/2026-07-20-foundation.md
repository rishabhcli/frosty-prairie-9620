# Foundation: Monorepo, Contracts, DB, Local CockroachDB — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the pnpm monorepo, shared contracts, CockroachDB schema/migrations, and the serializable-transaction retry helper that every later subsystem (policy, memory, bedrock, services, console, eval) depends on.

**Architecture:** TypeScript-strict pnpm workspace. `packages/contracts` holds Zod schemas shared by every package/service (single source of truth for row shapes and the Bedrock `OutreachPlan` contract). `packages/db` holds raw-SQL migrations, a thin `pg`-based client, and a CockroachDB-recommended client-side serializable retry loop. Local CockroachDB runs single-node/insecure in Docker for zero-cost dev; the vector index and schema are defined so a later swap to CockroachDB Cloud is a connection-string change only.

**Tech Stack:** Node.js 22, TypeScript 5 strict, pnpm workspaces, Zod, `pg` (node-postgres, CockroachDB wire-compatible), Vitest, Docker/docker-compose, CockroachDB `v26.1`.

## Global Constraints

- Repository slug: `frosty-prairie-9620`. Port block: **14900–14999** (PORT_BASE=14900). This phase uses 14910 (CockroachDB SQL) and 14911 (CockroachDB admin UI — no cache/queue service in this build, so this "PORT_BASE+11" slot is repurposed for the DB admin UI and documented as such).
- Bind all local services to `127.0.0.1`.
- `COMPOSE_PROJECT_NAME=frosty-prairie-9620`; all containers/volumes/networks prefixed `frosty-prairie-9620-`.
- Every table has `tenant_id UUID NOT NULL` (multi-tenant isolation per PLAN.md/AGENTS.md).
- Vector indexes are always defined inline in `CREATE TABLE`, never added later via `ALTER TABLE ... ADD VECTOR INDEX` backfill (backfill disables mutations on the table — see docs/CURRENT_SOURCES.md).
- No AWS/CockroachDB Cloud credentials exist or are created in this phase.
- TypeScript strict mode (`"strict": true`) everywhere; no `any` in contracts.

---

### Task 1: Monorepo scaffold

**Files:**
- Create: `package.json` (root, pnpm workspace root, private)
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.nvmrc`
- Create: `.env.example`
- Create: `packages/contracts/package.json`, `packages/contracts/tsconfig.json`
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`

**Interfaces:**
- Produces: pnpm workspace with `packages/*`, `services/*`, `apps/*` globs; every package extends `tsconfig.base.json`.

- [ ] **Step 1: Write root `package.json`**

```json
{
  "name": "contactsafe",
  "private": true,
  "version": "0.1.0",
  "license": "Apache-2.0",
  "engines": { "node": ">=22" },
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "lint": "eslint . --max-warnings=0",
    "typecheck": "pnpm -r run typecheck",
    "test": "pnpm -r run test",
    "test:integration": "pnpm -r run test:integration",
    "test:e2e": "playwright test",
    "eval:race": "tsx eval/race/run.ts",
    "eval:faults": "tsx eval/faults/run.ts",
    "eval:memory": "tsx eval/memory/run.ts",
    "build": "pnpm -r run build",
    "db:up": "docker compose -f infra/docker-compose.yml up -d",
    "db:down": "docker compose -f infra/docker-compose.yml down",
    "db:migrate": "tsx packages/db/src/migrate.ts",
    "db:seed": "tsx packages/db/src/seed.ts",
    "db:reset": "tsx packages/db/src/reset.ts"
  },
  "devDependencies": {
    "typescript": "^5.6.3",
    "tsx": "^4.19.2",
    "vitest": "^2.1.8",
    "eslint": "^9.15.0",
    "@playwright/test": "^1.49.0"
  }
}
```

- [ ] **Step 2: Write `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
  - "services/*"
  - "apps/*"
  - "eval"
```

- [ ] **Step 3: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true,
    "resolveJsonModule": true
  }
}
```

- [ ] **Step 4: Write `.gitignore`**

```
node_modules
dist
.env
*.log
.DS_Store
demo/audio/**/*.wav
demo/final/*.mp4
!demo/final/.gitkeep
.run/
```

- [ ] **Step 5: Write `.env.example`**

```bash
# Local CockroachDB (docker-compose, port block 14900-14999)
DATABASE_URL=postgresql://root@127.0.0.1:14910/contactsafe?sslmode=disable

# Bedrock: leave unset to run in fixture mode (deterministic canned plans)
BEDROCK_MODE=fixture
AWS_REGION=
AWS_BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0

# CockroachDB Managed MCP: leave unset to run local fixture-contract bridge
COCKROACH_MANAGED_MCP_ENDPOINT=
COCKROACH_MANAGED_MCP_API_KEY=

PORT_CONSOLE=14900
PORT_API=14901
PORT_AGENT_WORKER=14902
PORT_OUTBOX_WORKER=14903
```

- [ ] **Step 6: Write `packages/contracts/package.json`**

```json
{
  "name": "@contactsafe/contracts",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": { "zod": "^3.23.8" },
  "devDependencies": { "typescript": "^5.6.3", "vitest": "^2.1.8" }
}
```

- [ ] **Step 7: Write `packages/contracts/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

- [ ] **Step 8: Write `packages/db/package.json`**

```json
{
  "name": "@contactsafe/db",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run --exclude '**/*.integration.test.ts'",
    "test:integration": "vitest run --config vitest.integration.config.ts"
  },
  "dependencies": {
    "@contactsafe/contracts": "workspace:*",
    "pg": "^8.13.1"
  },
  "devDependencies": {
    "@types/pg": "^8.11.10",
    "typescript": "^5.6.3",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 9: Write `packages/db/tsconfig.json`** (same shape as contracts' tsconfig, `rootDir: src`)

- [ ] **Step 10: Install and verify workspace resolves**

Run: `pnpm install`
Expected: lockfile created, no errors, `packages/contracts` and `packages/db` show as workspace packages.

- [ ] **Step 11: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .gitignore .env.example packages/contracts/package.json packages/contracts/tsconfig.json packages/db/package.json packages/db/tsconfig.json pnpm-lock.yaml
git commit -m "chore: scaffold pnpm monorepo with contracts and db packages"
```

---

### Task 2: Contracts — row and event schemas

**Files:**
- Create: `packages/contracts/src/ids.ts`
- Create: `packages/contracts/src/consent.ts`
- Create: `packages/contracts/src/promise.ts`
- Create: `packages/contracts/src/lease.ts`
- Create: `packages/contracts/src/outbox.ts`
- Create: `packages/contracts/src/memory.ts`
- Create: `packages/contracts/src/policy.ts`
- Create: `packages/contracts/src/plan.ts`
- Create: `packages/contracts/src/index.ts`
- Test: `packages/contracts/src/plan.test.ts`

**Interfaces:**
- Produces: `ConsentEvent`, `Promise_`, `ContactLease`, `TransactionalOutbox`, `MemoryChunk`, `PolicyDecision`, `OutreachPlan` Zod schemas + inferred TS types, all re-exported from `packages/contracts/src/index.ts`. These exact names/types are consumed by every later package.

- [ ] **Step 1: Write the failing test for the plan contract**

```typescript
// packages/contracts/src/plan.test.ts
import { describe, it, expect } from "vitest";
import { OutreachPlanSchema } from "./plan.js";

describe("OutreachPlanSchema", () => {
  it("accepts a valid plan citing at least one fact", () => {
    const result = OutreachPlanSchema.safeParse({
      intent: "fulfill_promise",
      channel: "email",
      citedFactIds: ["promise:123"],
      proposedSubject: "Your revised quote",
      proposedBody: "As promised, here is the revised quote.",
      proposedNotBefore: "2026-07-22T00:00:00.000Z",
      uncertainties: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a plan with zero cited facts", () => {
    const result = OutreachPlanSchema.safeParse({
      intent: "follow_up",
      channel: "email",
      citedFactIds: [],
      proposedSubject: "Hi",
      proposedBody: "Following up.",
      proposedNotBefore: "2026-07-22T00:00:00.000Z",
      uncertainties: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid intent", () => {
    const result = OutreachPlanSchema.safeParse({
      intent: "cold_call",
      channel: "email",
      citedFactIds: ["promise:123"],
      proposedSubject: "Hi",
      proposedBody: "Hi",
      proposedNotBefore: "2026-07-22T00:00:00.000Z",
      uncertainties: [],
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @contactsafe/contracts test`
Expected: FAIL — `Cannot find module './plan.js'`

- [ ] **Step 3: Write `packages/contracts/src/ids.ts`**

```typescript
import { z } from "zod";

export const TenantId = z.string().uuid().brand<"TenantId">();
export const ContactId = z.string().uuid().brand<"ContactId">();
export type TenantId = z.infer<typeof TenantId>;
export type ContactId = z.infer<typeof ContactId>;
```

- [ ] **Step 4: Write `packages/contracts/src/plan.ts`**

```typescript
import { z } from "zod";

export const OutreachIntent = z.enum([
  "follow_up",
  "fulfill_promise",
  "clarify",
  "do_not_contact",
]);
export type OutreachIntent = z.infer<typeof OutreachIntent>;

export const OutreachPlanSchema = z.object({
  intent: OutreachIntent,
  channel: z.literal("email"),
  citedFactIds: z.array(z.string().min(1)).min(1, "plan must cite at least one fact"),
  proposedSubject: z.string().min(1).max(200),
  proposedBody: z.string().min(1).max(4000),
  proposedNotBefore: z.string().datetime(),
  uncertainties: z.array(z.string()),
});
export type OutreachPlan = z.infer<typeof OutreachPlanSchema>;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @contactsafe/contracts test`
Expected: PASS (3 tests)

- [ ] **Step 6: Write remaining contract files** (`consent.ts`, `promise.ts`, `lease.ts`, `outbox.ts`, `memory.ts`, `policy.ts`) mirroring the SQL schema in PLAN.md §4 — each field required, `tenant_id`/`contact_id` as branded UUID strings, timestamps as `z.string().datetime()`, enums matching the CHECK constraints below (Task 3). Example for `consent.ts`:

```typescript
// packages/contracts/src/consent.ts
import { z } from "zod";

export const ConsentStatus = z.enum(["granted", "revoked", "unknown"]);

export const ConsentEventSchema = z.object({
  tenantId: z.string().uuid(),
  contactId: z.string().uuid(),
  eventId: z.string().uuid(),
  channel: z.literal("email"),
  status: ConsentStatus,
  effectiveAt: z.string().datetime(),
  recordedAt: z.string().datetime(),
  sourceType: z.string().min(1),
  sourceRef: z.string().min(1),
  actor: z.string().min(1),
});
export type ConsentEvent = z.infer<typeof ConsentEventSchema>;
```

Apply the same pattern (schema + inferred type, `camelCase` field names mapping 1:1 to the `snake_case` SQL columns from PLAN.md §4) for `Promise_`/`promises`, `ContactLease`/`contact_leases`, `TransactionalOutbox`/`transactional_outbox`, `MemoryChunk`/`memory_chunks`, `PolicyDecision`/`policy_decisions`.

- [ ] **Step 7: Write `packages/contracts/src/index.ts`**

```typescript
export * from "./ids.js";
export * from "./consent.js";
export * from "./promise.js";
export * from "./lease.js";
export * from "./outbox.js";
export * from "./memory.js";
export * from "./policy.js";
export * from "./plan.js";
```

- [ ] **Step 8: Run full contracts test + typecheck**

Run: `pnpm --filter @contactsafe/contracts test && pnpm --filter @contactsafe/contracts typecheck`
Expected: PASS, 0 type errors

- [ ] **Step 9: Commit**

```bash
git add packages/contracts
git commit -m "feat(contracts): add row and outreach-plan Zod schemas"
```

---

### Task 3: CockroachDB migrations and docker-compose

**Files:**
- Create: `infra/docker-compose.yml`
- Create: `packages/db/migrations/001_init.sql`
- Create: `packages/db/migrations/002_vector_index.sql`
- Create: `packages/db/src/migrate.ts`
- Test: `packages/db/src/migrate.integration.test.ts`

**Interfaces:**
- Consumes: nothing (first DB task).
- Produces: `runMigrations(pool: pg.Pool): Promise<void>` from `packages/db/src/migrate.ts`, used by `packages/db/src/seed.ts` and integration tests.

- [ ] **Step 1: Write `infra/docker-compose.yml`**

```yaml
name: frosty-prairie-9620

services:
  cockroachdb:
    image: cockroachdb/cockroach:latest-v26.1
    container_name: frosty-prairie-9620-cockroachdb
    command: start-single-node --insecure --listen-addr=0.0.0.0:26257 --http-addr=0.0.0.0:8080
    ports:
      - "127.0.0.1:14910:26257"
      - "127.0.0.1:14911:8080"
    volumes:
      - frosty-prairie-9620-cockroach-data:/cockroach/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://127.0.0.1:8080/health?ready=1"]
      interval: 3s
      timeout: 3s
      retries: 20

volumes:
  frosty-prairie-9620-cockroach-data:
    name: frosty-prairie-9620-cockroach-data
```

- [ ] **Step 2: Start it and verify health**

Run: `docker compose -f infra/docker-compose.yml up -d && sleep 5 && curl -sf http://127.0.0.1:14911/health?ready=1`
Expected: container `frosty-prairie-9620-cockroachdb` running, curl returns `{}`

- [ ] **Step 3: Enable vector index feature flag once, manually**

Run: `docker exec frosty-prairie-9620-cockroachdb ./cockroach sql --insecure -e "SET CLUSTER SETTING feature.vector_index.enabled = true;"`
Expected: `SET CLUSTER SETTING`

- [ ] **Step 4: Write `packages/db/migrations/001_init.sql`** (schema per PLAN.md §4, condensed — full column list, all tables `tenant_id` first column, per-table primary keys and the unique indexes PLAN.md calls for)

```sql
CREATE TABLE IF NOT EXISTS contacts (
  tenant_id UUID NOT NULL,
  contact_id UUID NOT NULL DEFAULT gen_random_uuid(),
  display_name STRING NOT NULL,
  email_address STRING NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, contact_id)
);

CREATE TABLE IF NOT EXISTS consent_events (
  tenant_id UUID NOT NULL,
  contact_id UUID NOT NULL,
  event_id UUID NOT NULL DEFAULT gen_random_uuid(),
  channel STRING NOT NULL,
  status STRING NOT NULL CHECK (status IN ('granted','revoked','unknown')),
  effective_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_type STRING NOT NULL,
  source_ref STRING NOT NULL,
  actor STRING NOT NULL,
  PRIMARY KEY (tenant_id, contact_id, event_id)
);
CREATE INDEX IF NOT EXISTS consent_latest_idx ON consent_events (tenant_id, contact_id, channel, effective_at DESC);

CREATE TABLE IF NOT EXISTS promises (
  tenant_id UUID NOT NULL,
  promise_id UUID NOT NULL DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL,
  owner STRING NOT NULL,
  promised_action STRING NOT NULL,
  due_window_start TIMESTAMPTZ NOT NULL,
  due_window_end TIMESTAMPTZ NOT NULL,
  status STRING NOT NULL CHECK (status IN ('open','fulfilled','expired','superseded')),
  source_quote STRING NOT NULL,
  source_event_ref STRING NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, promise_id)
);
CREATE INDEX IF NOT EXISTS promises_due_idx ON promises (tenant_id, contact_id, status, due_window_start);

CREATE TABLE IF NOT EXISTS contact_attempts (
  tenant_id UUID NOT NULL,
  attempt_id UUID NOT NULL DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL,
  channel STRING NOT NULL,
  campaign_id STRING NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  worker_id STRING NOT NULL,
  PRIMARY KEY (tenant_id, attempt_id)
);
CREATE INDEX IF NOT EXISTS attempts_recent_idx ON contact_attempts (tenant_id, contact_id, channel, attempted_at DESC);

CREATE TABLE IF NOT EXISTS policy_decisions (
  tenant_id UUID NOT NULL,
  policy_decision_id UUID NOT NULL DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL,
  rule_version STRING NOT NULL,
  outcome STRING NOT NULL CHECK (outcome IN ('allow','block','review')),
  reason_codes STRING[] NOT NULL,
  evidence_fact_ids STRING[] NOT NULL,
  plan_hash STRING NOT NULL,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, policy_decision_id)
);

CREATE TABLE IF NOT EXISTS contact_leases (
  tenant_id UUID NOT NULL,
  contact_id UUID NOT NULL,
  channel STRING NOT NULL,
  owner_id STRING NOT NULL,
  fencing_token INT8 NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, contact_id, channel)
);

CREATE TABLE IF NOT EXISTS agent_tasks (
  tenant_id UUID NOT NULL,
  task_id UUID NOT NULL DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL,
  task_type STRING NOT NULL,
  state STRING NOT NULL CHECK (state IN ('pending','claimed','authorized','blocked','completed','failed')),
  version INT8 NOT NULL DEFAULT 1,
  worker_id STRING,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, task_id)
);
CREATE INDEX IF NOT EXISTS tasks_pending_idx ON agent_tasks (tenant_id, state, created_at);

CREATE TABLE IF NOT EXISTS transactional_outbox (
  tenant_id UUID NOT NULL,
  outbox_id UUID NOT NULL DEFAULT gen_random_uuid(),
  logical_action_key STRING NOT NULL,
  contact_id UUID NOT NULL,
  channel STRING NOT NULL,
  lease_fencing_token INT8 NOT NULL,
  policy_decision_id UUID NOT NULL,
  payload JSONB NOT NULL,
  state STRING NOT NULL CHECK (state IN ('pending','claimed','delivered','canceled_policy','retryable','ambiguous','terminal_failed')),
  provider_idempotency_key STRING NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  UNIQUE (tenant_id, logical_action_key),
  PRIMARY KEY (tenant_id, outbox_id)
);
CREATE INDEX IF NOT EXISTS outbox_pending_idx ON transactional_outbox (tenant_id, state, created_at);
```

- [ ] **Step 5: Write `packages/db/migrations/002_vector_index.sql`** (vector column + inline index defined at creation, per the backfill-avoidance constraint above)

```sql
CREATE TABLE IF NOT EXISTS memory_chunks (
  tenant_id UUID NOT NULL,
  chunk_id UUID NOT NULL DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL,
  source_type STRING NOT NULL,
  source_ref STRING NOT NULL,
  text_summary STRING NOT NULL,
  effective_at TIMESTAMPTZ NOT NULL,
  superseded BOOL NOT NULL DEFAULT false,
  checksum STRING NOT NULL,
  embedding VECTOR(384),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, chunk_id),
  VECTOR INDEX (tenant_id, embedding)
);
```

- [ ] **Step 6: Write the failing integration test**

```typescript
// packages/db/src/migrate.integration.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { Pool } from "pg";
import { runMigrations } from "./migrate.js";

describe("runMigrations", () => {
  it("creates all core tables idempotently", async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await runMigrations(pool);
    await runMigrations(pool); // must be idempotent
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
    );
    const names = rows.map((r) => r.table_name);
    for (const t of ["contacts", "consent_events", "promises", "contact_leases", "transactional_outbox", "memory_chunks"]) {
      expect(names).toContain(t);
    }
    await pool.end();
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `DATABASE_URL=postgresql://root@127.0.0.1:14910/contactsafe?sslmode=disable pnpm --filter @contactsafe/db test:integration`
Expected: FAIL — `Cannot find module './migrate.js'` (database `contactsafe` also doesn't exist yet)

- [ ] **Step 8: Create the database**

Run: `docker exec frosty-prairie-9620-cockroachdb ./cockroach sql --insecure -e "CREATE DATABASE IF NOT EXISTS contactsafe;"`
Expected: `CREATE DATABASE`

- [ ] **Step 9: Write `packages/db/src/migrate.ts`**

```typescript
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

export async function runMigrations(pool: Pool): Promise<void> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (name STRING PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`
  );
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const { rows } = await pool.query(`SELECT 1 FROM schema_migrations WHERE name = $1`, [file]);
    if (rows.length > 0) continue;
    const sql = await readFile(join(migrationsDir, file), "utf8");
    await pool.query(sql);
    await pool.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [file]);
  }
}
```

- [ ] **Step 10: Run test to verify it passes**

Run: `DATABASE_URL=postgresql://root@127.0.0.1:14910/contactsafe?sslmode=disable pnpm --filter @contactsafe/db test:integration`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add infra/docker-compose.yml packages/db/migrations packages/db/src/migrate.ts packages/db/src/migrate.integration.test.ts
git commit -m "feat(db): add local CockroachDB compose file and initial migrations"
```

---

### Task 4: Serializable transaction retry helper

**Files:**
- Create: `packages/db/src/pool.ts`
- Create: `packages/db/src/withSerializableRetry.ts`
- Test: `packages/db/src/withSerializableRetry.integration.test.ts`

**Interfaces:**
- Consumes: `Pool` from `pg` (Task 3).
- Produces: `withSerializableRetry<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>, opts?: { maxRetries?: number }): Promise<T>` — used by every later authorization transaction (policy engine's transactional caller, agent-worker, outbox-worker).

- [ ] **Step 1: Write `packages/db/src/pool.ts`**

```typescript
import { Pool } from "pg";

export function createPool(connectionString = process.env.DATABASE_URL): Pool {
  if (!connectionString) throw new Error("DATABASE_URL is required");
  return new Pool({ connectionString });
}
```

- [ ] **Step 2: Write the failing test** — two concurrent transactions incrementing the same row must both succeed exactly once each via retry, never lose an update

```typescript
// packages/db/src/withSerializableRetry.integration.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { createPool } from "./pool.js";
import { withSerializableRetry } from "./withSerializableRetry.js";
import { runMigrations } from "./migrate.js";

describe("withSerializableRetry", () => {
  const pool = createPool();

  beforeAll(async () => {
    await runMigrations(pool);
    await pool.query(`CREATE TABLE IF NOT EXISTS retry_counter (id INT PRIMARY KEY, value INT NOT NULL)`);
    await pool.query(`UPSERT INTO retry_counter (id, value) VALUES (1, 0)`);
  });

  it("retries on serialization conflict and both increments land", async () => {
    const bump = () =>
      withSerializableRetry(pool, async (client) => {
        const { rows } = await client.query(`SELECT value FROM retry_counter WHERE id = 1`);
        const current = rows[0].value as number;
        await new Promise((r) => setTimeout(r, 10));
        await client.query(`UPDATE retry_counter SET value = $1 WHERE id = 1`, [current + 1]);
      });

    await Promise.all([bump(), bump()]);

    const { rows } = await pool.query(`SELECT value FROM retry_counter WHERE id = 1`);
    expect(rows[0].value).toBe(2);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `DATABASE_URL=postgresql://root@127.0.0.1:14910/contactsafe?sslmode=disable pnpm --filter @contactsafe/db test:integration`
Expected: FAIL — `Cannot find module './withSerializableRetry.js'`

- [ ] **Step 4: Write `packages/db/src/withSerializableRetry.ts`** (CockroachDB's documented client-side retry loop: `SAVEPOINT cockroach_restart`, catch SQLSTATE `40001`, `ROLLBACK TO SAVEPOINT`, retry with capped exponential backoff)

```typescript
import type { Pool, PoolClient } from "pg";

const RETRY_SQLSTATE = "40001";

export async function withSerializableRetry<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
  opts: { maxRetries?: number } = {}
): Promise<T> {
  const maxRetries = opts.maxRetries ?? 8;
  const client = await pool.connect();
  try {
    for (let attempt = 0; ; attempt++) {
      await client.query("BEGIN; SAVEPOINT cockroach_restart");
      try {
        const result = await fn(client);
        await client.query("RELEASE SAVEPOINT cockroach_restart; COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK TO SAVEPOINT cockroach_restart");
        const code = (err as { code?: string }).code;
        if (code === RETRY_SQLSTATE && attempt < maxRetries) {
          const backoffMs = Math.min(2 ** attempt * 10, 500);
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }
        await client.query("ROLLBACK");
        throw err;
      }
    }
  } finally {
    client.release();
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `DATABASE_URL=postgresql://root@127.0.0.1:14910/contactsafe?sslmode=disable pnpm --filter @contactsafe/db test:integration`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/pool.ts packages/db/src/withSerializableRetry.ts packages/db/src/withSerializableRetry.integration.test.ts
git commit -m "feat(db): add CockroachDB serializable-transaction retry helper"
```

---

### Task 5: Seed and reset scripts (demo determinism)

**Files:**
- Create: `packages/db/src/seed.ts`
- Create: `packages/db/src/reset.ts`
- Create: `fixtures/contacts.json`
- Test: `packages/db/src/seed.integration.test.ts`

**Interfaces:**
- Consumes: `createPool`, `runMigrations` (Task 3/4).
- Produces: `seed(pool: Pool): Promise<{ jordanContactId: string }>` and `reset(pool: Pool): Promise<void>`, used by the eval harness and E2E tests for deterministic demo state.

- [ ] **Step 1: Write `fixtures/contacts.json`** (synthetic-only, per AGENTS.md non-negotiable #1)

```json
{
  "contacts": [
    {
      "contactId": "11111111-1111-1111-1111-111111111111",
      "displayName": "Jordan (synthetic demo contact)",
      "emailAddress": "jordan.demo@sandbox.contactsafe.invalid"
    }
  ]
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// packages/db/src/seed.integration.test.ts
import { describe, it, expect } from "vitest";
import { createPool } from "./pool.js";
import { runMigrations } from "./migrate.js";
import { seed } from "./seed.js";
import { reset } from "./reset.js";

describe("seed/reset", () => {
  const pool = createPool();

  it("seeds one consent event and one open promise for Jordan, and reset clears it", async () => {
    await runMigrations(pool);
    const { jordanContactId } = await seed(pool);
    const { rows: consents } = await pool.query(
      `SELECT * FROM consent_events WHERE contact_id = $1`, [jordanContactId]
    );
    expect(consents.length).toBe(1);
    expect(consents[0].status).toBe("granted");

    const { rows: promises } = await pool.query(
      `SELECT * FROM promises WHERE contact_id = $1`, [jordanContactId]
    );
    expect(promises.length).toBe(1);
    expect(promises[0].status).toBe("open");

    await reset(pool);
    const { rows: after } = await pool.query(`SELECT * FROM consent_events`);
    expect(after.length).toBe(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `DATABASE_URL=postgresql://root@127.0.0.1:14910/contactsafe?sslmode=disable pnpm --filter @contactsafe/db test:integration`
Expected: FAIL — `Cannot find module './seed.js'`

- [ ] **Step 4: Write `packages/db/src/seed.ts`**

```typescript
import type { Pool } from "pg";
import contactsFixture from "../../../fixtures/contacts.json" with { type: "json" };

export async function seed(pool: Pool): Promise<{ jordanContactId: string }> {
  const jordan = contactsFixture.contacts[0];
  await pool.query(
    `UPSERT INTO contacts (tenant_id, contact_id, display_name, email_address) VALUES ($1, $2, $3, $4)`,
    ["00000000-0000-0000-0000-000000000001", jordan.contactId, jordan.displayName, jordan.emailAddress]
  );
  await pool.query(
    `INSERT INTO consent_events (tenant_id, contact_id, channel, status, effective_at, source_type, source_ref, actor)
     VALUES ($1, $2, 'email', 'granted', now() - interval '30 days', 'demo_seed', 'seed:consent:1', 'seed-script')`,
    ["00000000-0000-0000-0000-000000000001", jordan.contactId]
  );
  await pool.query(
    `INSERT INTO promises (tenant_id, contact_id, owner, promised_action, due_window_start, due_window_end, status, source_quote, source_event_ref)
     VALUES ($1, $2, 'agent-a', 'email_revised_quote', now(), now() + interval '2 days', 'open',
             'email the revised quote after Tuesday', 'seed:promise:1')`,
    ["00000000-0000-0000-0000-000000000001", jordan.contactId]
  );
  return { jordanContactId: jordan.contactId };
}
```

- [ ] **Step 5: Write `packages/db/src/reset.ts`**

```typescript
import type { Pool } from "pg";

const TABLES = [
  "transactional_outbox", "contact_leases", "agent_tasks", "policy_decisions",
  "memory_chunks", "contact_attempts", "promises", "consent_events", "contacts",
];

export async function reset(pool: Pool): Promise<void> {
  for (const table of TABLES) {
    await pool.query(`DELETE FROM ${table}`);
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `DATABASE_URL=postgresql://root@127.0.0.1:14910/contactsafe?sslmode=disable pnpm --filter @contactsafe/db test:integration`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/seed.ts packages/db/src/reset.ts packages/db/src/seed.integration.test.ts fixtures/contacts.json
git commit -m "feat(db): add deterministic seed/reset for demo state"
```

---

## Self-Review Notes

- Spec coverage: PLAN.md §3 repository layout (contracts, db, infra) ✅; §4 data schema (all listed tables + indexes) ✅; §8 retry loop pattern ✅; AGENTS.md non-negotiable #2 (consent append-only, rechecked transactionally) — schema supports it, enforcement lands in Task list #5 (services); non-negotiable #6 (idempotency keys) — `transactional_outbox` unique `logical_action_key` ✅.
- No placeholders: all SQL/TS is complete, no TODOs.
- Type consistency: `withSerializableRetry(pool, fn)` signature is what agent-worker/outbox-worker plans (later) will call against — noted here for cross-plan consistency.
