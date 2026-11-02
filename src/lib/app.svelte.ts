// The one place that knows what is open. Documents are plain objects (a file handle cannot live in a proxy), so `app.rev` is what tells the
// page a document's text or name changed.
import { crlf, docs, download, ensurePermission, lf, onRemote, persist, pickFile, readFile, readInbound, saveAs, saveToHandle, watch, type Doc, type Source } from './store';
import type { Editor } from './editor';
import type { Preview, Stats } from './render';
import type { Attached } from './page/host';
import { startWatch } from './trust';

export type View = 'page' | 'write' | 'split' | 'read';

export const stored = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
export const remember = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {}
};

const phone = () => matchMedia('(max-width: 860px)').matches;
const savedView = (stored('md-mode') as View) || 'page';

export const app = $state({
  ready: false,
  rev: 0,
  active: '' as string,
  view: (phone() && savedView === 'split' ? 'write' : savedView) as View,
  split: Number(stored('md-split')) || 0.5,
  stats: { words: 0, chars: 0, minutes: 0 } as Stats,
  headings: [] as { level: number; text: string; id: string; line: number }[],
  notice: null as null | { text: string; label?: string; run?: () => void; id: number },
  dragging: false,
  stale: false,
});
class Tabs {
  list = $state.raw<Doc[]>([]);
}
export const tabs = new Tabs();

// md Local's side, loaded by boot() and only in that build (docs/local.md). Hosted never imports it, so every use below is removed from its bundle.
let L: typeof import('./local/sync.svelte') | undefined;
let fade = false;

let editor: Editor | undefined;
let preview: Preview | undefined;
let previewRootEl: HTMLElement | undefined;
let saveTimer = 0;
let viewTimer = 0;
let statTimer = 0;
let lastSnap = 0;
let stopWatch: (() => void) | undefined;
let asked = false;
let driver: 'editor' | 'preview' | null = null;
let driverTimer = 0;

const SNAP_EVERY = 5 * 60_000;
// the line being read in both panes, clear of the header's glass
const READ = 64;
const edits = new Set<string>();

export const current = () => tabs.list.find((d) => d.id === app.active);
export const getEditor = () => editor;

let noticeId = 0;
let noticeTimer = 0;
export function say(text: string, label?: string, run?: () => void) {
  clearTimeout(noticeTimer);
  const id = ++noticeId;
  app.notice = { text, label, run, id };
  noticeTimer = window.setTimeout(() => app.notice?.id === id && (app.notice = null), label ? 8000 : 3500);
}
const fail = (e: unknown) => say(e instanceof Error ? e.message : 'That did not work.');

/** A document's text as the file should hold it. */
export const out = (d: Doc, text: string) => (d.eol ? crlf(text) : text);
/** Takes a stored document's line endings to LF (older copies kept the file's CRLF); true when it changed. */
function normalise(d: Doc): boolean {
  if (!d.text.includes('\r') && !d.saved?.includes('\r')) return false;
  if (d.text.includes('\r\n')) d.eol = '\r\n';
  d.text = lf(d.text);
  if (d.saved != null) d.saved = lf(d.saved);
  return true;
}

const set = (list: Doc[]) => (tabs.list = list);
const bump = () => app.rev++;

