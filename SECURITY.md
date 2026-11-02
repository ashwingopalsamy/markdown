# Security policy

## Reporting a vulnerability

Do not report vulnerabilities in public issues. Use a private [security advisory](https://github.com/ashwingopalsamy/markdown/security/advisories/new). Include a document that triggers it and the commit you saw it on.

## What md promises

A document is untrusted input. md reads it and draws it, and never runs it. These promises are for the hosted site and `tools/serve.mjs`; md Local's are below.

- **The document stays on the device.** The page policy has `connect-src 'none'`, by header and by meta tag, so the page cannot make a request by script. There is no server to send a document to.
- **Everything is same-origin.** `default-src 'none'` and `script-src 'self'`. No inline script, no `eval`, no WebAssembly in the page, no third-party anything, no analytics.
- **No server code.** The hosted copy is static files. `tools/serve.mjs` only serves files.
- **Markup in a document cannot do anything.** Markdown is rendered to HTML and cleaned by DOMPurify with `style` removed, and the policy is the second wall. Links open in a new tab without an opener. Pictures from the web are never fetched: they show as a chip naming the host.
- **Diagram engines are shut in.** PlantUML and draw.io load only when a document has such a diagram, and run in sandboxed frames from this site whose policy has `connect-src 'none'`. The page allows frames from its own origin only. The PlantUML frame runs WebAssembly; the page does not.
- **No cookies.** Documents are kept in IndexedDB on the device.
- **Nothing reads a document back to an agent.** An agent can open text in md, not read it.

The one loosening is `style-src 'unsafe-inline'`, which KaTeX and Mermaid need. With `img-src`, `font-src` and `connect-src` closed to the web, CSS has nowhere to send anything. The [trust page](site/trust.md) has the full policy and how to check each claim.

## md Local

md Local ([docs/local.md](docs/local.md)) is a second edition for one machine, and promises something different:

- **Nothing goes to the internet.** The page talks only to md on `127.0.0.1:4874`: its policy has `connect-src 'self'`. md listens on loopback and has no code that makes a request.
- **Documents are files on disk.** md reads them and saves them back. The page asks for a document by the ID md gave it, with a capability; only `md`, with the token, can name a path.
- **Diagram engines are shut in**, as on the hosted site.
- **The limit.** Any program running as the user can read the token and mint a pair code. The token and capability stop web pages, other users and containers, not the user's own processes.

## Checking

`npm run build` runs `tools/audit.mjs`, which fails the build on an outside address in an HTML `src` or `href`, an inline script, a script from another origin, a `.wasm` file, a write to `document.cookie`, an analytics host, or a network-capable API in the JavaScript that is not on `tools/audit-allow.json` with a reason. `npm run verify:site` compares a live site with `dist/trust.json`.

## Limits

A person can still click a link in a document. A browser extension can read any page. A link that carries a document after the `#` stays out of server logs, but the whole address can pass through the program that opens it and into shell history. The static host sees the IP address and file requests, as any host does.

## Scope

Anything in this repository and the site at [md.ashwingopalsamy.in](https://md.ashwingopalsamy.in). A way to run script from a document, to make the page send a request it should not, to reach a file in md Local by path, or to slip past the cleaner is a vulnerability, not a bug.
