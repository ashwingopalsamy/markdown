// Finishes a build for hosting. Run after `vite build`: writes dist/_headers, 404.html, robots.txt, sitemap.xml and security.txt.
// Every policy string comes from tools/policy.mjs. There are no redirects: the host serves static files and nothing else.
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { ADVISORY, ENGINE_RULE, GUIDE_POLICY, HEADERS, LOCAL_PAGE_POLICY, NOT_FOUND_META, NOT_FOUND_POLICY, ORIGIN, PAGE_POLICY, SECURITY_EXPIRES, SW_POLICY } from './policy.mjs';

// `node tools/site.mjs [local]`. The local edition (docs/local.md) is served by the Go binary, not Cloudflare: no worker, its own page policy.
const local = process.argv[2] === 'local';
if (process.argv[2] && !local) throw new Error(`unknown edition: ${process.argv[2]}`);
const dist = new URL(local ? '../dist-local/' : '../dist/', import.meta.url);
const pagePolicy = local ? LOCAL_PAGE_POLICY : PAGE_POLICY;
const pages = readdirSync(dist, { recursive: true })
  .map((f) => String(f).split('\\').join('/'))
  .filter((f) => f.endsWith('.html') && f !== '404.html' && !f.startsWith('engine/'))
  .sort();
if (!pages.includes('index.html')) throw new Error(`${local ? 'dist-local' : 'dist'}/index.html is missing; run vite build first`);
const paths = pages.map((f) => `/${f.replace(/index\.html$/, '')}`);
const guides = paths.filter((p) => p !== '/');

writeFileSync(
  new URL('404.html', dist),
  `<!doctype html>
<html lang="en">
<head>
<meta http-equiv="Content-Security-Policy" content="${NOT_FOUND_META}">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="robots" content="noindex">
<title>404, page not found | md</title>
<link rel="icon" href="/favicon.svg">
<style>
@font-face{font-family:Inter;font-weight:100 900;font-display:swap;src:url(/fonts/inter.woff2) format("woff2")}
:root{--page:#f5f5f7;--paper:#fff;--fg:#1d1d1f;--fg-2:#48484a;--fg-3:#636368;--line:rgba(0,0,0,.09);--warn:#b45309;--sans:Inter,-apple-system,system-ui,sans-serif;--mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace}
@media(prefers-color-scheme:dark){:root{--page:#0a0a0c;--paper:#1a1a21;--fg:#f5f5f7;--fg-2:#cfcfd4;--fg-3:#9a9aa1;--line:rgba(255,255,255,.1);--warn:#f5b35a}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:32px 20px;background:var(--page);color:var(--fg);font:16px/1.55 var(--sans);-webkit-font-smoothing:antialiased}
main{width:min(100%,460px);text-align:center}
.who{width:84px;height:101px;margin:0 auto 22px;display:block;filter:drop-shadow(0 14px 18px rgba(20,24,40,.18));animation:bob 4s ease-in-out infinite}
.down{animation:down 2.4s ease-in-out infinite}
h1{margin:0;font-size:clamp(34px,8vw,46px);line-height:1.05;letter-spacing:-.035em;font-weight:700}
h1 span{color:var(--fg-3)}
.lede{margin:14px auto 0;max-width:36ch;color:var(--fg-2)}
.src{margin:26px 0 0;text-align:left;background:var(--paper);border:1px solid var(--line);border-radius:14px;box-shadow:0 1px 2px rgba(20,24,40,.06),0 12px 24px -16px rgba(20,24,40,.18);overflow:hidden;font:13px/1.65 var(--mono)}
.src div{padding:3px 14px}
.src div:first-child{padding-top:10px}
.src div:last-child{padding-bottom:10px}
.src b{color:var(--fg-3);font-weight:500;margin-right:8px;user-select:none}
.src .w{color:var(--warn)}
.src i{font-style:normal;color:var(--fg-3)}
.go{display:inline-flex;align-items:center;gap:8px;margin-top:26px;height:42px;padding:0 20px;border-radius:999px;background:var(--fg);color:var(--page);font-weight:600;font-size:15px;text-decoration:none;transition:transform .2s cubic-bezier(.3,1.25,.5,1)}
.go:hover{transform:translateY(-1px)}
.go:focus-visible{outline:2px solid var(--fg);outline-offset:3px}
.fine{margin:22px 0 0;font-size:13px;color:var(--fg-3)}
@keyframes bob{50%{transform:translateY(-5px) rotate(-1.5deg)}}
@keyframes down{0%,100%{transform:translateY(-1px)}50%{transform:translateY(2.5px)}}
@media(prefers-reduced-motion:reduce){.who,.down{animation:none}}
</style>
</head>
<body>
<main>
<svg class="who" viewBox="0 0 40 48" role="img" aria-label="The md mark, pointing down at where the page should be">
<rect width="40" height="48" rx="10" fill="#1d1d1f"/>
<circle cx="12" cy="11" r="3.6" fill="#4cc38a"/>
<g fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7.5 35V23l7 8 7-8v12"/><g class="down"><path d="M30 23v12M25.5 30.5 30 35l4.5-4.5"/></g></g>
</svg>
<h1>404.<br><span>Page not found.</span></h1>
<p class="lede">You asked for a page that does not exist. Markdown has syntax for most things, but not for this one.</p>
<div class="src" aria-hidden="true">
<div><b>1</b># 404</div>
<div><b>2</b></div>
<div class="w"><b>3</b>&gt; [!WARNING]</div>
<div class="w"><b>4</b>&gt; The page you typed is not in this document.<br><i>&nbsp;&nbsp;&nbsp;(It was not.)</i></div>
</div>
<a class="go" href="/">Take me to the editor</a>
<p class="fine">Check the address for typos, or blame whoever sent you the link. We will not tell.</p>
</main>
</body>
</html>
`,
);

