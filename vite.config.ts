import { readdirSync } from "node:fs";
import { defineConfig } from "vite-plus";

const mods = readdirSync("src/mods");
const VENDORED = ["types/**", ".agents/**", ".claude/**", "skills-lock.json"];

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  // src/ mods only (apps/ ship unbuilt). A mod can't import outside its own folder, so code
  // shared across src/ is inlined into each mod's build, never split into chunks.
  pack: mods.map((name) => ({
    entry: { main: `src/mods/${name}/main.js` },
    outDir: `dist/mods/${name}`,
    copy: [`src/mods/${name}/mod.json`],
    platform: "neutral",
    fixedExtension: false,
    // Herdr supplies every bare import (gpui-kit, gpui-base, herdr, fs/promises, crypto) at run time.
    deps: { neverBundle: [/^[^./]/] },
  })),
  // types/ is Herdr's generated API, refreshed by `pnpm run types`. The skills CLI owns the
  // installed skills: a reformat breaks their skills-lock.json hashes.
  lint: {
    ignorePatterns: VENDORED,
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    ignorePatterns: VENDORED,
  },
});
