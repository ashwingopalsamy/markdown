// md Local's half of the app (docs/local.md, Client): the tab list the server owns, what each tab is doing, saving, and the edit lock between windows.
// app.svelte.ts loads this in the local build only.
import { mount } from 'svelte';
import { activate, adopt, app, current, forget, getEditor, openText, out, say, tabs } from '../app.svelte';
import { docs, lf, type Doc } from '../store';
import { api, drafts, hear, json, listen, pair, tell } from '../store/server';
import { forget as forgetPictures, plain, sweep } from './pictures';
import Local from './Local.svelte';
import './local.css';

export { sweep };

interface Item { id: string; name: string; project: string; unread: boolean; gone: boolean }
interface Full { id: string; name: string; project: string; path: string; version: string; text: string; readonly: boolean; bom: boolean; gone: boolean }
/** What this window knows about a tab beyond the Doc itself. */
interface Meta {
  project: string;
  path: string;
  unread: boolean;
  gone: boolean;
  readonly: boolean;
  /** another window holds the edit lock */
  locked: boolean;
  /** the disk version a tab with unsaved edits was told about, for the Load it toast */
  stale: string;
  /** the disk version a save or a draft ran into */
  conflict: string;
  /** a save was asked for while the server could not be reached */
  waiting: boolean;
  /** when this window last wrote the file; 0 if it has not */
  savedAt: number;
}

export const lstate = $state({ pair: false, offline: false, conflict: '' });
const metas = new Map<string, Meta>();
const meta = (id: string): Meta => {
  let m = metas.get(id);
  if (!m) metas.set(id, (m = { project: '', path: '', unread: false, gone: false, readonly: false, locked: false, stale: '', conflict: '', waiting: false, savedAt: 0 }));
  return m;
};
const poke = () => {
  app.rev++;
  getEditor()?.freeze(!!frozen(current()));
};

// ---- what the tabs say

/** A tab's name, with its project in front when two tabs share the name. */
export function label(d: Doc): string {
  void app.rev;
  const project = metas.get(d.id)?.project;
  return project && tabs.list.some((x) => x !== d && x.name === d.name) ? `${project}/${d.name}` : d.name;
}
/** What the Info card says about the file. */
export function info(d: Doc) {
  void app.rev;
  const m = meta(d.id);
  return { path: m.path || d.name, project: m.project, savedAt: m.savedAt, gone: m.gone, changed: !!(m.stale || m.conflict) };
}
export const where = (d: Doc) => (void app.rev, metas.get(d.id)?.path || d.name);
export const unread = (id: string) => (void app.rev, !!metas.get(id)?.unread);
export const count = () => {
  void app.rev;
  const n = tabs.list.filter((d) => metas.get(d.id)?.unread).length;
  return n ? `(${n}) ` : '';
};
export const frozen = (d?: Doc) => {
  void app.rev;
  const m = d && metas.get(d.id);
  return !!m && (m.readonly || m.locked);
};
/** The one line under the page for the tab being read. */
export function note(): string {
  void app.rev;
  const d = current();
  const m = d && metas.get(d.id);
  if (!d || !m) return '';
  if (m.readonly) return `${d.name} is not valid UTF-8, so md shows it but cannot change it.`;
  if (m.locked) return 'Open for editing in another window, so it is read-only here.';
  if (m.gone) return `${d.name} is gone from disk. Save puts it back.`;
  return '';
}

// ---- fetching

async function fetchDoc(id: string): Promise<Full | null> {
  try {
    const r = await api(`/api/doc/${id}`);
    return r.ok ? ((await r.json()) as Full) : null;
  } catch {
    return null;
  }
}
async function fetchList(): Promise<Item[] | null> {
  try {
    const r = await api('/api/docs');
    return r.ok ? ((await r.json()) as { list: Item[] }).list : null;
  } catch {
    return null;
  }
}
const fill = (m: Meta, f: Full) => {
  m.path = f.path;
  m.readonly = f.readonly;
  m.gone = f.gone;
};
const find = (id: string) => tabs.list.find((d) => d.id === id && d.source);
const eolOf = (raw: string) => (raw.includes('\r\n') ? ('\r\n' as const) : undefined);

// ---- the edit lock: one window at a time changes a document

const holds = new Map<string, () => void>();
const taking = new Set<string>();
const waits = new Set<string>();
const lockName = (id: string) => `md-edit-${id}`;

