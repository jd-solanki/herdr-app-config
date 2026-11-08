# Agent triage

## Fences

- **It works without spaces-avatars.** The `space.repos` and `space.avatars` shared keys
  are optional: rows fall back to the space name and the program icon, never break.
  `apps/agent-triage/mods/agent-triage/main.js:Agents`
- **A sub-agent's done counts as idle.** It reports to its parent, and the parent's done is
  the news; its error still counts as Needs you.
  `apps/agent-triage/mods/agent-triage/main.js:kidStatus`
- **Icons are Herdr's, by path.** It draws `mods/workspace-chrome/` icons by path, so a
  Herdr version that moves them shows blanks. `apps/agent-triage/mods/agent-triage/main.js:Agents`
- **`theme()` colors are `#rrggbb`.** `herdr.d.ts` types them as plain strings, but the
  alpha pill appends two hex digits. `apps/agent-triage/mods/agent-triage/main.js:fade`

## Where it lives

`apps/agent-triage/` (behaviour: its recipe)
