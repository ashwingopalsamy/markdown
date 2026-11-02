// Compares a served copy of md with the local dist/trust.json.
//   node tools/verify.mjs [url]       default https://md.ashwingopalsamy.in
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const base = (process.argv[2] ?? 'https://md.ashwingopalsamy.in').replace(/\/+$/, '');
const trust = JSON.parse(readFileSync(new URL('../dist/trust.json', import.meta.url), 'utf8'));
// _headers is read by the host and not served. 404.html is only served for a missing path, so it is fetched that way.
const SKIP = new Set(['_headers']);
const where = (p) => (p === 'index.html' ? '/' : p.endsWith('/index.html') ? `/${p.slice(0, -10)}` : `/${p}`);

async function check(file) {
  const url = file.path === '404.html' ? `${base}/__md-verify-missing__` : base + where(file.path);
  try {
    const res = await fetch(url, { redirect: 'follow', cache: 'no-store' });
    const buf = Buffer.from(await res.arrayBuffer());
    const sha = createHash('sha256').update(buf).digest('hex');
    const good = sha === file.sha256 && (file.path === '404.html' ? res.status === 404 : res.ok);
    return { path: file.path, good, note: good ? '' : res.ok || res.status === 404 ? 'hash differs' : `status ${res.status}`, headers: res.headers };
  } catch (e) {
    return { path: file.path, good: false, note: String(e.cause?.code ?? e.message) };
  }
}

const todo = [...trust.files.filter((f) => !SKIP.has(f.path)), { path: 'trust.json', sha256: null }];
// trust.json is not in its own list; fetch it and compare it with the local one
const results = [];
let next = 0;
await Promise.all(Array.from({ length: 8 }, async () => { for (let i; (i = next++) < todo.length; ) results[i] = todo[i].sha256 ? await check(todo[i]) : await checkTrust(); }));
async function checkTrust() {
  try {
    const res = await fetch(`${base}/trust.json`, { cache: 'no-store' });
    const sha = createHash('sha256').update(Buffer.from(await res.arrayBuffer())).digest('hex');
    const local = createHash('sha256').update(readFileSync(new URL('../dist/trust.json', import.meta.url))).digest('hex');
    return { path: 'trust.json', good: res.ok && sha === local, note: res.ok ? (sha === local ? '' : 'hash differs') : `status ${res.status}` };
  } catch (e) {
    return { path: 'trust.json', good: false, note: String(e.cause?.code ?? e.message) };
  }
}

const width = Math.max(...results.map((r) => r.path.length));
for (const r of results) console.log(`${r.good ? 'match   ' : 'MISMATCH'}  ${r.path.padEnd(width)}  ${r.note}`);

// The page's own header must close connections
let headerOk = false;
try {
  const csp = (await fetch(`${base}/`, { cache: 'no-store' })).headers.get('content-security-policy') ?? '';
  headerOk = csp.includes("connect-src 'none'");
  console.log(`\npage Content-Security-Policy header ${headerOk ? 'has' : 'LACKS'} connect-src 'none'`);
  if (headerOk && csp !== trust.policy.page) console.log('note: the header differs from the policy recorded in trust.json');
} catch (e) {
  console.log(`\ncould not read the page header: ${e.message}`);
}
const bad = results.filter((r) => !r.good).length;
console.log(`${results.length - bad} of ${results.length} files match ${base}`);
process.exit(bad || !headerOk ? 1 : 0);
