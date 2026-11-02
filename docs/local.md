# md Local

A second edition of md for one machine. Agents run `md <path>`, and the file appears as a tab in Chrome, where it can be read, copied, edited and saved back to disk. The hosted edition is unchanged by anything here.

## Invariants

1. The file on disk is the truth. A save replaces it atomically; nothing else writes to it.
2. Text a person typed is never lost: not to an agent's write, a deleted file, a restart or a second window.
3. The page reaches documents by registered ID only. No API takes a path except `POST /api/open`, which needs the token.
4. Nothing leaves the machine: the server listens on loopback, has no outbound code, the page's policy is `connect-src 'self'`, and the engine frames' is `connect-src 'none'`.
5. An agent never takes focus from a window that is already open.
6. With no window connected, the server does no periodic work.
7. Nothing local reaches a hosted build except the diagram engines, which both editions ship. The audit proves it.

## Security limit

Any program running as this user can read these files and mint a pair code. The capability stops web pages, other users, containers and SSRF, not the user's own processes.

## Edition build

- `vite build --mode md-local` sets `__LOCAL__` to true, writes to `dist-local`. (Vite reserves the mode name `local`.) Hosted sets it to false, so local code is removed by tree-shaking.
- Local has no service worker. `src/main.ts` does not register one, and the build does not generate one.
- The audit takes the output folder and edition. Local allows `connect-src 'self'` and `frame-src 'self'`; hosted rules stay exactly as they are, and hosted must also contain no `/api/` string.
- `local/` embeds `dist-local`.
- What the page says about itself is the edition's own. Copy shared with hosted is chosen with `__LOCAL__`, so the hosted bundle keeps its words. `index.html`'s description and `<noscript>` are replaced at build time (`LOCAL_COPY` in `vite.config.ts`; a line that is gone stops the build). Guide pages come from `site/local/<page>.md` where one exists (`trust`, `agents`), else from `site/`. `llms.txt` and `robots.txt` have local wording.
- Both editions list `@plantuml/core` in `trust.json`.
- Allowlist entries in `tools/audit-allow.json` with `"edition": "local"` cover the API helper and apply to `dist-local` only.

Local page policy, identical to hosted except the two named directives:

```
connect-src 'self'; frame-src 'self'
```

Engine frames (`/engine/*.html`) get their own response policy, and the most specific header rule wins over `/*`:

```
default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; sandbox allow-scripts; frame-ancestors 'self'
```

Their scripts load with `crossorigin` and are sent with `Access-Control-Allow-Origin: *`, because a sandboxed frame has no origin to match. They are public code with no secrets, and this applies to `/engine/*` only. Engine routes omit `X-Frame-Options`.

## Commands

The single Go binary is `md`.

| Command | Does |
|---|---|
| `md <path>` | Registers the file, opens Chrome if needed, prints one line |
| `md serve` | Runs the server (what the LaunchAgent starts) |
| `md setup` | Creates the token, installs and loads the LaunchAgent |
| `md doctor` | Checks the service, port, identity, Chrome, token |
| `md uninstall` | Unloads and removes the LaunchAgent; keeps documents, which are the user's files |

`md <path>` exit codes: 0 opened, 2 not found, 3 type not allowed, 4 too large, 5 server not running, 6 refused. Each failure prints one line saying what to do. Any other use prints the usage and exits 1; `doctor` exits 1 when a check fails.

`install.sh` (macOS) builds from the checkout with `npm run build:local`, copies the binary to `~/.local/bin/md`, runs `md setup`, and offers to append one line to `~/.claude/CLAUDE.md`: "After finishing a Markdown file for me to read, run `md <path>`." It downloads nothing but npm packages. The old shell script `bin/mdopen`, which built a hosted `#md=` link, is gone: `md` means this binary only.

Paths on the server: `127.0.0.1:4874`. The port is new so that the old worker on 4873 cannot answer. Data lives in `os.UserConfigDir()/md`: `token` (0600), `state.json` (0600, written atomically).

## Authentication

