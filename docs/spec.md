# md: design and implementation spec

A markdown editor that lives entirely in the browser. Same page at `md.ashwingopalsamy.in` and on `127.0.0.1`. Sibling of ipynb viewer: same design language, same engineering habits, stricter trust posture.

This is the hosted edition. md Local, a second edition for one machine with its own server and policy, is specified in `docs/local.md`.

## Product behaviour

- Opening the site puts you straight in an editor with your last open documents, or a fresh one. No landing page.
- Open a file by drop, paste, picker, or a link whose `#` fragment carries the file. Open a folder (Chromium).
- Four views: Page (the rendered document, edited in place; the default), Write, Split, Read. Split has block-level scroll sync, and is not offered below 860 px wide.
- Work is autosaved to IndexedDB on this device. Not cookies: a cookie is sent to the server with every request, which is the exact thing we promise not to do. This app sets none.
- A file opened with a handle saves back in place (Cmd+S) and follows changes on disk, so an agent writing the file shows up live.
- Export: `.md`, self-contained `.html`, PDF (the print dialog's Save as PDF, with md's own print layout), copy Markdown, copy rich HTML.

## Invariants

1. **The document never leaves the browser.** The page policy has `connect-src 'none'`, from first byte, by header and by meta tag (so a copy on any static server has it too). The page cannot make a request by script at all.
2. **Everything is same-origin.** `default-src 'none'`, `script-src 'self'`. No inline script (so no hashes), no `eval`, no WebAssembly in the page, no third-party anything, no analytics.
3. **No server code.** The Cloudflare deployment is assets-only. `tools/serve.mjs` only serves files.
4. **Document markup cannot do anything.** Marked output goes through DOMPurify, then the CSP is the second wall. Web pictures are not fetched, ever: they become a chip naming the host. Clicking it opens the picture in a new tab, a navigation the person chose.
5. **Nothing reads a document back to an agent.** Agents can open text, never read it.
6. **Never lose text.** Autosave debounced at 400 ms and flushed on `pagehide`/`visibilitychange`. Snapshots kept per document.
7. **Same build everywhere.** `dist/` is identical on the hosted site and from `tools/serve.mjs`. `dist/trust.json` records each file's SHA-256, so anyone can compare. md Local is a different build, `dist-local/`.

## Stack

Svelte 5, Vite 8, TypeScript. CodeMirror 6 for the editor, marked for parsing, DOMPurify for cleaning, Shiki (JS engine) for code, KaTeX for math, Mermaid for diagrams. Everything past the shell lazy-loads; exact versions pinned; `ignore-scripts=true`.

Budget: `index.html` plus what it loads under 45 KB gzipped, with editor and renderer arriving as chunks. Mermaid, KaTeX and Shiki load only when a document asks for them.

## Layout of the code

```
index.html                 the app's page; <script src="/theme.js"> then the module
public/theme.js            sets data-theme before paint; external so script-src stays 'self'
public/fonts, mark.svg, favicon.svg, manifest.webmanifest
public/look/   palettes and typefaces, loaded when chosen
src/main.ts                mounts App
src/app.css                tokens (same as ipynb viewer) and base
src/App.svelte             shell
src/lib/ui/                ui.css, Icon, Pop sheets, and the sheets themselves
src/lib/editor/            CodeMirror setup, theme, commands, slash menu, data-url folding
src/lib/page/              the Page view: the rendered document, edited in place
src/lib/local/             md Local only (docs/local.md); never reaches the hosted bundle
src/lib/render/            markdown pipeline
src/lib/render/engines/   PlantUML and draw.io frames
src/lib/figure/   zoom, copy and download for diagrams and pictures
src/lib/store/             IndexedDB, documents, files, inbound links, agent tools
src/lib/trust/             the live proof: request count, policy, self-test
site/*.md                  static guide pages: trust, agents, syntax
site/local/*.md            md Local's own trust and agents pages
tools/site.mjs             post-build: _headers, 404, robots, security.txt
tools/audit.mjs            static audit of dist; writes trust.json; fails the build on a violation
tools/verify.mjs           compares a live site or folder to a local dist
tools/serve.mjs            zero-dependency local server (Node)
tools/sw.template.js       offline worker
local/                     md Local's server and the md command, stdlib only, dist-local embedded
public/engine/, vendor/   the diagram engines' frames and vendored files
install.sh                 installs md Local
```

## Module contracts

### `src/lib/render` (entry `render/index.ts`, must not import anything outside `render/`)

```ts
export interface Heading { level: number; text: string; id: string; line: number }
export interface Stats { words: number; chars: number; minutes: number }

/** Keeps one live view of a document. Only blocks whose source changed touch the DOM. */
export class Preview {
  constructor(root: HTMLElement);          // root gets class "md"
  update(source: string): void;            // sync; lex, diff blocks, patch DOM, then schedule enhancements
  readonly headings: Heading[];
  destroy(): void;
  /** Source line <-> vertical position in the scroller, for scroll sync. */
  topOfLine(line: number): number | null;
  lineAtTop(y: number): number;
}
export function renderToHtml(source: string): Promise<string>;  // fully enhanced, sanitized body HTML; for export
export function sanitize(html: string): string;                 // the same cleaner, exported for the self-test
export function statsOf(source: string): Stats;
```

