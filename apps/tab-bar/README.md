# Tab bar

A [Herdr app](https://herdr.dev) mod: Herdr's tab bar, which other mods add buttons and tab
labels to.

![Tab bar](preview.png)

```mermaid
flowchart LR
    M["A mod's mod.json<br>button field"] --> B["Tab bar"]
    L["tab-bar.labels<br>shared key"] --> B
    B --> P["Its side panel"]
    B --> T["Its tab"]
```

## Add it

Tell your agent:

```text
Read ~/.config/herdr-app/AGENTS.md, then add this mod: herdr.dev/mods/jd-solanki/herdr-app-config--apps--tab-bar
```

It replaces Herdr's own tab bar: your agent points the layout's `tabs` block at `tab-bar`, in a
clone of your layout if you're on Herdr's `main`.

It pairs with [GitHub inbox](../github-inbox/), which adds an Inbox button, and with
[tab-title](../tab-title/), which labels unnamed tabs with their agent's title.

## Add a button from your mod

Put a `button` field in your mod's `mod.json`. Herdr ignores it; the tab bar reads it.

```json
{ "place": "none", "button": { "label": "Inbox", "icon": "mods/my-mod/inbox.svg" } }
```

- `icon` is a path under `~/.config/herdr-app`. `per_space: true` passes the space as
  `props.space` when it opens your mod.
- The button toggles your mod's side panel when the layout's `panel-body` stack has a block
  with your mod's name as its id; otherwise it goes to your mod's tab in the space, or opens one.
- Bind a key to it with `"tab-bar.<your mod>"` in `keys.json`.
- To label unnamed tabs, write `{ "<tab id>": "<label>" }` to the `tab-bar.labels` shared key.

Set `"props": { "buttons": ["my-mod", "other-mod"] }` on the tab bar's layout block to pick and
order the buttons; without it, every declared button shows.

[RECIPE.md](RECIPE.md) describes it exactly, enough for an agent to build it again.

## Credit

A clone of the `tabs` mod 0.1.11 that ships with the [Herdr app](https://github.com/herdrdev/herdr-app)
(Apache-2.0), so Herdr's updates never reach it. See [NOTICE](NOTICE).
