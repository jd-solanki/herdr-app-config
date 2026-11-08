# GitHub tab

A space's GitHub issues and pull requests, in a tab: the ones in the repo the space's terminal is in, filtered by any GitHub search query. Each one opens inside the app, with its description and comments, Mermaid diagrams drawn and images shown. Labels can be changed straight from the list. It opens as a tab from a key, and from a **GitHub** button in the tab bar.

![GitHub tab](preview.png)

This file is the brief: enough to build GitHub tab from an empty folder. The files next to it are one build of it. If they don't work on your Herdr, or you want it different, build it again from here.

## What you see

The mod fills its pane on the theme's `background`. Text is 13px in `foreground`. It has two pages, the list and one issue or pull request, both with 16px padding.

**The list page**, 10px between its parts:

- **Kind chips**, 6px apart: "Issues" and "PRs".
- **Preset chips**, 6px apart: "Open" (`is:open`), "Assigned to me" (`is:open assignee:@me`) and "Involves me" (`is:open involves:@me`).
- A **chip** is 28px high, 12px side padding, 7px radius, a 1px line, 12px semibold. The current kind, and the preset whose query is exactly the query, are on: `solid` line and background, `solid_foreground` text. The others have a `border` line on `background` with `foreground` text.
- **A search box**, 34px high, 10px side padding, 7px radius, a 1px `border` line: the query, placeholder "GitHub search query". **Suggestions** show in a popup under its top-left corner: at least 260px wide, 4px padding, 2px gaps, 8px radius, a 1px `border` line, on `surface`, 12px text. It shows up to 8 rows, each 26px high with 8px side padding and 5px radius. The picked row, and the row under the pointer, are on `hover`.
- **A table** filling the rest: 8px radius, a 1px `border` line. Before the first answer it shows "Loading…" instead, or gh's error message, in `muted` with 4px padding.
  - A header, 34px high, 14px side padding, 12px between columns, on `surface` with a 1px `border` line under it. Captions are 11px semibold `dim`: "ID" (84px wide), "TITLE / CONTEXT" (the rest), "LABELS" (220px) and "ASSIGNEES" (150px).
  - A scrolling list below it with one row per issue or pull request, at most 100, in gh's order.
- **A row** is 60px high, 14px side padding, 12px between columns, a 1px `border` line under it, on `hover` under the pointer:
  - **ID:** the state icon, 16px, 8px before "#123" in `dim`. The icon's tooltip and accessibility label name the state:

    | State        | Icon           | Color   |
    | ------------ | -------------- | ------- |
    | Open issue   | `issue-open`   | `ansi2` |
    | Open PR      | `pr-open`      | `ansi2` |
    | Draft PR     | `pr-draft`     | `dim`   |
    | Merged PR    | `pr-merged`    | `ansi5` |
    | Closed issue | `issue-closed` | `ansi5` |
    | Closed PR    | `pr-closed`    | `ansi1` |

  - **Title and context**, 4px apart: the title, semibold, cut off with an ellipsis. Under it a 12px `muted` line, 10px apart: the author's login, then the repo's name without its owner.
  - **Labels:** a 48px-high box, 6px radius, on `raised` under the pointer, its chips wrapping 4px apart and clipped. A label chip has 7px side padding, 9px radius, a 1px `border` line and 11px `muted` text. A row with no labels shows "-" in `dim`.
  - **Assignees:** their logins joined by ", ", cut off with an ellipsis, in `foreground`; "-" in `dim` when there are none.
