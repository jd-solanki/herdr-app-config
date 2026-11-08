// `pnpm dev` reruns this on every save under apps/: apps ship as they are, so installing is their build.
import { execFileSync } from "node:child_process";

execFileSync("sh", ["scripts/install.sh"], { stdio: "inherit" });