- **Token:** 32 random bytes in the token file. Used by the CLI only, as `Authorization: Bearer`.
- **Pair code:** `POST /api/pair` (token) gives a single-use code valid for 60 s. The CLI opens `/#pair=<code>`, and the page removes it from the address with `replaceState`.
- **Capability:** `POST /api/pair/claim {code}` gives a 32-byte capability. The page keeps it in IndexedDB and sends it as `Authorization: Bearer` on every API call. The server stores only SHA-256 hashes and compares in constant time.
- A page with no capability and no code shows one calm screen: "Run `md <file>` to connect this window."

Every `/api` request, before anything else:

- `Host` must equal exactly `127.0.0.1:4874`. `localhost` is refused, because other ports on it share a site.
- If `Origin` is present it must equal `http://127.0.0.1:4874`.
- If `Sec-Fetch-Site` is present it must be `same-origin`.
- No CORS headers on `/api`; `OPTIONS` gets 405.
- Bodies have a size cap (11 MB for `PUT`, 64 KB otherwise).

Static files keep the existing `Host` check and GET/HEAD rule.

## API

| Call | Auth | Result |
|---|---|---|
| `GET /api/health` | none | `{app:"md", build}` for the CLI's identity check |
| `POST /api/open {path}` | token | `{id, name, project, opened, launch}`. `launch` is true only if no window is connected and none was launched in the last 10 s |
| `POST /api/pair` | token | `{code}` |
| `POST /api/pair/claim {code}` | code | `{cap}` |
| `GET /api/docs` | cap | The tab list in order |
| `GET /api/doc/:id` | cap | `{id, name, project, path, version, text, readonly, bom, gone}` |
| `PUT /api/doc/:id` | cap | Save. `If-Match: <version>` is required (428 without, 412 on mismatch with the current `{version}`). `If-None-Match: *` recreates a deleted file, and fails with 412 if something is there |
| `DELETE /api/doc/:id` | cap | Closes the tab; never touches the file |
| `PATCH /api/doc/:id {viewed}` | cap | Marks seen; clears the unread dot in every window |
| `POST /api/order {ids}` | cap | Tab order |
| `POST /api/tour` | cap | The tour as a file in `<config>/tour/`, `{id, name, project, opened}` |
| `GET /api/doc/:id/asset?p=` | cap | A relative picture (below) |
| `POST /api/doc/:id/reveal` | cap | 204, Finder shows the file (its folder if gone), 404 both gone, 501 off macOS |
| `GET /api/events` | cap | Event stream, in SSE format, read with `fetch` because `EventSource` cannot send a header |

`version` is the lowercase hex SHA-256 of the file's raw bytes.

Events: `hello {build}`, `docs {list}` (the full list, on connect and on any change), `change {id, version}`, `gone {id}`, `back {id, version}`. `ping` every 25 s.

The write and idle timeouts in `http.Server` are per route: the event stream has none, and `PUT` gets a longer read timeout.

## Registry and files

- Allowed extensions, checked on the resolved target: `md markdown mdx mdown txt`.
- Maximum 10 MB. Larger is refused at open.
- `open` resolves symlinks to an absolute real path. Two paths are the same document if `os.SameFile` says so; the second open returns the first ID and registers no new tab.
- A second open of a closed document's path makes a new registration.
- `project` is the base name of the nearest parent containing `.git`, else the parent folder's name.
- Every file operation opens `os.OpenRoot` on the document's real parent folder and uses the base name inside it, so a swapped symlink cannot escape.
- Non-UTF-8 files come back `readonly: true` with lossy text. A leading BOM is reported as `bom: true`, removed from `text` and put back on save. The version is always of raw bytes.
- `state.json` holds `{docs:[{id, path, viewed}], caps:[hash]}`. A missing or corrupt file starts an empty registry; the corrupt file is kept as `state.json.bad`.

**Change detection.** While at least one event stream is connected, a 1 s ticker stats each registered path. If size, mtime or inode changed, it waits until two stats about 500 ms apart match (about 2 s for an empty file), hashes the bytes, and publishes `change` if the hash differs from the known version. A path that no longer exists publishes `gone`, and one that returns publishes `back`. With no stream connected the ticker stops; on the first new connection every document is checked once.

**Save.** Per-document mutex. Re-read and hash the file immediately before writing, and compare with `If-Match`. Write a temp file in the same folder, fsync, copy the mode, rename over the real path, and record the new version, so the save does not echo as a `change`. A write landing between the final hash and the rename is lost; the window is microseconds and this is the documented limit.

## Client

