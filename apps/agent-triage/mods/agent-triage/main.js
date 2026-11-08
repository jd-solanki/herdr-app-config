import { View, div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, focused, layout, panes, run, setAgentOrder, setShared, shared, spaces, terminals, theme, window } from "herdr";
//#region apps/agent-triage/src/main.ts
const colors = () => theme();
/** @param alpha two hex digits */
const fade = (color, alpha) => `${color}${alpha}`;
function find(node, id) {
	if (node?.id === id) return node;
	for (const child of node?.children ?? []) {
		const found = find(child, id);
		if (found) return found;
	}
	return null;
}
const sidebar = () => find(layout(), "sidebar");
const narrow = () => (sidebar()?.size?.px ?? Infinity) < 160;
function toggleSidebar() {
	const width = sidebar()?.size?.px;
	if (!narrow()) setShared("sidebar.width", width);
	setShared("sidebar.collapsed", !narrow());
	run("layout.resize", {
		id: "sidebar",
		px: narrow() ? shared("sidebar.width") ?? 268 : window()?.platform === "macos" ? 76 : 44
	});
}
const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
function leadPanes(all) {
	const leads = /* @__PURE__ */ new Map();
	for (const p of all) {
		if (!p.terminal) continue;
		const current = leads.get(p.tab);
		if (!current || !current.program?.agent && (p.program?.agent || !current.focused && p.focused)) leads.set(p.tab, p);
	}
	return leads;
}
function title(tab, l) {
	const prog = l?.program?.name;
	const live = clean(l?.title);
	const telling = live && live !== prog && !/^[~/]|^[A-Za-z]:\\/.test(live) && !live.includes("@") && live.toLowerCase() !== l?.program?.key;
	return (tab.name === prog || !tab.named) && telling ? live : tab.name;
}
const RANK = {
	blocked: 4,
	done: 3,
	working: 2,
	idle: 1
};
/** @param k a terminals() entry */
const kidStatus = (k, listed) => {
	const s = listed.get(k.address) ?? k.status;
	return s === "error" ? "blocked" : s === "done" ? "idle" : s;
};
const SECTION = {
	4: "Needs you",
	3: "Done",
	2: "Working",
	1: "Idle"
};
const SECTION_STATUS = {
	4: "blocked",
	3: "done",
	2: "working"
};
function duration(ms) {
	const m = Math.floor(ms / 6e4);
	if (m < 1) return "<1m";
	if (m < 60) return `${m}m`;
	const h = Math.floor(m / 60);
	return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}
function icon(p, size, color) {
	if (!p?.icon) return null;
	return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}
