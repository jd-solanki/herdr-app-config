// `pnpm dev` reruns this on every save under apps/ and packages/: build, then install, so Herdr
// reloads. The build writes only what changed, so its own writes settle after one rerun.
import { execFileSync } from "node:child_process";

execFileSync("node", ["scripts/build-apps.mjs"], { stdio: "inherit" });
execFileSync("sh", ["scripts/install.sh"], { stdio: "inherit" });
