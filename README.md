# md

**A Markdown editor that keeps your document on your device.**

It runs in the browser. The page cannot make a request, so a document has nowhere to go. It works offline after the first visit, and the same files run on `127.0.0.1`. The hosted site opens on a landing page with a sourced comparison (`site/compare.ts`) and a demo; md Local opens straight into the editor.

[md Local](#md-local) is a second edition, for the files on one machine. It has its own rules, written below.

## Write

Open [md.ashwingopalsamy.in](https://md.ashwingopalsamy.in/) and start typing, or drop a `.md` file anywhere on the page. Your last documents are there when you come back. Work is saved on this device as you type.

- Write, Split and Read views. Split scrolls the two sides together.
- GitHub-flavoured Markdown, alerts, footnotes, math, Mermaid diagrams and highlighted code. The [syntax page](site/syntax.md) lists all of it.
- Open a file or a folder. In Chromium, a file opened from disk saves back in place (`Cmd+S`) and follows changes made to it, so an agent that writes the file shows up live.
- Export as `.md`, a self-contained `.html`, or print to PDF. Copy as Markdown or as rich HTML.

## Run it on your own machine

You need Node 22 or newer.

```sh
git clone https://github.com/ashwingopalsamy/markdown && cd markdown
npm ci
npm run local
```

That builds `dist/` and serves it at `http://127.0.0.1:4873/`. The server is `tools/serve.mjs`: no dependencies, loopback only, `GET` and `HEAD` only, no logging of paths. Documents on `127.0.0.1` and on the hosted site are kept apart, because browser storage belongs to an origin.

## md Local

md Local is md for one machine. Run `md <path>` and the file appears as a tab in Chrome, where it can be read, edited and saved back to disk. A small Go program, `md`, runs as you on `127.0.0.1:4874` and serves the page.

On macOS, with Go 1.25 and Node 22 or newer:

```sh
./install.sh
```

It builds the page and the binary from this checkout, puts `md` in `~/.local/bin`, and loads a LaunchAgent so md starts when you log in. Then it offers to add one line to `~/.claude/CLAUDE.md`, so your agents open what they write:

```
After finishing a Markdown file for me to read, run `md <path>`.
```

```sh
md notes.md     # opens it as a tab and prints one line
md doctor       # checks the service, the port, the build, Chrome and the token
md uninstall    # removes the LaunchAgent; your files, the token and state.json stay
```

`md <path>` exits 0 when the file is open, 2 when there is no such file, 3 when it is not a Markdown or text file, 4 when it is over 10 MB, 5 when md is not running (`md setup` starts it), and 6 when md refused. To remove everything, run `md uninstall`, then delete `~/.local/bin/md` and `~/Library/Application Support/md`.

What it promises is different from the hosted site:

- The page talks only to md on this machine. Its policy is `connect-src 'self'`.
- Documents are read from their files on disk and saved to them, through md. The page asks for them by an ID, never a path.
- PlantUML and draw.io run in sandboxed frames that cannot reach the network.
- Show in Finder, at the bottom left, opens Finder with the file selected. A web page cannot: browsers never tell it where a file is.
- Nothing goes to the internet. md listens on loopback and has no code that makes a request.

The limit, said plainly: any program running as you can read md's token and mint a pair code, so it can connect a window and read what md has open. The token stops web pages, other users and containers, not your own processes. [`site/local/trust.md`](site/local/trust.md) has the full policy and how to check it, and [`docs/local.md`](docs/local.md) has the design.

## Trust

For the hosted site and `npm run local`:

- The page policy has `connect-src 'none'`, by header and by meta tag. One origin, no inline script, no `eval`, no WebAssembly in the page, no cookies, no analytics, no server code.
- PlantUML and draw.io load when a document needs them and run in sandboxed frames that cannot reach the network.
- `npm run build` audits the output and fails on an outside address, an inline script, a `.wasm` file, a write to `document.cookie`, an analytics host, or a network-capable API that is not on [`tools/audit-allow.json`](tools/audit-allow.json) with a reason.
- It writes `dist/trust.json`: the SHA-256 of every file, the policy, the dependencies with their licences and the audit findings.
- `npm run verify:site -- https://md.ashwingopalsamy.in` fetches every file from a live site and compares it with your build.
- In the app, the Privacy sheet counts the requests the browser recorded and runs a self-test that tries to send to `blocked.invalid`.

[`site/trust.md`](site/trust.md) is written for security and network teams, with the full policy and the limits. [SECURITY.md](SECURITY.md) says how to report a problem.

## Agents

An agent can open a file in md. It cannot read one back.

On the hosted site, an agent builds a link with the file after the `#`, which the browser does not send to a server, and opens it. [`site/agents.md`](site/agents.md) has the format, the size limit, watching a file on disk, and the WebMCP tool `open_markdown_text`. In md Local, it runs `md <path>`; [`site/local/agents.md`](site/local/agents.md) has the output and exit codes.

<sub>[MIT](LICENSE) · [Security](SECURITY.md) · [Changelog](CHANGELOG.md) · [Design](DESIGN.md) · [Notice](NOTICE)</sub>
