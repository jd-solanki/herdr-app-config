// Builds each app's src/ into its mods/<name>/ by stripping types only, so the published code
// reads like the source with every comment kept; a bundler drops plain comments and reshapes
// code. Herdr refuses an import outside the mod's own folder, so each @herdr-app-config/*
// package an app imports is stripped into the mod folder too, and the import points there.
// A file is written only when its content changes, so `pnpm dev`'s watcher settles.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative } from "node:path";
import { transformSync } from "amaro";

const SCOPE = "@herdr-app-config/";

const filesUnder = (dir) =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));

// Under a neutral name: built files are on the formatter's ignore list, which would skip them.
const format = (code, path) => {
  const result = spawnSync("pnpm", ["exec", "vp", "fmt", "--stdin-filepath", "built.js"], {
    input: code,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(`vp fmt ${path}: ${result.stderr}`);
  return result.stdout;
};

const writeIfChanged = (path, code) => {
  if (existsSync(path) && readFileSync(path, "utf8") === code) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, code);
  console.log(`built ${path}`);
};

// Strips one source file into `out`, pointing package imports at their copies under `modDir`.
function strip(source, out, modDir, packages) {
  const code = transformSync(readFileSync(source, "utf8"), { mode: "strip-only" })
    .code
    // An import that held only types is left empty.
    .replace(/^import\s*\{\s*\}\s*from\s*["'][^"']+["'];?[ \t]*\n/gm, "")
    .replace(/(\bfrom\s*|\bimport\s*\(\s*)(["'])([^"']+)\2/g, (_, lead, quote, specifier) => {
      let target = specifier.replace(/\.ts$/, ".js");
      if (specifier.startsWith(SCOPE)) {
        const name = specifier.slice(SCOPE.length);
        packages.add(name);
        target = posix.relative(dirname(out), join(modDir, name, "index.js"));
        if (!target.startsWith(".")) target = `./${target}`;
      }
      return `${lead}${quote}${target}${quote}`;
    });
  writeIfChanged(out, format(code, out));
  return out;
}

for (const app of readdirSync("apps")) {
  const srcDir = join("apps", app, "src");
  if (!existsSync(srcDir)) continue;
  const modDir = join("apps", app, "mods", app);
  const built = new Set();
  const packages = new Set();
  for (const source of filesUnder(srcDir).filter((path) => path.endsWith(".ts")))
    built.add(
      strip(
        source,
        join(modDir, relative(srcDir, source)).replace(/\.ts$/, ".js"),
        modDir,
        packages,
      ),
    );
  // Packages a package imports join the set as they are found.
  for (const name of packages) {
    const pkgSrc = join("packages", name, "src");
    for (const source of filesUnder(pkgSrc).filter((path) => path.endsWith(".ts")))
      built.add(
        strip(
          source,
          join(modDir, name, relative(pkgSrc, source)).replace(/\.ts$/, ".js"),
          modDir,
          packages,
        ),
      );
  }
  // Every .js in a mod folder is built: one whose source is gone goes too.
  for (const path of filesUnder(modDir))
    if (path.endsWith(".js") && !built.has(path)) {
      rmSync(path);
      console.log(`removed ${path}`);
    }
}