// Rules that match one path add up, and a header set twice is joined with a comma, so each header lives in one rule.
const block = (path, headers) => `${path}\n${Object.entries(headers).map(([k, v]) => `  ${k}: ${v}`).join('\n')}\n`;
const md = { Link: '<index.md>; rel="alternate"; type="text/markdown"' };
const rules = [
  block('/*', HEADERS),
  block('/', { 'Content-Security-Policy': pagePolicy }),
  block('/index.html', { 'Content-Security-Policy': pagePolicy }),
  ...guides.flatMap((p) => [block(p, { 'Content-Security-Policy': GUIDE_POLICY, ...md }), block(`${p}index.html`, { 'Content-Security-Policy': GUIDE_POLICY, ...md })]),
  block('/404.html', { 'Content-Security-Policy': NOT_FOUND_POLICY }),
  ...(local ? [] : [block('/sw.js', { 'Content-Security-Policy': SW_POLICY, 'Cache-Control': 'no-cache' })]),
  block('/assets/*', { 'Cache-Control': 'public, max-age=31536000, immutable' }),
  block('/fonts/*', { 'Cache-Control': 'public, max-age=604800' }),
  // "! Name" drops a header an earlier rule set, here and in the binary. Sandboxed frames have an opaque origin, so their scripts load with CORS.
  ENGINE_RULE,
];
writeFileSync(new URL('_headers', dist), rules.join('\n'));

mkdirSync(new URL('.well-known/', dist), { recursive: true });
writeFileSync(
  new URL('.well-known/security.txt', dist),
  `Contact: ${ADVISORY}\nPolicy: https://github.com/ashwingopalsamy/markdown/blob/main/SECURITY.md\nExpires: ${SECURITY_EXPIRES}\nCanonical: ${ORIGIN}/.well-known/security.txt\n`,
);
writeFileSync(
  new URL('robots.txt', dist),
  `${local ? "# md Local runs on one machine: documents are the files on its disk, read and saved by md there; these pages are its documentation." : "# Documents are edited in the visitor's browser and never reach this site; these pages are public documentation."}
User-agent: *
Allow: /
Content-Signal: search=yes, ai-input=yes, ai-train=yes

Sitemap: ${ORIGIN}/sitemap.xml
`,
);
writeFileSync(
  new URL('sitemap.xml', dist),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((p) => `  <url><loc>${ORIGIN}${p}</loc></url>`).join('\n')}
</urlset>
`,
);
console.log(local ? `dist-local ready for the binary (${paths.length} pages)` : `dist ready for Cloudflare (${paths.length} pages, headers from tools/policy.mjs)`);
