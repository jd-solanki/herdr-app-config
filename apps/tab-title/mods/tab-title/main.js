import { View, div } from "gpui-kit";
import { exec, notify, panes, run, setShared, shared, spaces } from "herdr";
//#region apps/tab-title/src/main.ts
const ISSUE_NAME = /^#(\d+)$/;
const issueNumber = (tabName) => tabName.match(ISSUE_NAME)?.[1];
const MAX_TITLE_LENGTH = 40;
function tabLabel(issueNumber, { title, isPullRequest }) {
	const characters = Array.from(title);
	const clamped = characters.length > MAX_TITLE_LENGTH ? `${characters.slice(0, 39).join("")}…` : title;
	return `${isPullRequest ? "🔀" : "🛠️"} #${issueNumber} ${clamped}`;
}
const nameOf = (tabId) => spaces().flatMap((space) => space.tabs).find((tab) => tab.id === tabId)?.name;
function agentTitles() {
	const titles = {};
	for (const tab of spaces().flatMap((space) => space.tabs)) {
		const pane = panes().find((p) => p.tab === tab.id && p.program?.agent) ?? panes().find((p) => p.tab === tab.id);
		const program = pane?.program;
		if (tab.named && tab.name !== program?.name) continue;
		const live = (pane?.title ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
		if (live && live !== program?.name && live.toLowerCase() !== program?.key && !/^[~/]|^[A-Za-z]:\\/.test(live) && !live.includes("@")) titles[tab.id] = live;
	}
	return titles;
}
var TabTitle = class extends View {
	init() {
		this.tried = /* @__PURE__ */ new Set();
	}
	render(cx) {
		const titles = agentTitles();
		if (JSON.stringify(titles) !== JSON.stringify(shared("tab-bar.labels") ?? {})) setShared("tab-bar.labels", titles);
		const now = spaces().flatMap((space) => space.tabs.map((tab) => ({
			space,
			tab
		})));
		this.tried = new Set(now.map(({ tab }) => `${tab.id} ${tab.name}`).filter((key) => this.tried.has(key)));
		for (const { space, tab } of now) {
			const number = issueNumber(tab.name);
			const key = `${tab.id} ${tab.name}`;
			if (!number || this.tried.has(key)) continue;
			const tabPanes = panes().filter((pane) => pane.tab === tab.id && pane.cwd);
			const cwd = (tabPanes.find((pane) => pane.focused) ?? tabPanes[0])?.cwd;
			if (!cwd) continue;
			this.tried.add(key);
			cx.spawn(async () => {
				try {
					await this.title(space, tab, number, cwd);
				} catch (error) {
					notify({
						title: `Tab ${tab.name}: no title`,
						body: error.message,
						level: "error"
					});
				}
			});
		}
		return div();
	}
	async title(space, tab, number, cwd) {
		const gh = await exec("gh", [
			"api",
			`repos/{owner}/{repo}/issues/${number}`,
			"--jq",
			"{title, isPullRequest: (.pull_request != null)}"
		], {
			cwd,
			on: space.machine
		});
		if (gh.code !== 0) throw new Error(gh.stderr.trim() || `gh exited ${gh.code}`);
		if (nameOf(tab.id) !== tab.name) return;
		run("tab.rename", {
			id: tab.id,
			name: tabLabel(number, JSON.parse(gh.stdout))
		});
	}
};
//#endregion
export { TabTitle as default, issueNumber, tabLabel };
