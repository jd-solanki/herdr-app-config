# herdr-app-config

My [Herdr app](https://herdr.dev) customizations: mods and layouts, built with Vite+ and
copied into `~/.config/herdr-app`.

| Mod or layout                                           | What it does                                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [`github`](./src/mods/github/README.md)                 | A GitHub tab per space: issues and PRs, read in the app                        |
| `handed-back`                                           | Side panel: every open issue and PR labelled `agent:handed-back`, in all repos |
| [`spaces-avatars`](./src/mods/spaces-avatars/README.md) | Spaces sidebar with owner avatars, git counts and tab rows                     |
| `agents-accordion`                                      | Agents sidebar in priority sections that fold                                  |
| [`tab-title`](./src/mods/tab-title/README.md)           | A tab named `#123` takes that issue's or PR's title                            |
| `workspace-tabs`                                        | Herdr's `tabs` mod plus the GitHub and Handed back buttons                     |
| `src/layouts/workspace.json`                            | Herdr's `main` layout wired to the mods above                                  |

## Install

Needs the Herdr app, `pnpm` and `bun` (both come with [Vite+](https://viteplus.dev)), and
`gh` logged in. [dotfiles](https://github.com/jd-solanki/dotfiles) runs all of this in
`make setup`.

```bash
pnpm install
pnpm run setup
```

`setup` builds every mod into `dist/` and runs `scripts/install.sh`, which copies the mods,
the layouts and `bin/mermaid-svg` into place and binds `ctrl-shift-g` to the GitHub tab.
Open the Herdr app once before it, so `keys.json` exists. Then press `ctrl-shift-l`
(`cmd-shift-l` on the Mac) until the `workspace` layout shows.

## Change it

```bash
pnpm dev
```

Rebuilds on save and copies the result into `~/.config/herdr-app`, which Herdr reloads live.
Each mod builds to one `main.js`, so code in a shared file is inlined into every mod that
imports it. Herdr supplies every bare import (`herdr`, `gpui-kit`, `gpui-base`, `fs/promises`)
at run time.

`types/` is Herdr's generated API. After a Herdr update, run `pnpm run types` to refresh it.

`herdr-app check ~/.config/herdr-app/mods/<name>` loads a mod once and reports errors. It runs
with no props, so open the mod in the app to test it for real.
