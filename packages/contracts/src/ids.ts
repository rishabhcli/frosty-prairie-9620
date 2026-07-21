import { z } from "zod";

export const TenantId = z.string().uuid();
export const ContactId = z.string().uuid();
export type TenantId = z.infer<typeof TenantId>;
export type ContactId = z.infer<typeof ContactId>;

export const DEMO_TENANT_ID = "00000000-0000-0000-0000-000000000001";
