#!/bin/sh
# Pre-commit: an app's committed build must match its staged source. The gallery publishes the
# build, so a commit that changes source without it would publish the old app.
set -eu
cd "$(dirname "$0")/.."
pnpm exec vp pack >/dev/null
if ! git diff --quiet -- 'apps/*/mods/*/main.js'; then
  git diff --stat -- 'apps/*/mods/*/main.js'
  echo "ERROR: the built apps above are stale. Stage them: git add apps/*/mods/*/main.js"
  exit 1
fi