var Agents = class extends View {
	init(_props, cx) {
		this.folded = /* @__PURE__ */ new Set();
		this.changed = JSON.parse(localStorage.getItem("changed") ?? "{}");
		this.pendingPins = JSON.parse(localStorage.getItem("pins") ?? "[]");
		if (!this.pendingPins.length) localStorage.removeItem("pins");
		this.migratingPins = /* @__PURE__ */ new Set();
		this.held = null;
		this.listed = /* @__PURE__ */ new Map();
		this.hovered = null;
		this.seeded = false;
		cx.timer.every(3e4, (cx) => cx.notify());
	}
	track(list, now) {
		let dirty = false;
		for (const a of list) {
			const s = a.status === "done" ? "idle" : a.status;
			if (this.changed[a.address]?.s === s) continue;
			this.changed[a.address] = {
				s,
				at: now
			};
			dirty = true;
		}
		if (!dirty) return;
		const listed = new Set(list.map((a) => a.address));
		for (const [k, c] of Object.entries(this.changed)) if (!listed.has(k) && now - c.at > 2592e6) delete this.changed[k];
		localStorage.setItem("changed", JSON.stringify(this.changed));
	}
	/** @param all terminals() */
	migratePins(all) {
		const listed = new Map(all.filter((t) => t.state === "live").map((t) => [t.address, t]));
		const pending = this.pendingPins.filter((address) => {
			const terminal = listed.get(address);
			if (!terminal) return true;
			if (terminal.labels?.["herdr.pinned"]) return false;
			if (!this.migratingPins.has(address)) {
				this.migratingPins.add(address);
				run("terminal.pin", {
					terminal: address,
					pinned: true
				});
			}
			return true;
		});
		if (pending.length === this.pendingPins.length) return;
		this.pendingPins = pending;
		if (pending.length) localStorage.setItem("pins", JSON.stringify(pending));
		else localStorage.removeItem("pins");
	}
	since(a) {
		return this.changed[a.address]?.at ?? 0;
	}
	hold(list) {
		const cur = list.find((a) => a.focused);
		if (!(cur && cur.address === this.held?.address) || cur.status !== "idle") this.held = cur ? {
			address: cur.address,
			rank: RANK[cur.status] ?? 0
		} : null;
	}
	rank(a) {
		return a.address === this.held?.address && this.held.rank === RANK.done && a.status === "idle" ? RANK.done : RANK[a.status] ?? 0;
	}
	/** @param id an agent's address or a section's id */
	toggleFold(id) {
		if (!this.folded.delete(id)) this.folded.add(id);
	}
	peek(addr) {
		run("terminal.peek", { terminal: addr });
	}
	/** @param all terminals() */
	tree(all, addr, lead = []) {
		const kids = all.filter((k) => k.parent === addr && k.state === "live");
		return kids.flatMap((k, i) => {
			const last = i === kids.length - 1;
			return [{
				t: k,
				lines: [...lead, last ? "└" : "├"]
			}, ...this.tree(all, k.address, [...lead, last ? "" : "│"])];
		});
	}
	subRow(t, s, shown, compact) {
		const k = s.t;
		const st = kidStatus(k, this.listed);
		const pic = icon(k.program, 14, t.foreground);
		const on = k.address === shown;
		return h_flex().id(`sub-${k.address}`).pl(39).pr(8).rounded(8).h(26).flex_none().gap(0).items_center().text_size(12.5).when(on, (el) => el.bg(t.raised)).hover((s) => s.bg(t.hover)).on_click(() => this.peek(k.address)).children(s.lines.map((l) => div().self_start().mt(-4).w(9).h(17).mr(4).flex_none().when(Boolean(l), (el) => el.border_l(1.5).border_color(t.input)).when(l === "└" || l === "├", (el) => el.border_b(1.5).rounded_bl(6)))).when(Boolean(pic), (el) => el.child(div().mr(8).child(pic))).child(div().flex_1().truncate().text_color(on ? t.foreground : t.muted).child(k.name || k.template || k.program?.name || k.address)).child(this.status(t, { status: st }, compact));
	}
	status(t, a, compact = false) {
		const color = t[a.status] ?? t.dim;
		if (a.status === "working") return svg("mods/workspace-chrome/spinner.svg").size(12).mx(1).flex_none().text_color(t.working).spin(900);
		if (a.status === "blocked" && compact) return div().size(14).flex_none().rounded(4).bg(fade(t.blocked, "26")).text_size(10.5).font_bold().text_color(t.blocked).flex().items_center().justify_center().child("!");
		if (a.status === "blocked") return div().flex_none().px(6).h(18).rounded(5).bg(fade(t.blocked, "26")).text_size(10.5).font_semibold().text_color(t.blocked).flex().items_center().child("Needs you");
		if (a.status === "idle") return div().size(7).mx(3).flex_none().rounded(4).border(1.5).border_color(t.idle ?? t.dim);
		return div().size(7).mx(3).flex_none().rounded(4).bg(a.status === "done" ? color : fade(t.dim, "00"));
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
		const urgency = new Map(list.map((a) => [a.address, Math.max(this.rank(a), ...this.tree(all, a.address).map((s) => RANK[kidStatus(s.t, this.listed)] ?? 0))]));
		const rankOf = (a) => urgency.get(a.address);
		list = [...list].sort((x, y) => rankOf(y) - rankOf(x) || this.since(y) - this.since(x) || y.seq - x.seq);
		const pinned = list.filter((a) => a.pinned);
		const rest = list.filter((a) => !a.pinned);
		list = [...pinned, ...rest];
		setAgentOrder(list.map((a) => a.address));
		const withKids = (a, i) => {
			const subs = collapsed ? [] : this.tree(all, a.address);
			const r = row(a, i, subs);
			if (this.folded.has(a.address)) return [r];
			return [r, ...subs.map((s) => this.subRow(t, s, shown, true))];
		};
		const fold = (a, subs) => {
			const top = subs.map((s) => kidStatus(s.t, this.listed)).reduce((m, s) => (RANK[s] ?? 0) > (RANK[m] ?? 0) ? s : m, null);
			const open = !this.folded.has(a.address);
			return div().id(`fold-${a.address}`).h(18).px(3).gap(3).flex().items_center().rounded(4).text_size(11).text_color(open ? t.dim : t[top] ?? t.dim).cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground)).on_click((_e, cx) => {
				cx.stop_propagation();
				this.toggleFold(a.address);
				cx.notify();
			}).child(svg(`mods/workspace-chrome/chevron-${open ? "down" : "right"}.svg`).size(11).flex_none()).when(!open, (el) => el.child(String(subs.length)));
		};
		const leads = leadPanes(panes());
		const tabLabels = new Map(spaces().flatMap((s) => s.tabs).map((tab) => [tab.id, title(tab, leads.get(tab.id))]));
		const labels = new Map(list.map((a) => [a.address, tabLabels.get(a.tab) ?? (a.title || a.program?.name || "")]));
		const label = (a) => labels.get(a.address);
		const detail = new Map(list.map((a) => [a.address, /^\d+$/.test(label(a)) ? null : label(a)]));
		const repos = shared("space.repos") ?? {};
		const spaceName = (a) => repos[a.space] || a.space_name;
		const seen = {};
		for (const a of list) {
			const k = `${spaceName(a)}\u0000${detail.get(a.address) ?? ""}`;
			seen[k] = (seen[k] ?? 0) + 1;
		}
		for (const a of list) if (detail.get(a.address) == null && seen[`${spaceName(a)}\u0000`] > 1) detail.set(a.address, label(a));
		const avatars = shared("space.avatars") ?? {};
		const row = (a, i, subs = []) => {
			const pic = avatars[a.space] ? image(avatars[a.space]).size(16).flex_none().rounded(4) : icon(a.program, 16, t.foreground);
			const more = detail.get(a.address);
			const machine = a.address.includes("/") ? a.address.split("/")[0] : null;
			if (collapsed) return h_flex().id(`ag-${a.address}`).h(26).px(8).flex_none().items_center().gap(4).hover((s) => s.bg(t.hover)).on_click(() => run("pane.focus", { pane: a.pane })).child(div().flex_1().min_w(0).whitespace_nowrap().text_right().text_color(t.muted).child(String(i + 1))).child(h_flex().w(14).flex_none().items_center().justify_center().child(this.status(t, a, true)));
			const when = this.since(a);
			const idle = a.status === "idle" && !a.focused;
			const isPinned = a.pinned;
			const pin = div().id(`pin-${a.address}`).flex_none().p(2).rounded(4).text_color(t.dim).cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground)).tooltip(isPinned ? "Unpin" : "Pin to the top").on_click((_e, cx) => {
				cx.stop_propagation();
				run("terminal.pin", {
					terminal: a.address,
					pinned: !isPinned
				});
				this.hovered = null;
				cx.notify();
			}).child(svg(`mods/workspace-chrome/${isPinned ? "pin-off" : "pin"}.svg`).size(13));
			const name = spaceName(a) || label(a);
			return h_flex().id(`ag-${a.address}`).px(8).h(30).flex_none().rounded(8).items_center().gap(9).when(a.focused, (el) => el.bg(t.selected)).cursor_pointer().hover((s) => s.bg(t.hover)).on_hover((on, cx) => {
				if (on) this.hovered = a.address;
				else if (this.hovered === a.address) this.hovered = null;
				cx.notify();
			}).on_click(() => run("pane.focus", { pane: a.pane })).when(Boolean(pic), (el) => el.child(div().id(`agent-fold-${a.address}`).when(subs.length > 0, (el) => el.on_click((_e, cx) => {
				cx.stop_propagation();
				this.toggleFold(a.address);
				cx.notify();
			})).child(pic))).child(h_flex().flex_1().min_w(0).gap(5).items_center().child(div().min_w(0).max_w(more ? 120 : 200).truncate().text_color(idle ? t.muted : t.foreground).child(name)).when(Boolean(more), (el) => el.child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(`\u00b7 ${more}`)))).when(Boolean(machine), (el) => el.child(div().text_size(10).text_color(t.dim).child(machine))).when(subs.length > 0, (el) => el.child(fold(a, subs))).when(this.hovered === a.address, (el) => el.child(pin)).when(this.hovered !== a.address && Boolean(when), (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child(duration(now - when)))).child(this.status(t, a, !isPinned));
		};
		const groups = pinned.length ? [{
			id: "pinned",
			label: "Pinned",
			status: null,
			members: pinned
		}] : [];
		groups.push(...[
			4,
			3,
			2,
			1
		].map((r) => ({
			id: `sec-${r}`,
			label: SECTION[r],
			status: SECTION_STATUS[r],
			members: rest.filter((a) => (rankOf(a) || RANK.idle) === r)
		})));
		if (!this.seeded && rest.length) {
			this.seeded = true;
			const first = groups.find((g) => g.id.startsWith("sec-") && g.members.length);
			for (const g of groups) if (g.id.startsWith("sec-") && g !== first) this.folded.add(g.id);
		}
		const isFolded = (g) => this.folded.has(g.id);
		const header = (g) => {
			const open = !isFolded(g);
			return h_flex().id(g.id).px(8).pt(8).h(30).flex_none().gap(6).items_center().text_size(11).font_medium().cursor_pointer().hover((s) => s.text_color(t.foreground)).on_click((_e, cx) => {
				this.toggleFold(g.id);
				cx.notify();
			}).child(div().truncate().text_color(t[g.status] ?? t.dim).child(g.label)).child(div().text_color(t.dim).child(String(g.members.length))).child(div().flex_1()).when(!open, (el) => el.child(svg("mods/workspace-chrome/chevron-right.svg").size(11).flex_none().text_color(t.dim)));
		};
		const rows = collapsed ? list.flatMap(withKids) : groups.flatMap((g) => [header(g), ...isFolded(g) ? [] : g.members.flatMap(withKids)]);
		return v_flex().size_full().min_h(0).bg(t.chrome).border_t(1).border_color(t.border).text_size(13).when(!collapsed, (el) => el.child(h_flex().px(16).h(41).pt(14).pb(5).flex_none().items_center().justify_between().child(div().text_size(11.5).font_medium().text_color(t.dim).child("Agents")))).when(list.length === 0 && !collapsed, (el) => el.child(div().px(12).text_size(12).text_color(t.dim).child("No agent status yet. Agents show up here when they report their status. Older versions and agents inside tmux may not."))).child(v_flex().id("ag-list").flex_1().min_h(0).px(collapsed ? 0 : 8).overflow_y_scrollbar().mode("always").children(rows)).when(collapsed, (el) => el.child(h_flex().h(28).items_center().justify_center().child(div().id("collapse").text_size(13).text_color(t.dim).hover((s) => s.text_color(t.foreground)).on_click(toggleSidebar).child("»"))));
	}
};
//#endregion
export { Agents as default };
