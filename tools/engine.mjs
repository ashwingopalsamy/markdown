// The one list of what /engine/ may hold, in both editions: the frames in public/engine/, @plantuml/core's two files at the locked version, every vendored file by SHA-256 (vendor/SHA256SUMS), and the draw.io stencil sets as modules made from those XML files (the page loads them with import(), so connect-src stays closed).
// The build writes these (vite.config.ts), and the audit checks dist/engine/ against the same list.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** A Map of path under engine/ to its bytes. */
export function engineFiles(root) {
  const out = new Map();
  const frames = join(root, 'public/engine');
  for (const name of readdirSync(frames)) out.set(name, readFileSync(join(frames, name)));
  const core = join(root, 'node_modules/@plantuml/core');
  const have = JSON.parse(readFileSync(join(core, 'package.json'), 'utf8')).version;
  const want = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')).packages['node_modules/@plantuml/core']?.version;
  if (have !== want) throw new Error(`@plantuml/core ${have} is installed but package-lock.json has ${want}`);
  for (const f of ['plantuml.js', 'viz-global.js']) out.set(f, readFileSync(join(core, f)));
  for (const line of readFileSync(join(root, 'vendor/SHA256SUMS'), 'utf8').split('\n')) {
    const m = /^([0-9a-f]{64}) {2}(\S+)$/.exec(line);
    if (!m) continue;
    const bytes = readFileSync(join(root, 'vendor', m[2]));
    if (createHash('sha256').update(bytes).digest('hex') !== m[1]) throw new Error(`vendor/${m[2]} does not match vendor/SHA256SUMS`);
    const sheet = /^drawio\/stencils\/([\w-]+)\.xml$/.exec(m[2]);
    if (sheet) out.set(`stencils/${sheet[1]}.js`, Buffer.from(`export default ${JSON.stringify(bytes.toString('utf8'))};\n`));
    else if (m[2].startsWith('plantuml/')) out.set(m[2].slice(9), bytes);
    else if (m[2].startsWith('drawio/')) out.set(m[2].slice(7), bytes);
  }
  return out;
}
