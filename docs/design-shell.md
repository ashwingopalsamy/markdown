# md: search as an icon, toolbar in the centre, ipynb's floating contents

## Context

Your second review asked for four things: search out of the header's middle, the editing toolbar in that spot, the outline replaced by ipynb's floating contents, and the metadata block out of the way.

Your screenshot still shows search centred and the old card, so your Chrome was on the previous build. The service worker can hold a new version back, so I check that too (below).

Your answers: search becomes an icon just left of the pencil, metadata is hidden until clicked, and the document stats move to the View card.

## Header

```
Reading:  [ tabs + ]                           [ search | pencil | export shield | settings theme ]
Editing:  [ tabs + ]    [ B I S … toolbar ]    [ search | pencil | export shield | settings theme ]
```

- **Search:** always one icon, first in the dock, at every width. Pressing it, `/`, ⌘K or ⌘F opens the field and results in a card under the dock, sharing its right edge. That is the existing narrow-window branch of `Search.svelte`; the pill branch and `--find`, `--find-r` are removed.
- **Toolbar:** centred in the room between the tabs and the dock. Only when it doesn't fit do the tabs collapse to the active one. If it still doesn't fit, it scrolls with Done pinned. It no longer has to give way to search.
- **Tabs:** the 220px cap while editing applies only in that collapsed case.

## Floating contents (port of ipynb's `Toc.svelte`, `toc.css`)

Tick marks on the right edge. The current section's tick is longest, with its name beside it. Hovering opens the list with the current row in the middle. A click jumps and closes it.

Ported as they are: ticks, the sliding window for long outlines (22 rows), spacing before top-level headings, hover and pin, keyboard (arrows, Home, End, Esc), stepping aside while a card is open.

| ipynb | md |
|---|---|
| Headings from notebook cells | `app.headings`, with depth as level minus the top level |
| Window scroll | `.pane.read` scroll, read with `preview.topOfLine` |
| Jump with `jump()` | The existing `goto(line, id)` |
| `[` and `]` step sections | Same keys, only outside text fields |
| Opens from `t` | ⇧⌘O pins it open; the single key is not added |
| Popover on a phone | The same: on a phone the dock shows a contents icon, because the edge has no room |

- **Where it shows:** Page, Read and Split, with two or more headings. Write has no page to track, so ⇧⌘O there does nothing.
- **Split:** the rail sits on the read pane's right edge and the existing scroll sync keeps the source in step.
- **Removed:** the `outline` dock icon on desktop, and the Outline card's list. `Toc.svelte` loads with the lazy cards, so the first-screen budget holds.

## Dock and View card

The dock loses search's pill and outline, and gains the search icon: `search | pencil | export shield | settings theme`.

The View card gets one quiet foot line: `318 words · 1 min · On this device`.

## Metadata

In Page and Read, front matter draws as a closed, small `Properties` row above the first line, using `<details>`. Opening it shows the keys and values; clicking those in Page opens the source, as now. The file is untouched, and Write and Split show the text as usual. The darker box behind the tags value is removed.

HTML export and print get the same closed row.

## Service worker check

Build twice and confirm your flow picks up a new version: with one tab it should land on the next reload or two. If a second app tab is holding it back, say so in the Privacy card's rather than silently serving the old build: a small "Close other md tabs to update" toast. I add the toast only if the check shows that is the cause.

## Files

`App.svelte`, `app.css`, `ui/Search.svelte`, `ui/search.css`, new `ui/Toc.svelte`, new `ui/toc.css`, `ui/Outline.svelte` (removed), `ui/Sheets.svelte`, `ui/ViewCard.svelte`, `ui/ui.svelte.ts`, `ui/Icon.svelte`, `page/Toolbar.svelte`, `page/edit.css`, `render/text.ts`, `docs/design-shell.md`.

## Verification

In headless Chrome on the production build, at real sizes, with screenshots checked against your ipynb ones:
1. Header at 1920, 1440, 1280, 1200 and phone, reading and editing, both themes. Toolbar centred and overlapping nothing.
2. Contents on the tour and on a 40-heading document: ticks, current row follows scroll in Page, Read and Split, hover list, jump, keyboard, card opening hides it.
3. Search from the icon, `/`, ⌘F: finds, walks, closes; Replace in Write.
4. Metadata row in Page and Read; bytes of the front matter unchanged after an edit elsewhere.
5. A new build reaches an open tab. Budget and audit pass.

Nothing gets committed or deployed.
