#!/bin/sh
# Pre-commit: an app's committed build must match its staged source. The gallery publishes the
# build, so a commit that changes source without it would publish the old app.
set -eu
cd "$(dirname "$0")/.."
node scripts/build-apps.mjs >/dev/null
# Built files that differ from the index, or are new and unstaged.
stale=$(git status --porcelain --untracked-files=all -- 'apps/*/mods' | grep -E '^(.[^ ]|\?\?)' || true)
if [ -n "$stale" ]; then
  echo "$stale"
  echo "ERROR: the built apps above are stale. Stage them: git add apps/*/mods"
  exit 1
fi
