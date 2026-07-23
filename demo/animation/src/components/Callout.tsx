import { useCurrentFrame, interpolate } from "remotion";
import { colors, fonts } from "../tokens";

interface CalloutProps {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  color?: string;
  inAt?: number;
  labelPosition?: "top" | "bottom";
}

export const Callout: React.FC<CalloutProps> = ({
  x,
  y,
  width,
  height,
  label,
  color = colors.fencing,
  inAt = 0,
  labelPosition = "top",
}) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [inAt, inAt + 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const labelOpacity = interpolate(frame, [inAt + 8, inAt + 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", left: x, top: y, width, height }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          border: `2px solid ${color}`,
          borderRadius: 8,
          boxShadow: `0 0 0 4px ${color}22`,
          clipPath: `inset(0 ${100 - progress * 100}% 0 0)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          [labelPosition === "top" ? "bottom" : "top"]: "100%",
          marginBottom: labelPosition === "top" ? 10 : undefined,
          marginTop: labelPosition === "bottom" ? 10 : undefined,
          opacity: labelOpacity,
          backgroundColor: color,
          color: colors.ink,
          fontFamily: fonts.display,
          fontSize: 15,
          fontWeight: 500,
          padding: "5px 10px",
          borderRadius: 4,
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </div>
    </div>
  );
};