- **The label picker**, a popover under the labels box's top-left corner: 220px wide, 4px padding, 2px gaps, 8px radius, a 1px `border` line, on `surface`, 12px text.
  - A search field, 28px high, 8px side padding, 2px below it, 5px radius, a 1px `border` line, placeholder "Search labels".
  - Then "Loading…" (or gh's error) until the repo's labels arrive, "No matching labels", or up to 10 rows. A row is 26px high, 8px side padding, 8px gaps, 5px radius, on `hover` under the pointer: a 12px column with "✓" when ticked, then the label's name, cut off with an ellipsis.

**The detail page**, 12px between its parts:

- **A bar:** "← Back", "#123" in `dim`, the title (semibold, cut off with an ellipsis), then, once loaded, a state pill and a "↗" button, all 10px apart.
  - The buttons are 28px high, 10px side padding, 6px radius, a 1px `border` line, `muted` text, on `hover` under the pointer.
  - The pill has 9px by 2px padding, 10px radius, and its line and 11px semibold text are in the state's color from the table above: "Open", "Draft", "Merged" or "Closed".
- "Loading…" or gh's error until it loads, as on the list.
- **Facts**, 12px `muted`, 10px apart: the author, each label's name, and for a pull request "head → base", "+12 -3" and "4 files".
- **The posts**, scrolling, 12px apart: the description first ("No description" when empty), then each comment. A post has 8px radius and a 1px `border` line. Its header has 14px by 8px padding, 12px `muted` text on `surface`, a 1px `border` line under it, and shows the author's login. The body has 14px padding and 10px between its parts:
  - Text, as selectable Markdown.
  - Each Mermaid code block, drawn as a diagram at its own width and height, scrolling sideways when wider. It says "Rendering diagram…" in `muted` while drawing. If drawing fails it shows the error and the block's source as a code block.
  - Each image becomes a link, "🖼 alt" ("🖼 image" without alt text, `[` and `]` removed). An image that was itself a link (`[![alt](image)](href)`) links to `href`.
  - Under the text, a wrapping row of thumbnails, 8px apart, one per distinct image hosted on GitHub (`https://github.com/…` or `https://<name>.githubusercontent.com/…`). Any other image is only its link. Each is 240×140px with 6px radius and a 1px `border` line, the image filling it. It says "Loading image…" or the error at 11px `muted` with 8px padding until the image arrives. A loaded thumbnail shows a pointer cursor and an `accent` line under the pointer.
- **The full-size image**, a dialog 90% of the window wide and high: the image filling it, 8px padding, on `background`.

## How it behaves

- **Its space.** With `props.space` it shows that space. Without, it takes the space active when it starts and stays with it.
- **Its repo.** The space's repo is its first terminal's: the folder of the first pane in one of the space's tabs that has a folder, else the space's `folder`, on the space's machine. That folder's git top level is used. It is checked again on every render, so a terminal moving to another repo moves the tab. Moving within the repo changes nothing. A new repo closes the open detail page and the label picker.
- **Kinds and queries.** "Issues" and "PRs" switch the kind. A preset chip sets the search box and runs its query. Enter in the search box runs the typed query when no suggestion is showing. The query is gh's `--search`, with `--state all`, so the query decides the state: `is:closed` works.
- **Remembered.** The kind and query, in the shared key `github.lastView` (`{ kind, query }`), written whenever either changes. A new GitHub tab, in any space, opens on them. A fresh install opens on Issues with `is:open`.
- **Autocomplete, as on GitHub.** Only the last word is completed, once it has a `:`. It offers the qualifiers that start with it, and a leading `-` negates any:
  - **Issues:** `is:open`, `is:closed`, `label:`, `no:label`, `no:assignee`, `assignee:@me`, `author:@me`, `involves:@me`, `mentions:@me`, `sort:updated-desc`, `sort:created-desc`, `sort:comments-desc`.
  - **PRs:** `is:open`, `is:closed`, `is:merged`, `is:draft`, `label:`, `no:label`, `no:assignee`, `assignee:@me`, `author:@me`, `involves:@me`, `mentions:@me`, `review-requested:@me`, `review:required`, `review:approved`, `review:changes_requested`, then the three sorts.
  - **Labels:** after `label:` or `-label:` it offers the repo's label names that contain what's typed, quoted when they have a space. The labels are fetched the first time they're wanted.
  - A word that already matches a suggestion gets none.
- **Keys.** ↑ and ↓ pick a suggestion, Tab or Enter takes it, Esc closes the popup. A press on a suggestion takes it. Taking `label:` or another bare qualifier keeps the popup open for its value; taking a full word adds a space. A press outside closes the popup. Esc also closes the full-size image.
- **Clicks.**
  - A row opens its detail page. "← Back" returns to the list. "↗" opens the issue or pull request in the browser.
  - In a post, a link to an image shown in that post opens the full-size dialog, and so does a thumbnail. Any other `http`/`https` link opens in the browser. Other links do nothing.
- **Labels.** A press on a row's labels opens the picker and doesn't open the row. Typing in the picker's field filters the labels, ignoring case. A press on a label ticks or unticks it; nothing is saved yet. Closing the picker saves every change in one gh call, then the list refreshes. If nothing changed it makes no call. If the call fails, an error toast says "Could not change labels on #123" with gh's message. A row that leaves the list drops its unsaved picks.
- **Live.** Every 60 seconds it fetches again whatever is shown: the list, or the open issue or pull request. A failed fetch keeps the last good answer; only a first fetch that fails shows the error.
- **Diagrams and images** are fetched one at a time, in the order they're first shown, and kept for the run: a diagram per source and theme, an image per URL. One that fails keeps its error on screen and is tried again on the next 60-second tick, once nothing is queued.
- It shows no agent status.

## Built from

- **One mod**, `mods/github/`, with:
  - `main.js`.
  - `mod.json`: `"place": "none"`, `"title": "GitHub"`, and `"button": { "label": "GitHub", "icon": "icons/gh.svg", "per_space": true }`. Herdr ignores `button` and tab-bar reads it. `icons/gh.svg` is Herdr's own icon in the app folder.
  - The six state icons, shipped as files. They are 24px-viewBox SVGs with `stroke="currentColor"`, drawn with `svg("mods/github/<name>.svg")` in the state's color:
    - `issue-open.svg`: Lucide `circle-dot`.
    - `issue-closed.svg`: a circle with a check, `<circle cx="12" cy="12" r="10"/><path d="m16 9-5.5 5.5L8 12"/>`.
    - `pr-open.svg`: Lucide `git-pull-request`.
    - `pr-draft.svg`: Lucide `git-pull-request-draft`.
    - `pr-merged.svg`: Lucide `git-merge`.
    - `pr-closed.svg`: Lucide `git-pull-request-closed`.
  - `mermaid-svg`, a Bun script: `mermaid-svg <source> <palette json> <folder>`. It renders the source with `pele@1.13.0`, which Bun installs on first run. Pele colors with CSS variables, which SVG image renderers ignore, so it inlines every `var(--…)` inside tags, up to 4 deep. The values are the palette over the declarations in Pele's root `<svg style>`. It writes `<sha256 of the SVG>.svg` into the folder and prints `{ "name", "width", "height" }`. On a render error it prints the message to stderr and exits 1.
  - `github-search/`: the shared `github-search` package (`index.js`, `qualifiers.js`, `search-box.js`, `suggestions.js`), copied in and imported as `./github-search/index.js`. Its `SearchBox` is the search box and its suggestions. `ISSUE_QUALIFIERS` and `PULL_QUALIFIERS` are the lists for each kind.
- **A key**, in `keys.json` beside it: `ctrl-shift-g` runs `tab.new { name: "GitHub", mod: "github" }`.
- **A GitHub button**, recommended: the [tab-bar](../tab-bar/) mod shows the button `mod.json` declares. Because of `per_space`, pressing it goes to the shown space's GitHub tab, or opens one with `props: { space: <space id> }`.
- **Elements:**
  - From `gpui-kit`: `View`, `div`, `image` and `svg`.
  - From `gpui-base`: `v_flex`, `h_flex`, `Input`, `InputState` and `TextView.markdown(…).selectable().on_link_click(…)`. Also `Popover`, anchored `top_left`, controlled with `open()` and `on_open_change()`, its content built only while open. The search box adds `Popup`.
  - Colors come from `theme()`.
- **From the context:** `cx.timer.every(60_000)` refreshes and `cx.timer.after(100)` focuses the picker's field after the popover takes the keyboard. `cx.spawn` runs every fetch, `cx.open_url()` opens links, and `cx.stop_propagation()` keeps a press on the labels from opening the row.
- **From `herdr`:** `props()`, `spaces()`, `panes()`, `exec()`, `appHome()`, `theme()`, `shared()` / `setShared()` (`github.lastView`), `notify()` (error toasts) and `openOverlay({ mod: "github", kind: "dialog", width: 0.9, height: 0.9, props: { image: <file name> } })`. The full-size image is the mod itself, rendering just the image when `props.image` is set.
- **Node modules:** `mkdir` and `unlink` from `fs/promises`; `createHash` and `randomUUID` from `crypto`.
- **Programs it runs.** These run through `exec` in the repo's folder on the space's machine:
  - `git rev-parse --show-toplevel`, in the terminal's folder.
  - `gh issue list` or `gh pr list` with `--state all --search <query> --limit 100 --json number,title,author,labels,state,url,assignees`. PRs add `,isDraft`.
  - `gh issue view <n>` or `gh pr view <n>` with `--json number,title,author,labels,state,url,body,comments`. PRs add `,isDraft,headRefName,baseRefName,additions,deletions,changedFiles`.
  - `gh label list --limit 200 --json name`.
  - `gh issue edit <n>` or `gh pr edit <n>`, with `--add-label <csv>` and/or `--remove-label <csv>`. Each name in the CSV is a quoted field, with `"` doubled: `"bug","needs review"`.
  - `git config user.name`, for GitHub images.
- **More programs**, run on this computer:
  - `gh browse --repo <owner/repo> <n>` for "↗", with the repo taken from the issue or pull request's URL. A failure shows the toast "Could not open #123".
  - `bun <appHome>/mods/github/mermaid-svg <source> <palette json> <appHome>/data/github/mermaid`. The palette maps Pele's variables to the theme:

    | Variable             | Theme color  |
    | -------------------- | ------------ |
    | `--pele-bg`          | `background` |
    | `--pele-fg`          | `foreground` |
    | `--pele-muted`       | `muted`      |
    | `--pele-line`        | `muted`      |
    | `--pele-surface`     | `surface`    |
    | `--pele-surface-alt` | `raised`     |
    | `--pele-border`      | `border`     |
    | `--pele-accent`      | `accent`     |

  - Image downloads, as `sh -c <script> sh <url> <part file> <login>`. The script is:

    ```sh
    curl -fsSLg --proto =https --proto-redir =https --max-filesize 20M --max-time 25 -H @- -w '%{content_type}' -o "$2" -- "$1"
    ```

    `gh auth token ${3:+-u "$3"} | sed 's/^/Authorization: token /' |` comes before it. Only GitHub-hosted URLs are downloaded; any other is the error "Not a GitHub image: <url>", before curl runs.

  - Then `mv <part> <appHome>/data/github/images/<sha256 of the URL>.<ext>`. The part file is `<sha256>.<random UUID>.part` in the same folder and is always removed afterwards.
- **Data folders**, under the app home: `data/github/images/` and `data/github/mermaid/`. Both are drawn by their path relative to it.

## Watch out

- **It runs programs and reaches the network.** `gh` runs with the person's own login, in the repo's folder, so gh's account follows that repo. `curl` fetches the GitHub-hosted images a post contains, following GitHub's redirect to S3, and `bun` downloads Pele from npm on the first diagram. Without `bun`, every diagram shows its error and its source.
- **The token goes in on stdin.** `gh auth token` is piped to curl as an `Authorization` header via `-H @-`, so the token never shows in argv. It is sent only to github.com and `*.githubusercontent.com`. curl drops it on the redirect to S3. The login it picks is the repo's `git config user.name`, the rule the person's gh wrapper uses for choosing an account.
- **Only GitHub-hosted images are downloaded.** Any other host would learn the person's IP and when they read the post, so a tracking pixel in a comment would work. The download refuses other hosts itself, so no future caller can send it the token.
- **Only images are kept.** The download must report `image/png`, `jpeg`/`jpg`, `gif`, `webp`, `svg` or `bmp` as its content type; anything else is the error "Not an image: <url>". Herdr picks the decoder by file extension, so the extension comes from that type. Downloads are https-only, redirects included, at most 20 MB and 25 s.
- **Fetched text is untrusted and runs through the parsers inside render.** Find Mermaid blocks with a fence of 3 or more backticks or tildes, at most 3 spaces in, info string exactly `mermaid`. An unclosed fence runs to the end of the text. In multiline mode `^` also matches after CR, U+2028 and U+2029, so the opener's checks must stop at any line terminator.
- **One fetch at a time for diagrams and images.** The job count comes from fetched text, and `cx.spawn` throws at 1024 outstanding host tasks, so they go through a single queue.
- **Theme lookups:** build the Mermaid palette once per page, not once per block. A `theme()` call per block exhausts the render budget at 2,000 blocks.
- **The space is fixed at start** when there is no `props.space`. A mod pane can't see its own tab, so the key's tab takes the active space and stays with it.
- **Popover closes:** Herdr sends no close for a popover whose row is gone, so drop the drafts of rows no longer listed. Otherwise a draft reopens on the next row with that number.
- **Paths name the mod's folder.** These all say `github`: the state icons and `mermaid-svg` (`mods/github/…`) and the overlay's `mod: "github"`. If the mod is renamed, change them too. Images and diagrams live under `data/github/`, not in the mod's folder, because a new file there reloads the mod.
- Only the first 200 of a repo's labels are listed, and the list shows at most 100 issues or pull requests.
- `herdr.d.ts` types `theme()` as plain strings; they are `#rrggbb` colors.
- **Testing:** `herdr-app check` runs it with no props and no gh answer yet, so it can't catch a bug in a row or the detail page. Open the tab.
- **Add the key, then offer the button.** Merge `keys.json` into the person's, asking before replacing a key they already use. Then offer tab-bar, following its own recipe. With tab-bar, the mod gets a GitHub button from its `mod.json`. Herdr's own tab bar can't take a button.

## Done when

- `herdr-app check mods/github` passes.
- In a space whose terminal is in a GitHub repo, `ctrl-shift-g` opens a GitHub tab. It lists the repo's open issues, each with its state icon, "#number", title, author, repo name, label chips and assignees.
- "PRs" lists pull requests: drafts with the dim draft icon, and `is:merged` shows merged ones in `ansi5`. "Assigned to me" switches the query and lights its chip.
- Typing `is:` suggests `is:open`, `is:closed`, and on PRs also `is:merged` and `is:draft`. ↓ and Tab take one, and `label:` lists the repo's labels.
- After a query and kind change, a new GitHub tab in another space opens on the same kind and query.
- A press on a row opens it with its description, comments and facts (branch and diff size for a PR). "↗" opens it in the browser, and "← Back" returns to the list.
- A ` ```mermaid ` block draws as a diagram in the theme's colors. A broken one shows its error and source.
- An image in a post shows as a "🖼" link and a thumbnail, including a private repo's `user-attachments` image. Clicking either opens it at 90% of the window, and Esc closes it.
- An image from another host (`![x](https://example.com/x.png)`) shows only as a "🖼 x" link, nothing is downloaded, and clicking it opens the browser.
- In the label picker, ticking one label and unticking another, then closing the picker, changes both on GitHub in one edit. The row shows the new labels.
- `cd` into another repo in the space's terminal, and the tab lists that repo's issues.
- With tab-bar, the GitHub button opens the shown space's GitHub tab, or goes back to it.
