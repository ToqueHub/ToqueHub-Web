import "./index.css";
import { Composition, Still } from "remotion";
import { ToqueHubPresentation, Thumbnail } from "./ToqueHubPresentation";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="ToqueHubPresentation90s"
        component={ToqueHubPresentation}
        durationInFrames={2700}
        fps={30}
        width={1920}
        height={1080}
      />
      <Still id="ToqueHubThumbnail" component={Thumbnail} width={1920} height={1080} />
    </>
  );
};