/** What a chip calls a document: its file name, or for one never named, its first heading or line. */
export function title(d: Doc): string {
  void app.rev;
  if (__LOCAL__ && d.source) return L!.label(d);
  if (d.name !== 'untitled.md' || d.handle) return d.name;
  const head = d.text.slice(0, 4000);
  const line = /^#{1,6}[ \t]+(.+)$/m.exec(head)?.[1] ?? head.split('\n').find((l) => l.trim());
  return line?.replace(/[*_`#>[\]]/g, '').trim().slice(0, 48) || 'untitled';
}
// A file somewhere is a handle on this device or, in md Local, a source on disk.
export const dirty = (d: Doc) => (void app.rev, !!(d.handle || (__LOCAL__ && d.source)) && d.text !== d.saved);
// md Local only; callers test __LOCAL__ first, so none of these reach the hosted bundle.
/** The page's title: the document, and how many others have not been looked at. */
export async function openTour() {
  if (__LOCAL__) return L!.tour();
  const { default: text } = await import('./tour.md?raw');
  return openText('tour.md', text);
}
export const pageTitle = (d: Doc) => `${L!.count()}${title(d)} · md`;
/** A tab with a change nobody has looked at. */
export const unread = (d: Doc) => L!.unread(d.id);
/** Where the tab's file lives, for its tooltip. */
export const where = (d: Doc) => (d.source ? L!.where(d) : d.name);
export const fileInfo = (d: Doc) => L!.info(d);
/** This window may not change the document shown: another window is editing it, or it is not text. */
export const frozen = () => !!L?.frozen(current());

function flush() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  for (const id of edits) {
    const d = tabs.list.find((x) => x.id === id);
    if (d) (__LOCAL__ && d.source ? L!.keep(d) : docs.put(d)).catch(fail);
  }
  edits.clear();
}

function refresh(now = false) {
  const d = current();
  if (!d) return;
  clearTimeout(viewTimer);
  // a long document waits a little longer between redraws, so typing never does the waiting
  const wait = now ? 0 : d.text.length > 200_000 ? 180 : 40;
  const draw = async () => {
    if (app.view === 'write' && !outlineWanted) return;
    if (!preview) return;
    if (__LOCAL__ && fade) (preview.update(d.text, true), (fade = false));
    else preview.update(d.text);
    app.headings = preview.headings;
    if (__LOCAL__) L!.sweep();
  };
  if (now) draw();
  else viewTimer = window.setTimeout(draw, wait);
  clearTimeout(statTimer);
  statTimer = window.setTimeout(async () => {
    const { statsOf } = await import('./render');
    if (current() === d) app.stats = statsOf(d.text);
  }, now ? 0 : 300);
}

let outlineWanted = false;
export function wantOutline(on: boolean) {
  outlineWanted = on;
  if (on) refresh(true);
}

function changed(text: string) {
  const d = current();
  if (!d || d.text === text) return;
  d.text = text;
  d.updated = Date.now();
  edits.add(d.id);
  if (__LOCAL__ && d.source) L!.edited(d);
  if (!saveTimer) saveTimer = window.setTimeout(flush, 400);
  if (Date.now() - lastSnap > SNAP_EVERY) {
    lastSnap = Date.now();
    docs.snapshot(d).catch(() => {});
  }
  if (!asked) {
    asked = true;
    persist().catch(() => {});
  }
  bump();
  refresh();
}

function follow(d: Doc) {
  stopWatch?.();
  stopWatch = undefined;
  app.stale = false;
  if (__LOCAL__ && d.source) return L!.follow(d);
  if (!d.handle) return;
  stopWatch = watch(d.handle, d.updated, (raw) => {
    const text = lf(raw);
    if (text === d.saved || text === d.text) return;
    d.eol = raw.includes('\r\n') ? '\r\n' : undefined;
    if (dirty(d)) {
      app.stale = true;
      say(`${d.name} changed on disk.`, 'Load it', () => take(d, text));
      return;
    }
    take(d, text);
  });
}

function take(d: Doc, text: string) {
  page?.close();
  d.saved = text;
  d.text = text;
  app.stale = false;
  docs.put(d).catch(fail);
  if (current() === d) {
    editor?.set(text);
    refresh(true);
  }
  bump();
}

/** md Local: the file's new text arrives. It lands as a small edit that keeps the caret and scroll, stays out of undo, and the changed blocks fade in. */
export function adopt(d: Doc, text: string) {
  page?.close();
  d.saved = text;
  d.text = text;
  d.updated = Date.now();
  edits.delete(d.id);
  if (current() === d) {
    editor?.set(text, true, false);
    fade = true;
    refresh(true);
  }
  bump();
}

// The Page view's host, while that view shows. Anything that reads or replaces the document first has it commit the open block.
let page: Attached | undefined;
let attaching: Promise<void> | undefined;
export const settlePage = () => page?.close();
function syncPage() {
  const root = previewRootEl;
  if (app.view !== 'page') {
    page?.detach();
    page = undefined;
    return;
  }
  if (page) return void page.ready();
  if (!root || attaching) return;
  attaching = import('./page/host').then(({ attach }) => {
    attaching = undefined;
    if (app.view !== 'page' || page) return;
    page = attach(root, {
      commit(text) {
        if (!current()) return;
        editor?.set(text, true);
        changed(text);
        refresh(true);
      },
      history: {
        undo: () => stepHistory(false),
        redo: () => stepHistory(true),
        can: (forward = false) => !!editor?.canStep(forward),
      },
    });
    page.ready();
  }).catch(() => {
    attaching = undefined;
    say('This part did not load.', 'Try again', () => location.reload());
  });
}
function stepHistory(forward: boolean) {
  const ok = !!editor?.step(forward);
  if (ok) refresh(true);
  return ok;
}

export function activate(id: string) {
  page?.close();
  const d = tabs.list.find((x) => x.id === id);
  if (!d) return;
  flush();
  app.active = id;
  editor?.load(id, d.text);
  document.title = __LOCAL__ ? pageTitle(d) : `${title(d)} · md`;
  follow(d);
  if (d.handle) ensurePermission(d.handle, 'read').catch(() => {});
  if (__LOCAL__ && d.source) L!.shown(d);
  refresh(true);
  bump();
  syncPage();
  // the source came back to where this document was left; the page follows it
  requestAnimationFrame(() => editor && place(editor.topLine()));
}

/** Opens text as a document. A bare blank document is used up rather than left behind. */
export async function openText(name: string, raw: string, handle?: FileSystemFileHandle, show = true, src?: Source): Promise<string> {
  const eol = raw.includes('\r\n') ? ('\r\n' as const) : undefined;
  const text = lf(raw);
  const known = (id: string) => (show && activate(id), id);
  if (__LOCAL__) {
    if (!src) return say('Open files with md <file> in a terminal.'), '';
    // the server's id is the identity: two files with the same name and text are still two files
    const at = tabs.list.find((d) => d.source?.id === src.id);
    if (at) return known(at.id);
    const now = Date.now();
    set([...tabs.list, { id: src.id, name, text, created: now, updated: now, saved: text, open: true, order: tabs.list.length, eol, source: src }]);
    if (show) activate(src.id);
    else bump();
    return src.id;
  }
  for (const d of tabs.list) if (handle && d.handle && (await d.handle.isSameEntry(handle))) return known(d.id);
  const same = tabs.list.find((d) => d.name === name && d.text === text);
  if (same) return known(same.id);
  const blank = tabs.list.find((d) => d.id === app.active && !d.text && !d.handle && d.name === 'untitled.md');
  if (blank) {
    blank.name = name;
    blank.text = text;
    blank.saved = handle ? text : null;
    blank.handle = handle;
    blank.eol = eol;
    blank.updated = Date.now();
    await docs.put(blank);
    editor?.load(blank.id, text);
    activate(blank.id);
    return blank.id;
  }
  const doc = await docs.create({ name, text, saved: handle ? text : null, handle, eol, open: true, order: Date.now() });
  set([...tabs.list, doc]);
  if (show) activate(doc.id);
  else bump();
  return doc.id;
}

export async function fresh() {
  if (__LOCAL__) return void say('Open files with md <file> in a terminal.');
  const blank = tabs.list.find((d) => !d.text && !d.handle);
  if (blank) return activate(blank.id);
  const doc = await docs.create({ name: 'untitled.md', text: '', saved: null, open: true, order: Date.now() });
  set([...tabs.list, doc]);
  activate(doc.id);
  editor?.focus();
}

export async function closeTab(id: string) {
  page?.close();
  const d = tabs.list.find((x) => x.id === id);
  if (!d) return;
  flush();
  if (__LOCAL__ && d.source) return L!.close(d);
  const at = tabs.list.indexOf(d);
  const rest = tabs.list.filter((x) => x !== d);
  d.open = false;
  editor?.drop(id);
  if (!d.text && !d.handle) await docs.remove(id);
  else {
    await docs.snapshot(d).catch(() => {});
    await docs.put(d);
  }
  set(rest);
  if (!rest.length) await fresh();
  else if (app.active === id) activate(rest[Math.min(at, rest.length - 1)].id);
}

/** Drops a tab that is gone from the store, and writes nothing back. */
export function forget(id: string) {
  const at = tabs.list.findIndex((x) => x.id === id);
  if (at < 0) return;
  edits.delete(id);
  editor?.drop(id);
  const rest = tabs.list.filter((x) => x.id !== id);
  set(rest);
  if (!rest.length) {
    if (__LOCAL__) empty();
    else fresh();
  } else if (app.active === id) activate(rest[Math.min(at, rest.length - 1)].id);
}

/** md Local: no tab is open. The page shows nothing, and the window waits for the next file. */
function empty() {
  app.active = '';
  editor?.load('', '');
  preview?.update('');
  app.headings = [];
  app.stats = { words: 0, chars: 0, minutes: 0 };
  document.title = 'md';
  bump();
}

export async function reopen(id: string) {
  const open = tabs.list.find((d) => d.id === id);
  if (open) return activate(id);
  const d = await docs.get(id);
  if (!d) return;
  normalise(d);
  d.open = true;
  await docs.put(d);
  set([...tabs.list, d]);
  activate(id);
}

export async function erase(id: string) {
  flush();
  const d = (await docs.get(id)) ?? tabs.list.find((x) => x.id === id);
  if (!d) return;
  if (tabs.list.some((x) => x.id === id)) await closeTab(id);
  await docs.remove(id);
  bump();
  say(`Deleted ${title(d)}.`, 'Undo', async () => {
    await docs.put(d);
    bump();
    reopen(d.id);
  });
}

export function rename(d: Doc, name: string) {
  if (d.handle) return say(`${d.name} is a file on disk. Rename it there; saving here would still write to the old name.`);
  const clean = name.replace(/[\\/]/g, '_').trim().slice(0, 120);
  if (!clean) return;
  d.name = /\.[a-z0-9]{1,8}$/i.test(clean) ? clean : `${clean}.md`;
  docs.put(d).catch(fail);
  document.title = `${title(current() ?? d)} · md`;
  bump();
}

export function restore(text: string) {
  page?.close();
  const d = current();
  if (!d) return;
  docs.snapshot(d).catch(() => {});
  text = lf(text);
  editor?.set(text);
  changed(text);
  say('Restored. Undo brings the newer text back.');
}

export async function openPicked() {
  if (__LOCAL__) return void say('Open files with md <file> in a terminal.');
  try {
    for (const f of await pickFile()) await openText(f.name, f.text, f.handle);
  } catch (e) {
    if ((e as Error).name !== 'AbortError') fail(e);
  }
}

const TEXTY = /\.(?:md|markdown|mdx|mdown|txt)$/i;
export async function openFiles(files: Iterable<File>, items?: DataTransferItemList) {
  if (__LOCAL__) return void say('Open files with md <file> in a terminal.');
  const handles = new Map<string, FileSystemFileHandle>();
  const pending = [...(items ?? [])].filter((i) => i.kind === 'file');
  if ('getAsFileSystemHandle' in DataTransferItem.prototype)
    await Promise.all(
      pending.map(async (i) => {
        const h = await (i as unknown as { getAsFileSystemHandle(): Promise<FileSystemHandle | null> }).getAsFileSystemHandle().catch(() => null);
        if (h?.kind === 'file') handles.set(h.name, h as FileSystemFileHandle);
      }),
    );
  let opened = 0;
  for (const f of files) {
    if (!TEXTY.test(f.name) && !f.type.startsWith('text/')) continue;
    try {
      await openText(f.name, await readFile(f), handles.get(f.name));
      opened++;
    } catch (e) {
      fail(e);
    }
  }
  if (!opened) say('Only Markdown and text files can be opened.');
}

/** The file as it is on disk now, line endings taken to LF; null when it is gone. */
async function onDisk(h: FileSystemFileHandle): Promise<string | null> {
  try {
    return lf(await readFile(await h.getFile()));
  } catch (e) {
    if (e instanceof DOMException && e.name === 'NotFoundError') return null;
    throw e;
  }
}

async function write(d: Doc, h: FileSystemFileHandle) {
  const text = d.text;
  await saveToHandle(h, out(d, text));
  d.saved = text;
  app.stale = false;
  await docs.put(d);
  bump();
}

export async function save() {
  page?.commit();
  const d = current();
  if (!d) return;
  flush();
  if (__LOCAL__ && d.source) return L!.save(d);
  const text = d.text;
  try {
    if (d.handle && (await ensurePermission(d.handle, 'readwrite'))) {
      const h = d.handle;
      const disk = await onDisk(h);
      // the file moved on since it was read or last written: the person decides, and what is here is kept in the history first
      if (disk !== null && d.saved !== null && disk !== d.saved && disk !== text) {
        app.stale = true;
        await docs.snapshot(d).catch(() => {});
        say(`${d.name} changed on disk.`, 'Overwrite', () => write(d, h).catch(fail));
        return;
      }
      await write(d, h);
      return;
    }
    const h = await saveAs(fileName(d), out(d, text));
    if (h) {
      d.handle = h;
      d.name = h.name;
      d.saved = text;
      follow(d);
    } else say(`Downloaded ${fileName(d)}.`);
    await docs.put(d);
    bump();
  } catch (e) {
    if ((e as Error).name !== 'AbortError') fail(e);
  }
}

export function fileName(d: Doc) {
  if (d.name !== 'untitled.md' || d.handle) return d.name;
  const slug = title(d).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  return `${slug || 'untitled'}.md`;
}
export const downloadText = (d: Doc) => download(fileName(d), new Blob([out(d, d.text)], { type: 'text/markdown;charset=utf-8' }));

export function setView(v: View) {
  page?.close();
  // where the reader is, taken from the pane that shows it now, before that pane is hidden
  const at = drawnOnly() ? preview?.lineAtTop(pageScroll() + READ) : editor?.topLine();
  app.view = v;
  remember('md-mode', v);
  refresh(true);
  syncPage();
  if (at != null) requestAnimationFrame(() => place(at, true));
}

/** The views that show the drawn page and not the source. */
export const drawnOnly = () => app.view === 'read' || app.view === 'page';
const pagePane = () => document.querySelector<HTMLElement>('.pane.read');
const pageScroll = () => pagePane()?.scrollTop ?? 0;

/** Puts the page, and if asked the source too, at a position in the document. */
function place(at: number, source = false) {
  hold('editor');
  const y = preview?.topOfLine(at);
  const pane = pagePane();
  if (y != null && pane) pane.scrollTop = y - READ;
  if (source) editor?.scrollToLine(at);
}
export function cycleView() {
  const order: View[] = phone() ? ['page', 'write', 'read'] : ['page', 'write', 'split', 'read'];
  setView(order[(order.indexOf(app.view) + 1) % order.length]);
}

/** Where a source line sits in the drawn page, as a scroll position. */
export const lineTop = (line: number) => preview?.topOfLine(line) ?? null;

export function goto(line: number, id: string) {
  if (!drawnOnly()) {
    editor?.toLine(line);
    editor?.focus();
  }
  if (app.view !== 'write') {
    const y = preview?.topOfLine(line);
    const pane = document.querySelector('.pane.read');
    if (y != null && pane) pane.scrollTo({ top: y - 72, behavior: 'smooth' });
    else document.getElementById(id)?.scrollIntoView();
  }
}

function hold(who: 'editor' | 'preview') {
  driver = who;
  clearTimeout(driverTimer);
  driverTimer = window.setTimeout(() => (driver = null), 180);
}

/** Starts the page: documents first, then the editor and the renderer as they arrive. */
export async function boot(editorHost: () => HTMLElement | undefined, previewRoot: () => HTMLElement | undefined) {
  startWatch();
  const inbound = readInbound();
  let open: Doc[];
  if (__LOCAL__) {
    // the server owns the list of tabs; a window with no capability shows the pairing screen and nothing else
    L = await import('./local/sync.svelte');
    if (!(await L.start())) return;
    open = tabs.list;
  } else {
    const all = await docs.all().catch(() => [] as Doc[]);
    open = all.filter((d) => d.open).sort((a, b) => a.order - b.order);
    for (const d of open) if (normalise(d)) docs.put(d).catch(() => {});
    if (!open.length) open.push(await docs.create({ name: 'untitled.md', text: '', saved: null, open: true, order: Date.now() }));
    set(open);
  }
  const last = stored('md-active');
  app.active = __LOCAL__ && !open.length ? '' : (open.find((d) => d.id === last)?.id ?? open[open.length - 1].id);
  app.ready = true;

  let parts: [typeof import('./editor'), typeof import('./render')];
  try {
    parts = await Promise.all([import('./editor'), import('./render')]);
  } catch {
    return say('This part did not load.', 'Try again', () => location.reload());
  }
  const [{ Editor }, { Preview }] = parts;
  const host = editorHost();
  const root = previewRoot();
  if (!host || !root) return;
  preview = new Preview(root);
  previewRootEl = root;
  editor = new Editor(host, {
    onChange: changed,
    onScroll(line) {
      if (driver === 'preview' || app.view !== 'split') return;
      place(line);
    },
    onImage: async () => '',
  });
  applyEditorPrefs();
  root.parentElement!.addEventListener('scroll', () => {
    if (driver === 'editor' || app.view !== 'split') return;
    hold('preview');
    editor?.scrollToLine(preview!.lineAtTop(root.parentElement!.scrollTop + READ));
  }, { passive: true });
  // code colours, math and diagrams arrive late and change the page's height: the page finds its place again, unless it is the one being scrolled
  let settling = 0;
  new ResizeObserver(() => {
    cancelAnimationFrame(settling);
    settling = requestAnimationFrame(() => {
      if (app.view === 'split' && driver !== 'preview' && editor) place(editor.topLine());
    });
  }).observe(root);
  root.addEventListener('md-figure', (e) => void import('./figure/figure.svelte').then((m) => m.attach(e.target as HTMLElement)));
  if (__LOCAL__) root.addEventListener('md-link', (e) => L!.open((e as CustomEvent<{ href: string }>).detail.href));
  root.addEventListener('md-task', (e) => {
    const line = (e as CustomEvent<{ line: number }>).detail.line;
    const d = current();
    if (!d || (__LOCAL__ && frozen())) return;
    const lines = d.text.split('\n');
    // only a line that holds a box can toggle
    if (!Number.isInteger(line) || lines[line] === undefined || !/\[( |x|X)\]/.test(lines[line])) return;
    lines[line] = lines[line].replace(/\[( |x|X)\]/, (_, c) => (c === ' ' ? '[x]' : '[ ]'));
    const text = lines.join('\n');
    editor?.set(text);
    changed(text);
  });
  activate(app.active);
  if (!current()?.text && !drawnOnly() && !__LOCAL__) editor.focus();
  if (__LOCAL__) L!.ready();

  if (inbound) {
    inbound.text.then((t) => openText(inbound.name, t)).catch(fail);
  }
  // the agent tool arrives after the page, so the first screen does not carry it
  if (!__LOCAL__) import('./store/agent').then(({ registerAgentTools }) => {
    registerAgentTools((name, text) => {
      // beside what is open, so the page under the person's hands stays put; a blank page is the one that is used
      openText(name, text, undefined, false)
        .then((id) => say(`An agent opened ${name}.`, app.active === id ? undefined : 'Show', () => activate(id)))
        .catch(fail);
    });
  });
  onRemote(async (msg) => {
    if (msg.type === 'wipe') {
      // everything was erased in another window: nothing here may be written back
      clearTimeout(saveTimer);
      saveTimer = 0;
      edits.clear();
      for (const d of tabs.list) editor?.drop(d.id);
      set([]);
      return location.reload();
    }
    const { type, id } = msg;
    const d = tabs.list.find((x) => x.id === id);
    if (!d) return bump();
    if (type === 'remove') return forget(id);
    const fresh = await docs.get(id);
    if (!fresh || fresh.text === d.text) return;
    normalise(fresh);
    const load = () => {
      page?.close();
      edits.delete(id);
      d.text = fresh.text;
      d.name = fresh.name;
      d.saved = fresh.saved;
      d.eol = fresh.eol;
      if (id === app.active) {
        editor?.set(d.text);
        refresh(true);
      }
      bump();
    };
    // typing here that has not been saved yet, an open block's included, is not overwritten without being asked
    if (id === app.active) page?.commit();
    if (edits.has(id)) return say(`${d.name} changed in another window.`, 'Load it', load);
    load();
  });
  addEventListener('pagehide', () => (page?.close(), flush()));
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
}

export function applyEditorPrefs() {
  editor?.setSpellcheck(stored('md-spell') === '1');
}
export const pref = stored;
export const rememberActive = () => remember('md-active', app.active);
