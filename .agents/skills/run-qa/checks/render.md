# Render check

Does the page hold up on every device and data state? A render scenario names its page and its
**depth**, and you review every screenshot for what **breaks**.

| Depth | Devices | Data states | Time |
| --- | --- | --- | --- |
| `quick` | `iphone-15,laptop` | `typical,worst` | a few minutes |
| `full` | all | all | about ten minutes |

The data states are `/ux`'s data menu, `?data=<option>`. A page with no data menu has only `live`.

## Steps

### 1. Capture

`scripts/render.mjs` sits in this skill's folder, `<skill-dir>` below. It opens a fresh browser per
device with its viewport, pixel ratio, touch and user agent, saves a full-page and a first-screen
screenshot for each device and data state, hides every `data-dev-tool` element, and reports
**leads**: breaks a screenshot hides. A lead is a place to look, never a finding.

```sh
# quick
node <skill-dir>/scripts/render.mjs --url <page-url> --devices iphone-15,laptop --states typical,worst --out <run folder>/render-<n>
# full
node <skill-dir>/scripts/render.mjs --url <page-url> --out <run folder>/render-<n>
```

- `--help` lists the flags and the devices. At full depth, add any screen the project's own users
  stand at that the table lacks, with `--extra <name>:<width>x<height>:<pixel-ratio>[:touch]`.
- `--only <state>-<device>` recaptures one pair, for a caller checking a fix.
- `--self-test` checks the script on a page with planted breaks. Run it once when a lead looks wrong.

**Done when** every device and data state pair has both screenshots, and the leads are saved.

### 2. Review

Give each data state its own reviewer, in parallel when subagents are available: that state's
screenshots, ordered by width, its leads, and **What breaks**. Neighbouring widths share a layout,
so a reviewer spends its time where the layout changes, and still opens every image.

A reviewer opens the full screenshot each lead points at, and keeps it as a finding only when it
breaks in context. Each finding names the state, the device, the element, what breaks, one fix at
its root (a responsive rule, never a patch for one device), and its screenshot path.

**Done when** every screenshot has been opened and every lead judged.

### 3. End the scenario

- **pass**: no finding.
- **fail**: one or more findings, each with its screenshot. A break with more than one right fix
  says so, with its options, so the caller decides.
- **blocked**: the page does not load, or needs a login this machine lacks.

The caller fixes: `/ui` while building, the Fixer on a pull request.

## What breaks

- **Wrap**: a button, badge, tab or short label on two lines; one word alone on a line; a footer
  whose text and actions crowd each other.
- **Overflow**: sideways scroll, or a page zoomed out to fit; clipped text; an id, number or date
  cut off; content under a fixed bar or overlay.
- **Shift**: the loading layout differs from typical's at the same device, so content jumps as it
  arrives.
- **Stretch**: text lines past about 80 characters, a column stretched thin, or content lost in
  empty space, from 1920 up.
- **Cramp**: controls touching, or an action only reachable by hover on a touch device.
- **Rhythm**: misaligned edges, uneven gaps between like items, a heading closer to the section
  above than to its own content.
- **State**: an empty or error state without its next step; worst-case names, RTL and emoji
  breaking `/ux`'s `references/states.md` or `/ui`'s data rules.
