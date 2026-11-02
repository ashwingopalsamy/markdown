import { mount, unmount } from 'svelte';
import { current, frozen, say } from '../app.svelte';
import BlockEditor from './BlockEditor.svelte';
import Toolbar, { type Type } from './Toolbar.svelte';
import { blocksOf, type Block } from './blocks';
import type { Ask, Caret, Follow } from './types';
import './edit.css';

// The Page view: the drawn page with one block at a time open as text. The Markdown stays the document; a commit changes only the open block's span.
export interface Host {
  /** Puts new text in the document and draws it before returning. */
  commit(text: string): void;
  history: { undo(): boolean; redo(): boolean; can(forward?: boolean): boolean };
}

type Open = { kind: 'block' | 'ghost' | 'whole'; b: number; mode: 'rich' | 'source'; at: Caret | null; top?: number; as?: Type };
const FRONT = /^---[ \t]*\n[\s\S]*?\n---[ \t]*(?:\n|$)/;

// Raw HTML has no rich form and opens as its text. An element that spans blocks (`<details>`, its contents, `</details>`) is drawn as one, so it opens as one.
const tagDepth = (raw: string) => (raw.match(/<[a-zA-Z][^>]*[^/]>|<[a-zA-Z]>/g)?.length ?? 0) - (raw.match(/<\/[a-zA-Z]/g)?.length ?? 0);
function merged(list: Block[]): Block[] {
  const out: Block[] = [];
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    let d = b.token.type === 'html' ? tagDepth(b.token.raw) : 0;
    let end = i;
    for (let j = i + 1; d > 0 && j < list.length; j++) {
      if (list[j].token.type === 'html') d += tagDepth(list[j].token.raw);
      if (d <= 0) end = j;
    }
    out.push(end > i ? { ...b, end: list[end].end, kind: 'source' } : b);
    i = end;
  }
  return out;
}

function map(source: string): Block[] | null {
  const off = FRONT.exec(source)?.[0].length ?? 0;
  const rest = blocksOf(source.slice(off));
  if (!rest) return null;
  const moved = merged(rest).map((b) => ({ ...b, start: b.start + off, end: b.end + off }));
  // front matter has no rich form: it opens as its own text
  const front: Block[] = off ? [{ start: 0, end: source.slice(0, off).trimEnd().length, kind: 'source', token: { type: 'paragraph', raw: source.slice(0, off), text: '', tokens: [] } }] : [];
  return [...front, ...moved];
}

