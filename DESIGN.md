---
name: md
description: A Markdown editor that keeps the document on the device. The same neutral, quiet frame as ipynb viewer.
colors:
  page: { light: "#f5f5f7", dark: "#0a0a0c" }
  paper: { light: "#ffffff", dark: "#1a1a21" }
  well: { light: "#e6e8ef", dark: "#272833" }
  well-2: { light: "#f3f4f8", dark: "#20212a" }
  fg: { light: "#1d1d1f", dark: "#f5f5f7" }
  fg-2: { light: "#48484a", dark: "#cfcfd4" }
  fg-3: { light: "#636368", dark: "#9a9aa1" }
  line: { light: "rgba(0, 0, 0, 0.09)", dark: "rgba(255, 255, 255, 0.1)" }
  glass: { light: "rgba(255, 255, 255, 0.86)", dark: "rgba(34, 34, 38, 0.84)" }
  accent: { light: "#0066cc", dark: "#4da3ff" }
  ok: { light: "#1d8a4a", dark: "#4cc38a" }
typography:
  sans: Inter, -apple-system, system-ui, sans-serif
  mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace
  body: { size: 16px, line-height: 1.6, weight: 400 }
  code: { size: 13.5px, family: mono }
rounded: { key: 6px, group: 10px, tile: 14px, sheet: 18px, dialog: 22px, pill: 999px }
motion: { fast: 100ms, base: 160ms, slow: 220ms, max: 300ms, ease: "cubic-bezier(0.2, 0.8, 0.2, 1)" }
---

# md: design language

md is the sibling of ipynb viewer and keeps its language: neutral and calm, so the document, someone else's or your own, is the only thing with character. The tokens are the same. Source of truth: `src/app.css` (tokens and base) and `src/lib/ui/ui.css` (controls). The guide pages use the same tokens in `src/about/guide.css`.

## What differs from ipynb viewer

- **An editor, not a reader.** md Local opens straight into a document you can write in. The hosted site's `/` is a landing page (the ipynb viewer's look, lighter) with a comparison built from `site/compare.ts`; Start, the demo (the tour, which Clear deletes), a drop or a `#` link mounts the editor in place.
- **Three views.** Write, Split and Read, as a segmented control in the right pill. Split has one hairline you can drag. Phones get Write and Read.
- **Two typefaces in the paper.** Inter for the rendered text and the interface, JetBrains Mono at 13.5px in the editor and in code. The editor's syntax colours come from tokens, not hex values.
- **Tabs are documents.** The left pill holds a chip per open document and a `+`; an unsaved-to-disk dot sits on the chip.
- **A privacy shield.** The right pill has a shield with a live request count. It is the one control that is always about the promise, and it says `0`.
- **No outside request, ever.** No relay, and no frames or fonts from elsewhere. PlantUML and draw.io draw in md's own sandboxed frames, which cannot reach the network. Web pictures in a document become a chip naming the host.
- **The mark.** The same 40 by 48 body and green dot, with a white M and a down arrow drawn as rounded strokes instead of the two bars.
- **Guide pages are stricter.** They have no inline style at all (the page policy for them is `style-src 'self'`), and no link leaves the site; outside addresses are written as text.

## Colour

- Three tones, one ink: `page` is the window, `paper` the sheet being written on, `well` the recess under code. Text steps `fg`, `fg-2`, `fg-3`; `fg-3` still passes 4.5:1 on `paper`.
- There is no brand colour. `accent` is for links only. `ok` is the green of the mark's dot and means saved or safe, nothing else.
- Light and dark share every token and switch on `data-theme="dark"`, set before first paint by `public/theme.js` from `localStorage` key `md-theme` (`light`, `dark` or `system`). Dark drops drop-shadows and adds a 1px top highlight.
- Three palettes share every token: Neutral (above), Paper (warm paper, chocolate ink; a cocoa night) and Calm (a deeper sepia with brown ink; a quiet warm dark), each light and dark, with body text at 7:1 or more in all six. Paper and Calm load only when chosen (`public/look/`, `md-palette`).

## Typography

Inter for words, JetBrains Mono for code, both variable and served from the same origin. Prose is 16px at 1.6. UI text runs 11 to 15px; headings are 600 with -0.01em tracking.

Literata or Newsreader can take the reading text (`md-face`); each loads only when chosen. Code stays JetBrains Mono. One text size, 90 to 140%, scales the page, the Page editor and the source together (`--text`, `md-text`), from the pill at the bottom right, or Settings on a phone.

## Shape and depth

- Controls are pills (`999px`). Surfaces are rounded rectangles: popovers 18px, dialogs 22px, tiles 14px, grouped rows 10px, key caps 6px.
- Glass floats, paper rests. The header pills are `glass` with a `float` shadow and a 22px backdrop blur. The paper sheet below holds the editor and the preview.

## Layout

A 4px base. Rows are 44px, controls 32px, buttons 36px; both grow to 44px on touch. The reading column is 760px (Narrow, the default), 1120px (Normal) or the window less 80px gutters (Wide), a setting, remembered under `md-width` and applied before first paint. The dock is as wide as its cards (`--card`, 344px).

## Interaction and motion

- One set of states for every control: a fill of its own ink under the pointer, stronger while chosen, strongest while pressed. Press scales a control to 0.97.
- Focus is a 2px ring at 60% of `fg`, 2px offset, for the keyboard only.
- Four timings, by what moves: 100ms for feedback, 160ms for fades and exits, 220ms for movement and entrances, 300ms for the largest moves. Only transform and opacity move. Honour `prefers-reduced-motion`.

## Voice

Plain, short, verbs first, sentence case, lowercase product name `md`. Say the promise early: the document never leaves your browser. No exclamation marks, no emoji.

## Do and don't

- Do reuse a token; don't introduce a hex value.
- Do keep new controls pill-shaped and 44px on touch; don't add a second hover style.
- Don't add gradients, new shadows, outside fonts or any outside request.
