# GitHub inbox

## Fences

- **A submitted query outlives the default.** Once the person submits a query, the inbox
  keeps it across restarts; changing the default query reaches only fresh installs.
  `apps/github-inbox/mods/github-inbox/main.js:GithubInbox`
- **It stands alone.** It reads no shared key and needs no other mod or layout: the
  `workspace` layout's panel and `workspace-tabs`' Inbox button are this repo's own wiring,
  not part of the app. `apps/github-inbox/`

## Where it lives

`apps/github-inbox/` (behaviour: its recipe)
