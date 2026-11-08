import { View, div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { appHome, exec, hc, layout, machines, openOverlay, panes, run, setShared, shared, spaces, theme, watchFolder, window } from "herdr";
//#region apps/spaces-avatars/src/main.ts
function find(node, id) {
	if (node?.id === id) return node;
	for (const child of node?.children ?? []) {
		const found = find(child, id);
		if (found) return found;
	}
	return null;
}
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;
function place(s, ps) {
	const tabs = new Set((s.tabs ?? []).map((c) => c.id));
	return ps.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
}
const rowHeight = ({ tree }) => tree ? 28 : 30;
const where = (s, ps) => JSON.stringify([s.machine ?? null, place(s, ps)]);
const base = (path) => path.replace(/\/+$/, "").split("/").pop();
const title = (w, g) => !w.named && g?.name || w.name;
const FALLBACK = 6e4;
const MARK = {
	ansi6: "#22a99a",
	ansi3: "#e3814f",
	ansi4: "#5b8def",
	ansi5: "#8b7cf6",
	ansi2: "#3fae6a",
	ansi1: "#d9649a"
};
const spaceColors = () => shared("space.colors") ?? {};
const AVATARS = "mods/spaces-avatars/.avatars";
const AVATAR_PX = 54;
const githubOwner = (url) => url.match(/^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?(?:www\.|ssh\.)?github\.com(?::\d+\/|[:/])([\w-]+)\//i)?.[1] ?? null;
function treeCounts(status) {
	const counts = {
		untracked: 0,
		modified: 0,
		deleted: 0,
		unmerged: 0
	};
	for (const line of status.split("\n")) if (line.startsWith("? ")) counts.untracked++;
	else if (line.startsWith("u ")) counts.unmerged++;
	else if (/^[12] /.test(line)) counts[line.split(" ")[1].includes("D") ? "deleted" : "modified"]++;
	return counts;
}
function glyph(status) {
	return status === "blocked" || status === "done" ? "●" : "·";
}
function tone(t, status) {
	return t[status] ?? t.unknown;
}
var Spaces = class extends View {
	init(_props, cx) {
		this.git = {};
		this.avatars = /* @__PURE__ */ new Map();
		this.checked = {};
		this.unsure = /* @__PURE__ */ new Set();
		this.pending = /* @__PURE__ */ new Set();
		this.busy = {};
		this.ready = {};
		this.at = {};
		this.watching = /* @__PURE__ */ new Set();
		this.shown = new Set(spaces().map((s) => s.id));
		this.born = {};
		this.pressed = null;
		this.over = null;
		this.machines = [];
		this.folded = new Set(JSON.parse(localStorage.getItem("machines.folded") ?? "[]"));
		this.refreshMachines(cx);
		cx.timer.every(15e3, (cx) => this.refreshMachines(cx));
		cx.timer.every(250, (cx) => this.checkNew(cx));
	}
	checkNew(cx) {
		const now = Date.now();
		const sp = spaces();
		for (const s of sp) if (!this.shown.has(s.id)) this.born[s.id] ??= now;
		const due = this.due(now, sp, panes());
		if (due.size) this.refreshGit(due, cx);
		if (sp.some((s) => !this.shown.has(s.id))) cx.notify();
	}
	due(now, sp, ps) {
		const at = {};
		for (const s of sp) at[s.id] = where(s, ps);
		const keys = new Set(Object.values(at).filter((k) => JSON.parse(k)[1]));
		const due = new Set([...keys].filter((k) => !(k in this.git)));
		for (const [id, k] of Object.entries(at)) if (this.at[id] && this.at[id] !== k && keys.has(k)) due.add(k);
		this.at = at;
		const spaceOf = {};
		for (const s of sp) for (const t of s.tabs ?? []) spaceOf[t.id] = s;
		const busy = {};
		for (const p of ps) {
			if (!p.terminal || !spaceOf[p.tab]) continue;
			busy[p.pane] = p.status === "working" || !(p.program?.shell || p.program?.agent);
			if (this.busy[p.pane] && !busy[p.pane]) this.sameRepo(at[spaceOf[p.tab].id], keys).forEach((k) => due.add(k));
		}
		this.busy = busy;
		for (const m of machines()) {
			const ready = m.layout === "ready";
			if (ready && this.ready[m.name] === false) {
				for (const k of keys) if (JSON.parse(k)[0] === m.name) due.add(k);
			}
			this.ready[m.name] = ready;
		}
		if (window().active) {
			for (const k of keys) if ((this.git[k] || this.unsure.has(k)) && !this.folded.has(JSON.parse(k)[0]) && now - (this.checked[k] ?? 0) > FALLBACK) due.add(k);
		}
		return due;
	}
	sameRepo(key, keys) {
		const repo = this.git[key]?.repo;
		return [key, ...repo ? [...keys].filter((k) => this.git[k]?.repo === repo) : []];
	}
	refreshMachines(cx) {
		cx.spawn(async (cx) => {
			try {
				const r = await hc([
					"machine",
					"ls",
					"--json"
				]);
				if (r.code === 0) this.machines = (JSON.parse(r.stdout).machines ?? []).filter((m) => !m.temporary);
			} catch {}
			cx.notify();
		});
	}
	refreshGit(keys, cx) {
		for (const k of keys) this.pending.add(k);
		if (this.refreshing) return;
		this.refreshing = true;
		cx.spawn(async (cx) => {
			while (this.pending.size) {
				const keys = [...this.pending];
				this.pending.clear();
				for (const key of keys) await this.check(key, cx);
			}
			const used = new Set(Object.values(this.git).filter(Boolean).map((g) => JSON.parse(g.repo)).filter(([on]) => !on).map(([, repo]) => repo));
			for (const repo of this.watching) if (!used.has(repo)) this.watching.delete(repo);
			this.refreshing = false;
			cx.notify();
		});
	}
	async check(key, cx) {
		const [on, cwd] = JSON.parse(key);
		this.checked[key] = Date.now();
		this.unsure.delete(key);
		try {
			const r = await exec("git", [
				"--no-optional-locks",
				"-c",
				"core.fsmonitor=false",
				"status",
				"--porcelain=v2",
				"--branch"
			], {
				cwd,
				on
			});
			if (r.code !== 0) {
				if (!/not a git repository/i.test(r.stderr)) this.unsure.add(key);
				this.git[key] = null;
				return;
			}
			const top = await exec("git", ["rev-parse", "--show-toplevel"], {
				cwd,
				on
			});
			const repo = (await exec("git", [
				"rev-parse",
				"--path-format=absolute",
				"--git-common-dir"
			], {
				cwd,
				on
			})).stdout.trim();
			const name = repo.endsWith("/.git") ? base(repo.slice(0, -5)) : base(repo).replace(/\.git$/, "");
			const origin = await exec("git", [
				"remote",
				"get-url",
				"origin"
			], {
				cwd,
				on
			});
			const owner = githubOwner(origin.stdout);
			const info = {
				name,
				branch: null,
				ahead: 0,
				behind: 0,
				repo: JSON.stringify([on, repo]),
				linked: repo !== `${top.stdout.trim()}/.git`,
				owner,
				...treeCounts(r.stdout)
			};
			for (const line of r.stdout.split("\n")) if (line.startsWith("# branch.head ")) info.branch = line.slice(14);
			else if (line.startsWith("# branch.ab ")) {
				const [a, b] = line.slice(12).split(" ");
				info.ahead = Math.abs(parseInt(a, 10)) || 0;
				info.behind = Math.abs(parseInt(b, 10)) || 0;
			}
			this.git[key] = info;
			if (!on) this.watch(repo, cx);
			if (owner) this.fetchAvatar(owner, cx);
		} catch {
			this.git[key] ??= null;
			this.unsure.add(key);
		}
	}
	fetchAvatar(owner, cx) {
		if (this.avatars.has(owner)) return;
		this.avatars.set(owner, null);
		const file = `${AVATARS}/${owner}.png`;
		const path = `${appHome()}/${file}`;
		const show = async (cx) => {
			if ((await exec("test", ["-s", path])).code !== 0) return false;
			this.avatars.set(owner, file);
			cx.notify();
			return true;
		};
		cx.spawn(async (cx) => {
			try {
				await show(cx);
				if ((await exec("curl", [
					"-fsSL",
					"--max-time",
					"10",
					"--create-dirs",
					"-o",
					`${path}.tmp`,
					`https://github.com/${owner}.png?size=${AVATAR_PX}`
				])).code === 0) await exec("mv", [
					"-f",
					`${path}.tmp`,
					path
				]);
				if (!await show(cx)) this.avatars.delete(owner);
			} catch {
				this.avatars.delete(owner);
			}
		});
	}
	watch(repo, cx) {
		if (this.watching.has(repo)) return;
		this.watching.add(repo);
		cx.spawn(async (cx) => {
			try {
				while (this.watching.has(repo)) {
					await watchFolder(repo);
					const mine = JSON.stringify([null, repo]);
					if (this.watching.has(repo)) this.refreshGit(Object.keys(this.git).filter((k) => this.git[k]?.repo === mine), cx);
				}
			} catch {
				this.watching.delete(repo);
			}
		});
	}
	menu(w) {
		openOverlay({
			mod: "menu",
			kind: "popup",
			width: 200,
			height: 260,
			props: {
				tab: "space",
				target: { id: w.id }
			}
		});
	}
	ordered(ps) {
		const sp = spaces();
		const ready = (w) => this.shown.has(w.id) || where(w, ps) in this.git || Date.now() - (this.born[w.id] ??= Date.now()) > 1500;
		for (const w of sp) if (!this.shown.has(w.id) && ready(w)) this.shown.add(w.id);
		const list = sp.map((w, i) => ({
			w,
			i,
			g: this.git[where(w, ps)] ?? null
		})).filter((r) => this.shown.has(r.w.id));
		const mains = new Set(list.filter((r) => r.g && !r.g.linked).map((r) => r.g.repo));
		const nested = (r) => r.g?.linked && mains.has(r.g.repo);
		const out = [];
		const placed = /* @__PURE__ */ new Set();
		for (const r of list) {
			if (nested(r)) continue;
			out.push({
				...r,
				tree: null
			});
			if (!r.g || r.g.linked || placed.has(r.g.repo)) continue;
			placed.add(r.g.repo);
			const kids = list.filter((k) => nested(k) && k.g.repo === r.g.repo);
			kids.forEach((k, n) => out.push({
				...k,
				tree: n === kids.length - 1 ? "└─" : "├─"
			}));
		}
		return out;
	}
	grouped(t, collapsed) {
		const ps = panes();
		const rows = this.ordered(ps);
		const avatars = Object.fromEntries(rows.filter((r) => this.avatars.get(r.g?.owner)).map((r) => [r.w.id, this.avatars.get(r.g.owner)]));
		if (JSON.stringify(avatars) !== JSON.stringify(shared("space.avatars") ?? {})) setShared("space.avatars", avatars);
		const repos = Object.fromEntries(rows.filter((r) => r.g).map((r) => [r.w.id, title(r.w, r.g)]));
		if (JSON.stringify(repos) !== JSON.stringify(shared("space.repos") ?? {})) setShared("space.repos", repos);
		const draw = (r) => collapsed ? this.compact(r, t) : this.spaceGroup(r, t);
		const remote = [.../* @__PURE__ */ new Set([...rows.map((r) => r.w.machine).filter(Boolean), ...this.machines.map((m) => m.name)])].sort();
		const loading = (m) => {
			const layout = machines().find((k) => k.name === m)?.layout;
			return layout === "loading" || !layout && this.machines.some((k) => k.name === m && k.state === "connected") || spaces().some((s) => (s.machine ?? null) === m && !this.shown.has(s.id));
		};
		const loadingRow = (m) => div().id(`machine-loading-${m ?? "local"}`).h(28).flex_none().px(8).text_size(12).text_color(t.dim).child(collapsed ? "…" : "Loading…");
		if (!remote.length) return loading(null) && !rows.length ? [loadingRow(null)] : rows.map(draw);
		return [null, ...remote].flatMap((m) => {
			const mine = rows.filter((r) => (r.w.machine ?? null) === m);
			const machine = this.machines.find((k) => k.name === m);
			const connected = !m || machine?.state === "connected";
			const folded = this.folded.has(m);
			const head = h_flex().id(`machine-${m ?? "local"}`).h(26).flex_none().px(collapsed ? 2 : 8).gap(7).items_center().text_size(11).text_color(t.dim).cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => {
				if (folded) this.folded.delete(m);
				else this.folded.add(m);
				localStorage.setItem("machines.folded", JSON.stringify([...this.folded]));
				cx.notify();
			}).child(svg(`mods/workspace-chrome/${m ? "server" : "monitor"}.svg`).size(13).flex_none()).when(!collapsed, (el) => el.child(div().flex_1().truncate().child(m ?? "This computer")).when(!connected, (el) => el.child(div().flex_none().child((machine?.state ?? "asleep").replace(/_/g, " ")))).when(connected, (el) => el.child(div().id(`machine-add-${m ?? "local"}`).flex_none().px(4).rounded(4).hover((s) => s.bg(t.hover).text_color(t.foreground)).on_click((_e, cx) => {
				cx.stop_propagation();
				run("space.new", m ? { machine: m } : {});
			}).child("+"))).child(div().size(6).rounded(3).flex_none().bg(connected ? t.ansi2 : t.dim)).child(svg(`mods/workspace-chrome/chevron-${folded ? "right" : "down"}.svg`).size(11).flex_none()));
			const empty = h_flex().id(`machine-new-${m ?? "local"}`).h(28).flex_none().px(8).gap(7).items_center().rounded(7).text_size(12).text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground)).on_click(() => run("space.new", m ? { machine: m } : {})).child(svg("mods/workspace-chrome/plus.svg").size(12)).when(!collapsed, (el) => el.child("New space there"));
			return [head, ...folded ? [] : mine.length ? mine.map(draw) : [loading(m) ? loadingRow(m) : empty]];
		});
	}
	gitTail(g, tree, name, t) {
		const raw = g.branch ?? "detached";
		const same = (a) => a.toLowerCase() === name.toLowerCase();
		const branch = same(raw) || raw === "master" || raw === "main" ? "" : raw;
		const where = [tree || same(g.name) ? "" : g.name, branch].filter(Boolean).join(" · ");
		const shown = (parts) => parts.filter(([, count]) => count > 0);
		const commits = shown([[
			"↓",
			g.behind,
			t.ansi12
		], [
			"↑",
			g.ahead,
			t.ansi13
		]]);
		const changes = shown([
			[
				"?",
				g.untracked,
				t.ansi2
			],
			[
				"M",
				g.modified,
				t.ansi6
			],
			[
				"D",
				g.deleted,
				t.ansi1
			],
			[
				"U",
				g.unmerged,
				t.ansi9
			]
		]);
		const count = ([glyph, n, color]) => div().flex_none().text_color(color).child(`${glyph}${n}`);
		const place = h_flex().flex_1().min_w(0).justify_end().text_size(11.5).text_color(t.dim).when(Boolean(where), (el) => el.child(div().min_w(0).truncate().child(where)));
		const counts = h_flex().flex_none().gap(5).items_center().text_size(11.5).text_color(t.dim).children(commits.map(count)).when(commits.length > 0 && changes.length > 0, (el) => el.child(div().flex_none().child("·"))).children(changes.map(count));
		return commits.length + changes.length ? [place, counts] : [place];
	}
	row({ w, i, g, tree }, t) {
		const on = w.active;
		const color = spaceColors()[w.id] ?? "ansi6";
		const fill = color.startsWith("#") ? color : MARK[color] ?? t[color];
		const avatar = this.avatars.get(g?.owner);
		const name = title(w, g);
		return v_flex().id(`space-${w.id}`).px(8).h(rowHeight({ tree })).flex_none().justify_center().rounded(8).when(on, (el) => el.bg(t.selected)).when(!on, (el) => el.hover((s) => s.bg(t.hover))).when(this.pressed === i && this.over !== i, (el) => el.opacity(.5)).on_mouse_down("left", () => {
			this.pressed = i;
			this.over = i;
		}).on_mouse_down("right", () => this.menu(w)).child(h_flex().gap(9).items_center().when(Boolean(tree), (el) => el.pl(22).child(svg("mods/workspace-chrome/branch.svg").size(13).flex_none().text_color(t.dim))).when(!tree, (el) => el.child(avatar ? image(avatar).size(18).flex_none().rounded(5) : h_flex().size(18).flex_none().rounded(5).bg(fill).items_center().justify_center().text_size(10.5).font_bold().text_color("#ffffff").child([...name][0]?.toUpperCase() ?? "?"))).child(div().min_w(0).max_w(150).truncate().text_color(t.foreground).child(name)).children(g ? this.gitTail(g, tree, name, t) : [div().flex_1()]));
	}
	spaceGroup(r, t) {
		const { w, i } = r;
		return v_flex().relative().id(`space-group-${w.id}`).flex_none().on_mouse_move((_e, cx) => {
			const source = spaces()[this.pressed];
			const over = source && (source.machine ?? null) === (w.machine ?? null) ? i : null;
			if (this.pressed !== null && this.over !== over) {
				this.over = over;
				cx.notify();
			}
		}).on_mouse_up("left", (_e, cx) => {
			const from = this.pressed;
			const over = this.over;
			this.pressed = null;
			this.over = null;
			if (from !== null && over === i && from !== i) run("space.move", {
				id: spaces()[from].id,
				index: i + 1
			});
			else if (from === i) run("space.select", { id: w.id });
			cx.notify();
		}).child(this.row(r, t)).when(this.pressed !== null && this.over === i && this.pressed !== i, (el) => el.child(div().absolute().left(0).right(0).h(2).bg(t.accent).when(this.pressed < i, (line) => line.bottom(0)).when(this.pressed > i, (line) => line.top(0))));
	}
	compact({ w, i }, t) {
		return h_flex().id(`space-${w.id}`).h(26).flex_none().justify_center().gap(4).when(w.active, (el) => el.bg(t.raised)).hover((s) => s.bg(t.hover)).on_click(() => run("space.select", { id: w.id })).child(div().text_color(w.active ? t.foreground : t.muted).child(String(i + 1))).child(div().text_color(tone(t, w.status)).child(glyph(w.status)));
	}
	render() {
		const t = theme();
		const collapsed = narrow();
		const palette = [
			"ansi6",
			"ansi3",
			"ansi4",
			"ansi5",
			"ansi2",
			"ansi1"
		];
		const sp = spaces();
		const ids = new Set(sp.map((p) => p.id));
		const kept = Object.fromEntries(Object.entries(spaceColors()).filter(([id]) => ids.has(id)));
		let changed = Object.keys(kept).length !== Object.keys(spaceColors()).length;
		for (const p of sp) {
			if (kept[p.id] || p.name === "~") continue;
			const uses = (c) => Object.values(kept).filter((v) => v === c).length;
			kept[p.id] = palette.reduce((best, c) => uses(c) < uses(best) ? c : best);
			changed = true;
		}
		if (changed) setShared("space.colors", kept);
		return v_flex().size_full().min_h(0).bg(t.chrome).text_size(13).child(h_flex().h(31).pl(16).pr(10).items_center().justify_between().text_size(11.5).text_color(t.dim).when(!collapsed, (el) => el.child("Spaces")).child(div().id("space-new").size(26).flex_none().flex().items_center().justify_center().rounded(6).hover((s) => s.bg(t.hover).text_color(t.foreground)).on_click(() => run("space.new")).child(svg("mods/workspace-chrome/plus.svg").size(14)))).child(v_flex().flex_1().min_h(0).px(8).pb(14).overflow_y_scrollbar().mode("always").on_mouse_up("left", (_e, cx) => {
			this.pressed = null;
			cx.notify();
		}).children(this.grouped(t, collapsed)));
	}
};
//#endregion
export { Spaces as default, glyph, tone };
