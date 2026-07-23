import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { colors, fonts } from "../tokens";

export const ClosingFrame: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ruleWidth = interpolate(frame, [6, 24], [0, 200], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.ink,
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
      }}
    >
      <div style={{ fontFamily: fonts.body, fontSize: 30, color: colors.textPrimary, opacity, textAlign: "center" }}>
        Shared memory made two agents safe to run together.
      </div>
      <div style={{ width: ruleWidth, height: 2, backgroundColor: colors.fencing, margin: "26px 0" }} />
      <div style={{ fontFamily: fonts.display, fontSize: 44, fontWeight: 500, color: colors.textPrimary, opacity }}>
        CONTACTSAFE
      </div>
    </AbsoluteFill>
  );
};
