// A local server for dist/, with no dependencies. Binds 127.0.0.1 only, answers GET and HEAD, refuses any Host that is not loopback
// (DNS rebinding), applies the rules in dist/_headers except HSTS, and logs nothing but its start line.
//   node tools/serve.mjs [--port 4873] [--open]
import { spawn } from 'node:child_process';
import { createReadStream, readFileSync, realpathSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, sep } from 'node:path';

const arg = (name) => process.argv.indexOf(name);
const port = arg('--port') > 0 ? Number(process.argv[arg('--port') + 1]) : 4873;
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('--port needs a number from 1 to 65535');
const root = realpathSync(new URL('../dist/', import.meta.url));

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8', '.webp': 'image/webp', '.map': 'application/json; charset=utf-8',
};

// _headers: a path line, then indented "Name: value" lines. A trailing * matches a prefix. Rules that match all apply.
const rules = [];
for (const line of readFileSync(join(root, '_headers'), 'utf8').split('\n')) {
  if (!line.trim()) continue;
  if (!/^\s/.test(line)) rules.push({ path: line.trim(), headers: [] });
  else if (line.trim().startsWith('!')) rules.at(-1).headers.push([line.trim().slice(1).trim(), null]);
  else {
    const i = line.indexOf(':');
    const name = line.slice(0, i).trim();
    if (name.toLowerCase() !== 'strict-transport-security') rules.at(-1).headers.push([name, line.slice(i + 1).trim()]);
  }
}
// a line "! Name" drops that header, whatever an earlier rule set (as Cloudflare does)
const headersFor = (path) => {
  const out = new Map();
  for (const r of rules) if (r.path.endsWith('*') ? path.startsWith(r.path.slice(0, -1)) : r.path === path) for (const [k, v] of r.headers) v === null ? out.delete(k.toLowerCase()) : out.set(k.toLowerCase(), [k, v]);
  return [...out.values()];
};

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
const stat = (p) => { try { return statSync(p); } catch { return null; } };

// Maps a request path to a file under dist/, or null. Never leaves the root, even through a symlink.
function locate(path) {
  let rel;
  try { rel = decodeURIComponent(path); } catch { return null; }
  if (rel.includes('\0') || rel.includes('\\')) return null;
  let file = join(root, rel);
  if (!file.startsWith(root + sep) && file !== root) return null;
  let s = stat(file);
  const dir = !!s?.isDirectory();
  if (dir) { file = join(file, 'index.html'); s = stat(file); }
  if (!s?.isFile() || file === join(root, '_headers')) return null;
  try { file = realpathSync(file); } catch { return null; }
  return file.startsWith(root + sep) ? { file, stat: s, dir } : null;
}

const server = createServer((req, res) => {
  const send = (status, headers, body) => { res.writeHead(status, headers); res.end(req.method === 'HEAD' ? undefined : body); };
  const host = (req.headers.host ?? '').replace(/:\d+$/, '').toLowerCase();
  if (!LOOPBACK.has(host)) return send(403, { 'Content-Type': 'text/plain' }, 'Forbidden\n');
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain' }, 'Method not allowed\n');

  const path = (req.url ?? '/').split('?')[0].split('#')[0];
  const found = locate(path);
  // a folder without its slash goes to the slash, so relative links in its page work
  if (!path.endsWith('/') && (found ? found.dir : locate(`${path}/`))) return send(308, { Location: `${path}/` }, '');
  const hit = found ?? locate('/404.html');
  const headers = Object.fromEntries(headersFor(path));
  if (!hit) return send(404, { ...headers, 'Content-Type': 'text/plain' }, 'Not found\n');

  headers['Content-Type'] = TYPES[extname(hit.file)] ?? 'application/octet-stream';
  headers['Content-Length'] = hit.stat.size;
  headers['Cache-Control'] ??= 'no-cache';
  if (found) {
    headers.ETag = `W/"${hit.stat.size.toString(16)}-${Math.floor(hit.stat.mtimeMs).toString(16)}"`;
    if (req.headers['if-none-match'] === headers.ETag) { delete headers['Content-Length']; return send(304, headers, ''); }
  }
  res.writeHead(found ? 200 : 404, headers);
  if (req.method === 'HEAD') return res.end();
  createReadStream(hit.file).on('error', () => res.destroy()).pipe(res);
});

server.on('error', (e) => {
  console.error(e.code === 'EADDRINUSE' ? `md: port ${port} is in use; pick another with --port` : `md: ${e.message}`);
  process.exit(1);
});
server.listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${port}/`;
  console.log(`md: serving dist/ at ${url} (127.0.0.1 only, ctrl-c to stop)`);
  if (arg('--open') > 0) {
    const [cmd, ...args] = process.platform === 'darwin' ? ['open', url] : process.platform === 'win32' ? ['rundll32', 'url.dll,FileProtocolHandler', url] : ['xdg-open', url];
    spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => console.error(`md: could not open a browser; open ${url}`)).unref();
  }
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { server.close(() => process.exit(0)); server.closeAllConnections(); });
