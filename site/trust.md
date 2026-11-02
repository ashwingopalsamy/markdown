---
title: Trust and network notes
description: What md asks of a network, what it can and cannot send, the exact security policy, and how to check each claim yourself. Written for security and network teams.
---

# Trust and network notes

md is a Markdown editor that runs in your browser. This page is for the person deciding whether to allow it. It lists what exists, how to check it, and where the limits are. Nothing here is a promise that cannot be tested.

## What to allow

One hostname: `md.ashwingopalsamy.in`. No other host is contacted, ever. The page's policy has no entry for any other host, so the browser refuses a request to one before it leaves the machine.

## What requests exist

- A `GET` of static files from that hostname, once: the page, its scripts, one stylesheet, two fonts, icons and the guide pages. A typeface you choose in Settings, and the PlantUML and draw.io engines when a document has such a diagram, come from the same hostname the first time they are needed.
- After the first visit a service worker keeps those files on the device. The next visits make no request at all, and the app works with the network off. Typefaces you choose are kept after their first use.
- A new version is a new set of files, fetched the same way, the next time the app is opened.
- Nothing else. The page cannot make a request by script: its policy is `connect-src 'none'`, which blocks `fetch`, `XMLHttpRequest`, WebSocket, EventSource and `sendBeacon`.

## What TLS inspection will see

The app's own files, going down. Never a document, because the page has no way to send one. There is no upload, no sync and no save-to-server. Documents are kept in the browser's IndexedDB on the device and written to files you choose.

## What is not there

- **No cookies.** The app sets none, so none is sent with any request. Documents are stored in IndexedDB, which is not sent to a server.
- **No third parties.** No analytics, no fonts or scripts from another host, no tag manager, no error reporting.
- **No server code.** The hosted copy is static files on Cloudflare's asset hosting. There is no Worker that runs our code, and logs and preview URLs are off in the configuration.
- **No inline script.** The one small script that sets the theme is a file, `theme.js`, so the policy can say `script-src 'self'` with no hashes and no exceptions.
- **No `eval`, and no WebAssembly in the page.** The PlantUML engine runs Graphviz as WebAssembly inside its own sandboxed frame (below).
- **No file paths.** A browser gives a page a file's name, never where it is on disk, so this site cannot show a file in Finder. md Local can, because md opened the file.

## The policy

Sent as a header and repeated as a `<meta>` tag at the top of the page, so a copy saved to any static server has it too. A meta tag cannot carry `frame-ancestors`, so that one is header-only.

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

The service worker, `/sw.js`, has its own policy. Its only fetches are this site's files while it installs:

```
{{sw-policy}}
```

These headers are sent on every path: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, a `Permissions-Policy` that denies camera, microphone, location and the other device features, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`, `X-Frame-Options: DENY` (except on the engine frames, which the page holds), `X-DNS-Prefetch-Control: off`, and `Strict-Transport-Security` on the hosted site. The exact values are in `dist/trust.json` under `policy`.

## The one trade-off: inline styles

`style-src` includes `'unsafe-inline'` on the app page. KaTeX writes `style` attributes on its math, and Mermaid writes a `<style>` element inside its diagrams, so a policy without it would break both.

It cannot be used to send anything out. CSS can only reach the network through `url()`, `@import` or a font, and the policy closes each of those to this site: `img-src` allows `'self'`, `data:` and `blob:`, `font-src` allows `'self'` and `data:`, and there is no `connect-src`. A rule that names an outside address is blocked by the browser. Style attributes also cannot run script.

## How to check each claim

Each of these can be run by someone who does not trust this page.

1. **Browser's own record.** In md, open the Privacy sheet. It counts the network entries the browser recorded since the page loaded, shows the policy read from the page, and lists any policy violations the browser reported. You can compare the count with the Network tab of the developer tools.
2. **Live self-test.** The same sheet has a button that tries `fetch`, `XMLHttpRequest`, WebSocket, `sendBeacon`, a web picture and a frame, a fetch from inside a diagram engine's frame, all to `https://blocked.invalid/`, and runs a set of script-injection payloads through the cleaner. It shows each one refused. The `.invalid` domain never resolves, so nothing could leave even if a browser ignored the policy.
3. **Static audit.** `npm run build` runs `tools/audit.mjs` on the output. It fails the build on an outside address in a `src` or `href`, an inline script, a script from another origin, a WebAssembly file, an assignment to `document.cookie`, or a known analytics host. It also counts the network-capable APIs in every JavaScript file: `fetch(`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, `importScripts`, `eval(`, `new Function`, `Function(`, `navigator.connection` and `WebAssembly`. Each match must be on a reviewed list, `tools/audit-allow.json`, with a reason, so a new one fails the build. Outside addresses that appear as text in library code, such as XML namespaces, are reported and not treated as failures. Files under `/engine/` must be exactly the engine files md ships: the frames' own, `@plantuml/core`'s two at the locked version, and the vendored files whose SHA-256 sums are in `vendor/SHA256SUMS`.
4. **Compare what is served.** The audit writes `dist/trust.json`: the SHA-256 and size of every file, the policy, the production dependencies with their versions and licences, and the audit findings. There is no build time in it, so the same source gives the same file. `npm run verify:site` fetches every file from the live site and compares hashes, and checks that the page's header has `connect-src 'none'`.
5. **Read the source.** It is a small repository. Its one server, in `local/`, belongs to md Local and is not part of this site: the audit fails a hosted build that names its API. The repository is at github.com/ashwingopalsamy/markdown.

