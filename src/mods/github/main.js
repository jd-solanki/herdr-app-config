import { mkdir, unlink, writeFile } from "fs/promises";
import { createHash, randomUUID } from "crypto";
import { View, div, image, svg } from "gpui-kit";
import { Input, InputState, Popover, Popup, TextView, h_flex, v_flex } from "gpui-base";
import {
  appHome,
  exec,
  notify,
  openOverlay,
  panes,
  props,
  setShared,
  shared,
  spaces,
  theme,
} from "herdr";

const REFRESH_MS = 60_000;

const ID_WIDTH = 84;
const LABELS_WIDTH = 220;
const LABEL_MATCHES_SHOWN = 10;
const ASSIGNEES_WIDTH = 150;

const PRESETS = [
  { label: "Open", query: "is:open" },
  { label: "Assigned to me", query: "is:open assignee:@me" },
  { label: "Involves me", query: "is:open involves:@me" },
];
// The last kind and query, so a new GitHub tab opens on the view used last.
const LAST_VIEW_KEY = "github.lastView";

const SUGGESTIONS_SHOWN = 8;
// Users are left out: suggesting them means fetching every collaborator.
const QUALIFIERS = {
  issues: [
    "is:open",
    "is:closed",
    "label:",
    "no:label",
    "no:assignee",
    "assignee:@me",
    "author:@me",
    "involves:@me",
    "mentions:@me",
    "sort:updated-desc",
    "sort:created-desc",
    "sort:comments-desc",
  ],
  pulls: [
    "is:open",
    "is:closed",
    "is:merged",
    "is:draft",
    "label:",
    "no:label",
    "no:assignee",
    "assignee:@me",
    "author:@me",
    "involves:@me",
    "mentions:@me",
    "review-requested:@me",
    "review:required",
    "review:approved",
    "review:changes_requested",
    "sort:updated-desc",
    "sort:created-desc",
    "sort:comments-desc",
  ],
};

const WORK_FIELDS = "number,title,author,labels,state,url";
const LIST_FIELDS = `${WORK_FIELDS},assignees`;
const VIEW_FIELDS = `${WORK_FIELDS},body,comments`;
const KINDS = {
  issues: { label: "Issues", command: "issue", listFields: LIST_FIELDS, viewFields: VIEW_FIELDS },
  pulls: {
    label: "PRs",
    command: "pr",
    listFields: `${LIST_FIELDS},isDraft`,
    viewFields: `${VIEW_FIELDS},isDraft,headRefName,baseRefName,additions,deletions,changedFiles`,
  },
};

