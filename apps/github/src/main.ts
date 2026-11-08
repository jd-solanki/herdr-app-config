import { mkdir, unlink } from "fs/promises";
import { createHash, randomUUID } from "crypto";
import {
  View,
  div,
  image,
  svg,
  type AsyncContext,
  type ClickEvent,
  type Color,
  type Context,
  type Element,
} from "gpui-kit";
import { Input, InputState, Popover, TextView, h_flex, v_flex } from "gpui-base";
import { ISSUE_QUALIFIERS, PULL_QUALIFIERS, SearchBox } from "@herdr-app-config/github-search";
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
  type SpaceInfo,
} from "herdr";

type Colors = Record<string, Color>;
type Kind = keyof typeof KINDS;
type Place = { cwd: string; on: string | null };
type Login = { login: string };
type Label = { name: string };
type Work = {
  number: number;
  title: string;
  author: Login;
  labels: Label[];
  state: "OPEN" | "CLOSED" | "MERGED";
  url: string;
  isDraft?: boolean;
};
type ListedWork = Work & { assignees: Login[] };
type WorkDetail = Work & {
  body: string;
  comments: { author: Login; body: string }[];
  headRefName?: string;
  baseRefName?: string;
  additions?: number;
  deletions?: number;
  changedFiles?: number;
};
type Diagram = { name: string; width: number; height: number };
type Entry<T> = { value?: T; error?: string; retry?: boolean };
type Cache<T> = Record<string, Entry<T>>;
type LabelDraft = { applied: Set<string>; chosen: Set<string> };
type ClickHandler = (event: ClickEvent, cx: Context) => void;
type LinkHandler = (url: string, cx: Context) => void;
type Sources = {
  diagramOf: (source: string) => Entry<Diagram>;
  pictureOf: (url: string) => Entry<string>;
  onLink: LinkHandler;
};
// Herdr's runtime has the global URL; its generated types don't declare it.
declare const URL: new (url: string) => { pathname: string };

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

const QUALIFIERS = { issues: ISSUE_QUALIFIERS, pulls: PULL_QUALIFIERS };

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
// Shipped beside main.js; the path names the mod's folder, so renaming the mod changes it too.
const MOD_FOLDER = "mods/github";
const IMAGE_FOLDER = "data/github/images";
// TextView draws no images, so each becomes a link, and a GitHub-hosted one also a thumbnail. Groups: markdown alt, markdown URL, <img> src.
const IMAGE = /!\[([^\]]*)\]\(\s*<?([^\s)>]+)>?[^)]*\)|<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
// Only these are downloaded: any other host would learn your IP and when you read the post.
const GITHUB_ASSET = /^https:\/\/(github\.com|[\w-]+\.githubusercontent\.com)\//;
// A linked image, [![alt](image)](href): one link to href, so no link sits inside another. Groups: alt, image URL, href.
const LINKED_IMAGE = /\[\s*!\[([^\]]*)\]\(\s*<?([^\s)>]+)>?[^)]*\)\s*\]\(\s*<?([^\s)>]+)>?[^)]*\)/g;
// The token goes in on stdin, so argv never shows it, and curl drops it on the redirect to S3.
const AUTHED_CURL = `gh auth token \${3:+-u "$3"} | sed 's/^/Authorization: token /' | curl -fsSLg --proto =https --proto-redir =https --max-filesize 20M --max-time 25 -H @- -w '%{content_type}' -o "$2" -- "$1"`;

export default class GitHub extends View {
  declare spaceId: string;
  declare kind: Kind;
  declare query: string;
  declare openWork: number | null;
  declare listsByKey: Cache<ListedWork[]>;
  declare detailsByKey: Cache<WorkDetail>;
  declare diagramsByKey: Cache<Diagram>;
  declare imagesByUrl: Cache<string>;
  declare queue: { cache: Cache<unknown>; key: string; make: () => Promise<unknown> }[];
  declare repoLabelsByKey: Cache<Label[]>;
  declare labelDrafts: Map<number, LabelDraft>;
  declare labelSearch: InputState;
  declare search: SearchBox;
  declare folder: Place | null;
  declare place: Place | null;

