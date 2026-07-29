import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

export function parseDatabaseSecret(secretString: string): string {
  const trimmed = secretString.trim();
  if (trimmed.startsWith("postgresql://") || trimmed.startsWith("postgres://")) {
    return trimmed;
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(trimmed);
  } catch {
    throw new Error("Database secret must be a PostgreSQL URL or JSON containing DATABASE_URL");
  }

  if (
    typeof decoded === "object" &&
    decoded !== null &&
    "DATABASE_URL" in decoded &&
    typeof decoded.DATABASE_URL === "string" &&
    decoded.DATABASE_URL.length > 0
  ) {
    return decoded.DATABASE_URL;
  }

  throw new Error("Database secret JSON must contain a non-empty DATABASE_URL string");
}

export async function loadDatabaseUrl(): Promise<string> {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const secretId = process.env.DATABASE_URL_SECRET_ARN;
  if (!secretId) {
    throw new Error("DATABASE_URL or DATABASE_URL_SECRET_ARN is required");
  }

  const client = new SecretsManagerClient({});
  const response = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
  if (!response.SecretString) {
    throw new Error("Database secret did not contain a SecretString value");
  }
  return parseDatabaseSecret(response.SecretString);
}
