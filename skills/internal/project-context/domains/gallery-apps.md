# Gallery apps

## Words

**Gallery**:
herdr.dev's public catalogue of mods and layouts, built from public GitHub repos.

## Rules

- An app folder holds its TypeScript source in `src/`, its `mods/` (or layouts) with the
  committed build, its recipe, `preview.png`, `LICENSE` and `NOTICE`.
- `herdr-app check <mod folder>` loads a mod once with no props, so it misses bugs in rows
  and tabs. Test a change in the app.
- The gallery lists every folder with a recipe in a public repo with the `herdr-mod` or
  `herdr-layout` topic, within an hour of a push to `main`. This repo has `herdr-mod`; add
  `herdr-layout` with the first layout app.
- A mod's page is `herdr.dev/mods/jd-solanki/herdr-app-config--apps--<name>`. A new app
  gets a row in the `README.md` table.
- For `preview.png`, zoom in (`herdr-app do app.zoom_in`), `herdr-app shot`, zoom back
  (`app.zoom_reset`), and crop the mod's part onto a 16:10 canvas in its background color:
  the gallery card is 960×600.

## Fences

- **An app's build is committed with its source.** The gallery publishes `mods/` from git,
  so a source change without its rebuilt `main.js` publishes the old app; the pre-commit check
  fails a commit whose build is stale. Never edit an app's built `main.js` by hand.
  `scripts/check-built.sh`
- **The recipe is the source.** `main.js` is one build of the recipe. A behaviour change
  updates the recipe in the same change, or the next agent rebuilds the old app.
  `apps/*/RECIPE.md`
- **Replace, don't add.** An app takes the place of Herdr's own mod in its layout block,
  never sits beside it. Herdr's `main` layout is read-only, so the recipe clones it first.
  `apps/*/RECIPE.md:Watch out`
- **Never ship check files.** `herdr-app check` and the editor write `jsconfig.json` and
  `*.d.ts` into the mod folder; they are ignored so they never publish. `.gitignore`

## Where it lives

`apps/`, `apps/*/RECIPE.md`, `README.md` (the app table)
