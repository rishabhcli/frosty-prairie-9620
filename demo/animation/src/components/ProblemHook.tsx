import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { colors, fonts } from "../tokens";

const AGENT_A_X = 640;
const AGENT_B_X = 1280;
const CONTACT_Y = 620;
const AGENT_Y = 320;

export const ProblemHook: React.FC = () => {
  const frame = useCurrentFrame();

  const lineAOpacity = interpolate(frame, [10, 24], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const lineBOpacity = interpolate(frame, [18, 32], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const collisionPulse = interpolate(frame, [34, 44, 54], [0, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const captionOpacity = interpolate(frame, [40, 55], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: colors.ink }}>
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        <line
          x1={AGENT_A_X}
          y1={AGENT_Y}
          x2={960}
          y2={CONTACT_Y}
          stroke={colors.textTertiary}
          strokeWidth={2}
          strokeDasharray="6 6"
          opacity={lineAOpacity}
        />
        <line
          x1={AGENT_B_X}
          y1={AGENT_Y}
          x2={960}
          y2={CONTACT_Y}
          stroke={colors.textTertiary}
          strokeWidth={2}
          strokeDasharray="6 6"
          opacity={lineBOpacity}
        />
        <circle cx={960} cy={CONTACT_Y} r={14 + collisionPulse * 30} fill={colors.block} opacity={collisionPulse * 0.5} />
      </svg>

      {[
        { x: AGENT_A_X, label: "Agent A", opacity: lineAOpacity },
        { x: AGENT_B_X, label: "Agent B", opacity: lineBOpacity },
      ].map((a) => (
        <div
          key={a.label}
          style={{
            position: "absolute",
            left: a.x - 90,
            top: AGENT_Y - 40,
            width: 180,
            padding: "14px 0",
            textAlign: "center",
            backgroundColor: colors.panel,
            border: `1.5px solid ${colors.wire}`,
            borderRadius: 8,
            opacity: a.opacity,
            fontFamily: fonts.body,
            fontSize: 20,
            fontWeight: 600,
            color: colors.textPrimary,
          }}
        >
          {a.label}
        </div>
      ))}

      <div
        style={{
          position: "absolute",
          left: 960 - 110,
          top: CONTACT_Y - 26,
          width: 220,
          textAlign: "center",
          fontFamily: fonts.display,
          fontSize: 18,
          color: colors.textSecondary,
        }}
      >
        Jordan
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 130,
          width: "100%",
          textAlign: "center",
          opacity: captionOpacity,
          fontFamily: fonts.body,
          fontSize: 30,
          color: colors.textPrimary,
        }}
      >
        Same customer. Same instant. Neither agent knows about the other.
      </div>
    </AbsoluteFill>
  );
};
