# herdr-app-config

My [Herdr app](https://herdr.dev) customizations: mods and layouts, in a Vite+ monorepo.

## Add one to your Herdr

Each of these works on its own. Paste its line to the agent in your Herdr app; it reads the
mod first, tells you what it runs, then adds it.

| Mod                                          | What it does                                                          | Tell your agent                                                                                                           |
| -------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [Spaces with avatars](./apps/spaces-avatars) | Replaces the Spaces list: GitHub owner avatars and git counts         | `Read ~/.config/herdr-app/AGENTS.md, then add this mod: herdr.dev/mods/jd-solanki/herdr-app-config--apps--spaces-avatars` |
| [Agent triage](./apps/agent-triage)          | Replaces the Agents list: what needs you first, in sections that fold | `Read ~/.config/herdr-app/AGENTS.md, then add this mod: herdr.dev/mods/jd-solanki/herdr-app-config--apps--agent-triage`   |

They pair: with both, Agent triage shows each space's avatar and repo name.

## Not published yet

| Mod or layout                                 | What it does                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------ |
| [`github`](./src/mods/github/README.md)       | A GitHub tab per space: issues and PRs, read in the app                        |
| `handed-back`                                 | Side panel: every open issue and PR labelled `agent:handed-back`, in all repos |
| [`tab-title`](./src/mods/tab-title/README.md) | A tab named `#123` takes that issue's or PR's title                            |
| `workspace-tabs`                              | Herdr's `tabs` mod plus the GitHub and Handed back buttons                     |
| `src/layouts/workspace.json`                  | Herdr's `main` layout wired to all of the above                                |

## Install my whole setup

Needs the Herdr app, `pnpm` and `bun` (both come with [Vite+](https://viteplus.dev)), and
`gh` logged in. [dotfiles](https://github.com/jd-solanki/dotfiles) runs all of this in
`make setup`.

```bash
pnpm install
pnpm run setup
```

`setup` builds the `src/` mods into `dist/` and runs `scripts/install.sh`, which copies every
mod, the layouts and `bin/mermaid-svg` into place and binds `ctrl-shift-g` to the GitHub tab.
Open the Herdr app once before it, so `keys.json` exists. Then press `ctrl-shift-l`
(`cmd-shift-l` on the Mac) until the `workspace` layout shows.

## Change it

```bash
pnpm dev
```

Copies every save into `~/.config/herdr-app`, which Herdr reloads live.

- `apps/<name>/` is one gallery item, published exactly as it is in git: its `mods/`, a
  `RECIPE.md` (the brief another agent can rebuild it from), `preview.png`, `LICENSE` and
  `NOTICE`. Plain JS, type-checked against `types/` by `vp check` (`checkJs`, JSDoc where
  inference stops). There's no build: Herdr runs these files.
- `packages/<name>/` will hold code several apps share.
- `src/` holds the mods not published yet. They still build with `vp pack` until they move
  to `apps/`.

`types/` is Herdr's generated API. After a Herdr update, run `pnpm run types` to refresh it.

`herdr-app check <mod folder>` loads a mod once and reports errors. It runs with no props, so
open the mod in the app to test it for real.

## Publish an app

The gallery lists every folder with a `RECIPE.md` in a public repo with the `herdr-mod` or
`herdr-layout` topic, within an hour of a push to `main`. This repo has `herdr-mod`; add
`herdr-layout` with the first layout app. A mod's page is
`herdr.dev/mods/jd-solanki/herdr-app-config--apps--<name>`.

For `preview.png`, zoom in (`herdr-app do app.zoom_in`), `herdr-app shot`, zoom back
(`app.zoom_reset`), and crop the mod's part onto a 16:10 canvas in its background color:
the gallery card is 960×600. Then add the app to the table above.
