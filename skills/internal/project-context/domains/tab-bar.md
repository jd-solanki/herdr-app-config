# Tab bar

## Words

**Declared button**:
A tab bar button a mod names in the `button` field of its own `mod.json`; Herdr ignores the
field.
_Avoid_: registered button, plugin button

## Rules

- Other mods extend the bar only through declared buttons and the label slot; the bar knows
  no mod by name.

## Fences

- **A button lives in its mod's `mod.json`, never registered at run time.** A mod runs only
  while a layout shows it, and Herdr has no startup hook (herdr-app#288), so a button its mod
  registered itself could never open that mod. `apps/tab-bar/mods/tab-bar/main.js:declaredButtons`
- **It is a clone of Herdr's `tabs`.** Herdr's tab bar is read-only, so hosting buttons needs
  the clone, and Herdr's updates to `tabs` never reach it. `apps/tab-bar/mods/tab-bar/mod.json`

## Where it lives

`apps/tab-bar/` (behaviour: its recipe), the tab bar block's `props.buttons` in
`src/layouts/workspace.json`
