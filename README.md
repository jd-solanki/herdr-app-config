# herdr-app-config

My [Herdr app](https://herdr.dev) customizations: mods and layouts, in a Vite+ monorepo.

## Add one to your Herdr

Each of these works on its own. Paste its line to the agent in your Herdr app; it reads the
mod first, tells you what it runs, then adds it.

| Mod                                          | What it does                                                                 | Tell your agent                                                                                                           |
| -------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [Spaces with avatars](./apps/spaces-avatars) | Replaces the Spaces list: GitHub owner avatars and git counts                | `Read ~/.config/herdr-app/AGENTS.md, then add this mod: herdr.dev/mods/jd-solanki/herdr-app-config--apps--spaces-avatars` |
| [Agent triage](./apps/agent-triage)          | Replaces the Agents list: what needs you first, in sections that fold        | `Read ~/.config/herdr-app/AGENTS.md, then add this mod: herdr.dev/mods/jd-solanki/herdr-app-config--apps--agent-triage`   |
| [GitHub inbox](./apps/github-inbox)          | Open issues and PRs from every repo, from one GitHub search                  | `Read ~/.config/herdr-app/AGENTS.md, then add this mod: herdr.dev/mods/jd-solanki/herdr-app-config--apps--github-inbox`   |
| [Tab bar](./apps/tab-bar)                    | Replaces the tab bar: agent titles, `#123` issue titles, other mods' buttons | `Read ~/.config/herdr-app/AGENTS.md, then add this mod: herdr.dev/mods/jd-solanki/herdr-app-config--apps--tab-bar`        |
| [GitHub tab](./apps/github)                  | A GitHub tab per space: issues and PRs, read in the app                      | `Read ~/.config/herdr-app/AGENTS.md, then add this mod: herdr.dev/mods/jd-solanki/herdr-app-config--apps--github`         |

Spaces with avatars and Agent triage pair: with both, Agent triage shows each space's avatar
and repo name. Tab bar pairs with GitHub tab and GitHub inbox, which add their buttons.

## Not published yet

| Mod or layout                                           | What it does                                    |
| ------------------------------------------------------- | ----------------------------------------------- |
| [`src/layouts/workspace.json`](./src/layouts/README.md) | Herdr's `main` layout wired to all of the above |

## Setup

Needs the Herdr app, `pnpm` and `bun` (both come with [Vite+](https://viteplus.dev)), and
`gh` logged in. [dotfiles](https://github.com/jd-solanki/dotfiles) runs all of this in
`make setup`.

```bash
pnpm install
pnpm run setup
```

`setup` builds every mod and runs `scripts/install.sh`, which copies every
mod and the layouts into place and binds `ctrl-shift-g` to the GitHub tab and `ctrl-shift-i` to the inbox.
Open the Herdr app once before it, so `keys.json` exists. Then press `ctrl-shift-l`
(`cmd-shift-l` on the Mac) until the `workspace` layout shows.

## More

- Contributing and project status: [`CONTRIBUTING.md`](./CONTRIBUTING.md)
- Commands: the `scripts` block in [`package.json`](./package.json)