Pipeline: strip front matter (shown as a quiet key/value table), `marked.lexer`, one piece per top-level token. A piece's first-level elements get `data-line` (0-based source line). Cache sanitized HTML by `token.raw`; reference-link definitions and footnote definitions are doc-global, so if their serialized value changes, drop the cache. Diff by common prefix and suffix of `raw`, replace only the middle. Duplicate heading ids dedupe in document order, so ids are assigned after the diff from the whole heading list.

Syntax: GFM (tables with alignment, task lists, strikethrough, autolinks), GitHub alerts (`> [!NOTE]`, TIP, IMPORTANT, WARNING, CAUTION), footnotes, `==mark==`, `~sub~`, `^sup^`, `:emoji:` for a small common set (under 2 KB, no dependency), `[[toc]]`, math (`$`, `$$`, `\(`, `\[`, `\begin{}`), fenced code, mermaid fences, `<details>`, heading anchors, front matter.

Enhancements run after paint and only for visible blocks where cost matters (IntersectionObserver): Shiki per code block, KaTeX per placeholder, Mermaid per diagram. Each is keyed so an unchanged block isn't redone. A failed diagram shows its error and source, never a blank box.

Mermaid: `securityLevel: 'strict'`, `htmlLabels: false`, startOnLoad false, theme from `data-theme`, re-render on theme change. Output goes through DOMPurify's SVG profile.

Cleaner: as `src/lib/markdown.ts` in ipynb viewer. No `style` attributes, no forms, no media, no frames. Links get `target=_blank rel="noopener noreferrer"`. `#` links are prefixed `user-content-` as are ids. Web images become `<a class="rimg" href=src>` chips naming the host; `data:image/` stays.

Task checkboxes stay in the DOM, enabled in Preview, carrying `data-task-line`. `Preview` emits a bubbling `CustomEvent('md-task', { detail: { line } })`; the shell toggles the source.

Code blocks get a copy button by event delegation with `navigator.clipboard`.

Prose styling: `render/md.css` keeps the ipynb viewer's rhythm (hairline above headings whose length says the rank; `data-h` top/out/in, `data-d` depth). Drop its cell-specific rules. Add alerts, footnotes, mark, details, front matter, mermaid figure, chip.

### `src/lib/store` (entry `store/index.ts`, must not import from `ui`, `editor`, `render`)

```ts
export interface Doc { id: string; name: string; text: string; created: number; updated: number; saved: string | null /* text as last written to disk */; open: boolean; order: number; handle?: FileSystemFileHandle }
export interface Snapshot { id: string; doc: string; at: number; text: string }

export const docs: {                       // all async, IndexedDB database "md", no cookies, no localStorage for content
  all(): Promise<Doc[]>; get(id): Promise<Doc | undefined>;
  create(init?: Partial<Doc>): Promise<Doc>; put(doc: Doc): Promise<void>; remove(id): Promise<void>;
  snapshots(id): Promise<Snapshot[]>; snapshot(doc: Doc): Promise<void>;   // keeps newest 30 per doc; skipped if text equal to the newest
  wipe(): Promise<void>;                                                   // erases the whole database and caches
};
export function onRemote(fn: (msg: { type: 'put' | 'remove'; id: string }) => void): () => void; // BroadcastChannel between tabs
export function persist(): Promise<boolean>;                               // navigator.storage.persist(), once
export function pickFile(): Promise<{ text: string; name: string; handle?: FileSystemFileHandle }[]>;   // FS Access with <input> fallback
export function pickFolder(): Promise<FolderEntry[] | null>;               // null when unsupported; recursive .md/.markdown/.mdx/.txt, skips dot folders and node_modules, cap 5000
export function saveToHandle(handle, text): Promise<void>;
export function saveAs(name, text): Promise<FileSystemFileHandle | null>;  // FS Access, else download
export function download(name: string, blob: Blob): void;
export function watch(handle, last: number, fn: (text: string, modified: number) => void): () => void; // polls getFile() every 1.5 s while the page is visible
export function ensurePermission(handle, mode: 'read' | 'readwrite'): Promise<boolean>;
export function readInbound(): { name: string; text: Promise<string> } | null; // parses #md=…&name=…, then history.replaceState clears the fragment
export function encodeInbound(text: string, name: string): Promise<string>;    // makes that fragment, for "copy link"
export function registerAgentTools(open: (name: string, text: string) => void): void; // WebMCP, as agent.ts in ipynb viewer: open_markdown_text only
export const LIMIT: number; // 50 MB
```

Fragment format, same as ipynb viewer: raw DEFLATE, URL-safe base64 without padding: `#md=<data>&name=<percent-encoded>`. Decompress with `DecompressionStream('deflate-raw')`, capped at LIMIT while streaming (a zip bomb stops at the cap).

### `src/lib/editor` (entry `editor/index.ts`; imports only CodeMirror and own files)

