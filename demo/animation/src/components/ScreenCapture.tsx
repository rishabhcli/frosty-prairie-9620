import { AbsoluteFill, Img, Video, useCurrentFrame, interpolate } from "remotion";
import { colors } from "../tokens";

interface ScreenCaptureProps {
  src: string;
  kind?: "image" | "video";
  /** Subtle Ken-Burns pan/zoom over the duration of this Sequence -- restrained, not a swoop. */
  panFrom?: { x: number; y: number; scale: number };
  panTo?: { x: number; y: number; scale: number };
  durationInFrames: number;
  videoStartFrom?: number;
}

export const ScreenCapture: React.FC<ScreenCaptureProps> = ({
  src,
  kind = "image",
  panFrom = { x: 0, y: 0, scale: 1.0 },
  panTo = { x: 0, y: 0, scale: 1.03 },
  durationInFrames,
  videoStartFrom,
}) => {
  const frame = useCurrentFrame();
  const x = interpolate(frame, [0, durationInFrames], [panFrom.x, panTo.x]);
  const y = interpolate(frame, [0, durationInFrames], [panFrom.y, panTo.y]);
  const scale = interpolate(frame, [0, durationInFrames], [panFrom.scale, panTo.scale]);

  return (
    <AbsoluteFill style={{ backgroundColor: colors.ink, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `translate(${x}px, ${y}px) scale(${scale})`,
          transformOrigin: "center center",
        }}
      >
        {kind === "video" ? (
          <Video src={src} startFrom={videoStartFrom} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <Img src={src} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        )}
      </div>
      {/* Vignette so lower-thirds / callouts stay legible over busy screen content. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to top, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 22%)",
        }}
      />
    </AbsoluteFill>
  );
};