// Fetched text runs this inside render, and `^` also fires after CR, U+2028 and U+2029, so the opener's checks must stop at any line terminator.
const CODE_FENCE =
  /^ {0,3}(?=.*\r?\n)((`|~)\2{2,})(?!\2)(?!(?<=`).*`)[ \t]*(\S*)[^\n]*\n([\s\S]*?)(?:^ {0,3}\1\2*[ \t]*\r?$|(?![\s\S]))/gm;
const DIAGRAM_FOLDER = "data/github/mermaid";
const ICON_FOLDER = "data/github/icons";
// Lucide (ISC). Written under the app folder at start, so the mod stays one built main.js.
const STATE_ICONS = {
  "issue-open": '<circle cx="12" cy="12" r="1"/><circle cx="12" cy="12" r="10"/>',
  "issue-closed": '<circle cx="12" cy="12" r="10"/><path d="m16 9-5.5 5.5L8 12"/>',
  "pr-open":
    '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" x2="6" y1="9" y2="21"/>',
  "pr-draft":
    '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M18 6V5"/><path d="M18 11v-1"/><line x1="6" x2="6" y1="9" y2="21"/>',
  "pr-merged":
    '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/>',
  "pr-closed":
    '<path d="m15.5 3.5 5 5"/><path d="m15.5 8.5 5-5"/><path d="M18 11.62V15"/><path d="M6 9v12"/><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/>',
};
const IMAGE_FOLDER = "data/github/images";
// TextView draws no images, so each becomes a link and a thumbnail. Groups: markdown alt, markdown URL, <img> src.
const IMAGE = /!\[([^\]]*)\]\(\s*<?([^\s)>]+)>?[^)]*\)|<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
// A linked image, [![alt](image)](href): one link to href, so no link sits inside another. Groups: alt, image URL, href.
const LINKED_IMAGE = /\[\s*!\[([^\]]*)\]\(\s*<?([^\s)>]+)>?[^)]*\)\s*\]\(\s*<?([^\s)>]+)>?[^)]*\)/g;
const CURL = `curl -fsSLg --proto =https --proto-redir =https --max-filesize 20M --max-time 25 -H @- -w '%{content_type}' -o "$2" -- "$1"`;
// The token goes in on stdin, so argv never shows it, and curl drops it on the redirect to S3.
const AUTHED_CURL = `gh auth token \${3:+-u "$3"} | sed 's/^/Authorization: token /' | ${CURL}`;

export default class GitHub extends View {
  init(_props, cx) {
    const lastView = shared(LAST_VIEW_KEY);
    this.kind = KINDS[lastView?.kind] ? lastView.kind : "issues";
    this.query = typeof lastView?.query === "string" ? lastView.query : PRESETS[0].query;
    this.openWork = null;
    this.listsByKey = {};
    this.detailsByKey = {};
    this.diagramsByKey = {};
    this.imagesByUrl = {};
    this.queue = [];
    this.repoLabelsByKey = {};
    // The open label pickers' choices, by work number: closing one picker and opening the next can report in either order.
    this.labelDrafts = new Map();
    this.labelSearch = InputState.new({ placeholder: "Search labels" });
    this.labelSearch.on("change", (_e, cx) => cx.notify());
    this.search = InputState.new({ placeholder: "GitHub search query" });
    this.search.set_value(this.query);
    this.search.on("submit", (_e, cx) => this.submitSearch(cx));
    this.search.on("change", (_e, cx) => this.showSuggestions(cx));
    this.suggestionsOpen = false;
    this.suggestionIndex = 0;
    cx.timer.every(REFRESH_MS, (cx) => this.refresh(cx));
    // The table waits for the icons: an svg() drawn before its file exists stays blank.
    this.iconsReady = false;
    cx.spawn(async (cx) => {
      await writeStateIcons().catch((error) =>
        notify({
          title: "Could not write the GitHub state icons",
          body: error.message,
          level: "error",
        }),
      );
      this.iconsReady = true;
      cx.notify();
    });
  }

  listKey() {
    return JSON.stringify([this.place, this.kind, this.query]);
  }

  detailKey() {
    return JSON.stringify([this.place, this.kind, this.openWork]);
  }

  repoLabelsKey() {
    return JSON.stringify(this.place);
  }

  repoLabels() {
    return this.repoLabelsByKey[this.repoLabelsKey()];
  }

  loadRepoLabels(cx) {
    this.load(this.repoLabelsByKey, this.repoLabelsKey(), () => listRepoLabels(this.place), cx);
  }

  refresh(cx) {
    const { place, kind, query, openWork } = this;
    if (!place) return;
    this.flagFailures();
    if (openWork)
      this.load(this.detailsByKey, this.detailKey(), () => viewWork(kind, openWork, place), cx);
    else this.load(this.listsByKey, this.listKey(), () => listWork(kind, query, place), cx);
  }

  // Flagged, not deleted: a broken diagram or image keeps its error on screen while it retries. A queued one is already retrying.
  flagFailures() {
    if (this.queue.length) return;
    for (const entry of [
      ...Object.values(this.diagramsByKey),
      ...Object.values(this.imagesByUrl),
    ]) {
      if (entry.error) entry.retry = true;
    }
  }

  load(cache, key, fetchLatest, cx) {
    cx.spawn(async (cx) => {
      await this.settle(cache, key, fetchLatest);
      cx.notify();
    });
  }

  async settle(cache, key, fetchLatest) {
    try {
      cache[key] = { value: await fetchLatest() };
    } catch (error) {
      // A network blip keeps the last good result.
      if (!cache[key]?.value) cache[key] = { error: error.message };
    }
  }

  // Fetched text sets the job count, and cx.spawn throws at 1024 outstanding host tasks.
  drainQueue(cx) {
    cx.spawn(async (cx) => {
      while (this.queue.length) {
        const { cache, key, make } = this.queue[0];
        await this.settle(cache, key, make);
        this.queue.shift();
        cx.notify();
      }
    });
  }

  setQuery(query, cx) {
    this.query = query;
    this.search.set_value(query);
    this.suggestionsOpen = false;
    this.rememberView();
    this.refresh(cx);
    cx.notify();
  }

  setKind(kind, cx) {
    this.kind = kind;
    this.labelDrafts.clear();
    this.suggestionsOpen = false;
    this.rememberView();
    this.refresh(cx);
    cx.notify();
  }

  // Enter finishes the picked suggestion first, as on GitHub; with no suggestion showing, Enter searches.
  submitSearch(cx) {
    const suggestions = this.suggestions();
    if (suggestions.length) this.acceptSuggestion(suggestions[this.suggestionIndex], cx);
    else this.setQuery(this.search.value(), cx);
  }

  rememberView() {
    setShared(LAST_VIEW_KEY, { kind: this.kind, query: this.query });
  }

  showSuggestions(cx) {
    this.suggestionsOpen = true;
    this.suggestionIndex = 0;
    const wantsLabels = /^-?label:/.test(lastWord(this.search.value()));
    if (wantsLabels && !this.repoLabels()) this.loadRepoLabels(cx);
    cx.notify();
  }

  suggestions() {
    if (!this.suggestionsOpen) return [];
    const labelNames = this.repoLabels()?.value?.map(({ name }) => name) ?? [];
    return searchSuggestions(this.search.value(), QUALIFIERS[this.kind], labelNames).slice(
      0,
      SUGGESTIONS_SHOWN,
    );
  }

  acceptSuggestion(word, cx) {
    const query = this.search.value();
    const completed = query.slice(0, query.length - lastWord(query).length) + word;
    // A bare qualifier like "label:" still needs its value, so the popup stays for it.
    this.search.set_value(word.endsWith(":") ? completed : `${completed} `);
    this.search.focus();
    this.showSuggestions(cx);
  }

  closeSuggestions(cx) {
    if (!this.suggestionsOpen) return;
    this.suggestionsOpen = false;
    cx.notify();
  }

  moveSuggestion(step, count, cx) {
    this.suggestionIndex = (this.suggestionIndex + step + count) % count;
    cx.notify();
  }

  // ↑ and ↓ pick, Tab accepts and Esc closes; Enter is the input's submit, handled in submitSearch.
  steerSuggestions(event, suggestions, cx) {
    if (!suggestions.length) return;
    if (event.key === "down") this.moveSuggestion(1, suggestions.length, cx);
    else if (event.key === "up") this.moveSuggestion(-1, suggestions.length, cx);
    else if (event.key === "tab") this.acceptSuggestion(suggestions[this.suggestionIndex], cx);
    else if (event.key === "escape") this.closeSuggestions(cx);
    else return;
    cx.stop_propagation();
  }

  showWork(number, cx) {
    this.suggestionsOpen = false;
    this.openWork = number;
    this.refresh(cx);
    cx.notify();
  }

  openLabelPicker(work, cx) {
    // The open-time labels are the diff base: a refresh while open must not turn into edits.
    const applied = new Set(work.labels.map(({ name }) => name));
    this.labelDrafts.set(work.number, { applied, chosen: new Set(applied) });
    this.labelSearch.set_value("");
    this.loadRepoLabels(cx);
    // The popover takes the keyboard as it opens, so take it back once it has.
    cx.timer.after(100, () => this.labelSearch.focus());
    cx.notify();
  }

  toggleDraftLabel(number, name, cx) {
    const { chosen } = this.labelDrafts.get(number);
    if (!chosen.delete(name)) chosen.add(name);
    cx.notify();
  }

  applyLabelDraft(work, cx) {
    const { kind, place } = this;
    const draft = this.labelDrafts.get(work.number);
    this.labelDrafts.delete(work.number);
    cx.notify();
    if (!draft) return;
    const changes = labelEditArgs(draft.applied, draft.chosen);
    if (!changes.length) return;
    cx.spawn(async (cx) => {
      try {
        await gh([KINDS[kind].command, "edit", String(work.number), ...changes], place);
        this.refresh(cx);
      } catch (error) {
        notify({
          title: `Could not change labels on #${work.number}`,
          body: error.message,
          level: "error",
        });
      }
    });
  }

  queued(cache, key, make, cx) {
    const known = cache[key];
    if (!known || known.retry) {
      cache[key] = { error: known?.error };
      this.queue.push({ cache, key, make });
      if (this.queue.length === 1) this.drainQueue(cx);
    }
    return cache[key];
  }

  diagram(source, palette, cx) {
    return this.queued(
      this.diagramsByKey,
      JSON.stringify([source, palette]),
      () => renderMermaid(source, palette),
      cx,
    );
  }

  picture(url, cx) {
    const { place } = this;
    return this.queued(this.imagesByUrl, url, () => downloadImage(url, place), cx);
  }

  // A link to a downloaded image opens it here; any other link, in the browser.
  openLink(url, cx) {
    const name = this.imagesByUrl[url]?.value;
    if (name) return showImage(name);
    // open_url refuses anything but an http/https URL, so a file:// or custom-scheme link does nothing.
    try {
      cx.open_url(url);
    } catch {}
  }

  followSpace(cx) {
    const space = spaces().find(({ id }) => id === props()?.space);
    const folder = space ? terminalFolder(space) : null;
    if (JSON.stringify(folder) === JSON.stringify(this.folder)) return;
    this.folder = folder;
    cx.spawn(async (cx) => {
      // Always yields: a null folder would otherwise reach cx.notify() inside render, which rejects.
      const place = await (folder && repoRoot(folder));
      if (folder !== this.folder || JSON.stringify(place) === JSON.stringify(this.place)) return;
      this.place = place;
      this.labelDrafts.clear();
      this.openWork = null;
      this.refresh(cx);
      cx.notify();
    });
  }

  render(cx) {
    const colors = theme();
    // The full-size dialog showImage opens.
    const shown = props()?.image;
    if (shown)
      return div()
        .size_full()
        .p(8)
        .bg(colors.background)
        .child(image(`${IMAGE_FOLDER}/${shown}`).size_full());
    this.followSpace(cx);
    const page = this.openWork ? this.detailPage(cx, colors) : this.listPage(colors);
    return div()
      .size_full()
      .min_w(0)
      .bg(colors.background)
      .text_size(13)
      .text_color(colors.foreground)
      .child(page);
  }

  listPage(colors) {
    return v_flex()
      .size_full()
      .min_h(0)
      .p(16)
      .gap(10)
      .child(this.kindTabs(colors))
      .child(this.presets(colors))
      .child(this.searchBox(colors))
      .child(this.results(colors));
  }

  kindTabs(colors) {
    return h_flex()
      .flex_none()
      .gap(6)
      .children(
        Object.entries(KINDS).map(([kind, { label }]) =>
          chip(
            `kind-${kind}`,
            label,
            kind === this.kind,
            (_e, cx) => this.setKind(kind, cx),
            colors,
          ),
        ),
      );
  }

  presets(colors) {
    return h_flex()
      .flex_none()
      .gap(6)
      .children(
        PRESETS.map(({ label, query }) =>
          chip(
            `preset-${label}`,
            label,
            query === this.query,
            (_e, cx) => this.setQuery(query, cx),
            colors,
          ),
        ),
      );
  }

  searchBox(colors) {
    const suggestions = this.suggestions();
    const box = div()
      .h(34)
      .px(10)
      .flex()
      .items_center()
      .rounded(7)
      .border(1)
      .border_color(colors.border)
      .child(Input.new(this.search).flex_1().h_full().text_size(13).text_color(colors.foreground));
    return (
      div()
        .id("search")
        .flex_none()
        .on_key_down((event, cx) => this.steerSuggestions(event, suggestions, cx))
        // Not the input's blur: a press on non-focusable space may not move focus.
        .on_mouse_down_out((_e, cx) => this.closeSuggestions(cx))
        .child(
          Popup.new("search-suggestions", box)
            .anchor("top_left")
            .when(suggestions.length, (popup) =>
              popup.content(this.suggestionList(suggestions, colors)),
            ),
        )
    );
  }

  suggestionList(suggestions, colors) {
    return v_flex()
      .id("suggestion-list")
      .min_w(260)
      .p(4)
      .gap(2)
      .rounded(8)
      .border(1)
      .border_color(colors.border)
      .bg(colors.surface)
      .text_size(12)
      .children(
        suggestions.map((word, index) =>
          div()
            .id(`suggestion-${index}`)
            .h(26)
            .px(8)
            .flex()
            .items_center()
            .rounded(5)
            .when(index === this.suggestionIndex, (row) => row.bg(colors.hover))
            .hover((style) => style.bg(colors.hover))
            // Mouse down, not click: the press must land before the input can lose focus.
            .on_mouse_down("left", (_e, cx) => {
              cx.stop_propagation();
              this.acceptSuggestion(word, cx);
            })
            .child(word),
        ),
      );
  }

  results(colors) {
    const list = this.listsByKey[this.listKey()];
    if (!list?.value) return notice(list?.error ?? "Loading…", colors);
    if (!this.iconsReady) return notice("Loading…", colors);
    // Herdr sends no close for a popover whose row is gone, so its draft would reopen on the next row with that number.
    for (const number of this.labelDrafts.keys())
      if (!list.value.some((work) => work.number === number)) this.labelDrafts.delete(number);
    const labelsCell = (work) => this.labelsCell(work, colors);
    return workTable(list.value, ({ number }, cx) => this.showWork(number, cx), labelsCell, colors);
  }

  labelsCell(work, colors) {
    const isOpen = this.labelDrafts.has(work.number);
    const chips = div()
      .id(`labels-${work.number}`)
      .w_full()
      .h(48)
      .flex()
      .flex_wrap()
      .items_center()
      .gap(4)
      .overflow_hidden()
      .rounded(6)
      .hover((style) => style.bg(colors.raised))
      .when(!work.labels.length, (empty) => empty.text_color(colors.dim).child("-"))
      .children(work.labels.map((label) => labelChip(label, colors)));
    const picker = Popover.new(`label-picker-${work.number}`)
      .anchor("top_left")
      .open(isOpen)
      .on_open_change((open, cx) =>
        open ? this.openLabelPicker(work, cx) : this.applyLabelDraft(work, cx),
      )
      .trigger(chips)
      // Only the open one: content rebuilds with its trigger, and every row has one.
      .when(isOpen, (popover) => popover.content(this.labelPicker(work, colors)));
    // Outside the popover, so it still sees the press; the row must not also open.
    return column(LABELS_WIDTH)
      .id(`labels-cell-${work.number}`)
      .on_click((_e, cx) => cx.stop_propagation())
      .child(picker);
  }

  labelPicker(work, colors) {
    const picker = v_flex()
      .id("label-picker")
      .w(LABELS_WIDTH)
      .p(4)
      .gap(2)
      .rounded(8)
      .border(1)
      .border_color(colors.border)
      .bg(colors.surface)
      .text_size(12)
      .child(
        div()
          .h(28)
          .px(8)
          .mb(2)
          .flex()
          .items_center()
          .rounded(5)
          .border(1)
          .border_color(colors.border)
          .child(
            Input.new(this.labelSearch)
              .flex_1()
              .h_full()
              .text_size(12)
              .text_color(colors.foreground),
          ),
      );
    const repoLabels = this.repoLabels();
    if (!repoLabels?.value) return picker.child(notice(repoLabels?.error ?? "Loading…", colors));
    const draft = this.labelDrafts.get(work.number)?.chosen ?? new Set();
    const search = this.labelSearch.value().trim().toLowerCase();
    const matches = repoLabels.value
      .filter(({ name }) => name.toLowerCase().includes(search))
      .slice(0, LABEL_MATCHES_SHOWN);
    if (!matches.length) return picker.child(notice("No matching labels", colors));
    return picker.children(
      matches.map(({ name }) =>
        h_flex()
          .id(`label-option-${name}`)
          .flex_none()
          .h(26)
          .px(8)
          .gap(8)
          .items_center()
          .rounded(5)
          .hover((style) => style.bg(colors.hover))
          .on_click((_e, cx) => {
            cx.stop_propagation();
            this.toggleDraftLabel(work.number, name, cx);
          })
          .child(
            div()
              .w(12)
              .flex_none()
              .child(draft.has(name) ? "✓" : ""),
          )
          .child(div().truncate().child(name)),
      ),
    );
  }

  detailPage(cx, colors) {
    const { value: work, error } = this.detailsByKey[this.detailKey()] ?? {};
    const page = v_flex()
      .size_full()
      .min_h(0)
      .p(16)
      .gap(12)
      .child(detailBar(this.openWork, work, (_e, cx) => this.showWork(null, cx), colors));
    if (!work) return page.child(notice(error ?? "Loading…", colors));
    // Once per page: a theme() per block exhausts the render budget at 2,000 blocks.
    const palette = JSON.stringify(mermaidPalette(colors));
    const sources = {
      diagramOf: (source) => this.diagram(source, palette, cx),
      pictureOf: (url) => this.picture(url, cx),
      onLink: (url, cx) => this.openLink(url, cx),
    };
    return page.child(facts(work, colors)).child(conversation(work, sources, colors));
  }
}

