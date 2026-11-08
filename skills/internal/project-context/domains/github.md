# GitHub tab

## Fences

- **The token never reaches argv.** The gh token goes in on stdin, and curl is https-only
  and drops it on the redirect to S3. `apps/github/src/main.ts:AUTHED_CURL`
- **Fetched text is untrusted.** Issue and PR bodies run inside render, and `^` also fires
  after CR, U+2028 and U+2029, so the code-fence opener's checks stop at any line
  terminator. `apps/github/src/main.ts:CODE_FENCE`
- **Its space is fixed when it starts.** A mod pane can't see its own tab, so without
  `props.space` it takes the space shown at start, the one a key or `tab.new` opens it in.
  `apps/github/src/main.ts:GitHub`
- **Its icons and `mermaid-svg` are found by a path naming the mod's folder**, so renaming
  the mod changes `MOD_FOLDER` too. `apps/github/src/main.ts:MOD_FOLDER`

## Where it lives

`apps/github/` (behaviour: its recipe), `apps/github/mods/github/mermaid-svg`
