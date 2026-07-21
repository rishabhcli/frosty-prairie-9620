import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createPool, runMigrations } from "@contactsafe/db";
import { buildServer } from "./server.js";

describe("api server", () => {
  const pool = createPool();
  let app: FastifyInstance;

  beforeAll(async () => {
    await runMigrations(pool);
    app = await buildServer(pool);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("resets and seeds a deterministic demo contact", async () => {
    const res = await app.inject({ method: "POST", url: "/demo/reset" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.contactId).toBeDefined();
  });

  it("runs the health check", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("creates a task, races two workers, and returns one authorized + one idempotent_replay outcome", async () => {
    const resetRes = await app.inject({ method: "POST", url: "/demo/reset" });
    const { contactId } = resetRes.json();

    const taskRes = await app.inject({ method: "POST", url: "/tasks", payload: { contactId } });
    expect(taskRes.statusCode).toBe(201);
    const { taskId } = taskRes.json();

    const raceRes = await app.inject({ method: "POST", url: "/demo/race", payload: { contactId, taskId } });
    expect(raceRes.statusCode).toBe(200);
    const { agentA, agentB } = raceRes.json();
    const kinds = [agentA.kind, agentB.kind].sort();
    expect(kinds).toEqual(["authorized", "idempotent_replay"]);

    const stateRes = await app.inject({ method: "GET", url: `/contacts/${contactId}/state` });
    expect(stateRes.statusCode).toBe(200);
    const state = stateRes.json();
    expect(state.outbox).toHaveLength(1);
    expect(state.policyDecisions.length).toBeGreaterThanOrEqual(1);
  });

  it("revokes consent and blocks a subsequent authorization attempt", async () => {
    const resetRes = await app.inject({ method: "POST", url: "/demo/reset" });
    const { contactId } = resetRes.json();

    const consentRes = await app.inject({
      method: "POST",
      url: "/consent",
      payload: { contactId, status: "revoked" },
    });
    expect(consentRes.statusCode).toBe(201);

    const taskRes = await app.inject({ method: "POST", url: "/tasks", payload: { contactId } });
    const { taskId } = taskRes.json();

    const raceRes = await app.inject({ method: "POST", url: "/demo/race", payload: { contactId, taskId } });
    const { agentA, agentB } = raceRes.json();
    for (const outcome of [agentA, agentB]) {
      expect(outcome.kind).toBe("blocked");
      expect(outcome.reasonCodes).toContain("consent_revoked");
    }
  });
});
