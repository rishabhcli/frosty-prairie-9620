import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { OutreachPlanSchema, type OutreachPlan } from "@contactsafe/contracts";
import type { EvidencePacket, OutreachPlanner } from "./planner.js";

const TOOL_NAME = "submit_outreach_plan";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- AWS SDK's DocumentType union
// rejects a structurally-equivalent Record<string, unknown>; this is a plain JSON Schema literal.
const OUTREACH_PLAN_JSON_SCHEMA: any = {
  type: "object",
  properties: {
    intent: { type: "string", enum: ["follow_up", "fulfill_promise", "clarify", "do_not_contact"] },
    channel: { type: "string", enum: ["email"] },
    citedFactIds: { type: "array", items: { type: "string" }, minItems: 1 },
    proposedSubject: { type: "string" },
    proposedBody: { type: "string" },
    proposedNotBefore: { type: "string" },
    uncertainties: { type: "array", items: { type: "string" } },
  },
  required: [
    "intent",
    "channel",
    "citedFactIds",
    "proposedSubject",
    "proposedBody",
    "proposedNotBefore",
    "uncertainties",
  ],
};

const SYSTEM_PROMPT = `You plan a single outreach email from a bounded evidence packet of facts.
Rules you must follow exactly:
- Only cite factId values that appear in the evidence packet given to you. Never invent a fact or a factId.
- If no fact in the packet is currently valid, set intent to "do_not_contact" and cite the stale fact(s) as your reason.
- You are drafting a proposal only. You have no authority to send anything or to override consent, policy, or lease decisions -- a separate deterministic system does that.
- Call the ${TOOL_NAME} tool exactly once with your plan.`;

export interface BedrockOutreachPlannerOptions {
  region?: string;
  modelId?: string;
  client?: BedrockRuntimeClient;
}

export class BedrockOutreachPlanner implements OutreachPlanner {
  private readonly client: BedrockRuntimeClient;
  private readonly modelId: string;

  constructor(opts: BedrockOutreachPlannerOptions = {}) {
    this.modelId = opts.modelId ?? process.env.AWS_BEDROCK_MODEL_ID ?? "anthropic.claude-3-5-sonnet-20241022-v2:0";
    const region = opts.region ?? process.env.AWS_REGION;
    this.client = opts.client ?? new BedrockRuntimeClient(region ? { region } : {});
  }

  async plan(evidence: EvidencePacket): Promise<OutreachPlan> {
    const userMessage = JSON.stringify({
      contactId: evidence.contactId,
      goal: evidence.goal,
      facts: evidence.facts,
    });

    const response = await this.client.send(
      new ConverseCommand({
        modelId: this.modelId,
        system: [{ text: SYSTEM_PROMPT }],
        messages: [{ role: "user", content: [{ text: userMessage }] }],
        toolConfig: {
          tools: [
            {
              toolSpec: {
                name: TOOL_NAME,
                description: "Submit the planned outreach action.",
                inputSchema: { json: OUTREACH_PLAN_JSON_SCHEMA },
              },
            },
          ],
          toolChoice: { tool: { name: TOOL_NAME } },
        },
      })
    );

    const content = response.output?.message?.content ?? [];
    const toolUse = content.find((block) => block.toolUse)?.toolUse;
    if (!toolUse?.input) {
      throw new Error("Bedrock Converse response did not include a tool_use block with plan input");
    }

    return OutreachPlanSchema.parse(toolUse.input);
  }
}
