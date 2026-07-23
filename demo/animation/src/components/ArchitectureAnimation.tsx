import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { colors, fonts } from "../tokens";

interface Node {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  sub: string;
  accent: string;
  inAt: number;
}

interface Edge {
  from: string;
  to: string;
  label: string;
  inAt: number;
}

// Real components of this build, not generic "service" boxes.
const NODES: Node[] = [
  { id: "console", x: 60, y: 90, w: 260, h: 90, label: "Console", sub: "apps/console", accent: colors.textSecondary, inAt: 0 },
  { id: "api", x: 60, y: 430, w: 260, h: 90, label: "API", sub: "services/api", accent: colors.textSecondary, inAt: 6 },
  { id: "agent", x: 400, y: 260, w: 300, h: 100, label: "Agent Worker", sub: "recall -> plan -> policy -> tx", accent: colors.fencing, inAt: 12 },
  { id: "crdb", x: 820, y: 240, w: 340, h: 140, label: "CockroachDB", sub: "consent · promises · leases · vector", accent: colors.allow, inAt: 18 },
  { id: "bedrock", x: 400, y: 60, w: 300, h: 80, label: "Bedrock", sub: "plan/draft only -- no send authority", accent: colors.review, inAt: 26 },
  { id: "outbox", x: 400, y: 460, w: 300, h: 100, label: "Outbox Worker", sub: "sandbox send, idempotent", accent: colors.fencing, inAt: 34 },
  { id: "sandbox", x: 820, y: 480, w: 300, h: 80, label: "Sandbox Provider", sub: "no real recipients", accent: colors.block, inAt: 42 },
];

const EDGES: Edge[] = [
  { from: "console", to: "api", label: "", inAt: 4 },
  { from: "api", to: "agent", label: "task", inAt: 14 },
  { from: "agent", to: "crdb", label: "recall + authorize", inAt: 20 },
  { from: "agent", to: "bedrock", label: "plan", inAt: 28 },
  { from: "crdb", to: "outbox", label: "outbox row", inAt: 36 },
  { from: "outbox", to: "sandbox", label: "send", inAt: 44 },
];

function center(n: Node) {
  return { x: n.x + n.w / 2, y: n.y + n.h / 2 };
}

export const ArchitectureAnimation: React.FC = () => {
  const frame = useCurrentFrame();
  const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));

  return (
    <AbsoluteFill style={{ backgroundColor: colors.ink }}>
      <div
        style={{
          position: "absolute",
          top: 24,
          left: 60,
          fontFamily: fonts.display,
          fontSize: 22,
          color: colors.textSecondary,
          letterSpacing: "0.04em",
        }}
      >
        WHAT ACTUALLY RUNS
      </div>
      <svg width={1920 * 0.62} height={1080 * 0.62} style={{ position: "absolute", left: 40, top: 60 }}>
        {EDGES.map((e) => {
          const a = center(byId[e.from]!);
          const b = center(byId[e.to]!);
          const progress = interpolate(frame, [e.inAt, e.inAt + 10], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const midX = a.x + (b.x - a.x) * progress;
          const midY = a.y + (b.y - a.y) * progress;
          return (
            <g key={`${e.from}-${e.to}`}>
              <line x1={a.x} y1={a.y} x2={midX} y2={midY} stroke={colors.wire} strokeWidth={2} />
              {progress > 0.6 && e.label && (
                <text
                  x={(a.x + b.x) / 2}
                  y={(a.y + b.y) / 2 - 8}
                  fill={colors.textTertiary}
                  fontFamily={fonts.display}
                  fontSize={13}
                  textAnchor="middle"
                >
                  {e.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {NODES.map((n) => {
        const opacity = interpolate(frame, [n.inAt, n.inAt + 8], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const scale = interpolate(frame, [n.inAt, n.inAt + 8], [0.92, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <div
            key={n.id}
            style={{
              position: "absolute",
              left: n.x,
              top: n.y,
              width: n.w,
              height: n.h,
              opacity,
              transform: `scale(${scale})`,
              backgroundColor: colors.panel,
              border: `1.5px solid ${n.accent}`,
              borderRadius: 8,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              padding: "0 20px",
            }}
          >
            <div style={{ fontFamily: fonts.body, fontSize: 20, fontWeight: 600, color: colors.textPrimary }}>
              {n.label}
            </div>
            <div style={{ fontFamily: fonts.display, fontSize: 13, color: colors.textSecondary, marginTop: 4 }}>
              {n.sub}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
