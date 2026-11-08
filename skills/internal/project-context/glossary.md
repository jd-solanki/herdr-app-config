# Glossary

Mods and layouts for the Herdr app: published ones are apps in the gallery; the rest are
source mods still built and installed from this repo.

**Mod**:
A folder Herdr loads as one view or behaviour: a `main.js` and its `mod.json`.
_Avoid_: plugin, extension

**Layout**:
A JSON tree of blocks Herdr arranges its window from; each block names the mod it shows.

**App**:
One gallery item under `apps/<name>/`: a mod or layout with its recipe, preview, license and
notice, published exactly as it is in git.
_Avoid_: package, published mod

**Source mod**:
A mod under `src/` that is built before install and not yet an app.
_Avoid_: unpublished mod, legacy mod

**Recipe**:
An app's `RECIPE.md`: the brief another agent builds the app from, from an empty folder.
_Avoid_: spec, readme

**Clone**:
A mod or layout copied from one Herdr ships, with its origin in `cloned_from`; Herdr's updates
never reach it.
_Avoid_: fork, copy

**Space**:
Herdr's unit of work: a named place with its own tabs and terminals, usually one repo or
worktree.
_Avoid_: workspace, project

**Shared key**:
A value one mod publishes with `setShared()` for other mods to read.
_Avoid_: global, store

**App home**:
The folder Herdr loads mods and layouts from, `$HERDR_APP_HOME` or `~/.config/herdr-app`.
_Avoid_: config dir
