import { View, div } from "gpui-kit";
import { exec, notify, panes, run, spaces } from "herdr";

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

// The app has no tab events: render runs whenever spaces change, so it looks for tabs named #<number>.
export default class TabTitle extends View {
  init() {
    // `<tab id> <name>` already looked up, so a failed lookup isn't retried on every change.
    this.tried = new Set();
  }

  render(cx) {
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
            body: String(error.message ?? error),
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
