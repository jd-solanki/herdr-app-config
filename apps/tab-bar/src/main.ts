import { readFile, readdir } from "fs/promises";
import { View, div, svg, image, type AsyncContext, type Color } from "gpui-kit";
import { h_flex } from "gpui-base";
import {
  spaces,
  panes,
  run,
  openOverlay,
  theme,
  window,
  shared,
  layout,
  settings,
  nextCommand,
  appHome,
  props,
  watchFolder,
  type SpaceInfo,
  type TabInfo,
} from "herdr";

type LayoutNode = {
  id?: string;
  hidden?: boolean;
  active?: string;
  size?: { px?: number };
  children?: LayoutNode[];
  traffic_lights?: number[];
};
type Button = { mod: string; label: string; icon?: string; per_space?: boolean };

// A mod declares its tab bar button in its own mod.json, read here, because a mod runs only
// while shown: a button it registered itself could never open it.
// { "button": { "label": "GitHub", "icon": "<path under the app home>", "per_space": true } }
async function declaredButtons(): Promise<Button[]> {
  const root = `${appHome()}/mods`;
  const found = await Promise.all(
    (await readdir(root)).map(async (mod) => {
      try {
        const { button } = JSON.parse(await readFile(`${root}/${mod}/mod.json`, "utf8"));
        return button?.label ? { ...button, mod } : null;
      } catch {
        return null;
      }
    }),
  );
  return found.filter((b) => b !== null).sort((a, b) => a.label.localeCompare(b.label));
}

