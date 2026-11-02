import { decode } from './files';
import { LIMIT } from './limit';
import { cleanName, MD_EXT } from './name';

const bad = 'This link does not carry a readable document. It may be cut short or not made by md.';

function bytes(b64url: string): Uint8Array {
  const s = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open md links.');
  const r = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const parts: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await r.read();
    if (done) break;
    n += value.length;
    if (n > LIMIT) { await r.cancel(); throw new Error(`The document in this link is larger than ${LIMIT / 1024 / 1024} MB.`); }
    parts.push(value);
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export function readInbound(): { name: string; text: Promise<string> } | null {
  const got = readLink(location.hash);
  // Cleared first: a reload must not reopen it, and the text must not stay in the address bar or history.
  if (got) history.replaceState(null, '', location.pathname + location.search);
  return got;
}

/** The document a link's fragment carries, if it carries one. No request is involved: the text is in the link. */
export function readLink(hash: string): { name: string; text: Promise<string> } | null {
  const p = new URLSearchParams(hash.slice(1));
  const data = p.get('md');
  if (data === null) return null;
  let name = cleanName(p.get('name') ?? '') || 'Untitled.md';
  if (!MD_EXT.test(name)) name = name.slice(0, 117) + '.md';
  const text = (async () => {
    let raw: Uint8Array;
    try { raw = bytes(data); } catch { throw new Error(bad); }
    let out: Uint8Array;
    try { out = await inflate(raw); } catch (e) {
      throw e instanceof Error && /larger|cannot open/.test(e.message) ? e : new Error(bad);
    }
    return decode(out, name);
  })();
  return { name, text };
}

export async function encodeInbound(text: string, name: string): Promise<string> {
  const src = new TextEncoder().encode(text);
  if (src.length > LIMIT) throw new Error(`The document is larger than ${LIMIT / 1024 / 1024} MB.`);
  const r = new Blob([src as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw')).getReader();
  const parts: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await r.read();
    if (done) break;
    parts.push(value);
  }
  let bin = '';
  for (const p of parts) for (let i = 0; i < p.length; i += 0x8000) bin += String.fromCharCode(...p.subarray(i, i + 0x8000));
  const b64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `#md=${b64}&name=${encodeURIComponent(name)}`;
}
