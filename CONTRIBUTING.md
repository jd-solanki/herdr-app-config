# Contributing

## What this is

jd-solanki's mods and layouts for the [Herdr app](https://herdr.dev). Apps are published to
Herdr's gallery for anyone to add; source mods are part of the owner's own setup, installed
from this repo.

## Status

- Apps under `apps/` are published; the table in `README.md` lists them.
- Source mods under `src/` and the `workspace` layout were built for the owner's setup, not
  for publication, and may depend on each other. Each moves to `apps/` once it is made
  publishable; then `src/` goes.
- `packages/` is reserved for code apps may share. Whether and how apps use it is undecided.

## Conventions

Every rule about the code lives in `/project-context`. Invoke it.

## How to contribute

- Commands: see the `scripts` block in `package.json`.
- Commits: Conventional Commits, scoped by mod or script (`fix(install): …`).
- Pull requests: `pnpm run check` passes, and an app changed in behaviour is tested in the
  Herdr app.
