# Changelog

Versions follow [semantic versioning](https://semver.org). Each release lists what a reader would notice.

## Unreleased

- A text size control, from 90% to 140%, in a pill at the bottom right. ⌥⌘= and ⌥⌘− step it up and down.
- The reading column can be 760px (the default), 1120px or the full window, set in Settings.
- In md Local, Show in Finder at the bottom left opens Finder with the file selected.
- A tour of md, from the Open sheet, opened as a document you can read, edit and export.
- Diagrams and pictures download as PNG, JPEG, WEBP (where the browser can write it) or SVG (for diagrams and SVG pictures).
- Download PDF (⌘P) uses md's own print layout, with numbered pages in Chrome 131 and later.
- Literata and Newsreader can set the reading text, and Paper and Calm are new palettes beside Neutral. Each loads only when chosen.
- The editing bar is always shown in Page view, not only while you type.
- The dock is as wide as its cards. The new Info card shows words, characters, reading time, counts of headings, links, pictures and diagrams that jump to the first of each, and where the document is kept.
- PlantUML and draw.io diagrams work on the hosted site, drawn in sandboxed frames that cannot reach the network. Their engines load only when a document has such a diagram.

## 1.0.0

The first release.

- An editor that runs in the browser and keeps documents on the device. Write, Split and Read views; export as Markdown, HTML or PDF.
- The page cannot make a request: its policy has `connect-src 'none'`, by header and by meta tag. Everything is served from one origin, with no inline script, no `eval` and no WebAssembly.
- Works offline after the first visit, from a service worker that holds every file.
- Opens a file from a drop, a paste, the picker, or a link that carries the file after the `#`. `bin/mdopen` and the Go binary build that link.
- A Go binary with the app inside, and `tools/serve.mjs`, serve the same files on `127.0.0.1`.
- `npm run build` audits the output and writes `dist/trust.json`: a SHA-256 for every file, the policy, the dependencies and their licences, and every network-capable API in the JavaScript with the reason it is allowed. `npm run verify:site` compares a live site with it.
- Guide pages for security teams (`/trust/`), agents (`/agents/`) and syntax (`/syntax/`), each with a Markdown copy, and `llms.txt`.
