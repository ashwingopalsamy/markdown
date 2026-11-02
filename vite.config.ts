import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { gzipSync } from 'node:zlib'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { marked } from 'marked'
import { defineConfig, type Plugin } from 'vite'
import { engineFiles } from './tools/engine.mjs'
import { ENGINE_POLICY, GUIDE_META, GUIDE_POLICY, LOCAL_META_POLICY, LOCAL_PAGE_POLICY, META_POLICY, META_TAGS, ORIGIN, PAGE_POLICY, SW_POLICY } from './tools/policy.mjs'

// Files the offline copy leaves out: source maps, the worker itself, and files that are not served as files.
const SKIP = /\.map$|^(?:sw\.js|_headers|404\.html)$/
// dist/trust.json is written after the build by tools/audit.mjs, so it is named here rather than found.
const LATE = ['trust.json']
const BUDGET = 45_000
// Kept on this device the first time they are used, not at install: the two serif faces. The diagram engines are in neither list: they are not kept
// for offline use (a sandboxed frame does not go through the worker), and 20 MB is too much to put in the copy.
const ONUSE = /^fonts\/(?:literata|newsreader)/
const ENGINE = /^engine\//

const GUIDES = ['trust', 'agents', 'syntax']

/** /engine/: PlantUML's runtime from npm, the vendored files and the stencil modules made from them, and the frames, as tools/engine.mjs lists them. A vendored file that differs from vendor/SHA256SUMS stops the build. */
function engine(out: string) {
  for (const [name, bytes] of engineFiles('.')) {
    const to = join(out, 'engine', name)
    mkdirSync(dirname(to), { recursive: true })
    writeFileSync(to, bytes)
  }
}

// index.html speaks for the hosted site. md Local's page says what it does instead; a line that is no longer there stops the build.
const LOCAL_COPY: [string, string][] = [
  [
    'A Markdown editor that runs entirely in your browser. Nothing is uploaded, and the page is not able to upload. Works offline and on localhost.',
    'A Markdown editor for the files on this machine. The page talks only to md on this machine, and nothing goes to the internet.',
  ],
  ['md runs in your browser and needs JavaScript. It makes no requests with it.', 'md needs JavaScript. With it, the page talks only to md on this machine.'],
]

/** The policy as a <meta> tag, first in <head>, on the app page. Build only: the dev server needs inline HMR and a socket. */
function policy(local: boolean): Plugin {
  return {
    name: 'policy',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        let out = html.replace(/<head[^>]*>/, (open) => `${open}\n${META_TAGS(local ? LOCAL_META_POLICY : META_POLICY)}`)
        if (local)
          for (const [from, to] of LOCAL_COPY) {
            if (!out.includes(from)) throw new Error(`index.html no longer has: ${from}`)
            out = out.replace(from, to)
          }
        return out
      },
    },
  }
}

/** Finishes a build: checks the first-screen budget, then writes the offline worker with every file the app can ask for.
 * The local edition has no worker: the binary serves the files. */
function finish(local: boolean): Plugin {
  let out = 'dist'
  let base = ''
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = join(dir, name)
      return statSync(full).isDirectory() ? walk(full) : [full]
    })
  const gz = (file: string) => gzipSync(readFileSync(join(out, file)), { level: 9 }).length

  return {
    name: 'finish',
    apply: 'build',
    configResolved: (config) => {
      out = config.build.outDir
      base = config.base.replace(/^\/|\/$/g, '')
    },
    closeBundle() {
      engine(out)
      // md Local writes the tour to a file of the person's own on first use (local/server.go, /api/tour)
      if (local) copyFileSync('src/lib/tour.md', join(out, 'tour.md'))
      const all = walk(out).map((f) => relative(out, f).split('\\').join('/'))
      const html = readFileSync(join(out, 'index.html'), 'utf8')
      const first = [...html.matchAll(/(?:src|href)="(?:\.\.\/|\/)?([^"]+\.(?:js|css))"/g)].map((m) => (base && m[1].startsWith(`${base}/`) ? m[1].slice(base.length + 1) : m[1]))
      const core = gz('index.html') + first.reduce((n, f) => n + gz(f), 0)
      console.log(`first screen: ${core} bytes gz (index.html, ${first.join(', ')})`)
      if (core > BUDGET) throw new Error(`The first screen is ${core} bytes gzipped; the budget is ${BUDGET.toLocaleString('en')}.`)
      if (local) return

      const precache = [...all.filter((f) => !SKIP.test(f.split('/').pop()!) && !/\.map$/.test(f) && !ONUSE.test(f) && !ENGINE.test(f)), ...LATE].sort()
      const hash = createHash('sha256')
      for (const f of precache) if (!LATE.includes(f)) hash.update(f).update(readFileSync(join(out, f)))
      const use = createHash('sha256')
      for (const f of all.filter((f) => ONUSE.test(f)).sort()) use.update(f).update(readFileSync(join(out, f)))
      const template = readFileSync('tools/sw.template.js', 'utf8')
      writeFileSync(join(out, 'sw.js'), template.replace('__VERSION__', hash.digest('hex').slice(0, 10)).replace('__USE__', use.digest('hex').slice(0, 10)).replace('__FILES__', JSON.stringify(precache)))
    },
  }
}

/** The guide pages, written in Markdown under site/, become static pages with no script but the theme, plus Markdown copies and llms.txt.
 * The build writes them; the dev server draws the same pages on request. Outside addresses are written as text, never as links:
 * the audit fails a page that links out. md Local takes a page from site/local/ where one is there, since its claims differ. */
