import { useCurrentFrame, interpolate } from "remotion";
import { colors, fonts } from "../tokens";

interface TerminalOverlayProps {
  lines: string[];
  inAt?: number;
  linesPerSecondFrames?: number;
}

/** Renders real captured process log lines (see demo/capture/events.json) as an
 * on-screen terminal callout -- actual evidence, not a mocked-up log. */
export const TerminalOverlay: React.FC<TerminalOverlayProps> = ({ lines, inAt = 0, linesPerSecondFrames = 10 }) => {
  const frame = useCurrentFrame();
  const containerOpacity = interpolate(frame, [inAt, inAt + 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        right: 64,
        top: 64,
        width: 620,
        opacity: containerOpacity,
        backgroundColor: "rgba(19, 21, 26, 0.94)",
        border: `1px solid ${colors.wire}`,
        borderRadius: 8,
        padding: "16px 20px",
        boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
      }}
    >
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {[colors.block, colors.fencing, colors.allow].map((c) => (
          <div key={c} style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: c }} />
        ))}
      </div>
      {lines.map((line, i) => {
        const lineInAt = inAt + i * linesPerSecondFrames;
        const opacity = interpolate(frame, [lineInAt, lineInAt + 6], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const isKill = line.includes("SIGKILL");
        const isRestart = line.includes("restart");
        return (
          <div
            key={i}
            style={{
              opacity,
              fontFamily: fonts.display,
              fontSize: 15,
              lineHeight: 1.7,
              color: isKill ? colors.block : isRestart ? colors.fencing : colors.textSecondary,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            $ {line}
          </div>
        );
      })}
    </div>
  );
};