  init(_props: unknown, cx: AsyncContext) {
    // A mod pane can't see its own tab, so without props.space it takes the space shown when it
    // starts: a key or tab.new opens it in the active space.
    this.spaceId = props()?.space ?? spaces().find((space) => space.active)?.id;
    const lastView = shared(LAST_VIEW_KEY) as { kind?: Kind; query?: unknown } | null;
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
    this.labelDrafts = new Map<number, LabelDraft>();
    this.labelSearch = InputState.new({ placeholder: "Search labels" });
    this.labelSearch.on("change", (_e, cx) => cx.notify());
    this.search = new SearchBox({
      query: this.query,
      qualifiers: () => QUALIFIERS[this.kind],
      labels: () => this.repoLabels()?.value?.map(({ name }) => name) ?? [],
      needLabels: (cx) => {
        if (!this.repoLabels()) this.loadRepoLabels(cx);
      },
      submit: (query, cx) => this.setQuery(query, cx),
    });
    cx.timer.every(REFRESH_MS, (cx) => this.refresh(cx));
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

  loadRepoLabels(cx: Context) {
    this.load(this.repoLabelsByKey, this.repoLabelsKey(), () => listRepoLabels(this.place), cx);
  }

  refresh(cx: Context) {
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

  load<T>(cache: Cache<T>, key: string, fetchLatest: () => Promise<T>, cx: Context) {
    cx.spawn(async (cx) => {
      await this.settle(cache, key, fetchLatest);
      cx.notify();
    });
  }

  async settle<T>(cache: Cache<T>, key: string, fetchLatest: () => Promise<T>) {
    try {
      cache[key] = { value: await fetchLatest() };
    } catch (error) {
      // A network blip keeps the last good result.
      if (!cache[key]?.value) cache[key] = { error: (error as Error).message };
    }
  }

  // Fetched text sets the job count, and cx.spawn throws at 1024 outstanding host tasks.
  drainQueue(cx: Context) {
    cx.spawn(async (cx) => {
      while (this.queue.length) {
        const { cache, key, make } = this.queue[0];
        await this.settle(cache, key, make);
        this.queue.shift();
        cx.notify();
      }
    });
  }

  setQuery(query: string, cx: Context) {
    this.query = query;
    this.search.set(query);
    this.rememberView();
    this.refresh(cx);
    cx.notify();
  }

  setKind(kind: Kind, cx: Context) {
    this.kind = kind;
    this.labelDrafts.clear();
    this.search.close();
    this.rememberView();
    this.refresh(cx);
    cx.notify();
  }

  rememberView() {
    setShared(LAST_VIEW_KEY, { kind: this.kind, query: this.query });
  }

  showWork(number: number | null, cx: Context) {
    this.search.close();
    this.openWork = number;
    this.refresh(cx);
    cx.notify();
  }

  openLabelPicker(work: Work, cx: Context) {
    // The open-time labels are the diff base: a refresh while open must not turn into edits.
    const applied = new Set(work.labels.map(({ name }) => name));
    this.labelDrafts.set(work.number, { applied, chosen: new Set(applied) });
    this.labelSearch.set_value("");
    this.loadRepoLabels(cx);
    // The popover takes the keyboard as it opens, so take it back once it has.
    cx.timer.after(100, () => this.labelSearch.focus());
    cx.notify();
  }

  toggleDraftLabel(number: number, name: string, cx: Context) {
    const { chosen } = this.labelDrafts.get(number);
    if (!chosen.delete(name)) chosen.add(name);
    cx.notify();
  }

  applyLabelDraft(work: Work, cx: Context) {
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
          body: (error as Error).message,
          level: "error",
        });
      }
    });
  }

  queued<T>(cache: Cache<T>, key: string, make: () => Promise<T>, cx: Context) {
    const known = cache[key];
    if (!known || known.retry) {
      cache[key] = { error: known?.error };
      this.queue.push({ cache, key, make });
      if (this.queue.length === 1) this.drainQueue(cx);
    }
    return cache[key];
  }

  diagram(source: string, palette: string, cx: Context) {
    return this.queued(
      this.diagramsByKey,
      JSON.stringify([source, palette]),
      () => renderMermaid(source, palette),
      cx,
    );
  }

  picture(url: string, cx: Context) {
    const { place } = this;
    return this.queued(this.imagesByUrl, url, () => downloadImage(url, place), cx);
  }

  // A link to a downloaded image opens it here; any other link, in the browser.
  openLink(url: string, cx: Context) {
    const name = this.imagesByUrl[url]?.value;
    if (name) return showImage(name);
    // open_url refuses anything but an http/https URL, so a file:// or custom-scheme link does nothing.
    try {
      cx.open_url(url);
    } catch {}
  }

  followSpace(cx: Context) {
    const space = spaces().find(({ id }) => id === this.spaceId);
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

  render(cx: Context) {
    const colors = theme() as Colors;
    // The full-size dialog showImage opens.
    const shown: string | undefined = props()?.image;
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

  listPage(colors: Colors) {
    return v_flex()
      .size_full()
      .min_h(0)
      .p(16)
      .gap(10)
      .child(this.kindTabs(colors))
      .child(this.presets(colors))
      .child(this.search.render(colors))
      .child(this.results(colors));
  }

  kindTabs(colors: Colors) {
    return h_flex()
      .flex_none()
      .gap(6)
      .children(
        Object.entries(KINDS).map(([kind, { label }]) =>
          chip(
            `kind-${kind}`,
            label,
            kind === this.kind,
            (_e, cx) => this.setKind(kind as Kind, cx),
            colors,
          ),
        ),
      );
  }

  presets(colors: Colors) {
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

  results(colors: Colors) {
    const list = this.listsByKey[this.listKey()];
    if (!list?.value) return notice(list?.error ?? "Loading…", colors);
    // Herdr sends no close for a popover whose row is gone, so its draft would reopen on the next row with that number.
    for (const number of this.labelDrafts.keys())
      if (!list.value.some((work) => work.number === number)) this.labelDrafts.delete(number);
    const labelsCell = (work: ListedWork) => this.labelsCell(work, colors);
    return workTable(list.value, ({ number }, cx) => this.showWork(number, cx), labelsCell, colors);
  }

  labelsCell(work: Work, colors: Colors) {
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

  labelPicker(work: Work, colors: Colors) {
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

  detailPage(cx: Context, colors: Colors) {
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
    const sources: Sources = {
      diagramOf: (source) => this.diagram(source, palette, cx),
      pictureOf: (url) => this.picture(url, cx),
      onLink: (url, cx) => this.openLink(url, cx),
    };
    return page.child(facts(work, colors)).child(conversation(work, sources, colors));
  }
}

// A space's repo is its first terminal's, as in the shipped `spaces` mod.
function terminalFolder(space: SpaceInfo): Place {
  const tabs = new Set(space.tabs.map((tab) => tab.id));
  const cwd = panes().find((pane) => tabs.has(pane.tab) && pane.cwd)?.cwd || space.folder;
  return { cwd, on: space.machine };
}

// A `cd` inside the repo moves the terminal, not the page.
async function repoRoot({ cwd, on }: Place): Promise<Place> {
  const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on }).catch(
    (): null => null,
  );
  return { cwd: top?.code === 0 ? top.stdout.trim() : cwd, on };
}

async function stdoutOf(command: string, args: string[], options?: Place) {
  const result = await exec(command, args, options);
  if (result.code !== 0)
    throw new Error(result.stderr.trim() || `${command} exited ${result.code}`);
  return result.stdout;
}

const gh = (args: string[], place?: Place) => stdoutOf("gh", args, place);

// `--state all`: the search query owns the state, so `is:closed` works.
function listWork(kind: Kind, query: string, place: Place): Promise<ListedWork[]> {
  const { command, listFields } = KINDS[kind];
  return gh(
    [command, "list", "--state", "all", "--search", query, "--limit", "100", "--json", listFields],
    place,
  ).then(JSON.parse);
}

function listRepoLabels(place: Place): Promise<Label[]> {
  // shortcut: labels past 200 do not show, page through them if a repo has more.
  return gh(["label", "list", "--limit", "200", "--json", "name"], place).then(JSON.parse);
}

// gh reads each label flag as one CSV record, so every name is a quoted field.
const csv = (names: string[]) => names.map((name) => `"${name.replaceAll('"', '""')}"`).join(",");

function labelEditArgs(applied: Set<string>, chosen: Set<string>) {
  const added = [...chosen].filter((name) => !applied.has(name));
  const removed = [...applied].filter((name) => !chosen.has(name));
  return [
    ...(added.length ? ["--add-label", csv(added)] : []),
    ...(removed.length ? ["--remove-label", csv(removed)] : []),
  ];
}

function viewWork(kind: Kind, number: number, place: Place): Promise<WorkDetail> {
  const { command, viewFields } = KINDS[kind];
  return gh([command, "view", String(number), "--json", viewFields], place).then(JSON.parse);
}

const repoOf = (url: string) => new URL(url).pathname.split("/").slice(1, 3).join("/");

// Runs here, not on the space's machine: the browser is on this one.
async function openInBrowser({ number, url }: Work) {
  try {
    await gh(["browse", "--repo", repoOf(url), String(number)]);
  } catch (error) {
    notify({ title: `Could not open #${number}`, body: (error as Error).message, level: "error" });
  }
}

async function downloadImage(url: string, place: Place) {
  const folder = `${appHome()}/${IMAGE_FOLDER}`;
  // A stable file name per URL.
  const name = createHash("sha256").update(url).digest("hex");
  // One temp file per call: tabs in other spaces can fetch the same URL at once.
  const part = `${folder}/${name}.${randomUUID()}.part`;
  // The gh token goes with every request, so no other host is ever fetched.
  if (!GITHUB_ASSET.test(url)) throw new Error(`Not a GitHub image: ${url}`);
  // The gh wrapper's account rule: the repo's user.name is the login.
  const login = (await stdoutOf("git", ["config", "user.name"], place).catch(() => "")).trim();
  await mkdir(folder, { recursive: true });
  try {
    const type = await stdoutOf("sh", ["-c", AUTHED_CURL, "sh", url, part, login]);
    // Herdr picks the decoder by extension, so only a known image type names the file.
    const extension = type.match(/^image\/(png|jpe?g|gif|webp|svg|bmp)\b/i)?.[1].toLowerCase();
    if (!extension) throw new Error(`Not an image: ${url}`);
    await stdoutOf("mv", [part, `${folder}/${name}.${extension}`]);
    return `${name}.${extension}`;
  } finally {
    await unlink(part).catch(() => {});
  }
}

function showImage(name: string) {
  openOverlay({ mod: "github", kind: "dialog", width: 0.9, height: 0.9, props: { image: name } });
}

async function renderMermaid(source: string, palette: string): Promise<Diagram> {
  return JSON.parse(
    await stdoutOf("bun", [
      `${appHome()}/${MOD_FOLDER}/mermaid-svg`,
      source,
      palette,
      `${appHome()}/${DIAGRAM_FOLDER}`,
    ]),
  );
}

function mermaidPalette(colors: Colors) {
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

function notice(text: string, colors: Colors) {
  return div().p(4).text_color(colors.muted).child(text);
}

function chip(id: string, label: string, on: boolean, action: ClickHandler, colors: Colors) {
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
function statusOf(work: Work) {
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

function statusIcon(work: Work, colors: Colors) {
  const { label, color, icon } = statusOf(work);
  return div()
    .id(`status-${work.number}`)
    .flex_none()
    .tooltip(label)
    .accessibility_label(label)
    .child(svg(`${MOD_FOLDER}/${icon}.svg`).size(16).text_color(colors[color]));
}

function statusPill(work: Work, colors: Colors) {
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

function workTable(
  works: ListedWork[],
  onOpen: (work: ListedWork, cx: Context) => void,
  labelsCell: (work: ListedWork) => Element,
  colors: Colors,
) {
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

function tableHeading(colors: Colors) {
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

function column(width: number) {
  return div().w(width).flex_none();
}

function caption(text: string, colors: Colors) {
  return div().text_size(11).font_semibold().text_color(colors.dim).child(text);
}

function tableRow(
  work: ListedWork,
  onOpen: (work: ListedWork, cx: Context) => void,
  labelsCell: (work: ListedWork) => Element,
  colors: Colors,
) {
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

function context(work: Work, colors: Colors) {
  return h_flex()
    .gap(10)
    .items_center()
    .text_size(12)
    .text_color(colors.muted)
    .child(div().flex_none().child(work.author.login))
    .child(div().flex_none().child(repoOf(work.url).split("/")[1]));
}

function labelChip(label: Label, colors: Colors) {
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

function detailBar(number: number, work: WorkDetail, onBack: ClickHandler, colors: Colors) {
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

function barButton(id: string, text: string, action: ClickHandler, colors: Colors) {
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

function facts(work: WorkDetail, colors: Colors) {
  const items = [work.author.login, ...work.labels.map(({ name }) => name), ...pullFacts(work)];
  return h_flex()
    .flex_none()
    .gap(10)
    .text_size(12)
    .text_color(colors.muted)
    .children(items.map((item) => div().flex_none().child(item)));
}

function pullFacts(work: WorkDetail) {
  if (!work.headRefName) return [];
  return [
    `${work.headRefName} → ${work.baseRefName}`,
    `+${work.additions} -${work.deletions}`,
    `${work.changedFiles} files`,
  ];
}

function conversation(work: WorkDetail, sources: Sources, colors: Colors) {
  const postOf = (id: string, author: string, body: string) =>
    post(author, bodyParts(id, body, sources, colors), colors);
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

function post(author: string, parts: (Element | string)[], colors: Colors) {
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
function splitDiagrams(body: string) {
  const parts: string[] = [];
  let cursor = 0;
  for (const match of body.matchAll(CODE_FENCE)) {
    if (match[3] !== "mermaid") continue;
    parts.push(body.slice(cursor, match.index), match[4]);
    cursor = match.index + match[0].length;
  }
  parts.push(body.slice(cursor));
  return parts;
}

function bodyParts(
  id: string,
  body: string,
  { diagramOf, pictureOf, onLink }: Sources,
  colors: Colors,
) {
  const urls = new Set<string>();
  const imageLink = (imageUrl: string, alt: string, href = imageUrl) => {
    if (GITHUB_ASSET.test(imageUrl)) urls.add(imageUrl);
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

function markdown(id: string, text: string, onLink: LinkHandler) {
  return TextView.markdown(id, text).selectable().on_link_click(onLink);
}

function thumbnail(id: string, { value, error }: Entry<string>, colors: Colors) {
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

function diagramPart(
  id: string,
  source: string,
  { value, error }: Entry<Diagram>,
  onLink: LinkHandler,
  colors: Colors,
) {
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