function pages(local: boolean): Plugin {
  let base = '/'
  const source = (name: string) => readFileSync(local && existsSync(join('site/local', name)) ? join('site/local', name) : join('site', name), 'utf8')
  const fill = (text: string) =>
    text
      .replace(/\{\{page-policy\}\}/g, (local ? LOCAL_PAGE_POLICY : PAGE_POLICY).replace(/; /g, ';\n'))
      .replace(/\{\{meta-policy\}\}/g, (local ? LOCAL_META_POLICY : META_POLICY).replace(/; /g, ';\n'))
      .replace(/\{\{guide-policy\}\}/g, GUIDE_POLICY.replace(/; /g, ';\n'))
      .replace(/\{\{sw-policy\}\}/g, SW_POLICY)
      .replace(/\{\{engine-policy\}\}/g, ENGINE_POLICY.replace(/; /g, ';\n'))
      .replace(/\{\{origin\}\}/g, ORIGIN)
  const guide = (slug: string) => {
    const raw = source(`${slug}.md`)
    const m = /^---\n([\s\S]*?)\n---\n/.exec(raw)
    if (!m) throw new Error(`site/${slug}.md has no front matter`)
    const meta = Object.fromEntries(m[1].split('\n').map((l) => [l.slice(0, l.indexOf(':')).trim(), l.slice(l.indexOf(':') + 1).trim()]))
    return { slug, title: meta.title, description: meta.description, body: fill(raw.slice(m[0].length)) }
  }
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  const icon = '<svg viewBox="0 0 40 48" width="15" height="18" aria-hidden="true"><rect width="40" height="48" rx="10" fill="#1d1d1f"/><circle cx="12" cy="11" r="3.6" fill="#4cc38a"/><g fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7.5 35V23l7 8 7-8v12"/><path d="M30 23v12M25.5 30.5 30 35l4.5-4.5"/></g></svg>'
  const render = (g: ReturnType<typeof guide>, sheet: string, meta: boolean) => {
    // marked turns bare addresses into links; an outside link becomes plain text
    const body = (marked.parse(g.body, { async: false }) as string).replace(/<a href="(?:https?:)?\/\/[^"]*"[^>]*>([\s\S]*?)<\/a>/g, '$1')
    const nav = [['', 'Open the editor'], ...GUIDES.map((s) => [`${s}/`, { trust: 'Trust', agents: 'For agents', syntax: 'Syntax' }[s]!])]
    return `<!doctype html>
<html lang="en">
<head>
${meta ? `${META_TAGS(GUIDE_META)}\n` : ''}<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<meta name="color-scheme" content="light dark" />
<meta name="description" content="${esc(g.description)}" />
<meta name="theme-color" content="#f5f5f7" />
<link rel="icon" href="${base}favicon.svg" />
<link rel="manifest" href="${base}manifest.webmanifest" />
<title>${esc(g.title)} · md</title>
<link rel="alternate" type="text/markdown" href="index.md" />
<link rel="stylesheet" href="${sheet}" />
<script src="${base}theme.js"></script>
</head>
<body>
<header class="bar"><div class="inner"><a class="pill" href="${base}">${icon}md</a></div></header>
<main>
<article>
${body}
<p class="cta"><a href="${base}">Open the editor</a></p>
</article>
</main>
<footer>
<nav aria-label="More">${nav.map(([href, label]) => `<a href="${base}${href}">${label}</a>`).join('')}</nav>
<p>MIT licence. Source at github.com/ashwingopalsamy/markdown.</p>
</footer>
</body>
</html>
`
  }

  return {
    name: 'pages',
    enforce: 'post',
    configResolved: (config) => {
      base = config.base
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url ?? '').split('?')[0]
        const slug = GUIDES.find((s) => path === `${base}${s}` || path === `${base}${s}/` || path === `${base}${s}/index.html`)
        if (!slug) return next()
        if (path === `${base}${slug}`) return res.writeHead(301, { Location: `${base}${slug}/` }).end()
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.end(await server.transformIndexHtml(path, render(guide(slug), `${base}src/about/guide.css`, false)))
      })
    },
    generateBundle() {
      const sheet = this.getFileName(this.emitFile({ type: 'asset', name: 'guide.css', source: readFileSync('src/about/guide.css', 'utf8') }))
      const all = GUIDES.map(guide)
      for (const g of all) {
        this.emitFile({ type: 'asset', fileName: `${g.slug}/index.html`, source: render(g, `${base}${sheet}`, true) })
        this.emitFile({ type: 'asset', fileName: `${g.slug}/index.md`, source: g.body })
      }
      this.emitFile({
        type: 'asset',
        fileName: 'llms.txt',
        source: `# md

${
          local
            ? `> md Local: a markdown editor for the files on one machine. The page talks only to md on 127.0.0.1:4874, which reads and saves the files on disk; nothing goes to the internet.

md Local is served by the md program on this machine. Every page below has a Markdown version at the address shown.`
            : `> A markdown editor that runs in the browser. It keeps documents on the device, makes no requests after the first load, and can be run from 127.0.0.1.

md is a web page at ${ORIGIN}/. Every page below has a Markdown version at the address shown.`
        }

## Pages

${all.map((g) => `- [${g.title}](${g.slug}/index.md): ${g.description}`).join('\n')}

## Optional

- Source code: github.com/ashwingopalsamy/markdown
`,
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const local = mode === 'md-local'
  return {
    define: { __LOCAL__: JSON.stringify(local) },
    plugins: [svelte(), policy(local), pages(local), finish(local)],
    build: {
      outDir: local ? 'dist-local' : 'dist',
      // Every browser the editor supports preloads modules natively, so the polyfill would only add weight to the first load.
      modulePreload: { polyfill: false },
    },
  }
})
