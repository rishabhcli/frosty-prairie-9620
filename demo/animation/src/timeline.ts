import provenance from "../../audio/narration/provenance.json";

export const FPS = 30;
const TRANSITION_S = 1.5;

function s2f(seconds: number): number {
  return Math.round(seconds * FPS);
}

const durationById = Object.fromEntries(
  provenance.scenes.map((s) => [s.sceneId, s.durationSeconds] as const)
);

function dur(id: string): number {
  const d = durationById[id];
  if (d === undefined) throw new Error(`no narration duration for ${id}`);
  return d;
}

// Every timestamp here is derived from the *actual* rendered narration clip lengths
// (demo/audio/narration/provenance.json), not guessed -- so the composition always
// matches the real audio instead of drifting out of sync with it.
let cursor = 0;
function block(id: string, durationS: number, withTransitionAfter = true) {
  const from = s2f(cursor);
  const durationInFrames = s2f(durationS);
  cursor += durationS;
  if (withTransitionAfter) cursor += TRANSITION_S;
  return { id, from, durationInFrames };
}

export const TITLE = block("title", 3.0);
export const SCENE_01_PROBLEM = block("scene-01-problem", dur("scene-01-problem") + 1.0);
export const SCENE_02_RACE = block("scene-02-race", dur("scene-02-race"));
export const SCENE_03_RESULT = block("scene-03-transaction-result", dur("scene-03-transaction-result"));
export const SCENE_04_REVOCATION = block("scene-04-revocation", dur("scene-04-revocation"));
export const SCENE_05_CRASH = block("scene-05-crash-recovery", dur("scene-05-crash-recovery"));

// Scene 6's narration covers both the architecture explanation and the measured
// results -- split its real duration between the two visuals so each still lines up
// with what's actually being said at that moment.
const scene06Total = dur("scene-06-evaluation");
const architectureShare = Math.min(9.0, scene06Total * 0.45);
export const ARCHITECTURE = block("architecture", architectureShare, false);
export const RESULTS_REVEAL = block("results-reveal", scene06Total - architectureShare);

export const SCENE_07_LIMITATION = block("scene-07-limitation", dur("scene-07-limitation"));
export const SCENE_08_CLOSING = block("scene-08-closing", dur("scene-08-closing"));
export const OUTRO_HOLD = block("outro-hold", 4.0, false);

export const TOTAL_DURATION_IN_FRAMES = s2f(cursor);
export const TOTAL_DURATION_SECONDS = cursor;

export const NARRATION_AUDIO = {
  "scene-01-problem": "scene-01-problem",
  "scene-02-race": "scene-02-race",
  "scene-03-transaction-result": "scene-03-transaction-result",
  "scene-04-revocation": "scene-04-revocation",
  "scene-05-crash-recovery": "scene-05-crash-recovery",
  "scene-06-evaluation": "scene-06-evaluation",
  "scene-07-limitation": "scene-07-limitation",
  "scene-08-closing": "scene-08-closing",
} as const;
