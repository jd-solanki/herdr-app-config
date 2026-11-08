#!/bin/sh
# Copies the mods (apps/ as they are in git, src/ as built), the layouts and mermaid-svg into
# place, and binds the GitHub key.
# `pnpm run setup` runs it after a build; `pnpm dev` after every rebuild, so Herdr reloads.
set -eu
cd "$(dirname "$0")/.."
app="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"

# rm first: cp writes through a symlink, and an old stow link points back into a repo.
# File by file, so what a mod keeps in its installed folder (spaces-avatars' .avatars/) stays.
# apps/ last: it wins over any build left in dist/.
place() { mkdir -p "$2"; rm -f "$2/$(basename "$1")"; cp "$1" "$2/"; }

for file in dist/mods/*/* apps/*/mods/*/*; do
  [ -f "$file" ] && place "$file" "$app/mods/$(basename "$(dirname "$file")")"
done
for file in src/layouts/*.json; do place "$file" "$app/layouts"; done
place bin/mermaid-svg "$HOME/.local/bin"

# keys.json is Herdr's own file, written on first start, so each app's keys and this setup's
# own keys are upserted into it.
keys="$app/keys.json"
if [ -f "$keys" ]; then
  node -e '
    const fs = require("node:fs");
    const [path, ...appKeys] = process.argv.slice(1);
    const keys = JSON.parse(fs.readFileSync(path, "utf8"));
    const wanted = [
      ...appKeys.map((file) => JSON.parse(fs.readFileSync(file, "utf8"))),
      // After the apps: these keys press tab-bar buttons, which go back to an open tab.
      {
        global: {
          "ctrl-shift-g": "tab-bar.github",
          "ctrl-shift-i": "tab-bar.github-inbox",
        },
      },
    ];
    let changed = false;
    for (const sections of wanted)
      for (const [section, bindings] of Object.entries(sections))
        for (const [key, action] of Object.entries(bindings)) {
          keys[section] ??= {};
          if (JSON.stringify(keys[section][key]) === JSON.stringify(action)) continue;
          keys[section][key] = action;
          changed = true;
        }
    if (changed) fs.writeFileSync(path, `${JSON.stringify(keys, null, 2)}\n`);
  ' "$keys" apps/*/keys.json || echo "WARNING: could not add the keys to $keys."
else
  echo "NOTE: open the Herdr app once, then run 'pnpm run setup' again to add the keys."
fi
