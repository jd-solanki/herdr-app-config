// `pnpm dev` reruns this on every save under apps/, for the files an app ships as they are (mod.json, icons); `vp pack --watch` installs each rebuild.
import { execFileSync } from "node:child_process";

execFileSync("sh", ["scripts/install.sh"], { stdio: "inherit" });
