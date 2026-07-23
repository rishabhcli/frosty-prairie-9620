import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import eventsJson from "../../capture/events.json";
import { colors } from "./tokens";
import { TitleReveal } from "./components/TitleReveal";
import { ProblemHook } from "./components/ProblemHook";
import { ScreenCapture } from "./components/ScreenCapture";
import { Callout } from "./components/Callout";
import { LowerThird } from "./components/LowerThird";
import { ArchitectureAnimation } from "./components/ArchitectureAnimation";
import { ResultsReveal } from "./components/ResultsReveal";
import { LimitationFrame } from "./components/LimitationFrame";
import { ClosingFrame } from "./components/ClosingFrame";
import { TerminalOverlay } from "./components/TerminalOverlay";
import {
  TITLE,
  SCENE_01_PROBLEM,
  SCENE_02_RACE,
  SCENE_03_RESULT,
  SCENE_04_REVOCATION,
  SCENE_05_CRASH,
  ARCHITECTURE,
  RESULTS_REVEAL,
  SCENE_07_LIMITATION,
  SCENE_08_CLOSING,
  OUTRO_HOLD,
  TOTAL_DURATION_IN_FRAMES,
  FPS,
} from "./timeline";

function narrationSrc(sceneId: string): string {
  return staticFile(`audio/narration/${sceneId}.wav`);
}

// Every range where a narration Audio track is actually playing (mirrors the <Audio>
// placements below exactly) -- the music track ducks under these and comes back up
// in the gaps (title, transitions, outro), per the "music ducks beneath speech" spec.
const NARRATION_RANGES: { from: number; to: number }[] = [
  SCENE_01_PROBLEM,
  SCENE_02_RACE,
  SCENE_03_RESULT,
  SCENE_04_REVOCATION,
  SCENE_05_CRASH,
  { from: ARCHITECTURE.from, durationInFrames: ARCHITECTURE.durationInFrames + RESULTS_REVEAL.durationInFrames },
  SCENE_07_LIMITATION,
  SCENE_08_CLOSING,
].map((b) => ({ from: b.from, to: b.from + b.durationInFrames }));

const DUCK_FADE_FRAMES = 20;
const DUCKED_VOLUME = 0.16;
const OPEN_VOLUME = 0.65;

function musicVolumeAtFrame(frame: number): number {
  let target = OPEN_VOLUME;
  for (const range of NARRATION_RANGES) {
    if (frame >= range.from - DUCK_FADE_FRAMES && frame < range.from) {
      const t = (frame - (range.from - DUCK_FADE_FRAMES)) / DUCK_FADE_FRAMES;
      target = Math.min(target, OPEN_VOLUME + (DUCKED_VOLUME - OPEN_VOLUME) * t);
    } else if (frame >= range.from && frame < range.to - DUCK_FADE_FRAMES) {
      target = Math.min(target, DUCKED_VOLUME);
    } else if (frame >= range.to - DUCK_FADE_FRAMES && frame < range.to) {
      const t = (frame - (range.to - DUCK_FADE_FRAMES)) / DUCK_FADE_FRAMES;
      target = Math.min(target, DUCKED_VOLUME + (OPEN_VOLUME - DUCKED_VOLUME) * t);
    }
  }
  return target;
}

const workerLogLines = (eventsJson as { kind: string; label: string }[])
  .filter((e) => e.kind === "worker-log" || (e.kind === "action" && /SIGKILL|restart/.test(e.label)))
  .map((e) => e.label);

