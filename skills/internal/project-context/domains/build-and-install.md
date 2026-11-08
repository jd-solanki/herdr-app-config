# Build and install

confidence: provisional — the type-stripping build is new, and the `workspace` layout is not an
app yet.

## Rules

- Code two apps share lives in `packages/<name>/` as a workspace package; each app's build
  copies what it imports into its mod folder.
- `types/` is Herdr's generated API. Refresh it with the `types` script after a Herdr
  update; never edit it by hand.

## Reasons

- An app builds by stripping types only, file by file, never by bundling or minifying: the
  published code is what an installing agent reads and edits, so it keeps every comment and
  the shape of the source, and a clone diffs line for line against Herdr's original.

## Fences

- **A mod is self-contained.** Herdr refuses an import that resolves outside the mod's own
  folder, so the build copies each `@herdr-app-config/*` package an app imports into the mod
  folder and points the import there. `scripts/build-apps.mjs:strip`
- **Install copies file by file.** Replacing a mod's folder would delete what the mod
  writes into its installed folder, such as spaces-avatars' avatar cache.
  `scripts/install.sh:place`
- **Remove before copy.** `cp` writes through a symlink, and an old stow link points back
  into a repo. `scripts/install.sh:place`

## Where it lives

`scripts/build-apps.mjs`, `scripts/install.sh`, `scripts/install-on-save.mjs`,
`scripts/check-built.sh`, `tsconfig.json`, `pnpm-workspace.yaml`, `types/`, `packages/`