```ts
export class Editor {
  constructor(parent: HTMLElement, opts: { onChange(text: string): void; onScroll(topLine: number): void; onImage(file: File): Promise<string|null> });
  load(docId: string, text: string): void;   // keeps one EditorState per doc, so each tab keeps its undo and cursor
  drop(docId: string): void;
  get text(): string;
  set(text: string): void;                   // external change, undoable
  toLine(line: number): void; focus(): void;
  scrollToLine(line: number): void;          // no echo through onScroll
  command(name: 'bold'|'italic'|'code'|'link'|'h1'|'h2'|'h3'|'ul'|'ol'|'task'|'quote'|'codeblock'|'table'|'hr'|'math'|'mermaid'|'find'): void;
  destroy(): void;
}
```

Markdown highlighting from tokens, not hex. JetBrains Mono at 13.5px times the text size. Soft wrap. `data:` URLs replaced by a small chip so a pasted picture doesn't become a wall of base64. Slash menu at line start. Enter continues lists. Cmd+B, I, K, E. Pasting a URL over a selection makes a link. Pasted or dropped pictures go in as `![name][img-N]` with the definition at the end of the document, so the file stays one portable file.

### Shell

Two mirrored glass pills, exactly the ipynb viewer's header (`.pill`, `.tb`, `.tb-chip`, `.tools`).
Left: a chip per open document, `+`. Unsaved-to-disk dot on a chip.
Right: Search, View, Info, Contents, Export, Privacy (a shield with a dot that warns when the page did something), Settings, and the light/dark switch.
Paper sheet below holds the editor and preview. Split gets one hairline, draggable, ratio remembered.
The Info card has words, characters, reading time, counts that jump to the first heading, link, picture and diagram, and where the document is kept.
Sheets: Open (new document, open a file or folder, the Markdown tour, paste a link, documents on this device, earlier versions), View, Contents, Export, Privacy, Settings (width, typeface, colours, spellcheck, erase everything; text size on phones), Shortcuts. A text-size pill sits at the bottom right; md Local adds Show in Finder at the bottom left.

Empty document: placeholder in the editor, a line about what can be dropped, and no marketing.

## Security headers

Page policy, by header and by meta tag:

```
default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;
font-src 'self' data:; connect-src 'none'; worker-src 'self'; manifest-src 'self'; object-src 'none';
frame-src 'self'; base-uri 'none'; form-action 'none'
```

`frame-src 'self'` is for the diagram engines' sandboxed frames, which load only when a document has a PlantUML or draw.io diagram.

Header only: `frame-ancestors 'none'`.
`unsafe-inline` for styles is required by KaTeX's `style` attributes and Mermaid's SVG `<style>`. With `img-src` and `font-src` closed to the web and no `connect-src`, CSS has nowhere to send anything. It's written down in `/trust/` rather than hidden.

Everywhere: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy` all denied, COOP `same-origin`, CORP `same-origin`, COEP `require-corp`, `X-Frame-Options: DENY`, HSTS (hosted only), `X-DNS-Prefetch-Control: off`.

`/sw.js` has its own policy: `default-src 'none'; connect-src 'self'`. Its only fetches are this origin's files during install.

## Proofs

1. **Browser's own record.** Privacy sheet: count of network entries since load from `PerformanceObserver`, the policy text read from the page, and CSP violation events.
2. **Live self-test.** A button tries `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, `EventSource`, a web picture, a frame and a script tag, a fetch from inside a diagram engine's frame, all to `https://blocked.invalid/`, a `fetch` of the page's own `/trust.json`, and code from a string, and puts a set of XSS payloads through `sanitize`. Shows each one refused. `.invalid` never resolves, so nothing can leave even if a browser ignored CSP.
3. **Static audit.** `tools/audit.mjs` runs on every build: scans `dist/` for outside URLs in `src`/`href` of HTML, inline scripts, `eval`/`new Function`, WASM files, and network APIs. Writes `dist/trust.json` with hashes, sizes, licences, the policy, and the findings. Library code matches are listed by file and must be on a reviewed allowlist with the reason given. A new match fails the build.
4. **Compare what's served.** `npm run verify:site -- https://md.ashwingopalsamy.in` fetches every file and compares hashes and headers with the local build.
5. **For network teams.** `/trust/` is a plain page: one domain to allow, GET only, no cookies, no third parties, no inline script, what TLS inspection will and won't see, and how to run it on localhost instead.

## Local

`npm run local`: builds and serves at `127.0.0.1:4873`. `node tools/serve.mjs` serves an existing `dist/` with no dependencies: loopback only, GET and HEAD only, the headers from `dist/_headers` except HSTS, refuses a `Host` that isn't loopback (DNS rebinding), no CORS, no logging of paths.
IndexedDB is per origin, so localhost and the hosted site keep separate documents.
`npm run build:local` builds md Local, which is not this edition: see `docs/local.md`.

## Voice

As in ipynb viewer: plain, short, verbs first, sentence case, lowercase product name `md`, no exclamation marks, no emoji in UI.
