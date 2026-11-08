# Workspace tabs

confidence: exploratory — a source mod not built for publication yet; the button host is new,
and which settings it takes beyond button order is still open.

## Words

**Declared button**:
A tab bar button a mod names in the `button` field of its own `mod.json`; Herdr ignores the
field.
_Avoid_: registered button, plugin button

## Rules

- Other mods extend the bar only through declared buttons and shared keys; the bar holds no
  knowledge of any one mod.

## Fences

- **A button lives in its mod's `mod.json`, never registered at run time.** A mod runs only
  while a layout shows it, and Herdr has no startup hook (herdr-app#288), so a button its mod
  registered itself could never open that mod. `src/mods/workspace-tabs/main.js:declaredButtons`
- **It is a clone of Herdr's `tabs`.** Herdr's tab bar is read-only, so hosting buttons needs
  the clone, and Herdr's updates to `tabs` never reach it. `src/mods/workspace-tabs/mod.json`

## Where it lives

`src/mods/workspace-tabs/`, the tab bar block's `props.buttons` in `src/layouts/workspace.json`
