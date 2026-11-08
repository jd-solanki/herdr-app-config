import { readdirSync } from "node:fs";
import { defineConfig } from "vite-plus";

const mods = readdirSync("src/mods");
const apps = readdirSync("apps");
// The built apps are generated; an app's source lives in its src/.
const GENERATED = ["apps/*/mods/*/main.js"];
// types/ is Herdr's generated API, refreshed by `pnpm run types`. The skills CLI owns the
// installed skills: a reformat breaks their skills-lock.json hashes.
const VENDORED = ["types/**", ".agents/**", ".claude/**", "skills-lock.json", ...GENERATED];

// A mod can't import outside its own folder, so shared code (this repo's packages/) is inlined
// into each mod's build, never split into chunks. Herdr supplies every other bare import
// (gpui-kit, gpui-base, herdr, fs/promises, crypto) at run time.
const MOD_BUILD = {
  platform: "neutral" as const,
  fixedExtension: false,
  deps: { neverBundle: [/^(?!@herdr-app-config\/)[^./]/] },
};

export default defineConfig({
  staged: {
    "*": "vp check --fix",
    "{apps/*/src/**,packages/**}": "sh scripts/check-built.sh",
  },
  pack: [
    ...mods.map((name) => ({
      ...MOD_BUILD,
      entry: { main: `src/mods/${name}/main.js` },
      outDir: `dist/mods/${name}`,
      copy: [`src/mods/${name}/mod.json`],
    })),
    // The gallery publishes an app's mods/ folder from git, so its build is committed there,
    // beside the files it ships as they are (mod.json, icons); clean would delete those.
    ...apps.map((name) => ({
      ...MOD_BUILD,
      entry: { main: `apps/${name}/src/main.ts` },
      outDir: `apps/${name}/mods/${name}`,
      clean: false,
    })),
  ],
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
