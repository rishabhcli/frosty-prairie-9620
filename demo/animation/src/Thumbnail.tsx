import { AbsoluteFill, Img, staticFile } from "remotion";
import { colors, fonts } from "./tokens";

// Judge-facing thumbnail: the real product screenshot and the measured outcome lead,
// the wordmark is a small corner tag -- not the other way around.
export const Thumbnail: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: colors.ink }}>
      <div style={{ position: "absolute", inset: 0, opacity: 0.55 }}>
        <Img
          src={staticFile("screenshots/08-live-aws.png")}
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(100deg, rgba(20,23,28,0.97) 0%, rgba(20,23,28,0.75) 42%, rgba(20,23,28,0.25) 75%)",
        }}
      />
      <div style={{ position: "absolute", left: 90, top: 130, maxWidth: 980 }}>
        <div style={{ fontFamily: fonts.display, fontSize: 22, color: colors.fencing, letterSpacing: "0.06em", marginBottom: 18 }}>
          CONTACTSAFE
        </div>
        <div style={{ fontFamily: fonts.body, fontWeight: 700, fontSize: 74, lineHeight: 1.08, color: colors.textPrimary }}>
          1,000 attempts.
          <br />
          <span style={{ color: colors.allow }}>One</span> safe action.
        </div>
        <div style={{ fontFamily: fonts.display, fontSize: 24, color: colors.textSecondary, marginTop: 28 }}>
          CockroachDB Cloud + AWS Lambda · 0 duplicates · 0 consent violations
        </div>
      </div>
    </AbsoluteFill>
  );
};
