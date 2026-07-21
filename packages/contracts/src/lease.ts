import { z } from "zod";

export const ContactLeaseSchema = z.object({
  tenantId: z.string().uuid(),
  contactId: z.string().uuid(),
  channel: z.literal("email"),
  ownerId: z.string().min(1),
  fencingToken: z.number().int().nonnegative(),
  expiresAt: z.string(),
  updatedAt: z.string(),
});
export type ContactLease = z.infer<typeof ContactLeaseSchema>;
