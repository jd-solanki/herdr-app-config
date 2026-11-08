import { readdirSync } from "node:fs";
import { defineConfig } from "vite-plus";

const mods = readdirSync("src/mods");

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  // One build per mod: Herdr loads one main.js per mod folder, so shared code is inlined, never split into chunks.
  pack: mods.map((name) => ({
    entry: { main: `src/mods/${name}/main.js` },
    outDir: `dist/mods/${name}`,
    copy: [`src/mods/${name}/mod.json`],
    platform: "neutral",
    fixedExtension: false,
    // Herdr supplies every bare import (gpui-kit, gpui-base, herdr, fs/promises, crypto) at run time.
    deps: { neverBundle: [/^[^./]/] },
  })),
  // types/ is Herdr's generated API, refreshed by `pnpm run types`.
  lint: {
    ignorePatterns: ["types/**"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    ignorePatterns: ["types/**"],
  },
});
