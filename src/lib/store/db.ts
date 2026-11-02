import type { Doc, Snapshot } from './types';

const KEEP = 30;
const chan = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('md');

let ok = typeof indexedDB !== 'undefined';
/** Set once any window has erased everything: from then on this page writes nothing, or its next autosave would bring the database back. */
let wiped = false;
let conn: Promise<IDBDatabase> | null = null;
const memDocs = new Map<string, Doc>();
const memSnaps = new Map<string, Snapshot>();

/** False when documents live only in memory (private mode, blocked storage): they last until the tab closes. */
export const durable = (): boolean => ok;

const quota = (e: unknown): Error =>
  e instanceof DOMException && e.name === 'QuotaExceededError'
    ? new Error('This device is out of storage space for md. Free some space or delete documents from the library, then try again.', { cause: e })
    : e instanceof Error ? e : new Error(String(e));

function open(): Promise<IDBDatabase | null> {
  if (!ok || wiped) return Promise.resolve(null);
  conn ??= new Promise<IDBDatabase>((res, rej) => {
    let failed = false;
    const fail = (e: unknown) => { failed = true; rej(e); };
    let req: IDBOpenDBRequest;
    try { req = indexedDB.open('md', 1); } catch (e) { return fail(e); }
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('docs', { keyPath: 'id' });
      db.createObjectStore('snapshots', { keyPath: 'id' }).createIndex('doc', 'doc');
    };
    req.onblocked = () => fail(new Error('Another md tab is using an older version. Close it and reload.'));
    req.onerror = () => fail(req.error);
    req.onsuccess = () => {
      const db = req.result;
      if (failed) return db.close();
      db.onversionchange = () => { db.close(); conn = null; };
      db.onclose = () => { conn = null; };
      res(db);
    };
  });
  return conn.catch((e) => {
    conn = null;
    ok = false; // storage unavailable: keep the editor working from memory
    console.warn('md: IndexedDB unavailable, documents will not persist.', e);
    return null;
  });
}

const wrap = <T>(r: IDBRequest<T>) =>
  new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(quota(r.error)); });

/** Runs fn inside one transaction; resolves when it commits, so a quota failure at commit rejects too. */
async function tx<T>(mode: IDBTransactionMode, fn: (docs: IDBObjectStore, snaps: IDBObjectStore) => Promise<T>): Promise<T | undefined> {
  const db = await open();
  if (!db) return undefined;
  const t = db.transaction(['docs', 'snapshots'], mode);
  const done = new Promise<void>((res, rej) => {
    t.oncomplete = () => res();
    t.onerror = () => rej(quota(t.error));
    t.onabort = () => rej(quota(t.error ?? new DOMException('Transaction aborted', 'AbortError')));
  });
  const out = await fn(t.objectStore('docs'), t.objectStore('snapshots')).catch((e) => { try { t.abort(); } catch { /* already finished */ } throw quota(e); });
  await done;
  return out;
}

type Msg = { type: 'put' | 'remove'; id: string } | { type: 'wipe' };
const post = (m: Msg) => chan?.postMessage(m);
chan?.addEventListener('message', (e: MessageEvent<Msg>) => { if (e.data?.type === 'wipe') wiped = true; });

export function onRemote(fn: (msg: Msg) => void): () => void {
  if (!chan) return () => {};
  // One channel for send and receive: a second instance in this tab would hear our own posts.
  const h = (e: MessageEvent) => fn(e.data);
  chan.addEventListener('message', h);
  return () => chan.removeEventListener('message', h);
}

const byDoc = (id: string) => [...memSnaps.values()].filter((s) => s.doc === id);

export const docs = {
  async all(): Promise<Doc[]> {
    const r = await tx('readonly', (d) => wrap<Doc[]>(d.getAll()));
    return (r ?? [...memDocs.values()]).sort((a, b) => a.order - b.order);
  },
  async get(id: string): Promise<Doc | undefined> {
    const r = await tx('readonly', (d) => wrap<Doc | undefined>(d.get(id)));
    return ok ? r : memDocs.get(id);
  },
  async create(init: Partial<Doc> = {}): Promise<Doc> {
    const now = Date.now();
    const order = (await docs.all()).reduce((m, d) => Math.max(m, d.order), -1) + 1;
    const doc: Doc = { id: crypto.randomUUID(), name: 'Untitled.md', text: '', created: now, updated: now, saved: null, open: true, order, ...init };
    await docs.put(doc);
    return doc;
  },
  async put(doc: Doc): Promise<void> {
    if (wiped) return;
    const done = await tx('readwrite', (d) => wrap(d.put(doc)));
    if (done === undefined) memDocs.set(doc.id, doc);
    post({ type: 'put', id: doc.id });
  },
  async remove(id: string): Promise<void> {
    if (wiped) return;
    const done = await tx('readwrite', async (d, s) => {
      d.delete(id);
      const keys = await wrap<IDBValidKey[]>(s.index('doc').getAllKeys(id));
      for (const k of keys) s.delete(k);
    });
    if (done === undefined && !ok) {
      memDocs.delete(id);
      for (const s of byDoc(id)) memSnaps.delete(s.id);
    }
    post({ type: 'remove', id });
  },
  async snapshots(id: string): Promise<Snapshot[]> {
    const r = await tx('readonly', (_, s) => wrap<Snapshot[]>(s.index('doc').getAll(id)));
    return (ok ? r ?? [] : byDoc(id)).sort((a, b) => b.at - a.at);
  },
  async snapshot(doc: Doc): Promise<void> {
    if (wiped) return;
    const snap: Snapshot = { id: crypto.randomUUID(), doc: doc.id, at: Date.now(), text: doc.text };
    const r = await tx('readwrite', async (_, s) => {
      const all = (await wrap<Snapshot[]>(s.index('doc').getAll(doc.id))).sort((a, b) => b.at - a.at);
      if (all[0]?.text === doc.text) return;
      s.add(snap);
      for (const old of all.slice(KEEP - 1)) s.delete(old.id);
    });
    if (r === undefined && !ok) {
      const all = byDoc(doc.id).sort((a, b) => b.at - a.at);
      if (all[0]?.text === doc.text) return;
      memSnaps.set(snap.id, snap);
      for (const old of all.slice(KEEP - 1)) memSnaps.delete(old.id);
    }
  },
  async wipe(): Promise<void> {
    // told first, so the other windows stop saving before the database goes
    post({ type: 'wipe' });
    wiped = true;
    memDocs.clear();
    memSnaps.clear();
    if (conn) { const db = await conn.catch(() => null); db?.close(); conn = null; }
    if (typeof indexedDB !== 'undefined') {
      await new Promise<void>((res, rej) => {
        let r: IDBOpenDBRequest;
        try { r = indexedDB.deleteDatabase('md'); } catch { return res(); }
        r.onsuccess = () => res();
        r.onerror = () => rej(r.error);
        // Other tabs close on versionchange, which lets the delete proceed.
        r.onblocked = () => {};
      });
    }
    if (typeof caches !== 'undefined') for (const k of await caches.keys()) await caches.delete(k);
    if (navigator.serviceWorker) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
  },
};
