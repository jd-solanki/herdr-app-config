# Glossary

Mods and layouts for the Herdr app: published ones are apps in the gallery; the rest are
source mods still built and installed from this repo.

**Mod**:
A folder Herdr loads as one view or behaviour: a `main.js` and its `mod.json`.
_Avoid_: plugin, extension

**Layout**:
A JSON tree of blocks Herdr arranges its window from; each block names the mod it shows.

**App**:
One gallery item under `apps/<name>/`: a mod or layout with its source, its committed build,
recipe, preview, license and notice.
_Avoid_: published mod

**Source mod**:
A mod under `src/` that is not yet an app; it builds into `dist/` before install.
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

**Label slot**:
The `tab-bar.labels` shared key: tab id to the label an unnamed tab shows, filled by any mod.
_Avoid_: tab titles, title override

**Package**:
Code more than one mod shares, under `packages/<name>/`; each mod's build inlines it.
_Avoid_: library, shared module
