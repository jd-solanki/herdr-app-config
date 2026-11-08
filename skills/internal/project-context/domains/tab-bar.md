# Tab bar

## Words

**Declared button**:
A tab bar button a mod names in the `button` field of its own `mod.json`; Herdr ignores the
field.
_Avoid_: registered button, plugin button

## Rules

- Other mods add buttons only by declaring them; the bar knows no button's mod by name.

## Fences

- **A button lives in its mod's `mod.json`, never registered at run time.** A mod runs only
  while a layout shows it, and Herdr has no startup hook (herdr-app#288), so a button its mod
  registered itself could never open that mod. `apps/tab-bar/src/main.ts:declaredButtons`
- **It is a clone of Herdr's `tabs`.** Herdr's tab bar is read-only, so hosting buttons needs
  the clone, and Herdr's updates to `tabs` never reach it. `apps/tab-bar/mods/tab-bar/mod.json`
- **Agent titles are shown, never renamed in.** A rename marks the tab named and outlives the
  agent. `apps/tab-bar/src/tab-names.ts:agentTitles`
- **Only a name of exactly `#` and digits is looked up**, so the bar's own rename to the title
  never matches again. `apps/tab-bar/src/tab-names.ts:issueNumber`
- **gh reads the repo from the tab's own folder**, never Herdr's, so a tab opened outside the
  clone looks up the wrong repo. `apps/tab-bar/src/tab-names.ts:IssueTabs`

## Where it lives

`apps/tab-bar/` (behaviour: its recipe), the tab bar block's `props.buttons` in
`src/layouts/workspace.json`
