// Static audit of dist/ (or dist-local/ with `node tools/audit.mjs local`), run on every build. Hard failures stop the build; network-capable APIs in JS must be on tools/audit-allow.json
// with a reason. Writes dist/trust.json (no build time, so the same source gives the same bytes).
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { engineFiles } from './engine.mjs';
import { ANALYTICS, ENGINE_RULE, GUIDE_META, HEADERS, LOCAL_META_POLICY, LOCAL_PAGE_POLICY, META_POLICY, NOT_FOUND_META, ORIGIN, PAGE_POLICY, GUIDE_POLICY, SW_POLICY } from './policy.mjs';

const root = new URL('..', import.meta.url).pathname;
const local = process.argv[2] === 'local';
if (process.argv[2] && !local) throw new Error(`unknown edition: ${process.argv[2]}`);
const out = local ? 'dist-local' : 'dist';
const dist = join(root, out);
if (!existsSync(join(dist, 'index.html'))) throw new Error(`${out}/index.html is missing; run vite build first`);

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const files = walk(dist).map((f) => f.slice(dist.length + 1).split('\\').join('/')).filter((f) => f !== 'trust.json').sort();
const read = (f) => readFileSync(join(dist, f), 'utf8');
const failures = [];
const fail = (file, what) => failures.push({ file, what });

