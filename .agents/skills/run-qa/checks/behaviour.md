# Behaviour check

Does the app do the right thing? A behaviour scenario has numbered steps, each naming the result
to see, and may carry a `Fault:` line.

## Steps

Before the first scenario, check ffmpeg as `/capture-media` says. Unattended with no ffmpeg, every
behaviour scenario that uses the browser ends blocked with `needs ffmpeg`.

1. Capture proof as `/capture-media` says, purpose **proof**: one video for a scenario with
   actions, one chapter per step.
2. Make the scenario's own accounts and records first, as its first step says. Sign up as its
   role, or sign in with the accounts the repository documents (seed data, `.env.example`, the
   setup docs). A role with no way in is blocked. Make accounts only on the local app.
3. Force its `Fault:` line as **Force a failure** says.
4. Run the steps in order, comparing what you see with the result each step names. A fail records
   the step; a blocked step stops the steps after it.

**Done when** the scenario has a state, and its media covers every step it ran.

## Force a failure

Take the first way that reaches the failure:

1. **The screen has a data menu offering the state** (`/ux`'s `?data=<option>`: `empty`,
   `loading`, `error`, `worst`): open the page with that option. It shows how the screen renders
   the state, through the same fetch as real data. A scenario about the real failure path, such
   as how the server handles a 500, takes the next ways.
2. **The browser makes the call**: `playwright-cli route "<pattern>" --status <code> --body <body>`
   for an error or a reply in the wrong shape, `playwright-cli network-state-set offline` for
   offline, and `playwright-cli run-code` with a delayed `page.route` for a slow reply or a
   timeout.
3. **The server makes the call**: restart the dev server with that service's URL pointed at a dead
   address, such as `http://127.0.0.1:9`, then restart it as it was after the scenario.
4. **None of these reaches it**: a **fault patch**, a throwaway code change that forces the failure.

A fault patch:

- lives only in the QA checkout: a caller's checkout, or the QA worktree below. It is never
  committed and never pushed.
- fakes only what a dependency returns, or forces a state such as an expired session or an empty
  list. The behaviour the scenario checks stays as the change wrote it.
- goes into the report: `git diff` saved as `<run folder>/<n>.patch`, and the scenario marked
  `🩹 fault patch`.
- is undone after its scenario: `git reset --hard` to where the checkout started, then
  `git clean -fd`, then restart the dev server if it was running.

**The QA worktree.** On the user's working tree, make it the first time a scenario needs a fault
patch, or when the user asks for a fixed snapshot. Snapshot the tree without touching it or its
index:

```shell
export GIT_INDEX_FILE=<run folder>/index
git read-tree HEAD && git add -A
SNAP=$(git commit-tree "$(git write-tree)" -p HEAD -m "qa snapshot")
unset GIT_INDEX_FILE
git worktree add --detach <run folder>/worktree "$SNAP"
```

The snapshot has the edited and untracked files, but no ignored ones: copy the ignored files the
repository lists for new worktrees (such as `.worktreeinclude`), install dependencies, and start
its own dev server as the repository says for a second checkout. Every later scenario of the run
uses it; resetting means `git reset --hard "$SNAP"`.

**Done when** the failure the `Fault:` line names shows in the app, or the scenario is blocked
with why.
