# Tab bar

Herdr's tab bar, with better tab names and room for other mods' buttons: an unnamed tab shows its agent's own title, a tab named `#123` takes that GitHub issue's or pull request's title, and a mod adds a button by declaring it in its own `mod.json`. It takes the place of Herdr's own tab bar in your layout; it isn't a new window.

![Tab bar](preview.png)

This file is the brief: enough to build Tab bar from an empty folder. The files next to it are one build of it. If they don't work on your Herdr, or you want it different, build it again from here.

## What you see

One row filling its block, on `chrome` with a 1px `border` line along the bottom, 10px side padding (more on the left on macOS without a title bar, below), 3px gaps.

- **Tabs**, left, in a row that scrolls sideways, one pill per tab of the shown space: 29px high, 10px side padding, 7px gaps, 7px radius, 12.8px text, a 1px border. The shown tab is on `raised` with a `border` line and `foreground` text; others on `chrome`, `muted` text, `hover` under the pointer. In each:
  - the program's 14px icon: a one-color glyph in `muted`, or its image;
  - the name, cut off at 320px, with " Z" after it while the tab is zoomed. A named tab shows its name. An unnamed tab (or one named after its program) shows its agent's title (below), else its program's name, else "Terminal";
  - a 12px spinner in `working`, turning every 900ms, while it works; a 6px dot in `blocked` or `done` when it is;
  - on the shown tab, a 12px close icon in `dim`.
- **"+"**, a 26px square, 6px radius, `dim`, `hover` with `foreground` under the pointer.
- **Panel buttons**: Files and Changes (Herdr's `mods/files/file.svg` and `mods/changes/changes.svg`), each only if the shared `workspace.panels` list names it (both when it's unset). Then every **declared button**. Each is 26px high, 8px side padding, 5px gap, 6px radius, 12px text, a 14px icon then its label; on `selected` with `foreground` while its panel or tab shows, else `chrome` and `muted`, `hover` under the pointer.
- **Window buttons**, when Herdr asks a mod to draw them: "−", "□" and a 13px close icon, in the "+" style.

## How it behaves

- **Tabs.** Click selects. Double-click renames. Press one and release over another to move it there. Right-click opens Herdr's tab menu. The wheel moves to the next or previous tab. The close icon closes the shown tab. "+" opens Herdr's new-tab menu.
- **Agent status** shows on each tab: working as the spinner, blocked and done as the dot, idle as nothing.
- **Side panel per space.** Opening or closing a panel records it for the space; switching spaces shows that space's panel again, or closes the panel if the space never had one. A restore gets one second to land before the bar records the state as a choice.
- **Declared buttons.** A mod declares one in its own `mod.json`: `"button": { "label": "Inbox", "icon": "mods/github-inbox/inbox.svg", "per_space": true }`. `icon` is a path under the app folder; `per_space` is optional. The bar reads every `mods/*/mod.json` at start and again when one changes or a mod folder appears, sorted by label. `props.buttons` on the bar's layout block, a list of mod names, picks and orders them instead.
- **Pressing one.** When the layout's `panel-body` stack has a block whose id is the mod's name, it toggles the side panel on that block. When the layout has another node whose id is the mod's name, it toggles that node with `layout.toggle`, the same in every space (`selected` while it shows). Otherwise it selects the shown space's tab whose pane shows the mod, or opens one: `tab.new { name: <label>, mod }`, with `props: { space: <space id> }` when `per_space`.
- **Keys.** `tab-bar.<mod>` in `keys.json` presses that mod's button.
- **Agent titles.** For each tab that is unnamed, or named after its program, it takes the title of the tab's agent pane (else its first pane), drops leading symbols, and skips it when it's empty, the program's name or key, a path (`/`, `~`, `C:\`) or contains `@`. The tab itself stays unnamed, so the title follows the agent.
- **`#123` tabs.** A tab whose name is exactly `#` and digits is renamed `🛠️ #123 <title>` for a GitHub issue or `🔀 #123 <title>` for a pull request. The title is cut at 40 characters, ending in "…", counting characters so an emoji is never split. The repo comes from the folder of the tab's focused terminal (else its first terminal), on the space's machine; a brand-new tab waits until its terminal reports a folder. A tab renamed by someone while the lookup runs keeps their name. A failed lookup shows an error toast, "Tab #123: no title", with gh's message, and isn't tried again until the tab's name changes: rename it away and back to retry. Herdr has no tab events, so the bar looks for these tabs whenever it renders.
- Nothing moves on its own except the working spinner.

