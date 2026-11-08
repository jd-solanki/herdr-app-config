// Open issues and PRs from every repo the gh account sees, in one list, as on github.com/issues.

import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { ACROSS_REPOS_QUALIFIERS, SearchBox, queryWords } from "./github-search/index.js";
import { exec, theme as herdrTheme } from "herdr";

// herdr.d.ts types the theme as plain strings; its values are #rrggbb colors.
const theme = () => herdrTheme();

const DEFAULT_QUERY = "state:open assignee:@me";
// A query the person submits outlives restarts; DEFAULT_QUERY only seeds a fresh install.
const QUERY_KEY = "query";
const REFRESH_MS = 60_000;
const FIELDS =
  "repository,number,title,author,createdAt,updatedAt,commentsCount,labels,isPullRequest,url";
// The path names the mod's folder: renaming the mod changes it too.
const ICONS = "mods/github-inbox";

export default class GithubInbox extends View {
  // Label names by repo, for the repo a query names with repo:owner/name.

  init(_props, cx) {
    this.query = localStorage.getItem(QUERY_KEY) ?? DEFAULT_QUERY;
    this.list = null;
    this.repoLabels = {};
    this.search = new SearchBox({
      query: this.query,
      height: 32,
      qualifiers: () => ACROSS_REPOS_QUALIFIERS,
      labels: () => this.labelNames(),
      needLabels: (cx) => this.loadRepoLabels(cx),
      submit: (query, cx) => {
        this.query = query;
        localStorage.setItem(QUERY_KEY, this.query);
        this.list = null;
        this.refresh(cx);
        cx.notify();
      },
    });
    cx.timer.every(REFRESH_MS, (cx) => this.refresh(cx));
    this.refresh(cx);
  }

  // Labels on the results shown, as across repos there is no one repo to list; plus every label
  // of the repo the query names, once fetched.
  labelNames() {
    const shown = (this.list?.value ?? []).flatMap((work) => work.labels.map(({ name }) => name));
    const named = this.repoLabels[namedRepo(this.search.value()) ?? ""] ?? [];
    return [...new Set([...named, ...shown])].sort((a, b) => a.localeCompare(b));
  }

  loadRepoLabels(cx) {
    const repo = namedRepo(this.search.value());
    if (!repo || repo in this.repoLabels) return;
    this.repoLabels[repo] = null;
    cx.spawn(async (cx) => {
      const result = await exec("gh", [
        "label",
        "list",
        "-R",
        repo,
        "--limit",
        "500",
        "--json",
        "name",
      ]);
      // A repo gh can't read keeps the labels on the results.
      if (result.code === 0)
        this.repoLabels[repo] = JSON.parse(result.stdout).map(({ name }) => name);
      cx.notify();
    });
  }

  refresh(cx) {
    const query = this.query;
    cx.spawn(async (cx) => {
      try {
        const works = await searchWork(query);
        if (query === this.query) this.list = { value: works };
      } catch (error) {
        // A network blip keeps the last good result.
        if (query === this.query && !this.list?.value) this.list = { error: error.message };
      }
      cx.notify();
    });
  }

  render() {
    const colors = theme();
    return v_flex()
      .size_full()
      .min_w(0)
      .p(10)
      .gap(10)
      .bg(colors.background)
      .text_size(13)
      .text_color(colors.foreground)
      .child(this.search.render(colors))
      .child(this.results(colors));
  }

  results(colors) {
    const box = v_flex()
      .flex_1()
      .min_h(0)
      .rounded(8)
      .border(1)
      .border_color(colors.border)
      .overflow_hidden();
    const { value, error } = this.list ?? {};
    const count = value
      ? `${value.length} result${value.length === 1 ? "" : "s"}`
      : error
        ? "Error"
        : "Loading…";
    return box
      .child(
        div()
          .flex_none()
          .px(12)
          .py(9)
          .bg(colors.surface)
          .border_b(1)
          .border_color(colors.border)
          .font_semibold()
          .child(count),
      )
      .when(Boolean(error), (box) => box.child(div().p(12).text_color(colors.muted).child(error)))
      .when(Boolean(value), (box) =>
        box.child(
          v_flex()
            .id("github-inbox-rows")
            .flex_1()
            .min_h(0)
            .overflow_y_scrollbar()
            .children(value.map((work) => row(work, colors))),
        ),
      );
  }
}

async function searchWork(query) {
  const args = [
    "search",
    "issues",
    ...queryWords(query),
    "--include-prs",
    "--sort",
    "updated",
    "--limit",
    "100",
    "--json",
    FIELDS,
  ];
  // No cwd: the gh wrapper then takes the global account, the one that sees every repo.
  const result = await exec("gh", args);
  if (result.code !== 0) throw new Error(result.stderr.trim() || `gh exited ${result.code}`);
  return JSON.parse(result.stdout);
}

function row(work, colors) {
  const icon = svg(`${ICONS}/${work.isPullRequest ? "pr" : "issue"}.svg`)
    .size(16)
    .flex_none()
    .mt(2)
    .text_color(colors.ansi2);
  const meta = `${work.repository.nameWithOwner}#${work.number} · ${work.author.login} opened ${ago(work.createdAt)} · Updated ${ago(work.updatedAt)}`;
  return (
    h_flex()
      .id(`work-${work.url}`)
      .flex_none()
      .px(12)
      .py(10)
      .gap(8)
      .items_start()
      .border_b(1)
      .border_color(colors.border)
      .cursor_pointer()
      .hover((style) => style.bg(colors.hover))
      // open_url refuses anything but an http/https URL.
      .on_click((_e, cx) => {
        try {
          cx.open_url(work.url);
        } catch {}
      })
      .child(icon)
      .child(
        v_flex()
          .flex_1()
          .min_w(0)
          .gap(4)
          .child(div().font_semibold().child(work.title))
          .child(div().text_size(12).text_color(colors.muted).child(meta))
          .child(h_flex().flex_wrap().gap(4).children(work.labels.map(labelChip))),
      )
      .when(work.commentsCount > 0, (el) =>
        el.child(
          h_flex()
            .flex_none()
            .gap(4)
            .items_center()
            .text_size(12)
            .text_color(colors.muted)
            .child(svg(`${ICONS}/comment.svg`).size(14).text_color(colors.muted))
            .child(String(work.commentsCount)),
        ),
      )
  );
}

function labelChip({ name, color }) {
  return div()
    .flex_none()
    .px(8)
    .rounded(10)
    .text_size(11)
    .font_semibold()
    .bg(`#${color}`)
    .text_color(textOn(color))
    .child(name);
}

// GitHub's own rule is fancier; perceived brightness picks dark or light text well enough.
function textOn(hex) {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#1f2328" : "#ffffff";
}

function ago(iso, now = Date.now()) {
  const seconds = Math.max(0, (now - Date.parse(iso)) / 1000);
  const steps = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, size] of steps) {
    const n = Math.floor(seconds / size);
    if (n >= 1) return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
  }
  return "now";
}

// The repo a query names with repo:owner/name, the one whose labels it can list.
function namedRepo(query) {
  // It starts with a word character, so gh never reads it as a flag.
  return query.match(/(?:^|\s)repo:(\w[\w.-]*\/\w[\w.-]*)(?=\s|$)/)?.[1];
}