export function attach(root: HTMLElement, host: Host) {
  let open: Open | null = null;
  let live: (ReturnType<typeof mount> & { close?: () => void; commit?: () => void }) | null = null;
  let hid: HTMLElement[] = [];
  let told = false;

  const source = () => current()?.text ?? '';
  const blocks = () => map(source());
  const drawn = () => [...root.children].filter((c): c is HTMLElement => c instanceof HTMLElement && c.hasAttribute('data-line'));

  /** Marks each drawn element with the block it belongs to, by the source line it says it starts on. */
  function tag() {
    const text = source();
    const list = map(text);
    const lines: number[] = [];
    if (list) {
      let line = 0;
      let at = 0;
      for (const b of list) {
        for (let i = text.indexOf('\n', at); i !== -1 && i < b.start; i = text.indexOf('\n', i + 1)) line++, (at = i + 1);
        lines.push(line);
      }
    }
    for (const el of drawn()) {
      const l = Number(el.dataset.line);
      let k = -1;
      for (let i = 0; i < lines.length && lines[i] <= l; i++) k = i;
      if (k >= 0) el.dataset.b = String(k);
      else delete el.dataset.b;
    }
  }

  const of = (b: number) => drawn().filter((e) => e.dataset.b === String(b));

  function close() {
    if (live) unmount(live);
    live = null;
    open = null;
    for (const el of hid) el.hidden = false;
    hid = [];
  }

  function show(next: Open) {
    close();
    tag();
    const text = source();
    const list = map(text);
    let anchor: Element | null = null;
    let block: Block | null = null;
    let insertAt: number | undefined;
    if (next.kind === 'whole') {
      hid = drawn();
      anchor = hid[0] ?? root.firstElementChild;
    } else if (next.kind === 'ghost') {
      insertAt = next.b >= 0 ? list![next.b].end : 0;
      const els = next.b >= 0 ? of(next.b) : [];
      anchor = els.length ? els[els.length - 1].nextElementSibling : root.firstElementChild;
    } else {
      block = list![next.b];
      hid = of(next.b);
      anchor = hid[0] ?? null;
    }
    for (const el of hid) el.hidden = true;
    open = next;
    live = mount(BlockEditor, {
      target: root,
      anchor: anchor ?? undefined,
      props: { block, insertAt, source: text, mode: next.mode, at: next.at, top: next.top, as: next.as, onDone: done, history: host.history },
    }) as typeof live;
  }

  function begin(target: Element | null, point: { x: number; y: number } | null, after?: Ask) {
    if (open || (__LOCAL__ && frozen())) return;
    const edge = after?.edge;
    const list = blocks();
    if (!list) {
      if (!told) (told = true), say('This document has raw HTML, so it opens here as Markdown. Nothing in it is rewritten.');
      return show({ kind: 'whole', b: -1, mode: 'source', at: edge ?? null });
    }
    if (!list.length) return show({ kind: 'ghost', b: -1, mode: 'rich', at: 'start' });
    if (target && !root.contains(target)) return;
    const hit = target?.closest<HTMLElement>('[data-b]') ?? null;
    if (target && !hit) return;
    const tex = target?.closest('.math')?.querySelector('annotation[encoding="application/x-tex"]')?.textContent ?? null;
    const box = hit?.getBoundingClientRect() ?? null;
    const at: Caret | null = tex ? { find: tex } : point && box ? { x: point.x - box.left, y: point.y - box.top } : null;
    const was = hit ? Number(hit.dataset.b) : undefined;
    const before = was !== undefined && after?.moved ? list.findIndex((b) => b.start === after.moved!(prior?.[was]?.start ?? -1)) : was;
    const b = before === undefined || before < 0 ? (was ?? (edge?.edge === 'bottom' ? list.length - 1 : 0)) : before;
    if (!list[b]) return;
    const text = list[b].kind === 'source' || tex !== null;
    show({ kind: 'block', b, mode: text ? 'source' : 'rich', at: text && !tex ? (edge ?? null) : (at ?? edge ?? 'start'), top: box?.top });
  }

  // the blocks as they were before the commit that sent a click on: a clicked element still names its old index
  let prior: Block[] | null = null;

  function done(next: string | null, follow?: Follow) {
    const was = open!;
    const from = source();
    const count = blocks()?.length ?? 0;
    prior = blocks();
    close();
    if (next !== null) host.commit(next);
    tag();
    if (!follow) return;
    if (follow.to === 'cell') return begin(follow.ask.target, follow.ask.point, follow.ask);
    const list = blocks();
    const kindAt = (i: number): 'rich' | 'source' => (list![i].kind === 'source' ? 'source' : 'rich');
    if (follow.to === 'near') {
      if (!list) return void (was.kind === 'whole' && show({ kind: 'whole', b: -1, mode: 'source', at: follow.at }));
      if (!list.length) return show({ kind: 'ghost', b: -1, mode: 'rich', at: 'start' });
      const now = source();
      let p = 0;
      while (p < from.length && from[p] === now[p]) p++;
      const hit = from === now ? Math.max(0, was.b) : list.findIndex((b) => p <= b.end);
      const i = hit < 0 || hit >= list.length ? list.length - 1 : hit;
      show({ kind: 'block', b: i, mode: kindAt(i), at: follow.at });
    } else if (follow.to === 'ghost' || follow.to === 'above') {
      const after = follow.to === 'above' ? was.b - 1 : Math.min(was.kind === 'ghost' ? was.b + 1 : was.b, (list?.length ?? 0) - 1);
      show({ kind: 'ghost', b: after, mode: 'rich', at: follow.at });
    } else if (was.kind === 'ghost') {
      if (next === null) show({ kind: 'ghost', b: was.b, mode: 'rich', at: follow.at });
      else if (follow.to === 'same' && list?.[was.b + 1]) show({ kind: 'block', b: was.b + 1, mode: kindAt(was.b + 1), at: follow.at });
    } else if (was.kind === 'whole' || !list) {
      if (was.kind === 'whole' && follow.to === 'same') show({ kind: 'whole', b: -1, mode: 'source', at: follow.at });
    } else {
      const i = follow.to === 'next' ? was.b + 1 : follow.to === 'prev' ? was.b - 1 : was.b;
      if (list[i] && (follow.to !== 'same' || list.length === count)) show({ kind: 'block', b: i, mode: kindAt(i), at: follow.at });
    }
  }

  /** The bar's block buttons with nothing open: a new block at the end. An empty document puts it at the start. */
  function start(as: Type) {
    const list = blocks();
    if (open || !list || (__LOCAL__ && frozen())) return;
    show({ kind: 'ghost', b: list.length - 1, mode: 'rich', at: 'start', as });
  }

  // One click opens what it lands on. A link, a box, a button or a fold keeps its own click, and a drag that selected text stays a selection.
  function clicked(e: MouseEvent) {
    if (open || e.button !== 0 || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
    const sel = getSelection();
    if (sel && !sel.isCollapsed) return;
    const t = e.target as Element;
    if (t.closest('a, button, input, summary, label, .made')) return;
    const point = { x: e.clientX, y: e.clientY };
    if (root.contains(t) && t !== root) return begin(t, point);
    // the margins and the space under the page: the nearest block, or past the end a new paragraph
    const list = blocks();
    if (!list) return begin(null, null);
    const els = drawn().filter((el) => el.dataset.b !== undefined);
    const last = els[els.length - 1];
    if (!last || e.clientY > last.getBoundingClientRect().bottom) {
      if (!list.length) return begin(null, null);
      return show({ kind: 'ghost', b: list.length - 1, mode: 'rich', at: 'start' });
    }
    const near = els.find((el) => e.clientY <= el.getBoundingClientRect().bottom);
    if (near) begin(near, point);
  }

  const asked = (e: Event) => {
    const ask = (e as CustomEvent<Ask | null>).detail;
    begin(ask?.target ?? null, ask?.point ?? null, ask ?? undefined);
  };

  const pane = root.parentElement!;
  const watching = new MutationObserver(() => {
    if (!open) tag();
  });
  const tools = mount(Toolbar, { target: document.body, props: { idle: { history: host.history, start, ok: () => !open && !!current() && !(__LOCAL__ && frozen()) && blocks() !== null } } });
  root.dataset.page = '';
  tag();
  watching.observe(root, { childList: true, attributes: true, attributeFilter: ['data-line'], subtree: false });
  pane.addEventListener('click', clicked);
  root.addEventListener('edit', asked);

  return {
    /** Commits an open block and closes it, before anything else reads or changes the document. */
    close() {
      live?.close?.();
    },
    /** Commits an open block and keeps it open: a save. */
    commit() {
      live?.commit?.();
    },
    /** A document with nothing in it is ready to be written in. */
    ready() {
      tag();
      if (!open && !source().trim()) begin(null, null);
    },
    detach() {
      live?.close?.();
      close();
      unmount(tools);
      watching.disconnect();
      pane.removeEventListener('click', clicked);
      root.removeEventListener('edit', asked);
      delete root.dataset.page;
      for (const el of drawn()) delete el.dataset.b;
    },
  };
}
export type Attached = ReturnType<typeof attach>;
