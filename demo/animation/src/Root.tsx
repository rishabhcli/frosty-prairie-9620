import { Composition } from "remotion";
import { ContactSafeDemo, TOTAL_DURATION_IN_FRAMES, FPS } from "./ContactSafeDemo";
import { Thumbnail } from "./Thumbnail";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="ContactSafeDemo"
        component={ContactSafeDemo}
        durationInFrames={TOTAL_DURATION_IN_FRAMES}
        fps={FPS}
        width={1920}
        height={1080}
      />
      <Composition id="Thumbnail" component={Thumbnail} durationInFrames={1} fps={FPS} width={1920} height={1080} />
    </>
  );
};
