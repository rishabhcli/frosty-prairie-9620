import { z } from "zod";

export const ConsentStatus = z.enum(["granted", "revoked", "unknown"]);
export type ConsentStatus = z.infer<typeof ConsentStatus>;

export const ConsentEventSchema = z.object({
  tenantId: z.string().uuid(),
  contactId: z.string().uuid(),
  eventId: z.string().uuid(),
  channel: z.literal("email"),
  status: ConsentStatus,
  effectiveAt: z.string(),
  recordedAt: z.string(),
  sourceType: z.string().min(1),
  sourceRef: z.string().min(1),
  actor: z.string().min(1),
});
export type ConsentEvent = z.infer<typeof ConsentEventSchema>;
