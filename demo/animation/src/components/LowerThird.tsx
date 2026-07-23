import { useCurrentFrame, interpolate } from "remotion";
import { colors, fonts } from "../tokens";

interface LowerThirdProps {
  label: string;
  detail: string;
  mode: "fixture" | "live";
  /** Frame (relative to this component's Sequence) at which the label appears. */
  inAt?: number;
}

export const LowerThird: React.FC<LowerThirdProps> = ({ label, detail, mode, inAt = 0 }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [inAt, inAt + 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const x = interpolate(frame, [inAt, inAt + 12], [-24, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        left: 64,
        bottom: 64,
        opacity,
        transform: `translateX(${x}px)`,
        display: "flex",
        alignItems: "center",
        gap: 12,
        backgroundColor: "rgba(27, 31, 38, 0.92)",
        border: `1px solid ${colors.wire}`,
        borderRadius: 6,
        padding: "12px 18px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
      }}
    >
      <span
        style={{
          fontFamily: fonts.display,
          fontSize: 12,
          fontWeight: 500,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          padding: "3px 8px",
          borderRadius: 4,
          color: mode === "live" ? colors.allow : colors.fencing,
          backgroundColor: mode === "live" ? colors.allowDim : colors.fencingDim,
        }}
      >
        {mode === "live" ? "live" : "fixture mode"}
      </span>
      <div>
        <div style={{ fontFamily: fonts.body, fontSize: 16, fontWeight: 600, color: colors.textPrimary }}>
          {label}
        </div>
        <div style={{ fontFamily: fonts.display, fontSize: 13, color: colors.textSecondary }}>{detail}</div>
      </div>
    </div>
  );
};