function find(node: LayoutNode | null | undefined, id: string): LayoutNode | null {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export default class Tabs extends View {
  declare pressed: number | null;
  declare space: string | undefined;
  declare pending: { want: string | null; until: number } | null;
  // Space id to the panel it had open.
  declare panels: Record<string, string | null>;
  declare declared: Button[];

  init(_props: unknown, cx: AsyncContext) {
    this.pressed = null;
    this.space = undefined;
    this.pending = null;
    this.panels = JSON.parse(localStorage.getItem("panels") ?? "{}");
    this.declared = [];
    cx.spawn(async (cx) => {
      const mods = `${appHome()}/mods`;
      for (;;) {
        this.declared = await declaredButtons();
        cx.notify();
        let changed: string[];
        do changed = await watchFolder(mods);
        while (!changed.some((path) => path === mods || path.endsWith("/mod.json")));
      }
    });
    // `tab-bar.<declaring mod>` in keys.json presses that mod's button.
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        const button = this.buttons().find((b) => b.mod === command);
        if (button) this.press(button);
        cx.notify();
      }
    });
  }

  // props.buttons on the layout block picks and orders the declared buttons; without it, all.
  buttons(): Button[] {
    const wanted = props()?.buttons;
    if (!Array.isArray(wanted)) return this.declared;
    return wanted
      .map((mod) => this.declared.find((b) => b.mod === mod))
      .filter((b) => b !== undefined);
  }

  // A button whose mod has a block in the panel stack toggles the panel; any other goes to
  // the space's tab showing that mod, or opens one.
  press(button: Button) {
    const root = layout() as LayoutNode,
      panel = find(root, "panel"),
      body = find(root, "panel-body");
    if (body?.children?.some((c) => c.id === button.mod)) {
      if (panel && !panel.hidden && body.active === button.mod) run("layout.hide", { id: "panel" });
      else {
        run("layout.select", { stack: "panel-body", child: button.mod });
        run("layout.show", { id: "panel" });
      }
      return;
    }
    const space = spaces().find((p) => p.active);
    if (!space) return;
    const tab = this.modTab(space, button.mod);
    if (tab) run("tab.select", { id: tab });
    else
      run("tab.new", {
        name: button.label,
        mod: button.mod,
        ...(button.per_space ? { props: { space: space.id } } : {}),
      });
  }

  modTab(space: SpaceInfo | undefined, mod: string) {
    return panes().find((p) => p.mod === mod && space?.tabs.some((c) => c.id === p.tab))?.tab;
  }

  // The side panel is remembered per space: switching shows that space's choice
  // (closed if it never had one), and opening or closing it records it.
  syncPanel(
    space: SpaceInfo | undefined,
    panel: LayoutNode | null,
    body: LayoutNode | null,
    enabled: string[],
  ) {
    if (!space || !panel) return;
    const now = panel.hidden ? null : (body?.active ?? null);
    if (space.id !== this.space) {
      const first = this.space === undefined;
      this.space = space.id;
      this.pending = null;
      if (!(first && !(space.id in this.panels))) {
        const stored = this.panels[space.id] ?? null,
          want = enabled.includes(stored) ? stored : null;
        if (want !== now) {
          this.pending = { want, until: Date.now() + 1000 };
          if (want) {
            run("layout.select", { stack: "panel-body", child: want });
            run("layout.show", { id: "panel" });
          } else run("layout.hide", { id: "panel" });
          return;
        }
      }
    }
    // Until the restore lands (or something else won), the old state isn't a choice.
    if (this.pending) {
      if (this.pending.want !== now && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (this.panels[space.id] === now) return;
    this.panels[space.id] = now;
    localStorage.setItem("panels", JSON.stringify(this.panels));
  }

  render() {
    // herdr.d.ts types the theme as plain strings; its values are #rrggbb colors.
    const t = theme() as Record<string, Color>;
    const space = spaces().find((p) => p.active);
    const shown = space?.tabs ?? [];
    // Any mod may fill this slot: tab id to the label an unnamed tab shows.
    const labels = (shared("tab-bar.labels") ?? {}) as Record<string, string>;
    const stop = (_e: unknown, cx: { stop_propagation(): void }) => cx.stop_propagation();
    const button = (id: string, label: any, action: () => void) =>
      div()
        .id(id)
        .size(26)
        .flex_none()
        .flex()
        .items_center()
        .justify_center()
        .rounded(6)
        .text_color(t.dim)
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_mouse_down("left", stop)
        .on_click(action)
        .child(label);
    const item = (c: TabInfo, i: number) => {
      const program = (
        panes().find((p) => p.tab === c.id && p.program?.agent) ??
        panes().find((p) => p.tab === c.id)
      )?.program;
      const auto = !c.named || c.name === program?.name;
      const name = !auto ? c.name : (labels[c.id] ?? program?.name ?? "Terminal");
      return h_flex()
        .id(`tab-${c.id}`)
        .h(29)
        .px(10)
        .gap(7)
        .rounded(7)
        .items_center()
        .flex_none()
        .text_size(12.8)
        .border(1)
        .border_color(c.active ? t.border : t.chrome)
        .bg(c.active ? t.raised : t.chrome)
        .text_color(c.active ? t.foreground : t.muted)
        .hover((s) => s.bg(t.hover))
        .on_mouse_down("left", (e, cx) => {
          cx.stop_propagation();
          this.pressed = i;
          if (e.click_count === 2) run("tab.rename", { id: c.id });
        })
        .on_mouse_up("left", () => {
          const from = this.pressed;
          this.pressed = null;
          if (from !== null && from !== i)
            run("tab.move", {
              id: shown[from].id,
              index: space.tabs.findIndex((x) => x.id === c.id) + 1,
            });
          else run("tab.select", { id: c.id });
        })
        .on_mouse_down("right", (_e, cx) => {
          cx.stop_propagation();
          openOverlay({
            mod: "menu",
            kind: "popup",
            width: 200,
            props: { tab: "tab", target: { id: c.id, space: space.id } },
          });
        })
        .when(Boolean(program?.icon), (el) =>
          el.child(
            program.tint
              ? svg(program.icon).size(14).text_color(t.muted)
              : image(program.icon).size(14),
          ),
        )
        .child(
          div()
            .max_w(320)
            .truncate()
            .child(c.zoomed ? `${name} Z` : name),
        )
        .when(c.status === "working", (el) =>
          el.child(
            svg("mods/workspace-chrome/spinner.svg")
              .size(12)
              .flex_none()
              .text_color(t.working)
              .spin(900),
          ),
        )
        .when(c.status === "blocked" || c.status === "done", (el) =>
          el.child(div().size(6).rounded(3).bg(t[c.status])),
        )
        .when(c.active, (el) =>
          el.child(
            div()
              .id(`close-${c.id}`)
              .text_color(t.dim)
              .on_mouse_down("left", stop)
              .on_click((_e, cx) => {
                cx.stop_propagation();
                run("tab.close", { id: c.id });
              })
              .child(svg("mods/pane/close.svg").size(12)),
          ),
        );
    };
    const root = layout() as LayoutNode,
      sidebar = find(root, "sidebar"),
      w = window();
    // Old saved rails and a dragged-narrow sidebar can be smaller than the window buttons.
    const lightsPadding =
      w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
        ? Math.max(
            10,
            (root.traffic_lights[0] + 64) / (settings().zoom as number) -
              (sidebar?.hidden ? 0 : (sidebar?.size?.px ?? 0)),
          )
        : 10;
    const panel = find(root, "panel"),
      body = find(root, "panel-body");
    const buttons = this.buttons();
    const enabled = [
      ...((shared("workspace.panels") ?? ["files", "changes"]) as string[]),
      ...buttons.filter((b) => body?.children?.some((c) => c.id === b.mod)).map((b) => b.mod),
    ];
    this.syncPanel(space, panel, body, enabled);
    const barButton = (
      id: string,
      label: string,
      icon: string | null,
      on: boolean,
      action: () => void,
    ) =>
      h_flex()
        .id(id)
        .h(26)
        .px(8)
        .gap(5)
        .flex_none()
        .items_center()
        .rounded(6)
        .text_size(12)
        .bg(on ? t.selected : t.chrome)
        .text_color(on ? t.foreground : t.muted)
        .hover((s) => s.bg(t.hover))
        .on_mouse_down("left", stop)
        .on_click(action)
        .when(Boolean(icon), (el) => el.child(svg(icon).size(14)))
        .child(label);
    const panelButton = (id: string, label: string, icon: string) => {
      const on = panel && !panel.hidden && body?.active === id;
      return barButton(`panel-${id}`, label, icon, on, () => {
        if (on) run("layout.hide", { id: "panel" });
        else {
          run("layout.select", { stack: "panel-body", child: id });
          run("layout.show", { id: "panel" });
        }
      });
    };
    return h_flex()
      .size_full()
      .min_w(0)
      .px(10)
      .pl(lightsPadding)
      .gap(3)
      .items_center()
      .bg(t.chrome)
      .border_b(1)
      .border_color(t.border)
      .on_mouse_up("left", () => {
        this.pressed = null;
      })
      .on_scroll_wheel((e) => {
        if (Math.abs(e.delta.y) >= 1) run(e.delta.y > 0 ? "tab.prev" : "tab.next");
      })
      .child(
        h_flex()
          .id("tab-scroll")
          .flex_1()
          .min_w(0)
          .h_full()
          .items_center()
          .gap(3)
          .overflow_x_scrollbar()
          .children(shown.map(item)),
      )
      .child(
        button("tab-new", "+", () =>
          openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 }),
        ),
      )
      .when(enabled.includes("files"), (el) =>
        el.child(panelButton("files", "Files", "mods/files/file.svg")),
      )
      .when(enabled.includes("changes"), (el) =>
        el.child(panelButton("changes", "Changes", "mods/changes/changes.svg")),
      )
      .children(
        buttons.map((b) =>
          barButton(
            `button-${b.mod}`,
            b.label,
            b.icon ?? null,
            body?.children?.some((c) => c.id === b.mod)
              ? panel && !panel.hidden && body.active === b.mod
              : Boolean(this.modTab(space, b.mod)) &&
                  shown.find((c) => c.active)?.id === this.modTab(space, b.mod),
            () => this.press(b),
          ),
        ),
      )
      .when(w?.buttons, (el) =>
        el
          .child(button("minimize", "−", () => run("window.minimize")))
          .child(button("maximize", "□", () => run("window.maximize")))
          .child(
            button("close-window", svg("mods/pane/close.svg").size(13), () => run("window.close")),
          ),
      );
  }
}
