// Open issues and PRs from every repo the gh account sees, in one list, as on github.com/issues.

import { View, div, svg } from "gpui-kit";
import { Input, InputState, h_flex, v_flex } from "gpui-base";
import { exec, theme as herdrTheme } from "herdr";

/** @import { AsyncContext, Color } from "gpui-kit" */
/** @typedef {{ name: string, color: string }} Label */
/** @typedef {{ repository: { nameWithOwner: string }, number: number, title: string, author: { login: string }, createdAt: string, updatedAt: string, commentsCount: number, labels: Label[], isPullRequest: boolean, url: string }} Work */
/** @typedef {Record<string, Color>} Colors */

// herdr.d.ts types the theme as plain strings; its values are #rrggbb colors.
const theme = () => /** @type {Colors} */ (/** @type {unknown} */ (herdrTheme()));

const DEFAULT_QUERY = "state:open assignee:@me";
// A query the person submits outlives restarts; DEFAULT_QUERY only seeds a fresh install.
const QUERY_KEY = "query";
const REFRESH_MS = 60_000;
const FIELDS =
  "repository,number,title,author,createdAt,updatedAt,commentsCount,labels,isPullRequest,url";
// The path names the mod's folder: renaming the mod changes it too.
const ICONS = "mods/github-inbox";

export default class GithubInbox extends View {
  /** @param {unknown} _props @param {AsyncContext} cx */
  init(_props, cx) {
    this.query = localStorage.getItem(QUERY_KEY) ?? DEFAULT_QUERY;
    /** @type {{ value?: Work[], error?: string } | null} */
    this.list = null;
    this.search = InputState.new({ placeholder: "GitHub search query" });
    this.search.set_value(this.query);
    this.search.on("submit", (_e, cx) => {
      this.query = this.search.value();
      localStorage.setItem(QUERY_KEY, this.query);
      this.list = null;
      this.refresh(cx);
      cx.notify();
    });
    cx.timer.every(REFRESH_MS, (cx) => this.refresh(cx));
    this.refresh(cx);
  }

  /** @param {AsyncContext} cx */
  refresh(cx) {
    const query = this.query;
    cx.spawn(async (cx) => {
      try {
        const works = await searchWork(query);
        if (query === this.query) this.list = { value: works };
      } catch (error) {
        // A network blip keeps the last good result.
        if (query === this.query && !this.list?.value)
          this.list = { error: /** @type {Error} */ (error).message };
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
      .child(
        div()
          .h(32)
          .px(10)
          .flex()
          .flex_none()
          .items_center()
          .rounded(7)
          .border(1)
          .border_color(colors.border)
          .child(
            Input.new(this.search).flex_1().h_full().text_size(13).text_color(colors.foreground),
          ),
      )
      .child(this.results(colors));
  }

  /** @param {Colors} colors */
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

// shortcut: words split on spaces, so a quoted value with a space in it breaks; parse quotes if a query needs one.
/** @param {string} query @returns {Promise<Work[]>} */
async function searchWork(query) {
  const args = [
    "search",
    "issues",
    ...query.split(/\s+/).filter(Boolean),
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

/** @param {Work} work @param {Colors} colors */
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

/** @param {Label} label */
function labelChip({ name, color }) {
  return div()
    .flex_none()
    .px(8)
    .rounded(10)
    .text_size(11)
    .font_semibold()
    .bg(/** @type {Color} */ (`#${color}`))
    .text_color(textOn(color))
    .child(name);
}

// GitHub's own rule is fancier; perceived brightness picks dark or light text well enough.
/** @param {string} hex @returns {Color} */
function textOn(hex) {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#1f2328" : "#ffffff";
}

/** @param {string} iso @param {number} now */
function ago(iso, now = Date.now()) {
  const seconds = Math.max(0, (now - Date.parse(iso)) / 1000);
  /** @type {[string, number][]} */
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
