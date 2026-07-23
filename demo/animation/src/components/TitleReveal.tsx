import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { colors, fonts } from "../tokens";

export const TitleReveal: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const markScale = spring({ frame, fps, config: { damping: 200, stiffness: 120 }, durationInFrames: 20 });
  const tagOpacity = interpolate(frame, [12, 28], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ruleWidth = interpolate(frame, [4, 22], [0, 340], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.ink,
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          width: ruleWidth,
          height: 2,
          backgroundColor: colors.fencing,
          marginBottom: 28,
        }}
      />
      <div
        style={{
          fontFamily: fonts.display,
          fontSize: 96,
          fontWeight: 500,
          letterSpacing: "0.05em",
          color: colors.textPrimary,
          transform: `scale(${markScale})`,
        }}
      >
        CONTACTSAFE
      </div>
      <div
        style={{
          fontFamily: fonts.body,
          fontSize: 28,
          color: colors.textSecondary,
          marginTop: 18,
          opacity: tagOpacity,
        }}
      >
        agentic memory you can put on trial
      </div>
    </AbsoluteFill>
  );
};