// A space's repo is its first terminal's, as in the shipped `spaces` mod.
function terminalFolder(space) {
  const tabs = new Set(space.tabs.map((tab) => tab.id));
  const cwd = panes().find((pane) => tabs.has(pane.tab) && pane.cwd)?.cwd || space.folder;
  return { cwd, on: space.machine };
}

// A `cd` inside the repo moves the terminal, not the page.
async function repoRoot({ cwd, on }) {
  const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on }).catch(() => null);
  return { cwd: top?.code === 0 ? top.stdout.trim() : cwd, on };
}

async function stdoutOf(command, args, options) {
  const result = await exec(command, args, options);
  if (result.code !== 0)
    throw new Error(result.stderr.trim() || `${command} exited ${result.code}`);
  return result.stdout;
}

const gh = (args, place) => stdoutOf("gh", args, place);

// `--state all`: the search query owns the state, so `is:closed` works.
function listWork(kind, query, place) {
  const { command, listFields } = KINDS[kind];
  return gh(
    [command, "list", "--state", "all", "--search", query, "--limit", "100", "--json", listFields],
    place,
  ).then(JSON.parse);
}

function listRepoLabels(place) {
  // shortcut: labels past 200 do not show, page through them if a repo has more.
  return gh(["label", "list", "--limit", "200", "--json", "name"], place).then(JSON.parse);
}

