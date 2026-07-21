import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll } from "vitest";
import { createPool, runMigrations, reset } from "@contactsafe/db";
import { DEMO_TENANT_ID } from "@contactsafe/contracts";
import { embedText } from "./embed.js";
import { retrieveRelevantMemory } from "./retrieve.js";
import { ingestMemoryChunk } from "./ingest.js";

describe("retrieveRelevantMemory", () => {
  const pool = createPool();
  const contactId = randomUUID();
  const openPromiseId = randomUUID();
  const expiredPromiseId = randomUUID();

  beforeAll(async () => {
    await runMigrations(pool);
    await reset(pool);

    await pool.query(
      `INSERT INTO contacts (tenant_id, contact_id, display_name, email_address) VALUES ($1, $2, $3, $4)`,
      [DEMO_TENANT_ID, contactId, "Test Contact", "test@sandbox.contactsafe.invalid"]
    );

    await pool.query(
      `INSERT INTO promises (tenant_id, promise_id, contact_id, owner, promised_action, due_window_start, due_window_end, status, source_quote, source_event_ref)
       VALUES ($1, $2, $3, 'agent-a', 'email_revised_quote', now(), now() + interval '2 days', 'open',
               'email the revised quote after Tuesday', 'test:promise:open')`,
      [DEMO_TENANT_ID, openPromiseId, contactId]
    );
    await pool.query(
      `INSERT INTO promises (tenant_id, promise_id, contact_id, owner, promised_action, due_window_start, due_window_end, status, source_quote, source_event_ref)
       VALUES ($1, $2, $3, 'agent-a', 'email_follow_up', now() - interval '10 days', now() - interval '8 days', 'expired',
               'follow up next week', 'test:promise:expired')`,
      [DEMO_TENANT_ID, expiredPromiseId, contactId]
    );

    await ingestMemoryChunk(pool, {
      tenantId: DEMO_TENANT_ID,
      contactId,
      sourceType: "promise",
      sourceRef: openPromiseId,
      textSummary: "email the revised quote after Tuesday",
      effectiveAt: new Date().toISOString(),
      checksum: "chk-open",
    });
    await ingestMemoryChunk(pool, {
      tenantId: DEMO_TENANT_ID,
      contactId,
      sourceType: "promise",
      sourceRef: expiredPromiseId,
      textSummary: "follow up next week",
      effectiveAt: new Date().toISOString(),
      checksum: "chk-expired",
    });
  });

  it("marks the chunk citing an open promise as currently valid", async () => {
    const results = await retrieveRelevantMemory(pool, {
      tenantId: DEMO_TENANT_ID,
      contactId,
      queryEmbedding: embedText("email the revised quote after Tuesday"),
      topK: 5,
    });
    const openChunk = results.find((r) => r.sourceRef === openPromiseId);
    expect(openChunk).toBeDefined();
    expect(openChunk?.currentlyValid).toBe(true);
  });

  it("marks the chunk citing an expired promise as not currently valid", async () => {
    const results = await retrieveRelevantMemory(pool, {
      tenantId: DEMO_TENANT_ID,
      contactId,
      queryEmbedding: embedText("follow up next week"),
      topK: 5,
    });
    const expiredChunk = results.find((r) => r.sourceRef === expiredPromiseId);
    expect(expiredChunk).toBeDefined();
    expect(expiredChunk?.currentlyValid).toBe(false);
  });

  it("orders results by vector distance to the query embedding", async () => {
    const results = await retrieveRelevantMemory(pool, {
      tenantId: DEMO_TENANT_ID,
      contactId,
      queryEmbedding: embedText("email the revised quote after Tuesday"),
      topK: 1,
    });
    expect(results).toHaveLength(1);
    expect(results[0]?.sourceRef).toBe(openPromiseId);
  });
});
