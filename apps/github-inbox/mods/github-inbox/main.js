import { View, div, svg } from "gpui-kit";
import { Input, InputState, Popup, h_flex, v_flex } from "gpui-base";
import { exec, theme } from "herdr";
//#region packages/github-search/src/qualifiers.ts
const SHARED = [
	"is:open",
	"is:closed",
	"label:",
	"no:label",
	"no:assignee",
	"assignee:@me",
	"author:@me",
	"involves:@me",
	"mentions:@me"
];
const SORTS = [
	"sort:updated-desc",
	"sort:created-desc",
	"sort:comments-desc"
];
const PULL_ONLY = [
	"is:merged",
	"is:draft",
	"review-requested:@me",
	"review:required",
	"review:approved",
	"review:changes_requested"
];
[...SHARED, ...SORTS];
[
	...SHARED.slice(0, 2),
	...PULL_ONLY.slice(0, 2),
	...SHARED.slice(2),
	...PULL_ONLY.slice(2),
	...SORTS
];
const ACROSS_REPOS_QUALIFIERS = [
	"is:issue",
	"is:pr",
	...SHARED.slice(0, 2),
	...PULL_ONLY.slice(0, 2),
	"repo:",
	"org:",
	...SHARED.slice(2),
	...PULL_ONLY.slice(2)
];
//#endregion
//#region packages/github-search/src/suggestions.ts
function lastWord(query) {
	return query.slice(query.lastIndexOf(" ") + 1);
}
const wantsLabels = (query) => /^-?label:/.test(lastWord(query));
function searchSuggestions(query, qualifiers, labelNames) {
	const word = lastWord(query);
	if (!word.includes(":")) return [];
	const negation = word.startsWith("-") ? "-" : "";
	const typed = word.slice(negation.length).toLowerCase();
	const candidates = typed.startsWith("label:") ? labelNames.filter((name) => name.toLowerCase().includes(typed.slice(6).replace(/^"/, ""))).map((name) => `${negation}label:${name.includes(" ") ? `"${name}"` : name}`) : qualifiers.filter((qualifier) => qualifier.startsWith(typed)).map((qualifier) => negation + qualifier);
	return candidates.some((candidate) => candidate.toLowerCase() === word.toLowerCase()) ? [] : candidates;
}
const queryWords = (query) => query.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
//#endregion
//#region packages/github-search/src/search-box.ts
const SUGGESTIONS_SHOWN = 8;
var SearchBox = class {
	input;
	options;
	open;
	index;
	constructor(options) {
		this.options = options;
		this.open = false;
		this.index = 0;
		this.input = InputState.new({ placeholder: "GitHub search query" });
		this.input.set_value(options.query);
		this.input.on("submit", (_e, cx) => this.submit(cx));
		this.input.on("change", (_e, cx) => this.show(cx));
	}
	set(query) {
		this.input.set_value(query);
		this.open = false;
	}
	value() {
		return this.input.value();
	}
	close() {
		this.open = false;
	}
	suggestions() {
		if (!this.open) return [];
		const { qualifiers, labels } = this.options;
		return searchSuggestions(this.input.value(), qualifiers(), labels()).slice(0, SUGGESTIONS_SHOWN);
	}
	submit(cx) {
		const suggestions = this.suggestions();
		if (suggestions.length) this.accept(suggestions[this.index], cx);
		else {
			this.open = false;
			this.options.submit(this.input.value(), cx);
		}
	}
	show(cx) {
		this.open = true;
		this.index = 0;
		if (wantsLabels(this.input.value())) this.options.needLabels?.(cx);
		cx.notify();
	}
	accept(word, cx) {
		const query = this.input.value();
		const completed = query.slice(0, query.length - lastWord(query).length) + word;
		this.input.set_value(word.endsWith(":") ? completed : `${completed} `);
		this.input.focus();
		this.show(cx);
	}
	dismiss(cx) {
		if (!this.open) return;
		this.open = false;
		cx.notify();
	}
	steer(event, suggestions, cx) {
		if (!suggestions.length) return;
		const count = suggestions.length;
		if (event.key === "down") this.index = (this.index + 1) % count;
		else if (event.key === "up") this.index = (this.index - 1 + count) % count;
		else if (event.key === "tab") return this.stopAfter(cx, () => this.accept(suggestions[this.index], cx));
		else if (event.key === "escape") return this.stopAfter(cx, () => this.dismiss(cx));
		else return;
		cx.notify();
		cx.stop_propagation();
	}
	stopAfter(cx, act) {
		act();
		cx.stop_propagation();
	}
	render(colors) {
		const suggestions = this.suggestions();
		const box = div().h(this.options.height ?? 34).px(10).flex().items_center().rounded(7).border(1).border_color(colors.border).child(Input.new(this.input).flex_1().h_full().text_size(13).text_color(colors.foreground));
		return div().id("search").flex_none().on_key_down((event, cx) => this.steer(event, suggestions, cx)).on_mouse_down_out((_e, cx) => this.dismiss(cx)).child(Popup.new("search-suggestions", box).anchor("top_left").when(suggestions.length > 0, (popup) => popup.content(this.suggestionList(suggestions, colors))));
	}
	suggestionList(suggestions, colors) {
		return v_flex().id("suggestion-list").min_w(260).p(4).gap(2).rounded(8).border(1).border_color(colors.border).bg(colors.surface).text_size(12).children(suggestions.map((word, index) => div().id(`suggestion-${index}`).h(26).px(8).flex().items_center().rounded(5).when(index === this.index, (row) => row.bg(colors.hover)).hover((style) => style.bg(colors.hover)).on_mouse_down("left", (_e, cx) => {
			cx.stop_propagation();
			this.accept(word, cx);
		}).child(word)));
	}
};
//#endregion
//#region apps/github-inbox/src/main.ts
const theme$1 = () => theme();
const DEFAULT_QUERY = "state:open assignee:@me";
const QUERY_KEY = "query";
const REFRESH_MS = 6e4;
const FIELDS = "repository,number,title,author,createdAt,updatedAt,commentsCount,labels,isPullRequest,url";
const ICONS = "mods/github-inbox";
var GithubInbox = class extends View {
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
			}
		});
		cx.timer.every(REFRESH_MS, (cx) => this.refresh(cx));
		this.refresh(cx);
	}
	labelNames() {
		const shown = (this.list?.value ?? []).flatMap((work) => work.labels.map(({ name }) => name));
		const named = this.repoLabels[namedRepo(this.search.value()) ?? ""] ?? [];
		return [.../* @__PURE__ */ new Set([...named, ...shown])].sort((a, b) => a.localeCompare(b));
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
				"name"
			]);
			if (result.code === 0) this.repoLabels[repo] = JSON.parse(result.stdout).map(({ name }) => name);
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
				if (query === this.query && !this.list?.value) this.list = { error: error.message };
			}
			cx.notify();
		});
	}
	render() {
		const colors = theme$1();
		return v_flex().size_full().min_w(0).p(10).gap(10).bg(colors.background).text_size(13).text_color(colors.foreground).child(this.search.render(colors)).child(this.results(colors));
	}
	results(colors) {
		const box = v_flex().flex_1().min_h(0).rounded(8).border(1).border_color(colors.border).overflow_hidden();
		const { value, error } = this.list ?? {};
		const count = value ? `${value.length} result${value.length === 1 ? "" : "s"}` : error ? "Error" : "Loading…";
		return box.child(div().flex_none().px(12).py(9).bg(colors.surface).border_b(1).border_color(colors.border).font_semibold().child(count)).when(Boolean(error), (box) => box.child(div().p(12).text_color(colors.muted).child(error))).when(Boolean(value), (box) => box.child(v_flex().id("github-inbox-rows").flex_1().min_h(0).overflow_y_scrollbar().children(value.map((work) => row(work, colors)))));
	}
};
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
		FIELDS
	];
	const result = await exec("gh", args);
	if (result.code !== 0) throw new Error(result.stderr.trim() || `gh exited ${result.code}`);
	return JSON.parse(result.stdout);
}
function row(work, colors) {
	const icon = svg(`${ICONS}/${work.isPullRequest ? "pr" : "issue"}.svg`).size(16).flex_none().mt(2).text_color(colors.ansi2);
	const meta = `${work.repository.nameWithOwner}#${work.number} · ${work.author.login} opened ${ago(work.createdAt)} · Updated ${ago(work.updatedAt)}`;
	return h_flex().id(`work-${work.url}`).flex_none().px(12).py(10).gap(8).items_start().border_b(1).border_color(colors.border).cursor_pointer().hover((style) => style.bg(colors.hover)).on_click((_e, cx) => {
		try {
			cx.open_url(work.url);
		} catch {}
	}).child(icon).child(v_flex().flex_1().min_w(0).gap(4).child(div().font_semibold().child(work.title)).child(div().text_size(12).text_color(colors.muted).child(meta)).child(h_flex().flex_wrap().gap(4).children(work.labels.map(labelChip)))).when(work.commentsCount > 0, (el) => el.child(h_flex().flex_none().gap(4).items_center().text_size(12).text_color(colors.muted).child(svg(`${ICONS}/comment.svg`).size(14).text_color(colors.muted)).child(String(work.commentsCount))));
}
function labelChip({ name, color }) {
	return div().flex_none().px(8).rounded(10).text_size(11).font_semibold().bg(`#${color}`).text_color(textOn(color)).child(name);
}
function textOn(hex) {
	const [r, g, b] = [
		0,
		2,
		4
	].map((i) => parseInt(hex.slice(i, i + 2), 16));
	return (r * 299 + g * 587 + b * 114) / 1e3 > 150 ? "#1f2328" : "#ffffff";
}
function ago(iso, now = Date.now()) {
	const seconds = Math.max(0, (now - Date.parse(iso)) / 1e3);
	for (const [unit, size] of [
		["year", 31536e3],
		["month", 2592e3],
		["day", 86400],
		["hour", 3600],
		["minute", 60]
	]) {
		const n = Math.floor(seconds / size);
		if (n >= 1) return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
	}
	return "now";
}
function namedRepo(query) {
	return query.match(/(?:^|\s)repo:(\w[\w.-]*\/\w[\w.-]*)(?=\s|$)/)?.[1];
}
//#endregion
export { GithubInbox as default };
