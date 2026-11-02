// md Local's link to its server (docs/local.md): the capability, every API call, drafts, and the one event stream the windows share.
// Only the local build reaches this file; hosted code never imports it.

const KV = 'kv';
const DRAFTS = 'drafts';
let cap: string | null = null;
let lost: (() => void) | undefined;

/** Text typed and not yet saved to the file, from the version it started at. */
export interface Draft { id: string; baseVersion: string; text: string }

// A database of its own, so the hosted schema (store/db.ts) is not touched.
let conn: Promise<IDBDatabase> | undefined;
const open = () =>
  (conn ??= new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open('md-local', 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore(KV);
      r.result.createObjectStore(DRAFTS, { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
async function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((res, rej) => {
    const t = db.transaction(store, mode);
    const q = fn(t.objectStore(store));
    t.oncomplete = () => res(q.result);
    t.onerror = t.onabort = () => rej(t.error);
  });
}

export const drafts = {
  get: (id: string) => run<Draft | undefined>(DRAFTS, 'readonly', (s) => s.get(id)),
  put: (d: Draft) => run(DRAFTS, 'readwrite', (s) => s.put(d)).then(() => {}),
  del: (id: string) => run(DRAFTS, 'readwrite', (s) => s.delete(id)).then(() => {}),
};

/** Every call to the server goes through here, with the capability. A 401 means it was never valid or was revoked. */
export async function api(path: string, init: RequestInit & { bare?: boolean } = {}): Promise<Response> {
  const { bare, ...rest } = init;
  const r = await fetch(path, { ...rest, headers: { ...(bare ? {} : { Authorization: `Bearer ${cap}` }), ...rest.headers }, cache: 'no-store' });
  if (r.status === 401 && !bare) {
    cap = null;
    run(KV, 'readwrite', (s) => s.delete('cap')).catch(() => {});
    lost?.();
  }
  return r;
}

export const json = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/** Takes the pair code from the address (and removes it at once, so a reload cannot replay it), then finds a capability. False: this window is not paired. */
export async function pair(onLost: () => void): Promise<boolean> {
  lost = onLost;
  const code = new URLSearchParams(location.hash.slice(1)).get('pair');
  if (code !== null) history.replaceState(null, '', location.pathname + location.search);
  if (code) {
    try {
      const r = await api('/api/pair/claim', { ...json({ code }), bare: true });
      if (r.ok) {
        cap = ((await r.json()) as { cap: string }).cap;
        await run(KV, 'readwrite', (s) => s.put(cap, 'cap'));
      }
    } catch {
      /* the stored capability, if any, still stands */
    }
  }
  cap ??= (await run<string | undefined>(KV, 'readonly', (s) => s.get('cap')).catch(() => undefined)) ?? null;
  return !!cap;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const chan = new BroadcastChannel('md-local');

export type Wire = (name: string, data: Record<string, unknown>) => void;

/** One window at a time reads the stream (a Web Lock), and tells the rest over the channel. When it closes, the next one takes over and the server sends it everything again. */
export function listen(on: Wire, up: (up: boolean) => void): void {
  chan.addEventListener('message', (e: MessageEvent) => {
    if (e.data?.t === 'ev') on(e.data.name, e.data.data);
    else if (e.data?.t === 'up') up(e.data.up);
  });
  const say = (m: object) => chan.postMessage(m);
  navigator.locks.request('md-local-leader', async () => {
    const send = (name: string, data: Record<string, unknown>) => (on(name, data), say({ t: 'ev', name, data }));
    const flag = (v: boolean) => (up(v), say({ t: 'up', up: v }));
    let wait = 250;
    for (;;) {
      const quiet = new AbortController();
      let timer = 0;
      // the server pings every 25 s; silence for far longer than that means the connection is half dead
      const watch = () => (clearTimeout(timer), (timer = window.setTimeout(() => quiet.abort(), 70_000)));
      try {
        const r = await api('/api/events', { signal: quiet.signal });
        if (!r.ok || !r.body) throw new Error('no stream');
        watch();
        flag(true);
        wait = 250;
        const rd = r.body.pipeThrough(new TextDecoderStream()).getReader();
        let buf = '';
        for (;;) {
          const { done, value } = await rd.read();
          if (done) break;
          watch();
          buf += value;
          for (let i = buf.indexOf('\n\n'); i >= 0; i = buf.indexOf('\n\n')) {
            const block = buf.slice(0, i);
            buf = buf.slice(i + 2);
            const name = /^event: (.*)$/m.exec(block)?.[1];
            const data = /^data: (.*)$/m.exec(block)?.[1];
            if (name && name !== 'ping' && data) send(name, JSON.parse(data));
          }
        }
      } catch {
        /* the server went away or a window was unpaired: wait and try again */
      }
      clearTimeout(timer);
      flag(false);
      if (!cap) return;
      await sleep(wait);
      wait = Math.min(5000, wait * 2);
    }
  });
}

/** What a window tells the others about a document: who holds its edit lock, and that it saved (the server does not echo a save as a change). */
export const tell = (m: object) => chan.postMessage(m);
export const hear = (fn: (m: Record<string, unknown>) => void) => chan.addEventListener('message', (e: MessageEvent) => (e.data?.t === 'lock' || e.data?.t === 'saved') && fn(e.data));
