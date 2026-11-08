#!/bin/sh
# Copies the mods (apps/ as they are in git, src/ as built), the layouts and mermaid-svg into
# place, and binds the GitHub key.
# `pnpm run setup` runs it after a build; `pnpm dev` after every rebuild, so Herdr reloads.
set -eu
cd "$(dirname "$0")/.."
app="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"

# rm first: cp writes through a symlink, and an old stow link points back into a repo.
# File by file, so what a mod keeps in its installed folder (spaces-avatars' .avatars/) stays.
place() { mkdir -p "$2"; rm -f "$2/$(basename "$1")"; cp "$1" "$2/"; }

for file in apps/*/mods/*/* dist/mods/*/*; do
  [ -f "$file" ] && place "$file" "$app/mods/$(basename "$(dirname "$file")")"
done
for file in src/layouts/*.json; do place "$file" "$app/layouts"; done
place bin/mermaid-svg "$HOME/.local/bin"

# keys.json is Herdr's own file, written on first start, so the binding is upserted.
keys="$app/keys.json"
if [ -f "$keys" ]; then
  node -e '
    const fs = require("node:fs");
    const [path] = process.argv.slice(1);
    const keys = JSON.parse(fs.readFileSync(path, "utf8"));
    const wanted = "workspace-tabs.open-github";
    if (keys.global["ctrl-shift-g"] !== wanted) {
      keys.global["ctrl-shift-g"] = wanted;
      fs.writeFileSync(path, `${JSON.stringify(keys, null, 2)}\n`);
    }
  ' "$keys" || echo "WARNING: could not add the GitHub key to $keys."
else
  echo "NOTE: open the Herdr app once, then run 'pnpm run setup' again to add the GitHub key."
fi
