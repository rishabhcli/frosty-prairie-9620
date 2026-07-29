import awsLambdaFastify from "@fastify/aws-lambda";
import type { APIGatewayProxyEventV2, Context } from "aws-lambda";
import { createPool, runMigrations } from "@contactsafe/db";
import { buildServer } from "./server.js";
import { loadDatabaseUrl } from "./databaseSecret.js";

async function initialize() {
  const databaseUrl = await loadDatabaseUrl();
  const pool = createPool(databaseUrl);
  await runMigrations(pool);

  const app = await buildServer(pool, {
    ...(process.env.REPORTS_DIR ? { reportsDir: process.env.REPORTS_DIR } : {}),
    ...(process.env.STATIC_DIR ? { staticRoot: process.env.STATIC_DIR } : {}),
  });
  await app.ready();
  return awsLambdaFastify(app);
}

let proxyPromise: ReturnType<typeof initialize> | undefined;

export async function handler(event: APIGatewayProxyEventV2, context: Context) {
  context.callbackWaitsForEmptyEventLoop = false;
  const proxy = await (proxyPromise ??= initialize());
  return proxy(event, context);
}