// gh reads each label flag as one CSV record, so every name is a quoted field.
const csv = (names) => names.map((name) => `"${name.replaceAll('"', '""')}"`).join(",");

function labelEditArgs(applied, chosen) {
  const added = [...chosen].filter((name) => !applied.has(name));
  const removed = [...applied].filter((name) => !chosen.has(name));
  return [
    ...(added.length ? ["--add-label", csv(added)] : []),
    ...(removed.length ? ["--remove-label", csv(removed)] : []),
  ];
}

// shortcut: only the word at the end is completed, and a quoted value with a space in it is not; read the cursor if that matters.
function lastWord(query) {
  return query.slice(query.lastIndexOf(" ") + 1);
}

// Completes the last word once it has a `:`: a qualifier, or a label name after label: or -label:.
// Plain words like `in` get none, so Enter never rewrites free text; a finished word gets none either.
function searchSuggestions(query, qualifiers, labelNames) {
  const word = lastWord(query);
  if (!word.includes(":")) return [];
  const negation = word.startsWith("-") ? "-" : "";
  const typed = word.slice(negation.length).toLowerCase();
  const candidates = typed.startsWith("label:")
    ? labelNames
        .filter((name) =>
          name.toLowerCase().includes(typed.slice("label:".length).replace(/^"/, "")),
        )
        .map((name) => `${negation}label:${name.includes(" ") ? `"${name}"` : name}`)
    : qualifiers
        .filter((qualifier) => qualifier.startsWith(typed))
        .map((qualifier) => negation + qualifier);
  const isFinished = candidates.some((candidate) => candidate.toLowerCase() === word.toLowerCase());
  return isFinished ? [] : candidates;
}

function viewWork(kind, number, place) {
  const { command, viewFields } = KINDS[kind];
  return gh([command, "view", String(number), "--json", viewFields], place).then(JSON.parse);
}

const repoOf = (url) => new URL(url).pathname.split("/").slice(1, 3).join("/");

// Runs here, not on the space's machine: the browser is on this one.
async function openInBrowser({ number, url }) {
  try {
    await gh(["browse", "--repo", repoOf(url), String(number)]);
  } catch (error) {
    notify({ title: `Could not open #${number}`, body: error.message, level: "error" });
  }
}

async function writeStateIcons() {
  const folder = `${appHome()}/${ICON_FOLDER}`;
  await mkdir(folder, { recursive: true });
  const svgOf = (shapes) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${shapes}</svg>`;
  await Promise.all(
    Object.entries(STATE_ICONS).map(([name, shapes]) =>
      writeFile(`${folder}/${name}.svg`, svgOf(shapes)),
    ),
  );
}

async function downloadImage(url, place) {
  const folder = `${appHome()}/${IMAGE_FOLDER}`;
  // A stable file name per URL.
  const name = createHash("sha256").update(url).digest("hex");
  // One temp file per call: tabs in other spaces can fetch the same URL at once.
  const part = `${folder}/${name}.${randomUUID()}.part`;
  const github = /^https:\/\/(github\.com|[\w-]+\.githubusercontent\.com)\//.test(url);
  // The gh wrapper's account rule: the repo's user.name is the login.
  const login = github
    ? (await stdoutOf("git", ["config", "user.name"], place).catch(() => "")).trim()
    : "";
  await mkdir(folder, { recursive: true });
  try {
    const type = await stdoutOf("sh", [
      "-c",
      github ? AUTHED_CURL : `${CURL} </dev/null`,
      "sh",
      url,
      part,
      login,
    ]);
    // Herdr picks the decoder by extension, so only a known image type names the file.
    const extension = type.match(/^image\/(png|jpe?g|gif|webp|svg|bmp)\b/i)?.[1].toLowerCase();
    if (!extension) throw new Error(`Not an image: ${url}`);
    await stdoutOf("mv", [part, `${folder}/${name}.${extension}`]);
    return `${name}.${extension}`;
  } finally {
    await unlink(part).catch(() => {});
  }
}

function showImage(name) {
  openOverlay({ mod: "github", kind: "dialog", width: 0.9, height: 0.9, props: { image: name } });
}

async function renderMermaid(source, palette) {
  return JSON.parse(
    await stdoutOf("mermaid-svg", [source, palette, `${appHome()}/${DIAGRAM_FOLDER}`]),
  );
}

function mermaidPalette(colors) {
  return {
    "--pele-bg": colors.background,
    "--pele-fg": colors.foreground,
    "--pele-muted": colors.muted,
    "--pele-line": colors.muted,
    "--pele-surface": colors.surface,
    "--pele-surface-alt": colors.raised,
    "--pele-border": colors.border,
    "--pele-accent": colors.accent,
  };
}

function notice(text, colors) {
  return div().p(4).text_color(colors.muted).child(text);
}

function chip(id, label, on, action, colors) {
  return div()
    .id(id)
    .flex_none()
    .h(28)
    .px(12)
    .flex()
    .items_center()
    .rounded(7)
    .border(1)
    .text_size(12)
    .font_semibold()
    .border_color(on ? colors.solid : colors.border)
    .bg(on ? colors.solid : colors.background)
    .text_color(on ? colors.solid_foreground : colors.foreground)
    .on_click(action)
    .child(label);
}

// Only PRs are fetched with isDraft.
function statusOf(work) {
  const isPull = "isDraft" in work;
  if (work.state === "MERGED") return { label: "Merged", color: "ansi5", icon: "pr-merged" };
  if (work.state === "CLOSED")
    return {
      label: "Closed",
      color: isPull ? "ansi1" : "ansi5",
      icon: isPull ? "pr-closed" : "issue-closed",
    };
  if (work.isDraft) return { label: "Draft", color: "dim", icon: "pr-draft" };
  return { label: "Open", color: "ansi2", icon: isPull ? "pr-open" : "issue-open" };
}

function statusIcon(work, colors) {
  const { label, color, icon } = statusOf(work);
  return div()
    .id(`status-${work.number}`)
    .flex_none()
    .tooltip(label)
    .accessibility_label(label)
    .child(svg(`${ICON_FOLDER}/${icon}.svg`).size(16).text_color(colors[color]));
}

function statusPill(work, colors) {
  const { label, color } = statusOf(work);
  return div()
    .flex_none()
    .px(9)
    .py(2)
    .rounded(10)
    .border(1)
    .border_color(colors[color])
    .text_size(11)
    .font_semibold()
    .text_color(colors[color])
    .child(label);
}

function workTable(works, onOpen, labelsCell, colors) {
  return v_flex()
    .flex_1()
    .min_h(0)
    .rounded(8)
    .border(1)
    .border_color(colors.border)
    .child(tableHeading(colors))
    .child(
      v_flex()
        .id("work-rows")
        .flex_1()
        .min_h(0)
        .overflow_y_scrollbar()
        .children(works.map((work) => tableRow(work, onOpen, labelsCell, colors))),
    );
}

function tableHeading(colors) {
  return h_flex()
    .h(34)
    .flex_none()
    .px(14)
    .gap(12)
    .items_center()
    .bg(colors.surface)
    .border_b(1)
    .border_color(colors.border)
    .child(column(ID_WIDTH).child(caption("ID", colors)))
    .child(div().flex_1().child(caption("TITLE / CONTEXT", colors)))
    .child(column(LABELS_WIDTH).child(caption("LABELS", colors)))
    .child(column(ASSIGNEES_WIDTH).child(caption("ASSIGNEES", colors)));
}

function column(width) {
  return div().w(width).flex_none();
}

function caption(text, colors) {
  return div().text_size(11).font_semibold().text_color(colors.dim).child(text);
}

function tableRow(work, onOpen, labelsCell, colors) {
  const assignees = work.assignees.map(({ login }) => login).join(", ");
  return h_flex()
    .id(`work-${work.number}`)
    .flex_none()
    .h(60)
    .px(14)
    .gap(12)
    .items_center()
    .border_b(1)
    .border_color(colors.border)
    .hover((style) => style.bg(colors.hover))
    .on_click((_e, cx) => onOpen(work, cx))
    .child(
      column(ID_WIDTH)
        .flex()
        .items_center()
        .gap(8)
        .text_color(colors.dim)
        .child(statusIcon(work, colors))
        .child(`#${work.number}`),
    )
    .child(
      v_flex()
        .flex_1()
        .min_w(0)
        .gap(4)
        .child(div().truncate().font_semibold().child(work.title))
        .child(context(work, colors)),
    )
    .child(labelsCell(work))
    .child(
      column(ASSIGNEES_WIDTH)
        .truncate()
        .text_color(assignees ? colors.foreground : colors.dim)
        .child(assignees || "-"),
    );
}

function context(work, colors) {
  return h_flex()
    .gap(10)
    .items_center()
    .text_size(12)
    .text_color(colors.muted)
    .child(div().flex_none().child(work.author.login))
    .child(div().flex_none().child(repoOf(work.url).split("/")[1]));
}

function labelChip(label, colors) {
  return div()
    .flex_none()
    .px(7)
    .rounded(9)
    .border(1)
    .border_color(colors.border)
    .text_size(11)
    .text_color(colors.muted)
    .child(label.name);
}

function detailBar(number, work, onBack, colors) {
  return h_flex()
    .flex_none()
    .gap(10)
    .items_center()
    .child(barButton("back", "← Back", onBack, colors))
    .child(div().flex_none().text_color(colors.dim).child(`#${number}`))
    .child(
      div()
        .flex_1()
        .min_w(0)
        .truncate()
        .font_semibold()
        .child(work?.title ?? ""),
    )
    .when(work, (bar) =>
      bar
        .child(statusPill(work, colors))
        .child(barButton("open-in-browser", "↗", () => openInBrowser(work), colors)),
    );
}

function barButton(id, text, action, colors) {
  return div()
    .id(id)
    .flex_none()
    .h(28)
    .px(10)
    .flex()
    .items_center()
    .rounded(6)
    .border(1)
    .border_color(colors.border)
    .text_color(colors.muted)
    .hover((style) => style.bg(colors.hover))
    .on_click(action)
    .child(text);
}

function facts(work, colors) {
  const items = [work.author.login, ...work.labels.map(({ name }) => name), ...pullFacts(work)];
  return h_flex()
    .flex_none()
    .gap(10)
    .text_size(12)
    .text_color(colors.muted)
    .children(items.map((item) => div().flex_none().child(item)));
}

function pullFacts(work) {
  if (!work.headRefName) return [];
  return [
    `${work.headRefName} → ${work.baseRefName}`,
    `+${work.additions} -${work.deletions}`,
    `${work.changedFiles} files`,
  ];
}

function conversation(work, sources, colors) {
  const postOf = (id, author, body) => post(author, bodyParts(id, body, sources, colors), colors);
  return v_flex()
    .id("work-posts")
    .flex_1()
    .min_h(0)
    .gap(12)
    .overflow_y_scrollbar()
    .child(postOf("work-body", work.author.login, work.body))
    .children(
      work.comments.map(({ author, body }, index) =>
        postOf(`comment-${index}`, author.login, body),
      ),
    );
}

function post(author, parts, colors) {
  return v_flex()
    .flex_none()
    .rounded(8)
    .border(1)
    .border_color(colors.border)
    .child(
      div()
        .px(14)
        .py(8)
        .text_size(12)
        .text_color(colors.muted)
        .bg(colors.surface)
        .border_b(1)
        .border_color(colors.border)
        .child(author),
    )
    .child(v_flex().p(14).gap(10).children(parts));
}

// Diagram sources sit at odd indexes.
function splitDiagrams(body) {
  const parts = [];
  let cursor = 0;
  for (const match of body.matchAll(CODE_FENCE)) {
    if (match[3] !== "mermaid") continue;
    parts.push(body.slice(cursor, match.index), match[4]);
    cursor = match.index + match[0].length;
  }
  parts.push(body.slice(cursor));
  return parts;
}

function bodyParts(id, body, { diagramOf, pictureOf, onLink }, colors) {
  const urls = new Set();
  const imageLink = (imageUrl, alt, href = imageUrl) => {
    urls.add(imageUrl);
    return `[🖼 ${alt.replace(/[[\]]/g, "") || "image"}](${href})`;
  };
  const parts = splitDiagrams(body || "No description")
    .map((part, index) => {
      const partId = `${id}-${index}`;
      if (index % 2) return diagramPart(partId, part, diagramOf(part), onLink, colors);
      // shortcut: images inside code blocks become links too, rare in issue and PR bodies.
      const text = part
        .replace(LINKED_IMAGE, (_, alt, imageUrl, href) => imageLink(imageUrl, alt, href))
        .replace(IMAGE, (tag, alt, markdownUrl, htmlUrl) =>
          imageLink(markdownUrl ?? htmlUrl, alt ?? tag.match(/\balt=["']([^"']*)/i)?.[1] ?? ""),
        );
      return text.trim() && markdown(partId, text, onLink);
    })
    .filter(Boolean);
  if (!urls.size) return parts;
  return [
    ...parts,
    h_flex()
      .flex_wrap()
      .gap(8)
      .children(
        [...urls].map((url, index) => thumbnail(`${id}-image-${index}`, pictureOf(url), colors)),
      ),
  ];
}

function markdown(id, text, onLink) {
  return TextView.markdown(id, text).selectable().on_link_click(onLink);
}

function thumbnail(id, { value, error }, colors) {
  const frame = div()
    .id(id)
    .flex_none()
    .w(240)
    .h(140)
    .rounded(6)
    .border(1)
    .border_color(colors.border)
    .overflow_hidden();
  if (!value)
    return frame
      .p(8)
      .text_size(11)
      .text_color(colors.muted)
      .child(error ?? "Loading image…");
  return frame
    .cursor_pointer()
    .hover((style) => style.border_color(colors.accent))
    .on_click(() => showImage(value))
    .child(image(`${IMAGE_FOLDER}/${value}`).size_full());
}

function diagramPart(id, source, { value, error }, onLink, colors) {
  if (value) {
    return div()
      .id(id)
      .overflow_x_scrollbar()
      .child(image(`${DIAGRAM_FOLDER}/${value.name}`).flex_none().w(value.width).h(value.height));
  }
  if (!error) return notice("Rendering diagram…", colors);
  return v_flex()
    .gap(6)
    .child(notice(error, colors))
    .child(markdown(id, `\`\`\`mermaid\n${source}\`\`\``, onLink));
}
