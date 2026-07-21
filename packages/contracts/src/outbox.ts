import { z } from "zod";

export const OutboxState = z.enum([
  "pending",
  "claimed",
  "delivered",
  "canceled_policy",
  "retryable",
  "ambiguous",
  "terminal_failed",
]);
export type OutboxState = z.infer<typeof OutboxState>;

export const TransactionalOutboxSchema = z.object({
  tenantId: z.string().uuid(),
  outboxId: z.string().uuid(),
  logicalActionKey: z.string().min(1),
  contactId: z.string().uuid(),
  channel: z.literal("email"),
  leaseFencingToken: z.number().int().nonnegative(),
  policyDecisionId: z.string().uuid(),
  payload: z.record(z.string(), z.unknown()),
  state: OutboxState,
  providerIdempotencyKey: z.string().min(1),
  createdAt: z.string(),
  deliveredAt: z.string().nullable(),
});
export type TransactionalOutbox = z.infer<typeof TransactionalOutboxSchema>;
