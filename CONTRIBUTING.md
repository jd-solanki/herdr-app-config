# Contributing

## What this is

jd-solanki's mods and layouts for the [Herdr app](https://herdr.dev). Apps are published to
Herdr's gallery for anyone to add; source mods are part of the owner's own setup, installed
from this repo.

## Status

- Apps under `apps/` are published; the table in `README.md` lists them.
- The `workspace` layout under `src/layouts/` wires the apps into the owner's setup and is not
  published.
- `packages/` holds code apps share; each app's build copies what it imports into its mod
  folder.

## Conventions

Every rule about the code lives in `/project-context`. Invoke it.

## How to contribute

- Commands: see the `scripts` block in `package.json`.
- Commits: Conventional Commits, scoped by mod or script (`fix(install): …`).
- Pull requests: `pnpm run check` passes, and an app changed in behaviour is tested in the
  Herdr app.
