import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { colors, fonts } from "../tokens";

export const LimitationFrame: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.ink,
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        padding: "0 200px",
      }}
    >
      <div
        style={{
          fontFamily: fonts.display,
          fontSize: 16,
          letterSpacing: "0.1em",
          color: colors.fencing,
          marginBottom: 24,
          opacity,
        }}
      >
        HONEST LIMIT
      </div>
      <div
        style={{
          fontFamily: fonts.body,
          fontSize: 34,
          lineHeight: 1.5,
          color: colors.textPrimary,
          textAlign: "center",
          opacity,
        }}
      >
        This demo sends through a sandbox provider, not a live inbox.
        <br />
        ContactSafe enforces the policy you configure — it isn't a compliance review on its own.
      </div>
    </AbsoluteFill>
  );
};
