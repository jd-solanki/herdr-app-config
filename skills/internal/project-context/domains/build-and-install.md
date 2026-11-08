# Build and install

confidence: provisional — source mods empty into `apps/` as each is published, then `src/`
goes; whether `packages/` code reaches apps, and how, is undecided.

## Rules

- `types/` is Herdr's generated API. Refresh it with the `types` script after a Herdr
  update; never edit it by hand.

## Reasons

- Apps ship unbuilt, so installing an app is its build; only source mods pass through a
  bundler into `dist/`.

## Fences

- **A mod is self-contained.** A mod can't import outside its own folder, so code shared
  across source mods is inlined into each build, never split into chunks. Herdr supplies
  every bare import at run time, so none is bundled. `vite.config.ts:pack`
- **Apps install last.** A stale `dist/` build of a mod that moved to `apps/` would
  otherwise overwrite the app. `scripts/install.sh`
- **Install copies file by file.** Replacing a mod's folder would delete what the mod
  writes into its installed folder, such as spaces-avatars' avatar cache.
  `scripts/install.sh:place`
- **Remove before copy.** `cp` writes through a symlink, and an old stow link points back
  into a repo. `scripts/install.sh:place`

## Where it lives

`scripts/install.sh`, `scripts/install-on-save.mjs`, `vite.config.ts`, `tsconfig.json`,
`pnpm-workspace.yaml`, `types/`, `src/`
