# Tab title

A tab named `#123` takes that issue's or pull request's title, as `🛠️ #123 <title>` or `🔀 #123 <title>`. For every unnamed tab it publishes the agent's own title, which a tab bar such as [tab-bar](../tab-bar/) shows. It draws nothing: it lives in a 0px block of your layout.

![Tab title](preview.png)

This file is the brief: enough to build Tab title from an empty folder. The files next to it are one build of it. If they don't work on your Herdr, or you want it different, build it again from here.

## What you see

Nothing of its own. Tab names change in whatever tab bar the layout has; error toasts come from Herdr's `toast` mod.

## How it behaves

- **`#123` lookups.** A tab whose name is exactly `#` and digits is renamed `🛠️ #123 <title>` for an issue or `🔀 #123 <title>` for a pull request. The title is cut at 40 characters, ending in "…", counting characters so an emoji is never split.
- The repo comes from the folder of the tab's focused terminal (else its first terminal), on the space's machine. A brand-new tab waits until its terminal reports a folder.
- A tab renamed by someone while the lookup runs keeps their name.
- A failed lookup shows an error toast, "Tab #123: no title", with gh's message, and isn't tried again until the tab's name changes: rename it away and back to retry.
- **Agent titles.** For each tab that is unnamed, or named after its program, it takes the title of the tab's agent pane (else its first pane), drops leading symbols, and skips it when it's empty, the program's name or key, a path (`/`, `~`, `C:\`) or contains `@`. It writes the result as `{ "<tab id>": "<title>" }` to the `tab-bar.labels` shared key, only when that changed. The tab itself stays unnamed, so the title follows the agent.
- It has no agent status of its own.

## Built from

- **One mod**, `mods/tab-title/`, with `main.js` and `mod.json` (`"place": "none"`, `"title": "Tab title"`).
- **A 0px block** in the person's layout: `{ "id": "tab-title", "type": "block", "size": { "px": 0 }, "content": { "mod": "tab-title" } }`, for example last in the column that holds the tab bar.
- **A view** from `gpui-kit` that renders an empty `div()`. Herdr has no tab events: `render` runs whenever spaces, panes or shared state change, and does the work there.
- **From `herdr`:** `spaces()`, `panes()`, `exec()`, `run()`, `notify()`, `shared()` and `setShared()`.
- **Commands:** `tab.rename { id, name }`.
- **The program it runs**, through `exec` in the tab's folder on the space's machine: `gh api repos/{owner}/{repo}/issues/<number> --jq '{title, isPullRequest: (.pull_request != null)}'`. The issues endpoint answers for pull requests too, and only a pull request has `pull_request`.

## Watch out

- **It runs only while a layout with its block is shown.** Herdr starts a mod only for a shown block and has no startup hook. In a layout without the block, unnamed tabs show program names and `#123` tabs wait until it shows. If the person's layout is Herdr's read-only `main`, clone it first, `herdr-app do layout.clone '{"name":"main","as":"<name>"}'`, and add the block to the clone.
- **It runs a program and reaches the network:** `gh`, with the person's own login.
- **Agent titles are published, never renamed in.** A rename marks the tab named and outlives the agent.
- Only a name of exactly `#` and digits matches, so its own rename never matches again.
- `herdr-app check` renders it with no tabs; name a tab `#1` in a repo to test.

## Done when

- `herdr-app check mods/tab-title` passes.
- In a repo's tab, naming the tab `#1` turns it into `🛠️ #1 <issue title>` (or `🔀` for a pull request) within a few seconds.
- Naming a tab `#99999999` shows an error toast and leaves the name; renaming it away and back tries again.
- With tab-bar, an unnamed tab running Claude Code shows the session's title, and returns to the program name when the agent exits.
