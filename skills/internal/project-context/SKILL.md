---
name: project-context
description: This repository's words, rules, reasons and fences. Invoke before the first code action in a session, and again when a task enters a new domain.
---

# Project context

## What earns a line here

- A **word** — a term whose meaning this project fixes.
- A **rule** — a convention no linter or type checker enforces.
- A **reason** — why this shape was chosen, when the code cannot show it.
- A **fence** — the trap, where it bites (`file:symbol`), and why the fence stands.

**The test: could I learn this by reading the code?** Then link the path under
**Where it lives**. Leave the prose out.

A line that passes still needs both of these:

- **The value test: could leaving it out cause a costly wrong decision before nearby code or
  tests catch it?** Correct but low-value detail earns nothing.
- **The refactor test: would the sentence survive an ordinary rename, move or refactor?**
  Write the invariant (an outcome, ownership boundary, state transition, safety property or
  failure policy), not symbols, call sequences, wiring or versions. Name a library only when
  the owner chose it as durable architecture.

Git holds the history and `package.json` holds the commands. Both are sources of
truth already; point at them.

A file whose tasks need different parts of it is two domains; so, usually, is one past ~150
lines. Split it or cut it.

`/audit-project-context` enforces all of the above.

## Upstream of the code

This context holds the decisions. The code implements them.

When a task changes a decision, update the domain file in the same pull request as the
code. When the code and a domain file disagree, ask the owner which one is wrong.

Before you edit any file in this skill (this router, `glossary.md` or a domain file), invoke
`/context-engineering`.

## References

Load `glossary.md` every session. Load a domain file when your task enters it, and the file
its row names after `with`.

A domain file is settled unless its header says otherwise. `provisional`: build on it, but
keep its detail behind one seam. `exploratory`: argue with it before building on it.
The word moves when the owner's decision moves, in the same pull request as the code it
governs.

| Reference                      | Load when                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `glossary.md`                  | always                                                                                                             |
| `domains/build-and-install.md` | building or installing apps and layouts, changing `pnpm dev`, the type-check setup or `types/`, adding shared code |
| `domains/gallery-apps.md`      | creating, changing or publishing an app, or writing its recipe or preview                                          |
| `domains/spaces-avatars.md`    | changing the Spaces list app; with gallery-apps.md                                                                 |
| `domains/agent-triage.md`      | changing the Agents list app; with gallery-apps.md                                                                 |
| `domains/github-inbox.md`      | changing the GitHub inbox app; with gallery-apps.md                                                                |
| `domains/github.md`            | changing the GitHub tab app or `mermaid-svg`; with gallery-apps.md                                                 |
| `domains/tab-title.md`         | changing the Tab title app; with gallery-apps.md                                                                   |
| `domains/tab-bar.md`           | changing the Tab bar app, or giving a mod a tab bar button or tab label; with gallery-apps.md                      |
