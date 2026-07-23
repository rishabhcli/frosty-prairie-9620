import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { colors, fonts } from "../tokens";
import raceReport from "../../../../eval/reports/race.json";
import faultsReport from "../../../../eval/reports/faults.json";
import memoryReport from "../../../../eval/reports/memory.json";

interface Stat {
  value: string;
  label: string;
  inAt: number;
}

const faultsPassed = faultsReport.scenarios.filter((s) => s.recovered).length;

const STATS: Stat[] = [
  { value: `${raceReport.totalAttempts.toLocaleString()} → ${raceReport.approvedActions}`, label: "concurrent/retried attempts → approved actions", inAt: 0 },
  { value: `${raceReport.duplicateApprovedActions}`, label: "duplicate approved actions", inAt: 10 },
  { value: `${faultsPassed}/${faultsReport.scenarios.length}`, label: "fault-injection scenarios recovered", inAt: 20 },
  { value: `${Math.round(memoryReport.citedFactValidityRate * 100)}%`, label: "cited-fact validity", inAt: 30 },
];

export const ResultsReveal: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ backgroundColor: colors.ink, justifyContent: "center", padding: "0 120px" }}>
      <div style={{ fontFamily: fonts.display, fontSize: 20, color: colors.textSecondary, marginBottom: 40 }}>
        MEASURED, NOT ASSERTED
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
        {STATS.map((s) => {
          const opacity = interpolate(frame, [s.inAt, s.inAt + 10], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const x = interpolate(frame, [s.inAt, s.inAt + 10], [-16, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div key={s.label} style={{ opacity, transform: `translateX(${x}px)`, display: "flex", alignItems: "baseline", gap: 24 }}>
              <div style={{ fontFamily: fonts.display, fontSize: 56, fontWeight: 500, color: colors.allow, minWidth: 260 }}>
                {s.value}
              </div>
              <div style={{ fontFamily: fonts.body, fontSize: 22, color: colors.textPrimary }}>{s.label}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
