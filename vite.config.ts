import { defineConfig } from "vite-plus";

// An app's mods/ JavaScript is built from its src/ by scripts/build-apps.mjs; `herdr-app check`
// writes jsconfig.json and Herdr's .d.ts files into every mod folder it checks.
const GENERATED = ["apps/*/mods/**/*.js", "apps/*/mods/**/jsconfig.json", "apps/*/mods/**/*.d.ts"];
// types/ is Herdr's generated API, refreshed by `pnpm run types`. The skills CLI owns the
// installed skills: a reformat breaks their skills-lock.json hashes.
const VENDORED = ["types/**", ".agents/**", ".claude/**", "skills-lock.json", ...GENERATED];

export default defineConfig({
  staged: {
    "*": "vp check --fix",
    "{apps/*/src/**,packages/**}": "sh scripts/check-built.sh",
  },
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
