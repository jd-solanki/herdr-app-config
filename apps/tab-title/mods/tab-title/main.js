import { View, div } from "gpui-kit";
import { exec, notify, panes, run, setShared, shared, spaces } from "herdr";

const ISSUE_NAME = /^#(\d+)$/;

// Only a name that is exactly #<number>, so the mod's own rename never matches again.
export const issueNumber = (tabName) => tabName.match(ISSUE_NAME)?.[1];

const MAX_TITLE_LENGTH = 40;

export function tabLabel(issueNumber, { title, isPullRequest }) {
  // Code points, so an emoji is never cut in half.
  const characters = Array.from(title);
  const clamped =
    characters.length > MAX_TITLE_LENGTH
      ? `${characters.slice(0, MAX_TITLE_LENGTH - 1).join("")}…`
      : title;
  return `${isPullRequest ? "🔀" : "🛠️"} #${issueNumber} ${clamped}`;
}

const nameOf = (tabId) =>
  spaces()
    .flatMap((space) => space.tabs)
    .find((tab) => tab.id === tabId)?.name;

// An unnamed tab's agent title (Claude Code sets one per session), unless it's a path,
// user@host or the program name. Published, never renamed in: a rename marks the tab named
// and outlives the agent.
function agentTitles() {
  const titles = {};
  for (const tab of spaces().flatMap((space) => space.tabs)) {
    const pane =
      panes().find((p) => p.tab === tab.id && p.program?.agent) ??
      panes().find((p) => p.tab === tab.id);
    const program = pane?.program;
    if (tab.named && tab.name !== program?.name) continue;
    const live = (pane?.title ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
    const telling =
      live &&
      live !== program?.name &&
      live.toLowerCase() !== program?.key &&
      !/^[~/]|^[A-Za-z]:\\/.test(live) &&
      !live.includes("@");
    if (telling) titles[tab.id] = live;
  }
  return titles;
}

// The app has no tab events: render runs whenever spaces change, so it looks for tabs named #<number>.
export default class TabTitle extends View {
  init() {
    // `<tab id> <name>` already looked up, so a failed lookup isn't retried on every change.
    this.tried = new Set();
  }

  render(cx) {
    const titles = agentTitles();
    // tab-bar's label slot: a tab bar that reads it shows these for unnamed tabs.
    if (JSON.stringify(titles) !== JSON.stringify(shared("tab-bar.labels") ?? {}))
      setShared("tab-bar.labels", titles);
    const now = spaces().flatMap((space) => space.tabs.map((tab) => ({ space, tab })));
    // Forget names a tab no longer has, so naming it #123 again retries.
    this.tried = new Set(
      now.map(({ tab }) => `${tab.id} ${tab.name}`).filter((key) => this.tried.has(key)),
    );
    for (const { space, tab } of now) {
      const number = issueNumber(tab.name);
      const key = `${tab.id} ${tab.name}`;
      if (!number || this.tried.has(key)) continue;
      const tabPanes = panes().filter((pane) => pane.tab === tab.id && pane.cwd);
      // gh reads the repo from the folder's git remote, so it must be the tab's, never Herdr's.
      const cwd = (tabPanes.find((pane) => pane.focused) ?? tabPanes[0])?.cwd;
      // A new tab's terminal reports its folder a moment later, and that change renders again.
      if (!cwd) continue;
      this.tried.add(key);
      cx.spawn(async () => {
        try {
          await this.title(space, tab, number, cwd);
        } catch (error) {
          notify({
            title: `Tab ${tab.name}: no title`,
            body: error.message,
            level: "error",
          });
        }
      });
    }
    return div();
  }

  async title(space, tab, number, cwd) {
    // The issues endpoint answers for pull requests too, and gives only a pull request the pull_request key.
    const gh = await exec(
      "gh",
      [
        "api",
        `repos/{owner}/{repo}/issues/${number}`,
        "--jq",
        "{title, isPullRequest: (.pull_request != null)}",
      ],
      { cwd, on: space.machine },
    );
    if (gh.code !== 0) throw new Error(gh.stderr.trim() || `gh exited ${gh.code}`);
    // Someone renamed it while gh ran: theirs wins.
    if (nameOf(tab.id) !== tab.name) return;
    run("tab.rename", { id: tab.id, name: tabLabel(number, JSON.parse(gh.stdout)) });
  }
}
