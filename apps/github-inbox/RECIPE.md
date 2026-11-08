# GitHub inbox

Open issues and pull requests from every repo the person's GitHub account sees, in one list, from one GitHub search, as on github.com/issues. It starts on what's assigned to them and keeps whatever query they set. It opens as a tab from a key, and from an **Inbox** button in the tab bar.

![GitHub inbox](preview.png)

This file is the brief: enough to build GitHub inbox from an empty folder. The files next to it are one build of it. If they don't work on your Herdr, or you want it different, build it again from here.

## What you see

The mod fills its pane on the theme's `background`, 10px padding, 10px between its parts. Text is 13px in `foreground`.

- **A search box**, 32px high, 10px side padding, 7px radius, a 1px `border` line: the query, placeholder "GitHub search query".
- **Suggestions**, while typing a word with a `:`: a popup under the box's top-left corner, at least 260px wide, 4px padding, 2px gaps, 8px radius, a 1px `border` line, on `surface`, 12px text. Up to 8 rows, 26px high, 8px side padding, 5px radius; the picked row and the row under the pointer on `hover`.
- **A results box** below, filling the rest: 8px radius, a 1px `border` line.
  - A header strip on `surface`, 12px by 9px padding, semibold, with a 1px `border` line under it: "12 results" ("1 result"), "Loading…" before the first answer, or "Error".
  - On an error with nothing shown yet, gh's message in `muted`, 12px padding.
  - Otherwise a scrolling list, one row per issue or pull request, newest update first, at most 100.
- **A row**, 12px by 10px padding, 8px between its parts, a 1px `border` line under it, `hover` under the pointer, top-aligned:
  - A 16px icon in `ansi2`, 2px down: a pull request's (Lucide `git-pull-request`) or an issue's (Lucide `circle-dot`).
  - Then, 4px apart: the title, semibold; a 12px `muted` line, "owner/repo#123 · login opened 3 days ago · Updated 2 hours ago" (minutes, hours, days, months, years; "now" under a minute); and its labels as chips, wrapping 4px apart: 11px semibold, 8px side padding, 10px radius, on the label's GitHub color, with `#1f2328` text when the color is bright (perceived brightness over 150 of 255) and white otherwise.
  - On the right, when it has comments: a 14px Lucide `message-square` icon and the count, 12px `muted`.

## How it behaves

- **Autocomplete, as on GitHub.** Only the last word is completed, once it has a `:`. It offers the qualifiers that start with it: `is:issue`, `is:pr`, `is:open`, `is:closed`, `is:merged`, `is:draft`, `repo:`, `org:`, `label:`, `no:label`, `no:assignee`, `assignee:@me`, `author:@me`, `involves:@me`, `mentions:@me`, `review-requested:@me`, `review:required`, `review:approved` and `review:changes_requested`; a leading `-` negates any. After `label:` or `-label:` it offers label names containing what's typed, quoted when they have a space: the labels on the results shown, plus every label of the repo when the query names one as `repo:owner/name` (listed once per repo). A word that already matches a suggestion gets none.
- **Keys.** ↑ and ↓ pick a suggestion, Tab or Enter takes it, Esc closes the popup; a press on a row takes it. Taking `label:` or another bare qualifier keeps the popup open for its value; taking a full word adds a space. With no suggestion showing, Enter runs the query. A press outside closes the popup.
- **The query.** It starts on `state:open assignee:@me`. Enter runs the typed query and keeps it in the mod's `localStorage` under `query`, so a restart opens on the person's last query; the default only seeds a fresh install.
- **Live.** It searches again every 60 seconds. A failed search keeps the last good list; only a first search that fails shows the error.
- **Clicks.** A row opens its issue or pull request in the browser.
- It shows no agent status.

## Built from

- **One mod**, `mods/github-inbox/`, with `main.js`, `mod.json` (`"place": "none"`, `"title": "GitHub inbox"`, and `"button": { "label": "Inbox", "icon": "mods/github-inbox/inbox.svg" }`, which Herdr ignores and tab-bar reads) and its four icons, `issue.svg`, `pr.svg`, `comment.svg` and `inbox.svg` (Lucide, ISC, 24px viewBox, `stroke="currentColor"`), drawn by their path under the app folder, `mods/github-inbox/<name>.svg`. The search box is its own module set beside them, `github-search/` (`index.js`, `search-box.js`, `suggestions.js`, `qualifiers.js`), which `main.js` imports by relative path.
- **A key**, in `keys.json` beside it: `ctrl-shift-i` runs `tab.new { name: "Inbox", mod: "github-inbox" }`.
- **An Inbox button**, recommended: the [tab-bar](../tab-bar/) mod (`herdr.dev/mods/jd-solanki/herdr-app-config--apps--tab-bar`) shows the button `mod.json` declares; pressing it goes to the open Inbox tab or opens one. Herdr's own tab bar can't take a button.
- **Elements:** `View`, `div` and `svg` from `gpui-kit`; `v_flex`, `h_flex`, `Input`, `InputState` and `Popup` (anchored `top_left`, its content filled only while there are suggestions) from `gpui-base`; colors from `theme()`.
- **From `herdr`:** `exec()` and `theme()`. The input's `change` event opens the suggestions and its `submit` event takes the picked one or runs the query; a 60s `cx.timer.every` refreshes it; `cx.open_url()` opens a row.
- **The programs it runs:** `gh label list -R <owner/name> --limit 500 --json name` for a repo the query names, and `gh search issues <query words> --include-prs --sort updated --limit 100 --json repository,number,title,author,createdAt,updatedAt,commentsCount,labels,isPullRequest,url`, with no folder, so gh uses the person's default account, the one that sees every repo. The query splits into words on spaces, keeping a quoted value (`label:"needs review"`) as one word.

## Watch out

- **It runs a program and reaches the network:** `gh`, with the person's own login.
- **Add the key, then offer the button.** Merge `keys.json` into the person's, asking before replacing a key they already use. Then offer tab-bar, following its own recipe.
- A repo name from the query reaches `gh` as an argument, so it must start with a letter, digit or `_`: `repo:-x/y` names nothing.
- `herdr.d.ts` types `theme()` as plain strings; they are `#rrggbb` colors.
- The icon paths name the mod's folder: if the mod is renamed, change them too.
- `herdr-app check` runs it with no gh answer yet, so it can't catch a bug in a row; open the inbox.

## Done when

- `herdr-app check mods/github-inbox` passes.
- `ctrl-shift-i` opens an Inbox tab listing the person's open assigned issues and pull requests across repos, newest update first, with "N results" above.
- Typing `state:open author:@me` and pressing Enter lists those instead, and the inbox still shows that query after a restart.
- Typing `is:` shows `is:issue`, `is:pr`, `is:open`…; ↓ and Tab take one. With `repo:owner/name` in the query, `label:` lists that repo's labels.
- A row shows its icon, title, repo and number, author, ages, label chips and comment count; clicking it opens the browser.
- With tab-bar, Inbox in the tab bar opens the inbox tab, or goes back to it.