**Source seam.** `Doc` gets plain data that survives IndexedDB: `source: {kind:'handle', handle} | {kind:'server', id, version}`. Functions dispatch on `kind` at the sites in `app.svelte.ts` that use `handle` today (`follow`, `onDisk`, `write`, `save`, `openText`'s identity check).

**Tab list.** The server owns the open list in local. `GET /api/docs` and the `docs` event replace `app.docs` membership and order. Drafts live in IndexedDB as `{id, baseVersion, text}`, keyed by server ID, and exist only while a tab has unsaved edits. A draft whose `baseVersion` differs from disk on load becomes a conflict.

**Event stream.** One tab holds the stream through a Web Lock (`md-local-leader`) and relays events over a `BroadcastChannel` named `md-local`. When the lock changes hands the new leader reconnects and gets a full `docs` event. On disconnect: retry with backoff to 5 s and show a quiet "Reconnecting" state; documents stay readable and editable, saving waits.

**States of a tab.**

| State | Means | Shown as |
|---|---|---|
| clean | Text equals disk | Nothing; a `change` loads silently, keeping scroll and caret through a minimal edit, and changed blocks fade |
| dirty | Unsaved edits | Existing dirty mark; a `change` shows the toast offering Load it |
| unread | Changed or opened and not yet viewed | A dot on the tab; the title counts them |
| conflict | Save got 412 | Toast: Overwrite or Load it. Disk version goes to snapshots first |
| gone | File is missing | Tab keeps its text; save offers Recreate |
| readonly | Not valid UTF-8 | No editing; a note says why |

**Two windows.** The first edit takes a Web Lock on `md-edit-<id>`. A window that cannot get it shows the document read-only with a note. The lock releases on save, on revert to clean, and on close.

**Pictures and links.** `![](rel)` resolves against the document. The sanitizer's output is post-processed by trusted code that fetches each relative picture through `/asset` into a `blob:` URL; author markup can never carry `blob:`. A relative link to an allowed text file opens as a tab through `POST /api/doc/:id/link {p}` (cap), under the same containment rule.

## Assets

`GET /api/doc/:id/asset?p=rel` serves files inside the document's project root (the folder holding `.git`, else the document's folder). Decoded path, `os.Root` containment, and an extension check on the resolved target: `png jpg jpeg gif webp avif svg`, and `drawio`, with 25 MB maximum. Every response carries `Content-Security-Policy: default-src 'none'; sandbox`, `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`.

## Diagram engines

PlantUML and draw.io both run in sandboxed frames, in a separate process from the page, so a hang can be stopped by removing the frame. Tested in headless Chrome: the page kept running while a frame looped forever, and removing the frame stopped it.

**PlantUML** cannot run in a Worker: `@plantuml/core` builds SVG through `document`. One long-lived frame (`/engine/plantuml.html`: `viz-global.js` as a classic script, then `plantuml-frame.js` as a module that imports `plantuml.js`), made on the first drawing and hidden. It says `ready` within 6.5 s or is made again, three tries in all. One render at a time, 20 s limit, then the frame is removed and rebuilt. `PLANTUML_STDLIB_BASE` points at `/engine/` for bundles such as C4. The frame answers only its parent, and only `{id, src}`. Output goes through `sanitize(svg, 'svg')`.

The source gets `@startuml` and `@enduml` when it lacks them, and a skin just after the opening line: a clear background and no shadows, plus light lines and text on a dark page (17 lines dark, 2 light). PlantUML applies skinparams and styles only to what follows them, so the skin cannot go after the person's lines. An error drawing ignores the skin but counts its lines, so when PlantUML answers with one (it names `[From … (line N) ]`), the source is drawn again without the skin. That drawing names the person's line and lists only what they wrote; when `@startuml` was added, its line number is lowered by one so it matches the fence. A source whose skin PlantUML would not take is drawn plain the same way.