## Built from

- **One mod**, `mods/tab-bar/`, with `main.js`, `tab-names.js` (agent titles and `#123` tabs, imported by `main.js`) and `mod.json` (`"place": "none"`, `"title": "Tabs"`, `cloned_from: { name: "tabs", version: "0.1.11" }`). In the person's layout, the block whose content is `{ "mod": "tabs" }` gets `{ "mod": "tab-bar" }`; keep its size and `window_drag`.
- **Elements:** `View`, `div`, `svg` and `image` from `gpui-kit`; `h_flex` from `gpui-base`; colors from `theme()`.
- **From `herdr`:** `spaces()`, `panes()` (each tab's program and agent), `layout()` (the `sidebar`, `panel` and `panel-body` nodes, `traffic_lights`), `window()`, `settings()` (zoom), `shared()`, `props()`, `nextCommand()`, `appHome()`, `watchFolder()`, `openOverlay()`, `exec()` and `notify()`; `readdir` and `readFile` from `fs/promises`.
- **Commands:** `tab.select`, `tab.rename`, `tab.move { id, index }`, `tab.close`, `tab.new`, `tab.next`, `tab.prev`, `layout.select { stack: "panel-body", child }`, `layout.show`/`layout.hide { id: "panel" }`, `layout.toggle { id: <mod> }`, `window.minimize`, `window.maximize`, `window.close`. The tab menu is Herdr's `menu` mod as a 200px popup with `{ tab: "tab", target: { id, space } }`; "+" opens Herdr's `new-menu` as a 250×512 popup.
- **macOS without a title bar** (and not full screen): the left padding clears the window buttons, `max(10, (traffic_lights[0] + 64) / zoom − the sidebar's width)`, with a hidden sidebar counting as 0.
- **Its own storage:** `localStorage` key `panels` (space id → the panel it had open).
- **Art:** Herdr's shipped `mods/workspace-chrome/spinner.svg`, `mods/pane/close.svg`, `mods/files/file.svg` and `mods/changes/changes.svg`.
- **The program it runs**, through `exec` in the tab's folder on the space's machine: `gh api repos/{owner}/{repo}/issues/<number> --jq '{title, isPullRequest: (.pull_request != null)}'`. The issues endpoint answers for pull requests too, and only a pull request has `pull_request`. It also reads other mods' `mod.json` files.

## Watch out

- **Replace, don't add.** Put it in the block that has Herdr's `tabs` mod. If the person's layout is Herdr's own `main`, which is read-only, clone it first, `herdr-app do layout.clone '{"name":"main","as":"<name>"}'`, and change the clone.
- **A button lives in its mod's `mod.json`, never registered at run time.** A mod runs only while a layout shows it, so a button it registered itself could never open it.
- **It runs a program and reaches the network** for `#123` tabs: `gh`, with the person's own login.
- **Agent titles are shown, never renamed in.** A rename marks the tab named and outlives the agent.
- Only a name of exactly `#` and digits is looked up, so the bar's own rename never matches again.
- It draws Herdr's icons by path: a Herdr version that moves them shows blanks.
- `herdr.d.ts` types `theme()` as plain strings; they are `#rrggbb` colors.
- It is a clone of Herdr's `tabs` mod 0.1.11, so Herdr's updates don't reach it.
- `herdr-app check` renders it with no tabs; look at the bar.

## Done when

- `herdr-app check mods/tab-bar` passes.
- The layout's tab bar is this one and Herdr's is gone; tabs select, rename, move, close and show agent status as before.
- A mod with a `button` in its `mod.json` gets a button after Files and Changes without a restart; pressing it opens that mod's tab, and pressing again from another tab goes back to it.
- With a `panel-body` block named after the mod, the button toggles that side panel instead.
- With any other layout node named after the mod, the button shows and hides it, and switching spaces leaves it as it is.
- `props.buttons` on the block shows only the listed buttons, in that order.
- A `tab-bar.<mod>` key presses the button.
- An unnamed tab running Claude Code shows the session's title, and the program's name again once the agent exits.
- In a repo's tab, naming the tab `#1` turns it into `🛠️ #1 <issue title>` (or `🔀` for a pull request) within a few seconds; `#99999999` shows an error toast and keeps the name.