function take(id: string): Promise<boolean> {
  return new Promise((ok) => {
    navigator.locks.request(lockName(id), { ifAvailable: true }, (lock) => {
      if (!lock) return void ok(false);
      return new Promise<void>((free) => {
        holds.set(id, () => (holds.delete(id), free()));
        ok(true);
      });
    });
  });
}
function release(id: string) {
  if (!holds.has(id)) return;
  holds.get(id)!();
  tell({ t: 'lock', id, on: false });
}
/** Someone else is editing: this window shows the tab read-only, and takes it back when the lock frees. */
function lockedBy(id: string) {
  const m = meta(id);
  m.locked = true;
  poke();
  if (waits.has(id)) return;
  waits.add(id);
  navigator.locks.request(lockName(id), () => {}).then(() => {
    waits.delete(id);
    const was = metas.get(id);
    if (was) (was.locked = false), poke();
  });
}
async function probe(d: Doc) {
  const m = meta(d.id);
  if (m.readonly || m.locked || holds.has(d.id)) return;
  const { held } = await navigator.locks.query();
  if (held?.some((l) => l.name === lockName(d.id))) lockedBy(d.id);
}

/** The person changed the text. The first change takes the lock; changing back to what is on disk gives it up. */
export function edited(d: Doc) {
  if (d.text === d.saved) {
    release(d.id);
    drafts.del(d.id).catch(() => {});
    return;
  }
  if (holds.has(d.id) || taking.has(d.id)) return;
  taking.add(d.id);
  take(d.id).then((ok) => {
    taking.delete(d.id);
    if (ok) tell({ t: 'lock', id: d.id, on: true });
    else lockedBy(d.id);
  });
}
/** Keeps unsaved text in the browser, from the version it started at, so a restart or a closed window loses nothing. */
export async function keep(d: Doc) {
  if (d.text === d.saved) return drafts.del(d.id);
  if (meta(d.id).locked) return;
  await drafts.put({ id: d.id, baseVersion: d.source!.version, text: d.text });
}

// ---- the list of tabs

/** Adds the tab for a document the server has, with any draft the last session left. Never changes the active tab. */
async function add(i: Item) {
  const full = await fetchDoc(i.id);
  if (!full) return;
  const m = meta(i.id);
  m.project = i.project;
  m.unread = i.unread;
  fill(m, full);
  await openText(i.name, full.text, undefined, false, { kind: 'server', id: i.id, version: full.version });
  const d = find(i.id);
  const draft = await drafts.get(i.id).catch(() => undefined);
  if (!d || !draft) return;
  if (draft.text === d.text) return void drafts.del(i.id).catch(() => {});
  d.text = draft.text;
  if (!(await take(i.id))) lockedBy(i.id);
  else tell({ t: 'lock', id: i.id, on: true });
  // a draft that began from a file that has since changed is a conflict; it is never dropped and never written over the file unasked
  if (draft.baseVersion !== full.version) {
    m.conflict = full.version;
    docs.snapshot({ ...d, text: lf(full.text) }).catch(() => {});
  }
}

/** What the person has been told about a tab that changed while it had unsaved text. */
function nag(d: Doc) {
  app.stale = true;
  if (current() === d) say(`${d.name} changed on disk.`, 'Load it', () => loadIt(d));
}

async function sync(list: Item[], first = false) {
  const ids = new Set(list.map((i) => i.id));
  for (const i of list) {
    const m = meta(i.id);
    m.project = i.project;
    m.unread = i.unread;
    m.gone = i.gone;
  }
  for (const d of [...tabs.list]) if (d.source && !ids.has(d.id)) away(d);
  for (const i of list) if (!find(i.id)) await add(i);
  const at = new Map(list.map((i, n) => [i.id, n]));
  tabs.list = [...tabs.list].sort((a, b) => (at.get(a.id) ?? 0) - (at.get(b.id) ?? 0));
  // the window had no tab at all: the first file is the one to show (at start, boot() picks the tab)
  if (!first && !current() && tabs.list.length) activate(tabs.list[0].id);
  poke();
  seen();
}

/** Closed from somewhere else. Text typed here and not saved goes to the document's earlier versions first. */
function away(d: Doc) {
  if (d.text !== d.saved) {
    docs.snapshot(d).catch(() => {});
    say(`${d.name} was closed in another window. Your unsaved text is kept in its earlier versions.`);
  }
  release(d.id);
  drafts.del(d.id).catch(() => {});
  metas.delete(d.id);
  forget(d.id);
}

