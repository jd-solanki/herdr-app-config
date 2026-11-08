# Build and install

confidence: provisional — source mods empty into `apps/` as each is published, then `src/`
goes.

## Rules

- Code two mods share lives in `packages/<name>/` as a workspace package; each mod's build
  inlines it.
- `types/` is Herdr's generated API. Refresh it with the `types` script after a Herdr
  update; never edit it by hand.

## Reasons

- Apps build in place, into the `mods/` folder the gallery publishes; source mods build into
  `dist/`, which install copies.

## Fences

- **A mod is self-contained.** Herdr refuses an import that resolves outside the mod's own
  folder, so `packages/` code is inlined into each build, never split into chunks. Herdr
  supplies every other bare import at run time, so only `@herdr-app-config/*` is bundled.
  `vite.config.ts:MOD_BUILD`
- **Apps install last.** A stale `dist/` build of a mod that moved to `apps/` would
  otherwise overwrite the app. `scripts/install.sh`
- **Install copies file by file.** Replacing a mod's folder would delete what the mod
  writes into its installed folder, such as spaces-avatars' avatar cache.
  `scripts/install.sh:place`
- **Remove before copy.** `cp` writes through a symlink, and an old stow link points back
  into a repo. `scripts/install.sh:place`

## Where it lives

`scripts/install.sh`, `scripts/install-on-save.mjs`, `scripts/check-built.sh`, `vite.config.ts`, `tsconfig.json`,
`pnpm-workspace.yaml`, `types/`, `src/`, `packages/`
