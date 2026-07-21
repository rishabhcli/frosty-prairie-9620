import { z } from "zod";

export const PromiseStatus = z.enum(["open", "fulfilled", "expired", "superseded"]);
export type PromiseStatus = z.infer<typeof PromiseStatus>;

export const PromiseSchema = z.object({
  tenantId: z.string().uuid(),
  promiseId: z.string().uuid(),
  contactId: z.string().uuid(),
  owner: z.string().min(1),
  promisedAction: z.string().min(1),
  dueWindowStart: z.string(),
  dueWindowEnd: z.string(),
  status: PromiseStatus,
  sourceQuote: z.string().min(1),
  sourceEventRef: z.string().min(1),
  createdAt: z.string(),
});
export type Promise_ = z.infer<typeof PromiseSchema>;
