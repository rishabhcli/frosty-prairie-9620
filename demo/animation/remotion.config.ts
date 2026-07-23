import { Config } from "@remotion/cli/config";
import path from "node:path";

Config.setVideoImageFormat("png");
Config.setOverwriteOutput(true);
Config.setCodec("h264");
Config.setPixelFormat("yuv420p");
// Screenshots/capture/audio all live one level up (demo/), not in this sub-package,
// so they're shared with the capture and narration/music scripts instead of duplicated.
// `__dirname` inside this config file resolves to @remotion/cli's own package
// directory (its config loader does not preserve the config file's real location),
// so we anchor on process.cwd() instead -- reliable since every render/preview
// command in this project is invoked from demo/animation/ (see package.json scripts).
Config.setPublicDir(path.join(process.cwd(), ".."));