/** The tab's text became what the file holds. */
function land(d: Doc, f: Full) {
  const m = meta(d.id);
  fill(m, f);
  m.stale = m.conflict = '';
  if (lstate.conflict === d.id) lstate.conflict = '';
  d.source!.version = f.version;
  d.eol = eolOf(f.text);
  forgetPictures();
  adopt(d, lf(f.text));
  app.stale = false;
  // only the window holding the edit lock owns the draft
  if (holds.has(d.id)) {
    release(d.id);
    drafts.del(d.id).catch(() => {});
  }
}

/** The file is what the disk says now. */
function observe(d: Doc, f: Full) {
  const m = meta(d.id);
  fill(m, f);
  if (f.gone) return poke();
  if (f.version === d.source!.version) return poke();
  if (d.text !== d.saved && !m.locked) {
    // typing is never replaced unasked
    m.stale = f.version;
    poke();
    return nag(d);
  }
  land(d, f);
}

async function loadIt(d: Doc) {
  const f = await fetchDoc(d.id);
  if (!f) return say(`${d.name} could not be read.`);
  if (d.text !== d.saved) await docs.snapshot(d).catch(() => {});
  land(d, f);
}

export function resolve(how: 'overwrite' | 'load') {
  const d = current();
  if (!d?.source) return;
  if (how === 'load') return void loadIt(d);
  put(d, false, meta(d.id).conflict);
}

// ---- events

let build = '';
let down = false;
let again = false;
let queue: Promise<unknown> = Promise.resolve();

async function resync() {
  for (const d of [...tabs.list]) {
    const f = await fetchDoc(d.id);
    if (f && find(d.id)) observe(d, f);
  }
  for (const d of tabs.list) if (metas.get(d.id)?.waiting) save(d);
}

async function handle(name: string, data: Record<string, unknown>) {
  if (name === 'hello') {
    if (build && data.build !== build) say('md has been updated.', 'Reload', () => location.reload());
    return;
  }
  if (name === 'docs') {
    await sync(data.list as Item[]);
    if (again) (again = false), await resync();
    return;
  }
  const d = find(data.id as string);
  if (!d) return;
  if (name === 'gone') {
    meta(d.id).gone = true;
    return poke();
  }
  // change and back: what the disk holds now decides, not the version in the message
  if (data.version === d.source!.version && !meta(d.id).gone) return;
  const f = await fetchDoc(d.id);
  if (f) observe(d, f);
}

/** Opens a document the page links to, beside the others, and shows it: the person asked for it. */
export async function open(href: string) {
  const d = current();
  const rel = plain(href);
  if (!d) return;
  if (!/\.(?:md|markdown|mdx|mdown|txt)$/i.test(rel)) return void say(`${rel} is not a Markdown file.`);
  try {
    const r = await api(`/api/doc/${d.id}/link`, json({ p: rel }));
    if (!r.ok) return void say(`${rel} could not be opened.`);
    const { id } = (await r.json()) as { id: string };
    const list = await fetchList();
    if (list) await (queue = queue.then(() => sync(list)));
    if (find(id)) activate(id);
  } catch {
    say('md is not reachable.');
  }
}

/** The tour, a file of the person's own that md writes once. */
export async function tour() {
  try {
    const r = await api('/api/tour', { method: 'POST' });
    if (!r.ok) return void say('The tour could not be opened.');
    const { id } = (await r.json()) as { id: string };
    const list = await fetchList();
    if (list) await (queue = queue.then(() => sync(list)));
    if (find(id)) activate(id);
  } catch {
    say('md is not reachable.');
  }
}

/** Shows the file in Finder, selected. */
export async function reveal(d: Doc) {
  try {
    const r = await api(`/api/doc/${d.id}/reveal`, { method: 'POST' });
    if (r.status === 501) return void say('Show in Finder works on a Mac.');
    if (r.status === 404) return void say(`${d.name} and its folder are gone.`);
    if (!r.ok) say('Finder did not open.');
  } catch {
    say('md is not reachable.');
  }
}

/** Marks the tab being read as seen, in every window. */
function seen() {
  const d = current();
  const m = d && metas.get(d.id);
  if (!d || !m?.unread || document.visibilityState !== 'visible') return;
  m.unread = false;
  app.rev++;
  api(`/api/doc/${d.id}`, { ...json({ viewed: true }), method: 'PATCH' }).catch(() => {});
}

export function shown(d: Doc) {
  const m = meta(d.id);
  getEditor()?.freeze(!!frozen(d));
  probe(d).catch(() => {});
  seen();
  lstate.conflict = m.conflict ? d.id : '';
  if (m.stale && !m.conflict) nag(d);
}
export function follow(d: Doc) {
  const m = meta(d.id);
  app.stale = !!(m.stale || m.conflict);
}

