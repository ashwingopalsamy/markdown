---
title: Trust and network notes
description: What md Local reaches, what it reads and writes on this machine, the exact security policy, how to check each claim yourself, and the limits.
---

# Trust and network notes

md Local is md for one machine. A program, `md`, runs as you and serves the page at `http://127.0.0.1:4874/`. The page shows Markdown files from your disk as tabs, and saves them back. This page lists what exists, how to check it, and where the limits are. Nothing here is a promise that cannot be tested.

## What talks to what

- The page talks only to md on this machine, at `127.0.0.1:4874`. Its policy is `connect-src 'self'`, so the browser refuses a request to any other address, including another port on this machine.
- md listens on `127.0.0.1` only, and has no code that makes a request of its own. Nothing goes to the internet.
- Documents are read from their files on disk and saved to them, through md. A save replaces the file in one step.
- The page never names a path. It asks for a document by the ID md gave it when `md <path>` opened the file.
- A picture beside a document is read the same way: by the document's ID and a path inside its project. Pictures from the web are not fetched; they show as a chip with the host name.
- Text you have not saved yet is kept in the browser's IndexedDB until it is, so a closed window loses nothing. It does not leave this machine.
- There is no service worker. md serves every file.

## Diagram engines

PlantUML and draw.io drawings are made in sandboxed frames from `/engine/`. A sandboxed frame has no origin, so it cannot read the page, its storage or md's API. Its policy has `connect-src 'none'`, so it cannot reach the network at all, not even md. The page sends it the diagram's text and gets back a drawing, which is cleaned before it is shown. draw.io's shape sets come from md: the page loads the ones a drawing needs as scripts from md and passes them in.

The PlantUML frame runs WebAssembly (Graphviz, inside `@plantuml/core`), so its policy allows `'wasm-unsafe-eval'`. The page's policy does not.

## Who can use md

- `md <path>` reads a token from the file `token` in md's settings folder (`~/Library/Application Support/md` on macOS, mode 0600) and sends it only to md. With it, a file can be opened.
- A window is connected by a pair code: single use, valid for 60 seconds, given to the window after the `#` in its address, which the browser does not send. The window trades it for a capability, keeps that in IndexedDB, and sends it with every call. md keeps only a hash of it.
- Every API call must carry the `Host` `127.0.0.1:4874`, and come from this page's own origin when the browser says where it came from. There are no CORS headers, so a page on another site cannot read an answer.

## The policy

Sent as a header and repeated as a `<meta>` tag at the top of the page. A meta tag cannot carry `frame-ancestors`, so that one is header-only.

The app page, as a header:

```
{{page-policy}}
```

The same policy in the page's meta tag has no `frame-ancestors`:

```
{{meta-policy}}
```

The guide pages, including this one, have a stricter policy with no inline styles:

```
{{guide-policy}}
```

The engine frames, `/engine/*`:

```
{{engine-policy}}
```

Their scripts load with `crossorigin` and are sent with `Access-Control-Allow-Origin: *`, because a sandboxed frame has no origin to match. They are public code with no secrets.

These headers are sent on every path: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, a `Permissions-Policy` that denies camera, microphone, location and the other device features, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`, `X-Frame-Options: DENY` (except on the engine frames, which the page holds) and `X-DNS-Prefetch-Control: off`. There is no `Strict-Transport-Security`: md is plain HTTP on loopback. The exact values are in `trust.json` under `policy`.

## The one trade-off: inline styles

`style-src` includes `'unsafe-inline'` on the app page. KaTeX writes `style` attributes on its math, and Mermaid writes a `<style>` element inside its diagrams, so a policy without it would break both.

It cannot be used to send anything out. CSS can only reach the network through `url()`, `@import` or a font, and the policy closes each of those to md on this machine: `img-src` allows `'self'`, `data:` and `blob:`, `font-src` allows `'self'` and `data:`, and `connect-src` allows `'self'`. A rule that names any other address is blocked by the browser. Style attributes also cannot run script.

## How to check each claim

1. **Browser's own record.** In md, open the Privacy sheet. Its large number counts the requests the browser recorded to anywhere but md on this machine, since the page loaded. Below it are the requests to md, the policy read from the page, and any policy violations the browser reported. You can compare them with the Network tab of the developer tools.
2. **Live self-test.** The same sheet has a button that tries `fetch`, `XMLHttpRequest`, WebSocket, `sendBeacon`, EventSource, a web picture, a frame and a script, all to `https://blocked.invalid/`; a request to another port on this machine, `127.0.0.1:4873`; a document asked for by its path instead of its ID; and a request from a frame with the engines' policy. It also runs a set of script-injection payloads through the cleaner. It shows each one refused.
3. **Static audit.** `npm run build:app-local` runs `tools/audit.mjs` on `dist-local/`, with the same checks as the hosted build: an outside address in a `src` or `href`, an inline script, a script from another origin, a WebAssembly file, an assignment to `document.cookie` or a known analytics host fails the build, and every network-capable API in the JavaScript must be on `tools/audit-allow.json` with a reason. md Local's own entry there, its one API helper, applies to this edition only. A hosted build fails if it names `/api/`.
4. **Compare what is served.** The audit writes `trust.json`: the SHA-256 and size of every file, the policy, the production dependencies with their versions and licences, and the audit findings. md serves the same `trust.json` it was built with.
5. **Read the source.** md's server is in `local/` of the repository, written with Go's standard library and nothing else. The repository is at github.com/ashwingopalsamy/markdown.

## Limits, said plainly

- **Programs running as you.** Any program running as your user can read the token, mint a pair code and connect a window, or read the files themselves. The token and the capability stop web pages, other users, containers and requests forged through another server. They do not stop your own processes.
- **What md reads.** md reads and writes the files opened with `md`, and a Markdown file you open by following a relative link in one. Pictures and linked files come only from inside the same project: the folder holding `.git`, or else the document's folder.
- **A link in a document is still a link.** If you click one, the browser opens it in a new tab. That is a navigation you chose, and the destination sees the visit.
- **Browser extensions can read any page.** An extension with access to `127.0.0.1` can read the editor. The policy does not apply to extensions.
- **Anything newer than this build.** The audit describes the files it was run on.
