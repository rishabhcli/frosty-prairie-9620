import { describe, it, expect } from "vitest";
import { createOutreachPlanner } from "./createOutreachPlanner.js";
import { FixtureOutreachPlanner } from "./fixturePlanner.js";
import { BedrockOutreachPlanner } from "./bedrockPlanner.js";

describe("createOutreachPlanner", () => {
  it("defaults to the fixture planner when BEDROCK_MODE is unset", () => {
    const planner = createOutreachPlanner(undefined as unknown as "fixture");
    expect(planner).toBeInstanceOf(FixtureOutreachPlanner);
  });

  it("returns the fixture planner for mode 'fixture'", () => {
    expect(createOutreachPlanner("fixture")).toBeInstanceOf(FixtureOutreachPlanner);
  });

  it("returns the live Bedrock planner for mode 'live' without throwing, even with no AWS credentials present", () => {
    expect(() => createOutreachPlanner("live")).not.toThrow();
    expect(createOutreachPlanner("live")).toBeInstanceOf(BedrockOutreachPlanner);
  });
});
