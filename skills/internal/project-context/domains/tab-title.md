# Tab title

confidence: exploratory — a source mod not built for publication yet; it may depend on other
mods or layouts, and nobody has reviewed its code for publishing.

## Fences

- **Only a name of exactly `#` and digits matches**, so the mod's own rename to the title
  never matches again. `src/mods/tab-title/main.js:issueNumber`
- **gh reads the repo from the tab's own folder**, never Herdr's, so a tab opened outside
  the clone looks up the wrong repo. `src/mods/tab-title/main.js:TabTitle`

## Where it lives

`src/mods/tab-title/`
