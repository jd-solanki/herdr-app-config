# Tab title

confidence: exploratory — a source mod not built for publication yet; it may depend on other
mods or layouts, and nobody has reviewed its code for publishing.

## Fences

- **Only a name of exactly `#` and digits matches**, so the mod's own rename to the title
  never matches again. `src/mods/tab-title/main.js:issueNumber`
- **gh reads the repo from the tab's own folder**, never Herdr's, so a tab opened outside
  the clone looks up the wrong repo. `src/mods/tab-title/main.js:TabTitle`
- **Agent titles are published, never renamed in.** A rename marks the tab named and
  outlives the agent, so the bar shows the `tab.titles` shared key instead.
  `src/mods/tab-title/main.js:agentTitles`
- **It runs only while a layout shows its block.** Herdr starts a mod only for a shown slot
  and has no startup hook (herdr-app#288), so a layout with the bar but without the 0px
  `tab-title` block shows program names, and `#123` renames wait until it shows.
  `src/layouts/workspace.json`

## Where it lives

`src/mods/tab-title/`
