import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import type { Pool } from "pg";
import { reset, seed } from "@contactsafe/db";
import { DEMO_TENANT_ID, ConsentStatus } from "@contactsafe/contracts";
import { createOutreachPlanner } from "@contactsafe/bedrock";
import { createAgentTask, runAgentAttempt } from "@contactsafe/agent-worker";
import { claimAndDeliverOne } from "@contactsafe/outbox-worker";
import { getContactState } from "./state.js";

export async function buildServer(pool: Pool): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });
  const planner = createOutreachPlanner();

  app.get("/health", async () => ({ status: "ok" }));

  app.get("/contacts/:contactId/state", async (req, reply) => {
    const { contactId } = req.params as { contactId: string };
    const state = await getContactState(pool, DEMO_TENANT_ID, contactId);
    return reply.send(state);
  });

  app.post("/consent", async (req, reply) => {
    const body = req.body as { contactId?: string; status?: string; actor?: string };
    if (!body.contactId || !body.status) {
      return reply.status(400).send({ error: "contactId and status are required" });
    }
    const parsedStatus = ConsentStatus.safeParse(body.status);
    if (!parsedStatus.success) {
      return reply.status(400).send({ error: "status must be granted, revoked, or unknown" });
    }
    const eventId = randomUUID();
    await pool.query(
      `INSERT INTO consent_events (tenant_id, contact_id, event_id, channel, status, effective_at, source_type, source_ref, actor)
       VALUES ($1, $2, $3, 'email', $4, now(), 'console', $5, $6)`,
      [DEMO_TENANT_ID, body.contactId, eventId, parsedStatus.data, `console:${eventId}`, body.actor ?? "console-operator"]
    );
    return reply.status(201).send({ eventId, status: parsedStatus.data });
  });

  app.post("/tasks", async (req, reply) => {
    const body = req.body as { contactId?: string; taskType?: string };
    if (!body.contactId) {
      return reply.status(400).send({ error: "contactId is required" });
    }
    const { taskId } = await createAgentTask(pool, {
      tenantId: DEMO_TENANT_ID,
      contactId: body.contactId,
      ...(body.taskType ? { taskType: body.taskType } : {}),
    });
    return reply.status(201).send({ taskId });
  });

  app.post("/demo/race", async (req, reply) => {
    const body = req.body as { contactId?: string; taskId?: string };
    if (!body.contactId || !body.taskId) {
      return reply.status(400).send({ error: "contactId and taskId are required" });
    }
    const [agentA, agentB] = await Promise.all([
      runAgentAttempt({
        pool,
        tenantId: DEMO_TENANT_ID,
        contactId: body.contactId,
        taskId: body.taskId,
        workerId: "agent-a",
        planner,
      }),
      runAgentAttempt({
        pool,
        tenantId: DEMO_TENANT_ID,
        contactId: body.contactId,
        taskId: body.taskId,
        workerId: "agent-b",
        planner,
      }),
    ]);
    return reply.send({ agentA, agentB });
  });

  app.post("/outbox/process-one", async (_req, reply) => {
    const outcome = await claimAndDeliverOne(pool, DEMO_TENANT_ID);
    return reply.send(outcome);
  });

  app.post("/demo/reset", async (_req, reply) => {
    await reset(pool);
    const { jordanContactId } = await seed(pool);
    return reply.send({ contactId: jordanContactId });
  });

  return app;
}