**draw.io** uses `viewer-static.min.js` in a frame, created on first use. The frame is off the screen at 1100 × 800, not `display:none`, because the viewer measures its labels. It says `ready` within 8 s, three tries; one render at a time, 20 s limit. `mxUtils.eval` is replaced with a function that returns null. Sources over 4 MB and SVG over 30 MB are refused; the last 16 drawings are cached by source. Stencils load in two passes: render once with `mxStencilRegistry.loadStencilSet` replaced so it records the sets needed; the page imports those as modules, `/engine/stencils/<set>.js`, which the build makes from the vendored XML, and passes them in; render again. A set still missing shows a note under the drawing: "Some shapes are not in the sets md has: …". Output has `foreignObject` for HTML labels, which the sanitizer would strip, so it is cleaned by its own pass (no script, frames, media, handlers, or links other than `#` and `data:image/`) and shown only as `<img src="data:image/svg+xml,…">`, where scripts do not run and nothing is fetched.

A draw.io drawing is always the light one, on a light surface (white, 12 px padding, a hairline border), in both themes: its colours are the author's, and a dark rewrite would change them.

Stencil sets shipped: `aws4`, `azure`, `basic`, `bpmn`, `cisco19`, `flowchart`, `gcp2`, `kubernetes`. They carry draw.io's stencil licence, quoted in `NOTICE`. In practice: md may ship them, and diagrams drawn with them, as pictures or documents, are free to use anywhere. What is not allowed is using the stencils themselves as assets in, or distributing them with, an Atlassian product or anything sold through Atlassian's marketplace. md is not one, and the sets must not be carried into one.

**The Privacy sheet** tests this edition's own claims. The hosted probe that fetches the page's own file (which `connect-src 'self'` allows here) is replaced by three: a `fetch` to another port on this machine (`127.0.0.1:4873`), refused by `connect-src`; a request for a document by path (`/api/doc/%2Fetc%2Fhosts`), refused by the server because documents open only by ID; and a sandboxed frame, `/engine/probe.html`, with the engines' response policy, which tries to fetch md's `/trust.json` and `https://probe.invalid/` and reports that both were refused by `connect-src`. The other probes, to `blocked.invalid`, are the hosted ones. The shield's tip says "Nothing has left this machine".

**Diagram toolbar.** In both editions, every drawn Mermaid, PlantUML or draw.io figure in the live preview gets a bar at its top right, shown on hover or focus (always on touch, never in print or on an error): Zoom (the drawing alone, filling the window), Copy image (a PNG on the clipboard, at the last size and background chosen), and Download image (a card). Ordinary pictures get the same bar, with SVG only when the picture is one.

**Export.** In both editions, the card offers PNG, JPEG, WEBP (where the browser writes it) or SVG; a size of 1× to 4× or a width in pixels; and a background of Clear, White or Page. The choice is kept in `localStorage` as `md-diagram`.

- The picture needs nothing from the page: each element's computed colours and type are written onto it, and fonts become a stack every machine has.
- JPEG has no transparency, so Clear becomes White.
- Page is the colour behind the drawing; for draw.io it is white, its own surface.
- From a dark page with White, Mermaid and PlantUML are drawn again light, so their light text does not vanish; draw.io is already light. A drawing that cannot be drawn again is saved as shown, with a note.
- A raster is capped at 16384 px on a side and 268 M pixels in all, and says so when capped.
- Files are named `<document>-diagram-<n>.<ext>`.

**Raster export** always loads the SVG from a `data:` URL. A `blob:` SVG with `foreignObject` taints the canvas in Chrome.

## Find

Search has three options, kept in `localStorage`: Match case, Whole word (bounded by anything that is not a Unicode letter, digit or underscore) and Regular expression (JavaScript syntax, flags `gmu`, plus `i` without Match case). Matching and replacing run in a module worker; a job that takes more than 250 ms ends the worker and shows "Pattern too slow", and a newer job ends an older one. An invalid pattern shows the engine's reason. Replacement text takes `$$`, `$&`, `` $` ``, `$'`, `$1` to `$99` and `$<name>`, as `String.replace` does; Replace all is one undoable change. Matches past 5,000 are not marked.

## Vendored files

Under `vendor/`, checked in with a `SHA256SUMS` file so builds do not depend on the network or on Zscaler: draw.io's viewer and stencils, and PlantUML's C4 bundles. The build copies them to `/engine/`, and stops if a file does not match its sum. `@plantuml/core` comes through npm, pinned at `1.2026.9` (MIT from 1.2026.6). The frames' own files (`plantuml.html`, `plantuml-frame.js`, `drawio.html`, `drawio-frame.js`, `probe.html`, `probe.js`) are in `public/engine/`.