## The service worker

`sw.js` is registered by the page and keeps every file the app can ask for in the browser's Cache Storage. It answers requests for this site's files from that copy. It never fetches anything for a document, and it makes no request except to this site's files while it installs. A new version waits until the old one's windows are closed, so an open tab never loses a file halfway; the page can ask to update when it is the only window. Its policy is shown above.

## Diagram engines

PlantUML and draw.io drawings are made in sandboxed frames from `/engine/`. A sandboxed frame has no origin, so it cannot read the page or its storage. Its policy has `connect-src 'none'`, so it cannot reach the network at all, not even md. The page sends it the diagram's text and gets back a drawing, which is cleaned before it is shown. draw.io's shape sets come from md: the page loads the ones a drawing needs as scripts from this site and passes them in.

The PlantUML frame runs WebAssembly (Graphviz, inside `@plantuml/core`), so its policy allows `'wasm-unsafe-eval'`. The page's policy does not.

The app page allows frames from this site only (`frame-src 'self'`), and only the engines use it.

```
{{engine-policy}}
```

Their scripts load with `crossorigin` and are sent with `Access-Control-Allow-Origin: *`, because a sandboxed frame has no origin to match. They are public code with no secrets.

## Run it on localhost instead

If the hosted site cannot be allowed, run the same files on your own machine. No hostname beyond `127.0.0.1` is involved after you have them.

```bash
git clone https://github.com/ashwingopalsamy/markdown
cd markdown
npm ci
npm run local
```

That builds and serves `dist/` at `http://127.0.0.1:4873/`. The server is a short file, `tools/serve.mjs`, with no dependencies: it answers `GET` and `HEAD` only, refuses a `Host` header that is not loopback, applies the same headers as the hosted site except HSTS, and logs no paths. Documents on `127.0.0.1` and on the hosted site are kept separately, because browser storage belongs to an origin. md Local, built by `npm run build:local`, is a different edition: its own server reads and saves files on disk, and it has its own policy and its own trust page.

## Limits, said plainly

- **A link in a document is still a link.** If you click one, the browser opens it in a new tab. That is a navigation you chose, and the destination sees the visit. Pictures from the web are not fetched; they show as a chip with the host name, and clicking it opens the picture in a new tab.
- **Browser extensions can read any page.** An extension with access to this site can read the editor. The policy does not apply to extensions.
- **Agent links.** A link with the document after the `#` is not sent to a server by the browser, so it stays out of server logs. The whole address can still pass through the program that opens it, through any endpoint tool that records process arguments, and into your shell history if you typed it. See [for agents](../agents/).
- **The host sees file requests.** Cloudflare serves the static files, so it sees the IP address and the file requests that any web host sees. It does not see documents.
- **A categorising proxy has its own opinion.** Tools such as Zscaler assign a category to a domain themselves, and this page cannot guarantee their verdict. It gives them nothing to object to: one host, static files, no cookies, no third parties, and a policy that closes every outbound path.
- **Anything newer than this build.** The audit describes the files it was run on. `npm run verify:site` tells you whether the site serves those files.