export const ContactSafeDemo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: colors.ink }}>
      <Audio src={staticFile("audio/music/bed.wav")} volume={musicVolumeAtFrame} />

      <Sequence from={TITLE.from} durationInFrames={TITLE.durationInFrames}>
        <TitleReveal />
      </Sequence>

      <Sequence from={SCENE_01_PROBLEM.from} durationInFrames={SCENE_01_PROBLEM.durationInFrames}>
        <ProblemHook />
        <Audio src={narrationSrc("scene-01-problem")} startFrom={0} />
      </Sequence>

      <Sequence from={SCENE_02_RACE.from} durationInFrames={SCENE_02_RACE.durationInFrames}>
        <ScreenCapture
          src={staticFile("screenshots/01-recall-citations.png")}
          durationInFrames={SCENE_02_RACE.durationInFrames}
          panFrom={{ x: 0, y: 0, scale: 1.0 }}
          panTo={{ x: -10, y: -4, scale: 1.03 }}
        />
        <Callout x={300} y={70} width={880} height={490} label="operator triggers the race" color={colors.fencing} inAt={20} />
        <LowerThird label="Bedrock" detail="fixture-mode planner, deterministic" mode="fixture" inAt={40} />
        <Audio src={narrationSrc("scene-02-race")} />
      </Sequence>

      <Sequence from={SCENE_03_RESULT.from} durationInFrames={SCENE_03_RESULT.durationInFrames}>
        <ScreenCapture
          src={staticFile("screenshots/02-transaction-result.png")}
          durationInFrames={SCENE_03_RESULT.durationInFrames}
          panFrom={{ x: 0, y: 0, scale: 1.0 }}
          panTo={{ x: 8, y: 0, scale: 1.03 }}
        />
        <Callout x={1044} y={195} width={240} height={110} label="fencing token" color={colors.fencing} inAt={15} />
        <Callout x={300} y={90} width={620} height={430} label="1 outbox row · 1 authorized" color={colors.allow} inAt={35} labelPosition="bottom" />
        <Audio src={narrationSrc("scene-03-transaction-result")} />
      </Sequence>

      <Sequence from={SCENE_04_REVOCATION.from} durationInFrames={SCENE_04_REVOCATION.durationInFrames}>
        <ScreenCapture
          src={staticFile("screenshots/04-delivery-canceled.png")}
          durationInFrames={SCENE_04_REVOCATION.durationInFrames}
          panFrom={{ x: 0, y: 0, scale: 1.0 }}
          panTo={{ x: -6, y: 4, scale: 1.03 }}
        />
        <Callout x={1044} y={125} width={240} height={40} label="consent: revoked" color={colors.block} inAt={10} />
        <Callout x={293} y={385} width={700} height={130} label="canceled_policy -- nothing sent" color={colors.block} inAt={40} labelPosition="bottom" />
        <Audio src={narrationSrc("scene-04-revocation")} />
      </Sequence>

      <Sequence from={SCENE_05_CRASH.from} durationInFrames={SCENE_05_CRASH.durationInFrames}>
        <ScreenCapture
          src={staticFile("capture/product-raw.webm")}
          kind="video"
          durationInFrames={SCENE_05_CRASH.durationInFrames}
          panFrom={{ x: 0, y: 0, scale: 1.0 }}
          panTo={{ x: 0, y: 0, scale: 1.03 }}
        />
        <TerminalOverlay lines={workerLogLines} inAt={20} linesPerSecondFrames={14} />
        <Audio src={narrationSrc("scene-05-crash-recovery")} />
      </Sequence>

      <Sequence from={ARCHITECTURE.from} durationInFrames={ARCHITECTURE.durationInFrames + RESULTS_REVEAL.durationInFrames}>
        <Audio src={narrationSrc("scene-06-evaluation")} />
      </Sequence>
      <Sequence from={ARCHITECTURE.from} durationInFrames={ARCHITECTURE.durationInFrames}>
        <ArchitectureAnimation />
      </Sequence>
      <Sequence from={RESULTS_REVEAL.from} durationInFrames={RESULTS_REVEAL.durationInFrames}>
        <ResultsReveal />
      </Sequence>

      <Sequence from={SCENE_07_LIMITATION.from} durationInFrames={SCENE_07_LIMITATION.durationInFrames}>
        <LimitationFrame />
        <Audio src={narrationSrc("scene-07-limitation")} />
      </Sequence>

      <Sequence from={SCENE_08_CLOSING.from} durationInFrames={SCENE_08_CLOSING.durationInFrames}>
        <ClosingFrame />
        <Audio src={narrationSrc("scene-08-closing")} />
      </Sequence>

      <Sequence from={OUTRO_HOLD.from} durationInFrames={OUTRO_HOLD.durationInFrames}>
        <ClosingFrame />
      </Sequence>
    </AbsoluteFill>
  );
};

export { TOTAL_DURATION_IN_FRAMES, FPS };
