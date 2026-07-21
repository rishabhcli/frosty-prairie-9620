import { z } from "zod";

export const OutreachIntent = z.enum([
  "follow_up",
  "fulfill_promise",
  "clarify",
  "do_not_contact",
]);
export type OutreachIntent = z.infer<typeof OutreachIntent>;

export const OutreachPlanSchema = z.object({
  intent: OutreachIntent,
  channel: z.literal("email"),
  citedFactIds: z.array(z.string().min(1)).min(1, "plan must cite at least one fact"),
  proposedSubject: z.string().min(1).max(200),
  proposedBody: z.string().min(1).max(4000),
  proposedNotBefore: z.string().datetime(),
  uncertainties: z.array(z.string()),
});
export type OutreachPlan = z.infer<typeof OutreachPlanSchema>;