// ---- saving

async function put(d: Doc, create = false, ifMatch = d.source!.version) {
  const m = meta(d.id);
  const text = d.text;
  let r: Response;
  try {
    r = await api(`/api/doc/${d.id}`, { method: 'PUT', headers: create ? { 'If-None-Match': '*' } : { 'If-Match': ifMatch }, body: out(d, text) });
  } catch {
    // the server is away: the text is safe in the draft, and the save goes through when the connection is back
    m.waiting = true;
    return void say(`${d.name} is saved here for now, and goes to the file when md reconnects.`);
  }
  const body = (await r.json().catch(() => ({}))) as { version?: string; error?: string };
  if (r.ok) {
    d.saved = text;
    d.source!.version = body.version!;
    d.updated = Date.now();
    m.stale = m.conflict = '';
    m.gone = m.waiting = false;
    m.savedAt = Date.now();
    if (lstate.conflict === d.id) lstate.conflict = '';
    app.stale = false;
    tell({ t: 'saved', id: d.id });
    if (d.text === text) {
      release(d.id);
      drafts.del(d.id).catch(() => {});
    } else drafts.put({ id: d.id, baseVersion: body.version!, text: d.text }).catch(() => {});
    return poke();
  }
  if (r.status === 412 && body.version === '') return gone(d);
  if (r.status === 412) return conflict(d);
  if (r.status === 403) {
    m.readonly = true;
    poke();
    return void say(note());
  }
  say(r.status === 413 ? `${d.name} is larger than 10 MB.` : `${d.name} could not be saved (${body.error ?? r.status}).`);
}

function gone(d: Doc) {
  meta(d.id).gone = true;
  poke();
  say(`${d.name} is gone from disk.`, 'Recreate', () => put(d, true));
}

/** The file moved on since this tab read it. What is on disk goes to earlier versions first; the person decides. */
async function conflict(d: Doc) {
  const f = await fetchDoc(d.id);
  if (!f) return void say(`${d.name} changed on disk.`);
  if (f.gone) return gone(d);
  await docs.snapshot({ ...d, text: lf(f.text) }).catch(() => {});
  meta(d.id).conflict = f.version;
  lstate.conflict = d.id;
  // the choice replaces the "changed on disk" toast that may still be up
  app.notice = null;
  app.stale = true;
  poke();
}

export function save(d: Doc) {
  const m = meta(d.id);
  if (m.readonly || m.locked) return void say(note());
  if (m.gone) return say(`${d.name} is gone from disk.`, 'Recreate', () => put(d, true));
  if (d.text === d.saved && !m.conflict) return;
  return put(d);
}

export async function close(d: Doc) {
  if (meta(d.id).locked) return void say('Open for editing in another window. Close it there.');
  if (d.text !== d.saved) await docs.snapshot(d).catch(() => {});
  try {
    const r = await api(`/api/doc/${d.id}`, { method: 'DELETE' });
    if (!r.ok && r.status !== 404) return void say('That did not work.');
  } catch {
    return void say('md is not reachable, so the tab stays open.');
  }
  release(d.id);
  drafts.del(d.id).catch(() => {});
  metas.delete(d.id);
  forget(d.id);
}

// ---- starting

/** Pairs this window and loads the tabs. False: nothing here is connected, and the pairing screen is up. */
export async function start(): Promise<boolean> {
  mount(Local, { target: document.body });
  if (!(await pair(() => (lstate.pair = true)))) {
    lstate.pair = true;
    return false;
  }
  try {
    build = ((await (await api('/api/health', { bare: true })).json()) as { build: string }).build;
  } catch {
    /* the stream's first hello will say */
  }
  const list = await fetchList();
  if (!list) {
    lstate.pair = true;
    return false;
  }
  await sync(list, true);
  hear((m) => {
    const id = m.id as string;
    if (m.t === 'saved') return void (queue = queue.then(() => fetchDoc(id).then((f) => f && find(id) && observe(find(id)!, f))).catch(() => {}));
    if (m.on && !holds.has(id)) lockedBy(id);
  });
  listen(
    (name, data) => void (queue = queue.then(() => handle(name, data)).catch(() => {})),
    (up) => {
      lstate.offline = !up;
      if (up && down) again = true;
      down = !up;
    },
  );
  return true;
}
export function ready() {
  document.addEventListener('visibilitychange', seen);
  poke();
}