// 1. Hard failures
const WEB = /^(?:https?:)?\/\//i;
for (const f of files) {
  if (f.endsWith('.wasm')) fail(f, 'WebAssembly file');
  if (!f.endsWith('.html')) continue;
  const html = read(f);
  for (const m of html.matchAll(/\b(src|href)\s*=\s*["']?([^"'\s>]+)/gi)) if (WEB.test(m[2])) fail(f, `outside address in ${m[1]}: ${m[2]}`);
  for (const m of html.matchAll(/<script\b([^>]*)>/gi)) {
    const src = /\bsrc\s*=\s*["']?([^"'\s>]+)/i.exec(m[1]);
    if (!src) fail(f, 'inline script');
    else if (WEB.test(src[1]) || /^[a-z][\w+.-]*:/i.test(src[1])) fail(f, `script src is not same-origin: ${src[1]}`);
  }
  if (/\son[a-z]+\s*=\s*["']/i.test(html.replace(/<(?:script|style)[\s\S]*?<\/(?:script|style)>/gi, ''))) fail(f, 'inline event handler');
  // An engine frame has its policy from its response header, checked below; a meta tag could only loosen it.
  if (f.startsWith('engine/')) continue;
  const meta = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/i.exec(html)?.[1];
  // Only the local app page may connect, and only to its own server (docs/local.md); every other page is closed.
  const open = local && f === 'index.html';
  if (!meta || !meta.includes(open ? "connect-src 'self'" : "connect-src 'none'")) fail(f, `page meta has no connect-src '${open ? 'self' : 'none'}'`);
  else {
    const want = f === 'index.html' ? (local ? LOCAL_META_POLICY : META_POLICY) : f === '404.html' ? NOT_FOUND_META : GUIDE_META;
    if (meta !== want) fail(f, 'page meta differs from tools/policy.mjs');
  }
}
// Both editions send /engine/* with the engine policy, from tools/policy.mjs.
if (!existsSync(join(dist, '_headers')) || !read('_headers').includes(ENGINE_RULE)) fail('_headers', 'no /engine/* rule with the engine policy from tools/policy.mjs');
// /engine/ holds exactly the engine files md ships (tools/engine.mjs): frames, @plantuml/core at the locked version, vendored files by SHA-256, stencil modules made from them.
const want = engineFiles(root);
for (const f of files.filter((f) => f.startsWith('engine/'))) {
  const b = want.get(f.slice(7));
  if (!b) fail(f, 'not an engine file md ships');
  else if (!b.equals(readFileSync(join(dist, f)))) fail(f, 'differs from its source');
}
for (const k of want.keys()) if (!files.includes(`engine/${k}`)) fail(`engine/${k}`, 'engine file missing');
const TEXT = /\.(?:html|js|mjs|css|json|svg|webmanifest|txt|xml|md)$/;
for (const f of files) {
  if (!TEXT.test(f) && f !== '_headers') continue;
  const text = read(f);
  if (!local && text.includes('/api/')) fail(f, 'mentions /api/ (local-only code in the hosted build)');
  for (const host of ANALYTICS) if (text.includes(host)) fail(f, `analytics host: ${host}`);
  if (/\.(?:js|mjs)$/.test(f) && /document\s*\.\s*cookie\s*=(?!=)/.test(text)) fail(f, 'writes document.cookie');
  if (f.endsWith('.css') && /(?:url\(\s*["']?|@import\s+["']?)(?:https?:)?\/\//i.test(text)) fail(f, 'stylesheet loads an outside address');
}

// 2. Network-capable APIs in JS, per file. Matched on the chunk name without its hash.
const APIS = {
  'fetch(': /\bfetch\s*\(/g,
  XMLHttpRequest: /\bXMLHttpRequest\b/g,
  WebSocket: /\bWebSocket\b/g,
  EventSource: /\bEventSource\b/g,
  sendBeacon: /\bsendBeacon\b/g,
  importScripts: /\bimportScripts\b/g,
  'eval(': /\beval\s*\(/g,
  'new Function': /\bnew\s+Function\b/g,
  'Function(': /(?<!new\s)(?<![\w$.])Function\s*\(/g,
  'navigator.connection': /\bnavigator\s*\.\s*connection\b/g,
  WebAssembly: /\bWebAssembly\b/g,
};
// An entry with "edition" applies to that build only. The hosted worker (sw.js) does not exist in local, and local code that talks to the page's own server must never be allowed in hosted.
const allow = JSON.parse(readFileSync(join(root, 'tools/audit-allow.json'), 'utf8')).allow.filter((a) => !a.edition || a.edition === (local ? 'local' : 'hosted'));
const apiMatches = [];
const outside = [];
for (const f of files.filter((n) => /\.m?js$/.test(n))) {
  const text = read(f);
  for (const [api, re] of Object.entries(APIS)) {
    const count = text.match(re)?.length ?? 0;
    if (!count) continue;
    const rule = allow.find((a) => a.api === api && basename(f).startsWith(a.file));
    apiMatches.push({ file: f, api, count, allowed: Boolean(rule), reason: rule?.reason ?? null });
    if (!rule) fail(f, `${api} x${count} is not on tools/audit-allow.json`);
    else if (rule.max !== undefined && count > rule.max) fail(f, `${api} x${count} is more than the ${rule.max} that were reviewed`);
  }
  const hosts = [...new Set([...text.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1].toLowerCase()))].sort();
  if (hosts.length) outside.push({ file: f, hosts });
}
const unused = allow.filter((a) => !apiMatches.some((m) => m.allowed && m.api === a.api && basename(m.file).startsWith(a.file)));

// 3. Production dependencies, from the lockfile and node_modules.
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')).packages;
const seen = new Map();
const resolve = (from, name) => {
  for (let dir = from; ; ) {
    const key = `${dir ? `${dir}/` : ''}node_modules/${name}`;
    if (lock[key]) return key;
    if (!dir) return null;
    const i = dir.lastIndexOf('/node_modules/');
    dir = i < 0 ? '' : dir.slice(0, i);
  }
};
const visit = (key) => {
  if (seen.has(key)) return;
  const meta = lock[key];
  const disk = join(root, key, 'package.json');
  const license = meta.license ?? (existsSync(disk) ? JSON.parse(readFileSync(disk, 'utf8')).license : undefined) ?? 'unknown';
  seen.set(key, { name: key.slice(key.lastIndexOf('node_modules/') + 13), version: meta.version, license: typeof license === 'string' ? license : (license.type ?? 'unknown') });
  for (const dep of Object.keys({ ...meta.dependencies, ...meta.optionalDependencies })) {
    const k = resolve(key, dep);
    if (k) visit(k);
  }
};
for (const dep of Object.keys(pkg.dependencies ?? {})) visit(resolve('', dep));
const dependencies = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));

// 4. trust.json
const sha = (f) => createHash('sha256').update(readFileSync(join(dist, f))).digest('hex');
const trust = {
  name: pkg.name,
  version: pkg.version,
  origin: ORIGIN,
  policy: { page: local ? LOCAL_PAGE_POLICY : PAGE_POLICY, meta: local ? LOCAL_META_POLICY : META_POLICY, guide: GUIDE_POLICY, serviceWorker: SW_POLICY, headers: HEADERS },
  files: files.map((f) => ({ path: f, bytes: statSync(join(dist, f)).size, sha256: sha(f) })),
  dependencies,
  audit: { failures, apiMatches, outsideAddressesInCode: outside },
};
writeFileSync(join(dist, 'trust.json'), `${JSON.stringify(trust, null, 2)}\n`);

// 5. Report
const bytes = files.reduce((n, f) => n + statSync(join(dist, f)).size, 0);
console.log(`audit${local ? ' (local)' : ''}: ${files.length} files, ${(bytes / 1e6).toFixed(2)} MB, ${dependencies.length} dependencies, trust.json written`);
const byApi = {};
for (const m of apiMatches) (byApi[m.file] ??= []).push(`${m.api} x${m.count}${m.allowed ? '' : ' (not allowed)'}`);
for (const [f, list] of Object.entries(byApi)) console.log(`  ${f}: ${list.join(', ')}`);
if (!apiMatches.length) console.log('  no network-capable APIs found in JS');
console.log(`  outside addresses in code, reported only: ${outside.reduce((n, o) => n + o.hosts.length, 0)} hosts in ${outside.length} files`);
for (const a of unused) console.log(`  note: allowlist entry never matched: ${a.file} ${a.api}`);
if (failures.length) {
  console.error(`\naudit failed, ${failures.length} problem${failures.length === 1 ? '' : 's'}:`);
  for (const x of failures) console.error(`  ${x.file}: ${x.what}`);
  process.exit(1);
}
console.log('audit passed');
