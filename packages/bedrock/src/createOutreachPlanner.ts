import { FixtureOutreachPlanner } from "./fixturePlanner.js";
import { BedrockOutreachPlanner, type BedrockOutreachPlannerOptions } from "./bedrockPlanner.js";
import type { OutreachPlanner } from "./planner.js";

export type BedrockMode = "fixture" | "live";

export function createOutreachPlanner(
  mode: BedrockMode = (process.env.BEDROCK_MODE as BedrockMode) || "fixture",
  opts: BedrockOutreachPlannerOptions = {}
): OutreachPlanner {
  if (mode === "live") {
    return new BedrockOutreachPlanner(opts);
  }
  return new FixtureOutreachPlanner();
}
