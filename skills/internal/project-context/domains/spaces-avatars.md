# Spaces with avatars

## Fences

- **The shared keys are a contract.** agent-triage reads `space.avatars` and `space.repos`;
  renaming or reshaping either silently drops its avatars and repo names.
  `apps/spaces-avatars/mods/spaces-avatars/main.js:Spaces`
- **The git counts match the shell prompt.** Same glyphs, order and ANSI slots as the git
  segment in `jd-solanki/dotfiles`; a change to one is a change to both.
  `apps/spaces-avatars/mods/spaces-avatars/main.js:treeCounts`
- **The avatar cache is hidden.** Any other new file in a mod's folder reloads the mod, so
  avatars live in a dot-folder. Its path names the mod's folder: renaming the mod changes it
  too. `apps/spaces-avatars/mods/spaces-avatars/main.js:AVATARS`
- **Only a strict owner name reaches the file path.** Letters, digits, `_` and `-`, so a
  crafted remote URL can never write outside the cache.
  `apps/spaces-avatars/mods/spaces-avatars/main.js:githubOwner`

## Where it lives

`apps/spaces-avatars/` (behaviour: its recipe)
