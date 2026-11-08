// Agents in priority sections that fold: Needs you, Done, Working, Idle, under any pinned.
// Parents take their most urgent sub-agent's place. A viewed done agent stays in Done until left.

import { View, div, image, svg, type AsyncContext, type Color } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import {
  agents,
  terminals,
  panes,
  focused,
  spaces,
  run,
  theme,
  shared,
  setShared,
  setAgentOrder,
  window,
  layout,
  type AgentInfo,
  type PaneInfo,
  type Program,
  type Status,
  type TabInfo,
} from "herdr";

type LayoutNode = { id?: string; size?: { px?: number }; children?: LayoutNode[] };
/** A live sub-agent (a terminals() entry) with the tree lines in front of it. */
type Sub = { t: any; lines: string[] };
type Group = { id: string; label: string; status: Status | null; members: AgentInfo[] };

// herdr.d.ts types the theme as plain strings; its values are #rrggbb colors.
const colors = () => theme() as Record<string, Color>;
/** @param alpha two hex digits */
const fade = (color: Color, alpha: string): Color => `${color}${alpha}`;

function find(node: LayoutNode, id: string): LayoutNode | null {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
// herdr.d.ts leaves layout() unknown.
const sidebar = () => find(layout() as LayoutNode, "sidebar");
const narrow = () => (sidebar()?.size?.px ?? Infinity) < 160;

// To the rail (on macOS wide enough for the traffic lights), or back to the width it had.
function toggleSidebar() {
  const width = sidebar()?.size?.px;
  if (!narrow()) setShared("sidebar.width", width);
  // Mods edited before the rail went by width still read the flag.
  setShared("sidebar.collapsed", !narrow());
  run("layout.resize", {
    id: "sidebar",
    px: narrow() ? (shared("sidebar.width") ?? 268) : window()?.platform === "macos" ? 76 : 44,
  });
}

const clean = (s: string | null | undefined) => (s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();

function leadPanes(all: PaneInfo[]) {
  const leads: Map<string, PaneInfo> = new Map();
  for (const p of all) {
    if (!p.terminal) continue;
    const current = leads.get(p.tab);
    // First agent, else first focused terminal, else first terminal in the tab.
    if (
      !current ||
      (!current.program?.agent && (p.program?.agent || (!current.focused && p.focused)))
    )
      leads.set(p.tab, p);
  }
  return leads;
}

function title(tab: TabInfo, l: PaneInfo | undefined) {
  const prog = l?.program?.name;
  const live = clean(l?.title);
  const telling =
    live &&
    live !== prog &&
    !/^[~/]|^[A-Za-z]:\\/.test(live) &&
    !live.includes("@") &&
    live.toLowerCase() !== l?.program?.key;
  return (tab.name === prog || !tab.named) && telling ? live : tab.name;
}
const RANK: Record<string, number> = { blocked: 4, done: 3, working: 2, idle: 1 };
// A sub-agent without a pane isn't in agents(): its raw word, error counting as
// blocked. It's never done: it reports to its parent, and the parent's done is the news.
/** @param k a terminals() entry */
const kidStatus = (k: any, listed: Map<string, Status>): string => {
  const s = listed.get(k.address) ?? k.status;
  return s === "error" ? "blocked" : s === "done" ? "idle" : s;
};
const SECTION: Record<number, string> = { 4: "Needs you", 3: "Done", 2: "Working", 1: "Idle" };
const SECTION_STATUS: Record<number, Status> = { 4: "blocked", 3: "done", 2: "working" };

function duration(ms: number) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

// The agent's icon from the app's program table: a one-color glyph or a picture.
function icon(p: Program | undefined, size: number, color: Color) {
  if (!p?.icon) return null;
  return p.tint
    ? svg(p.icon).size(size).flex_none().text_color(color)
    : image(p.icon).w(size).h(size).flex_none();
}

export default class Agents extends View {
  declare folded: Set<string>;
  declare changed: Record<string, { s: string; at: number }>;
  declare pendingPins: string[];
  declare migratingPins: Set<string>;
  declare held: { address: string; rank: number } | null;
  declare listed: Map<string, Status>;
  declare hovered: string | null;
  declare seeded: boolean;

  init(_props: Record<string, any> | undefined, cx: AsyncContext) {
    // Agents and sections folded by hand.
    this.folded = new Set();
    // Each agent's last state and when it changed (ms), kept across restarts.
    this.changed = JSON.parse(localStorage.getItem("changed") ?? "{}");
    this.pendingPins = JSON.parse(localStorage.getItem("pins") ?? "[]");
    if (!this.pendingPins.length) localStorage.removeItem("pins");
    this.migratingPins = new Set();
    this.held = null;
    this.listed = new Map();
    this.hovered = null;
    this.seeded = false;
    cx.timer.every(30000, (cx) => cx.notify());
  }

  // Stamps agents whose state changed. Done and idle count as one: looking at a
  // finished agent turns done into idle, and looking isn't the agent doing anything.
  track(list: AgentInfo[], now: number) {
    let dirty = false;
    for (const a of list) {
      const s = a.status === "done" ? "idle" : a.status;
      if (this.changed[a.address]?.s === s) continue;
      this.changed[a.address] = { s, at: now };
      dirty = true;
    }
    if (!dirty) return;
    // Gone and old: the list alone is empty right after a start.
    const listed = new Set(list.map((a) => a.address));
    for (const [k, c] of Object.entries(this.changed))
      if (!listed.has(k) && now - c.at > 30 * 86400000) delete this.changed[k];
    localStorage.setItem("changed", JSON.stringify(this.changed));
  }

  // Keep offline pins until their terminal returns, and keep each pending until
  // core echoes the label so a failed write doesn't erase the old pin.
  /** @param all terminals() */
  migratePins(all: any[]) {
    const listed: Map<string, any> = new Map(
      all.filter((t) => t.state === "live").map((t) => [t.address, t]),
    );
    const pending = this.pendingPins.filter((address) => {
      const terminal = listed.get(address);
      if (!terminal) return true;
      if (terminal.labels?.["herdr.pinned"]) return false;
      if (!this.migratingPins.has(address)) {
        this.migratingPins.add(address);
        run("terminal.pin", { terminal: address, pinned: true });
      }
      return true;
    });
    if (pending.length === this.pendingPins.length) return;
    this.pendingPins = pending;
    if (pending.length) localStorage.setItem("pins", JSON.stringify(pending));
    else localStorage.removeItem("pins");
  }

  since(a: AgentInfo) {
    return this.changed[a.address]?.at ?? 0;
  }

  // Looking at a done agent makes it idle; it stays with Done until you leave
  // it rather than drop away under you. Any other change moves it at once.
  hold(list: AgentInfo[]) {
    const cur = list.find((a) => a.focused);
    const same = cur && cur.address === this.held?.address;
    // Arriving, or any change but done turning idle, sets what it was.
    if (!same || cur.status !== "idle")
      this.held = cur ? { address: cur.address, rank: RANK[cur.status] ?? 0 } : null;
  }

  rank(a: AgentInfo) {
    const sawDone =
      a.address === this.held?.address && this.held.rank === RANK.done && a.status === "idle";
    return sawDone ? RANK.done : (RANK[a.status] ?? 0);
  }

  /** @param id an agent's address or a section's id */
  toggleFold(id: string) {
    if (!this.folded.delete(id)) this.folded.add(id);
  }

  peek(addr: string) {
    run("terminal.peek", { terminal: addr });
  }

  // Live sub-agents of `addr`, depth first, each with the tree lines in front of it.
  /** @param all terminals() */
  tree(all: any[], addr: string, lead: string[] = []): Sub[] {
    const kids = all.filter((k) => k.parent === addr && k.state === "live");
    return kids.flatMap((k, i) => {
      const last = i === kids.length - 1;
      return [
        { t: k, lines: [...lead, last ? "└" : "├"] },
        ...this.tree(all, k.address, [...lead, last ? "" : "│"]),
      ];
    });
  }

  subRow(t: Record<string, Color>, s: Sub, shown: string | null | undefined, compact: boolean) {
    const k = s.t;
    const st = kidStatus(k, this.listed);
    const pic = icon(k.program, 14, t.foreground);
    const on = k.address === shown;
    return h_flex()
      .id(`sub-${k.address}`)
      .pl(39)
      .pr(8)
      .rounded(8)
      .h(26)
      .flex_none()
      .gap(0)
      .items_center()
      .text_size(12.5)
      .when(on, (el) => el.bg(t.raised))
      .hover((s) => s.bg(t.hover))
      .on_click(() => this.peek(k.address))
      .children(
        s.lines.map((l) =>
          div()
            .self_start()
            .mt(-4)
            .w(9)
            .h(17)
            .mr(4)
            .flex_none()
            .when(Boolean(l), (el) => el.border_l(1.5).border_color(t.input))
            .when(l === "└" || l === "├", (el) => el.border_b(1.5).rounded_bl(6)),
        ),
      )
      .when(Boolean(pic), (el) => el.child(div().mr(8).child(pic)))
      .child(
        div()
          .flex_1()
          .truncate()
          .text_color(on ? t.foreground : t.muted)
          .child(k.name || k.template || k.program?.name || k.address),
      )
      .child(this.status(t, { status: st }, compact));
  }

  // compact: a ! for blocked where a header already says "Needs you".
  status(t: Record<string, Color>, a: { status: string }, compact = false) {
    const color = t[a.status] ?? t.dim;
    if (a.status === "working")
      return svg("mods/workspace-chrome/spinner.svg")
        .size(12)
        .mx(1)
        .flex_none()
        .text_color(t.working)
        .spin(900);
    if (a.status === "blocked" && compact)
      return div()
        .size(14)
        .flex_none()
        .rounded(4)
        .bg(fade(t.blocked, "26"))
        .text_size(10.5)
        .font_bold()
        .text_color(t.blocked)
        .flex()
        .items_center()
        .justify_center()
        .child("!");
    if (a.status === "blocked")
      return div()
        .flex_none()
        .px(6)
        .h(18)
        .rounded(5)
        .bg(fade(t.blocked, "26"))
        .text_size(10.5)
        .font_semibold()
        .text_color(t.blocked)
        .flex()
        .items_center()
        .child("Needs you");
    // Idle: a ring; done: a dot.
    if (a.status === "idle")
      return div()
        .size(7)
        .mx(3)
        .flex_none()
        .rounded(4)
        .border(1.5)
        .border_color(t.idle ?? t.dim);
    return div()
      .size(7)
      .mx(3)
      .flex_none()
      .rounded(4)
      .bg(a.status === "done" ? color : fade(t.dim, "00"));
  }

  render() {
    const t = colors();
    const collapsed = narrow();
    let list = agents();
    this.listed = new Map(list.map((a) => [a.address, a.status]));
    const all = terminals();
    this.migratePins(all);
    const shown = focused()?.agent;
    const now = Date.now();
    this.track(list, now);
    this.hold(list);
    const urgency = new Map(
      list.map((a) => [
        a.address,
        Math.max(
          this.rank(a),
          ...this.tree(all, a.address).map((s) => RANK[kidStatus(s.t, this.listed)] ?? 0),
        ),
      ]),
    );
    const rankOf = (a: AgentInfo) => urgency.get(a.address);
    list = [...list].sort(
      (x, y) => rankOf(y) - rankOf(x) || this.since(y) - this.since(x) || y.seq - x.seq,
    );
    const pinned = list.filter((a) => a.pinned);
    const rest = list.filter((a) => !a.pinned);
    list = [...pinned, ...rest];
    setAgentOrder(list.map((a) => a.address));

    const withKids = (a: AgentInfo, i: number) => {
      const subs = collapsed ? [] : this.tree(all, a.address);
      const r = row(a, i, subs);
      if (this.folded.has(a.address)) return [r];
      return [r, ...subs.map((s) => this.subRow(t, s, shown, true))];
    };

    // The fold chevron; folded, the count too, colored by the most urgent one.
    const fold = (a: AgentInfo, subs: Sub[]) => {
      const sts = subs.map((s) => kidStatus(s.t, this.listed));
      const top = sts.reduce(
        (m, s) => ((RANK[s] ?? 0) > (RANK[m] ?? 0) ? s : m),
        null as string | null,
      );
      const open = !this.folded.has(a.address);
      return div()
        .id(`fold-${a.address}`)
        .h(18)
        .px(3)
        .gap(3)
        .flex()
        .items_center()
        .rounded(4)
        .text_size(11)
        .text_color(open ? t.dim : (t[top] ?? t.dim))
        .cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_click((_e, cx) => {
          cx.stop_propagation();
          this.toggleFold(a.address);
          cx.notify();
        })
        .child(
          svg(`mods/workspace-chrome/chevron-${open ? "down" : "right"}.svg`)
            .size(11)
            .flex_none(),
        )
        .when(!open, (el) => el.child(String(subs.length)));
    };

    // A row reads "space \u00b7 detail": the detail is a tab someone named or the
    // agent's own title, never an automatic tab number unless two rows would
    // otherwise read the same.
    // Read the pane snapshot once: every host read copies the whole list into JS.
    const leads = leadPanes(panes());
    const tabLabels = new Map(
      spaces()
        .flatMap((s) => s.tabs)
        .map((tab) => [tab.id, title(tab, leads.get(tab.id))]),
    );
    const labels = new Map(
      list.map((a) => [a.address, tabLabels.get(a.tab) ?? (a.title || a.program?.name || "")]),
    );
    const label = (a: AgentInfo) => labels.get(a.address);
    const detail = new Map(list.map((a) => [a.address, /^\d+$/.test(label(a)) ? null : label(a)]));
    // The space's repo (from spaces-avatars), else its folder: a worktree's folder name means nothing.
    const repos = (shared("space.repos") ?? {}) as Record<string, string>;
    const spaceName = (a: AgentInfo) => repos[a.space] || a.space_name;
    const seen: Record<string, number> = {};
    for (const a of list) {
      const k = `${spaceName(a)}\u0000${detail.get(a.address) ?? ""}`;
      seen[k] = (seen[k] ?? 0) + 1;
    }
    for (const a of list) {
      if (detail.get(a.address) == null && seen[`${spaceName(a)}\u0000`] > 1)
        detail.set(a.address, label(a));
    }

    // Space id to an avatar image path, from spaces-avatars.
    const avatars = (shared("space.avatars") ?? {}) as Record<string, string>;
    const row = (a: AgentInfo, i: number, subs: Sub[] = []) => {
      // The space's avatar, from the spaces list; else the program's icon.
      const pic = avatars[a.space]
        ? image(avatars[a.space]).size(16).flex_none().rounded(4)
        : icon(a.program, 16, t.foreground);
      const more = detail.get(a.address);
      // An agent on another machine (`vps/t7`) says which.
      const machine = a.address.includes("/") ? a.address.split("/")[0] : null;
      if (collapsed) {
        return h_flex()
          .id(`ag-${a.address}`)
          .h(26)
          .px(8)
          .flex_none()
          .items_center()
          .gap(4)
          .hover((s) => s.bg(t.hover))
          .on_click(() => run("pane.focus", { pane: a.pane }))
          .child(
            div()
              .flex_1()
              .min_w(0)
              .whitespace_nowrap()
              .text_right()
              .text_color(t.muted)
              .child(String(i + 1)),
          )
          .child(
            h_flex()
              .w(14)
              .flex_none()
              .items_center()
              .justify_center()
              .child(this.status(t, a, true)),
          );
      }
      const when = this.since(a);
      const idle = a.status === "idle" && !a.focused;
      const isPinned = a.pinned;
      const pin = div()
        .id(`pin-${a.address}`)
        .flex_none()
        .p(2)
        .rounded(4)
        .text_color(t.dim)
        .cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .tooltip(isPinned ? "Unpin" : "Pin to the top")
        .on_click((_e, cx) => {
          cx.stop_propagation();
          run("terminal.pin", { terminal: a.address, pinned: !isPinned });
          // The row moves away from under the pointer, and no hover-out comes.
          this.hovered = null;
          cx.notify();
        })
        .child(svg(`mods/workspace-chrome/${isPinned ? "pin-off" : "pin"}.svg`).size(13));
      // No space header above a row, so it names its space; the detail follows.
      const name = spaceName(a) || label(a);
      return h_flex()
        .id(`ag-${a.address}`)
        .px(8)
        .h(30)
        .flex_none()
        .rounded(8)
        .items_center()
        .gap(9)
        .when(a.focused, (el) => el.bg(t.selected))
        .cursor_pointer()
        .hover((s) => s.bg(t.hover))
        .on_hover((on, cx) => {
          if (on) this.hovered = a.address;
          else if (this.hovered === a.address) this.hovered = null;
          cx.notify();
        })
        .on_click(() => run("pane.focus", { pane: a.pane }))
        .when(Boolean(pic), (el) =>
          el.child(
            div()
              .id(`agent-fold-${a.address}`)
              .when(subs.length > 0, (el) =>
                el.on_click((_e, cx) => {
                  cx.stop_propagation();
                  this.toggleFold(a.address);
                  cx.notify();
                }),
              )
              .child(pic),
          ),
        )
        .child(
          h_flex()
            .flex_1()
            .min_w(0)
            .gap(5)
            .items_center()
            .child(
              div()
                .min_w(0)
                .max_w(more ? 120 : 200)
                .truncate()
                .text_color(idle ? t.muted : t.foreground)
                .child(name),
            )
            .when(Boolean(more), (el) =>
              el.child(
                div().flex_1().min_w(0).truncate().text_color(t.dim).child(`\u00b7 ${more}`),
              ),
            ),
        )
        .when(Boolean(machine), (el) =>
          el.child(div().text_size(10).text_color(t.dim).child(machine)),
        )
        .when(subs.length > 0, (el) => el.child(fold(a, subs)))
        .when(this.hovered === a.address, (el) => el.child(pin))
        .when(this.hovered !== a.address && Boolean(when), (el) =>
          el.child(
            div()
              .flex_none()
              .text_size(11)
              .text_color(t.dim)
              .child(duration(now - when)),
          ),
        )
        .child(this.status(t, a, !isPinned));
    };

    // Pinned, then every section, even empty, so the list doesn't jump.
    const groups: Group[] = pinned.length
      ? [{ id: "pinned", label: "Pinned", status: null, members: pinned }]
      : [];
    groups.push(
      ...[4, 3, 2, 1].map((r) => ({
        id: `sec-${r}`,
        label: SECTION[r],
        status: SECTION_STATUS[r],
        members: rest.filter((a) => (rankOf(a) || RANK.idle) === r),
      })),
    );

    // Sections start folded but the most urgent one with agents; after that each folds on its own.
    if (!this.seeded && rest.length) {
      this.seeded = true;
      const first = groups.find((g) => g.id.startsWith("sec-") && g.members.length);
      for (const g of groups) if (g.id.startsWith("sec-") && g !== first) this.folded.add(g.id);
    }
    const isFolded = (g: Group) => this.folded.has(g.id);

    // A group's header, with how many it holds; it folds the group.
    const header = (g: Group) => {
      const open = !isFolded(g);
      return h_flex()
        .id(g.id)
        .px(8)
        .pt(8)
        .h(30)
        .flex_none()
        .gap(6)
        .items_center()
        .text_size(11)
        .font_medium()
        .cursor_pointer()
        .hover((s) => s.text_color(t.foreground))
        .on_click((_e, cx) => {
          this.toggleFold(g.id);
          cx.notify();
        })
        .child(
          div()
            .truncate()
            .text_color(t[g.status] ?? t.dim)
            .child(g.label),
        )
        .child(div().text_color(t.dim).child(String(g.members.length)))
        .child(div().flex_1())
        .when(!open, (el) =>
          el.child(
            svg("mods/workspace-chrome/chevron-right.svg").size(11).flex_none().text_color(t.dim),
          ),
        );
    };
    const rows = collapsed
      ? list.flatMap(withKids)
      : groups.flatMap((g) => [header(g), ...(isFolded(g) ? [] : g.members.flatMap(withKids))]);

    return (
      v_flex()
        .size_full()
        .min_h(0)
        .bg(t.chrome)
        .border_t(1)
        .border_color(t.border)
        .text_size(13)
        .when(!collapsed, (el) =>
          el.child(
            h_flex()
              .px(16)
              .h(41)
              .pt(14)
              .pb(5)
              .flex_none()
              .items_center()
              .justify_between()
              .child(div().text_size(11.5).font_medium().text_color(t.dim).child("Agents")),
          ),
        )
        .when(list.length === 0 && !collapsed, (el) =>
          el.child(
            div()
              .px(12)
              .text_size(12)
              .text_color(t.dim)
              .child(
                "No agent status yet. Agents show up here when they report their status. Older versions and agents inside tmux may not.",
              ),
          ),
        )
        .child(
          v_flex()
            .id("ag-list")
            .flex_1()
            .min_h(0)
            .px(collapsed ? 0 : 8)
            .overflow_y_scrollbar()
            .mode("always")
            .children(rows),
        )
        // Only a narrow `sidebar` node collapses the list, so the toggle needs one to resize.
        .when(collapsed, (el) =>
          el.child(
            h_flex()
              .h(28)
              .items_center()
              .justify_center()
              .child(
                div()
                  .id("collapse")
                  .text_size(13)
                  .text_color(t.dim)
                  .hover((s) => s.text_color(t.foreground))
                  .on_click(toggleSidebar)
                  .child("»"),
              ),
          ),
        )
    );
  }
}
