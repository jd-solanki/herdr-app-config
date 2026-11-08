# GitHub tab

confidence: exploratory — a source mod not built for publication yet; it may depend on other
mods or layouts, and nobody has reviewed its code for publishing.

## Fences

- **The token never reaches argv.** The gh token goes in on stdin, and curl is https-only
  and drops it on the redirect to S3. `src/mods/github/main.js:AUTHED_CURL`
- **Fetched text is untrusted.** Issue and PR bodies run inside render, and `^` also fires
  after CR, U+2028 and U+2029, so the code-fence opener's checks stop at any line
  terminator. `src/mods/github/main.js:CODE_FENCE`

## Where it lives

`src/mods/github/`, `bin/mermaid-svg`
