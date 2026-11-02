import './md.css';
import type { Token, Tokens } from 'marked';
import { lexDoc, marked, nl, renderTokens } from './lex';
import { sanitize, TASK } from './sanitize';
import { frontHtml, splitFront } from './text';
import { highlight } from './highlight';
import { typeset } from './math';
import { drawFig, kindOf } from './engines';

export interface Heading {
  level: number;
  text: string;
  id: string;
  line: number;
}

/** A top-level block as lexed: what it says, where it starts, and how it renders unless the cache has it. */
interface Seg {
  raw: string;
  tokens: Token[];
  line: number;
  /** markup that does not come from marked (the front matter) */
  html?: string;
}

interface Piece {
  raw: string;
  html: string;
  /** source line of the first row, 0-based */
  line: number;
  /** rows of source the block itself covers (blank lines after it are not counted) */
  span: number;
  all: ChildNode[];
  els: HTMLElement[];
  head?: { level: number; text: string; el: HTMLElement; anchor: HTMLAnchorElement };
  tasks: [HTMLInputElement, number][];
  toc: boolean;
  dead: boolean;
}

/** What is still to do for one top-level element once it is near the screen. */
interface Job {
  piece: Piece;
  el: HTMLElement;
  code: boolean;
  math: boolean;
  mermaid: boolean;
  /** has drawings at all, which a change of theme draws again */
  figs: boolean;
}

// An opening tag that a blank line inside would split from its closing one: `<details>` with markdown in it, say.
const TAGS = /<(\/)?(details|div|section|center|article|aside|figure|header|footer|nav|main|table|ul|ol|dl|blockquote)\b[^>]*?(\/)?>/gi;
const depth = (raw: string) => {
  let d = 0;
  for (const m of raw.matchAll(TAGS)) if (!m[3]) d += m[1] ? -1 : 1;
  return d;
};

const ICONS: Record<string, string> = {
  note: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  tip: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z"/>',
  important: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5h.01"/>',
  warning: '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 10v4M12 17h.01"/>',
  caution: '<path d="M8 3h8l5 5v8l-5 5H8l-5-5V8l5-5Z"/><path d="M9 9l6 6M15 9l-6 6"/>',
};
const svg = (paths: string) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const COPY = svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>').replace('<svg ', '<svg class="i-copy" ');
const CHECK = svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>').replace('<svg ', '<svg class="i-check" ');

const SELECT = 'div.code, .math[data-tex], figure.mermaid';
const within = (el: Element, selector: string): Element[] => [...(el.matches(selector) ? [el] : []), ...el.querySelectorAll(selector)];
// a block this long is shown plain; tokenizing it would stall the page
const HIGHLIGHT_CAP = 100_000;

const slugify = (text: string) =>
  text.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s+/g, '-') || 'section';

export class View {
  headings: Heading[] = [];
  private src: string | null = null;
  private pieces: Piece[] = [];
  private cache = new Map<string, string>();
  private links: Record<string, { href: string; title?: string }> = {};
  private ids = '';
  private jobs = new Map<Element, Job>();
  private done = new WeakSet<Element>();
  private lit = new Map<string, string>();
  private io?: IntersectionObserver;
  private ioRoot: Element | null = null;
  private mo?: MutationObserver;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private notes?: HTMLElement;
  private noteKey = '';
  private tocKey = '';
  private mapped = '';
  private dead = false;

  constructor(
    private root: HTMLElement,
    private live: boolean,
  ) {
    root.classList.add('md');
    if (!live) return;
    root.addEventListener('click', this.click);
    this.mo = new MutationObserver(() => {
      // the drawings are the one thing that was made for a theme; code carries both as variables
      for (const job of this.jobs.values()) {
        if (job.figs && !job.piece.dead) {
          job.mermaid = true;
          this.watch(job.el);
        }
      }
    });
    this.mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-palette'] });
  }

  /** `fresh` (md Local): the text came from the file, so the blocks that changed fade in. */
  update(source: string, fresh = false) {
    if (this.dead || source === this.src) return;
    this.src = source;
    const front = splitFront(source);
    const { tokens, links, defs } = lexDoc(front?.body ?? source);
    const segs = this.segments(tokens, front);

    // reference links and footnote definitions reach every block, so a change in them stales every block
    const ids = [...defs.keys()].join('\0');
    const stale = ids !== this.ids || !sameLinks(links, this.links);
    this.ids = ids;
    this.links = links;
    if (stale) this.cache.clear();

    const old = this.pieces;
    const most = Math.min(old.length, segs.length);
    let a = 0;
    let z = 0;
    if (!stale) {
      while (a < most && old[a].raw === segs[a].raw) a++;
      while (z < most - a && old[old.length - 1 - z].raw === segs[segs.length - 1 - z].raw) z++;
    }
    for (let k = a; k < old.length - z; k++) this.drop(old[k]);
    const made: Piece[] = [];
    const frag = document.createDocumentFragment();
    for (let k = a; k < segs.length - z; k++) {
      const piece = this.make(segs[k]);
      made.push(piece);
      frag.append(...piece.all);
    }
    const tail = old.slice(old.length - z);
    this.root.insertBefore(frag, tail.find((p) => p.all.length)?.all[0] ?? this.notes ?? null);
    this.pieces = [...old.slice(0, a), ...made, ...tail];
    if (this.live) for (const p of made) for (const el of p.els) for (const img of within(el, 'img')) if (!img.closest('figure.mermaid')) img.dispatchEvent(new CustomEvent('md-figure', { bubbles: true }));
    // blocks after the edit keep their DOM; only their numbers move
    if (z && tail[0].line !== segs[segs.length - z].line) this.shift(tail, segs[segs.length - z].line - tail[0].line);
    if (this.cache.size > this.pieces.length + 64) this.cache = new Map(this.pieces.map((p) => [p.raw, p.html]));

    this.footnotes(defs);
    this.outline();
    if (this.live) for (const p of made) this.arm(p);
    if (__LOCAL__ && fresh) for (const p of made) for (const el of p.els) el.classList.add('md-fresh');
  }

  /** Runs every enhancement now and resolves when all are done. Only for an export, where nothing is watched. */
  async settle() {
    await Promise.all([...this.jobs.values()].map((j) => this.run(j)));
  }

  destroy() {
    this.dead = true;
    for (const p of this.pieces) this.drop(p);
    this.pieces = [];
    this.io?.disconnect();
    this.mo?.disconnect();
    for (const t of this.timers) clearTimeout(t);
    this.root.removeEventListener('click', this.click);
    this.root.replaceChildren();
    this.root.classList.remove('md');
  }

  topOfLine(line: number): number | null {
    const ps = this.pieces;
    if (!ps.length || !this.root.getClientRects().length) return null;
    let lo = 0;
    let hi = ps.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (ps[mid].line <= line) lo = mid;
      else hi = mid - 1;
    }
    let k = lo;
    while (k < ps.length && !ps[k].els.length) k++;
    if (k === ps.length) {
      // past the last block, or only blocks that draw nothing
      const last = ps.findLast((p) => p.els.length);
      return last ? this.edges(last)[1] : null;
    }
    const p = ps[k];
    const [top, bottom] = this.edges(p);
    return k !== lo || line >= p.line + p.span ? (k !== lo ? top : bottom) : top + ((line - p.line) / p.span) * (bottom - top);
  }

  lineAtTop(y: number): number {
    const ps = this.pieces;
    let lo = 0;
    let hi = ps.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      let k = mid;
      while (k < ps.length && !ps[k].els.length) k++;
      if (k < ps.length && this.edges(ps[k])[0] <= y) {
        found = k;
        lo = k + 1;
      } else hi = mid - 1;
    }
    if (found < 0) return ps.find((p) => p.els.length)?.line ?? 0;
    const p = ps[found];
    const [top, bottom] = this.edges(p);
    const at = bottom > top ? Math.min(1, Math.max(0, (y - top) / (bottom - top))) : 0;
    return p.line + at * p.span;
  }

  // ---- lexing into blocks

  private segments(tokens: Token[], front: ReturnType<typeof splitFront>): Seg[] {
    const segs: Seg[] = [];
    let line = 0;
    if (front) {
      segs.push({ raw: front.raw, tokens: [], line, html: frontHtml(front.inner) });
      line += nl(front.raw);
    }
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      const last = segs.at(-1);
      // blank lines belong to the block before them, so a block's raw says everything about its place
      if (t.type === 'space' && last) {
        last.raw += t.raw;
        line += nl(t.raw);
        continue;
      }
      let end = i;
      if (t.type === 'html' && depth(t.raw) > 0) {
        let d = depth(t.raw);
        for (let j = i + 1; j < tokens.length && j < i + 400 && d > 0; j++) {
          if (tokens[j].type === 'html') d += depth(tokens[j].raw);
          if (d <= 0) end = j;
        }
      }
      const group = tokens.slice(i, end + 1);
      const raw = group.length > 1 ? group.map((g) => g.raw).join('') : t.raw;
      segs.push({ raw, tokens: group, line });
      line += nl(raw);
      i = end;
    }
    return segs;
  }

  // ---- building and tearing down blocks

  private make(seg: Seg): Piece {
    let html = this.cache.get(seg.raw);
    if (html === undefined) {
      html = seg.html !== undefined ? sanitize(seg.html) : seg.tokens.length ? sanitize(renderTokens(seg.tokens)) : '';
      this.cache.set(seg.raw, html);
    }
    let end = seg.raw.length;
    while (end > 0 && seg.raw.charCodeAt(end - 1) === 10) end--;
    const piece: Piece = { raw: seg.raw, html, line: seg.line, span: nl(seg.raw.slice(0, end)) + 1, all: [], els: [], tasks: [], toc: false, dead: false };
    const box = document.createElement('template');
    box.innerHTML = html;
    const content = box.content;
    this.decorate(content, piece);
    if (seg.tokens.find((t) => t.type !== 'space')?.type === 'heading') {
      const h = content.firstElementChild as HTMLElement | null;
      if (h && /^H[1-6]$/.test(h.tagName)) {
        const text = h.textContent!.trim();
        const anchor = document.createElement('a');
        anchor.className = 'anchor';
        anchor.setAttribute('aria-label', 'Link to this heading');
        h.append(anchor);
        piece.head = { level: +h.tagName[1], text, el: h, anchor };
      }
    }
    piece.all = [...content.childNodes].filter((n) => n.nodeType === 1 || n.textContent!.trim());
    piece.els = piece.all.filter((n): n is HTMLElement => n.nodeType === 1);
    piece.toc = piece.els[0]?.matches('nav.toc') ?? false;
    // md Local: relative pictures are fetched from the server after the markup is clean, so what an author wrote can never carry a blob: address
    if (__LOCAL__ && this.live) import('../local/pictures').then((m) => {
      const alive = () => !piece.dead && !this.dead;
      m.draw(piece.els, alive, (fig) => this.diagram(fig, alive));
    });
    for (const el of piece.els) {
      if (this.live) el.setAttribute('data-line', String(piece.line));
      if (el.matches(SELECT) || el.querySelector(SELECT)) {
        this.jobs.set(el, {
          piece,
          el,
          code: within(el, 'div.code').length > 0,
          math: within(el, '.math[data-tex]').length > 0,
          mermaid: within(el, 'figure.mermaid').length > 0,
          figs: within(el, 'figure.mermaid').length > 0,
        });
      }
    }
    return piece;
  }

  /** What marked cannot say: the code block's bar, the alert's icon, the task's place in the source. */
  private decorate(content: DocumentFragment, piece: Piece) {
    for (const code of content.querySelectorAll('pre > code')) {
      const pre = code.parentElement!;
      if (pre.closest('figure.mermaid')) continue;
      const bar = document.createElement('div');
      bar.className = 'code-bar';
      const label = document.createElement('span');
      label.className = 'code-lang';
      label.textContent = /(?:^|\s)language-(\S+)/.exec(code.className)?.[1] ?? '';
      bar.append(label);
      if (this.live) {
        const copy = document.createElement('button');
        copy.type = 'button';
        copy.className = 'copy';
        copy.setAttribute('aria-label', 'Copy code');
        copy.innerHTML = COPY + CHECK;
        bar.append(copy);
      }
      const box = document.createElement('div');
      box.className = 'code';
      pre.replaceWith(box);
      box.append(bar, pre);
    }
    for (const title of content.querySelectorAll('.alert-title')) {
      const kind = /alert-(\w+)/.exec(title.parentElement!.className)?.[1] ?? 'note';
      title.insertAdjacentHTML('afterbegin', svg(ICONS[kind] ?? ICONS.note));
    }
    for (const box of content.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
      const mine = box.hasAttribute(TASK);
      const rel = Number(box.getAttribute(TASK));
      box.removeAttribute(TASK);
      if (this.live && mine && rel >= 0) {
        piece.tasks.push([box, rel]);
        box.setAttribute('data-task-line', String(piece.line + rel));
      } else box.disabled = true;
    }
  }

  private drop(piece: Piece) {
    piece.dead = true;
    for (const n of piece.all) {
      n.parentNode?.removeChild(n);
      if (this.jobs.delete(n as Element)) this.io?.unobserve(n as Element);
    }
  }

  private shift(pieces: Piece[], by: number) {
    for (const p of pieces) {
      p.line += by;
      for (const el of p.els) el.setAttribute('data-line', String(p.line));
      for (const [box, rel] of p.tasks) box.setAttribute('data-task-line', String(p.line + rel));
    }
  }

  // ---- what depends on the whole document

  private footnotes(defs: Map<string, Tokens.Generic>) {
    if (!defs.size && !this.notes) return;
    const order = new Map<string, number>();
    const count = new Map<string, number>();
    for (const ref of this.root.querySelectorAll<HTMLAnchorElement>('a.fnref[data-fn]')) {
      const id = ref.dataset.fn!;
      if (!defs.has(id) || this.notes?.contains(ref)) continue;
      if (!order.has(id)) order.set(id, order.size + 1);
      const n = order.get(id)!;
      const k = (count.get(id) ?? 0) + 1;
      count.set(id, k);
      const text = String(n);
      if (ref.textContent !== text) ref.textContent = text;
      ref.id = `user-content-fnref-${n}${k > 1 ? '-' + k : ''}`;
      ref.setAttribute('href', `#user-content-fn-${n}`);
    }
    const key = [...order].map(([id, n]) => `${n}:${count.get(id)}:${defs.get(id)!.raw}`).join('\0');
    if (key === this.noteKey) return;
    this.noteKey = key;
    if (!order.size) {
      this.notes?.remove();
      this.notes = undefined;
      return;
    }
    const items = [...order].map(([id, n]) => {
      const back = Array.from({ length: count.get(id)! }, (_, k) => {
        const at = `${n}${k ? '-' + (k + 1) : ''}`;
        return `<a class="fnback" href="#fnref-${at}" aria-label="Back to reference ${at.replace('-', '.')}">↩${k ? `<sup>${k + 1}</sup>` : ''}</a>`;
      }).join(' ');
      const body = marked.parser(defs.get(id)!.tokens!).trimEnd();
      // the way back goes at the end of the last paragraph
      return `<li id="fn-${n}">${body.endsWith('</p>') ? body.slice(0, -4) + ' ' + back + '</p>' : body + ' ' + back}</li>`;
    });
    if (!this.notes) {
      this.notes = document.createElement('section');
      this.notes.className = 'footnotes';
      this.root.append(this.notes);
    }
    this.notes.innerHTML = sanitize(`<ol>${items.join('')}</ol>`);
    // a box in a note has no line of its own to toggle
    for (const box of this.notes.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) (box.removeAttribute(TASK), (box.disabled = true));
  }

  /** Headings in order: their ids, their place in the outline, and the contents list that wants them. */
  private outline() {
    const heads = this.pieces.filter((p) => p.head);
    const top = Math.min(7, ...heads.map((p) => p.head!.level));
    const seen = new Map<string, number>();
    const used = new Set<string>();
    const list: Heading[] = [];
    let prev = 0;
    for (const p of heads) {
      const { level, text, el, anchor } = p.head!;
      const slug = slugify(text);
      let n = seen.get(slug) ?? 0;
      let id = n ? `${slug}-${n}` : slug;
      while (used.has(id)) id = `${slug}-${++n}`;
      used.add(id);
      seen.set(slug, n + 1);
      if (el.id !== 'user-content-' + id) el.id = 'user-content-' + id;
      anchor.setAttribute('href', '#user-content-' + id);
      list.push({ level, text, id: 'user-content-' + id, line: p.line });
      // how the reader got here, for the hairline above the heading (md.css)
      const kind = !prev ? '' : level === top ? 'top' : level < prev ? 'out' : level === prev ? 'same' : 'in';
      if ((el.getAttribute('data-h') ?? '') !== kind) kind ? el.setAttribute('data-h', kind) : el.removeAttribute('data-h');
      const rank = String(Math.min(3, level - top));
      if (kind && el.getAttribute('data-d') !== rank) el.setAttribute('data-d', rank);
      prev = level;
    }
    const key = list.map((h) => `${h.level}\0${h.text}\0${h.id}\0${h.line}`).join('\n');
    if (key !== this.mapped) {
      this.mapped = key;
      this.headings = list;
    }
    const contents = this.pieces.filter((p) => p.toc);
    const want = this.mapped + '\u0001' + contents.length + contents.map((p) => (p.els[0].childElementCount ? 1 : 0)).join('');
    if (want === this.tocKey) return;
    this.tocKey = want;
    for (const p of contents) {
      const ul = document.createElement('ul');
      for (const h of this.headings) {
        const li = document.createElement('li');
        li.className = 'l' + Math.min(5, h.level - top);
        const a = document.createElement('a');
        a.textContent = h.text;
        a.setAttribute('href', '#' + h.id);
        li.append(a);
        ul.append(li);
      }
      p.els[0].replaceChildren(ul);
    }
  }

  // ---- positions

  /** Top and bottom of a block, in the scroller's own coordinates. */
  private edges(p: Piece): [number, number] {
    const sc = this.scroller();
    const base = sc ? sc.getBoundingClientRect().top - sc.scrollTop : -window.scrollY;
    const last = p.els.at(-1)!;
    return [p.els[0].getBoundingClientRect().top - base, last.getBoundingClientRect().bottom - base];
  }

  private scroller(): HTMLElement | null {
    for (let el: HTMLElement | null = this.root; el && el !== document.body; el = el.parentElement) {
      if (/auto|scroll|overlay/.test(getComputedStyle(el).overflowY)) return el;
    }
    return null;
  }

  // ---- enhancements

  private arm(p: Piece) {
    for (const el of p.els) if (this.jobs.has(el)) this.watch(el);
  }

  /** Waits for the element to come near the screen, then runs what it still needs. */
  private watch(el: Element) {
    const root = this.scroller();
    if (!this.io || root !== this.ioRoot) {
      this.io?.disconnect();
      this.ioRoot = root;
      this.io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            this.io!.unobserve(e.target);
            const job = this.jobs.get(e.target);
            if (job && !job.piece.dead) void this.run(job);
          }
        },
        { root, rootMargin: '800px 0px' },
      );
      for (const k of this.jobs.keys()) this.io.observe(k);
    }
    this.io.observe(el);
  }

  private async run(job: Job) {
    const alive = () => !job.piece.dead && !this.dead;
    const work: Promise<unknown>[] = [];
    if (job.code) {
      job.code = false;
      for (const code of within(job.el, 'div.code code')) work.push(this.paint(code, alive));
    }
    if (job.math) {
      job.math = false;
      work.push(typeset(job.el, alive).catch(() => {}));
    }
    if (job.mermaid) {
      job.mermaid = false;
      for (const fig of within(job.el, 'figure.mermaid')) work.push(this.diagram(fig as HTMLElement, alive));
    }
    await Promise.all(work);
  }

  private async paint(code: Element, alive: () => boolean) {
    if (this.done.has(code)) return;
    this.done.add(code);
    const text = code.textContent ?? '';
    if (text.length > HIGHLIGHT_CAP) return;
    const lang = /(?:^|\s)language-(\S+)/.exec(code.className)?.[1] ?? null;
    const key = `${lang}\0${text}`;
    let html = this.lit.get(key);
    if (html === undefined) {
      try {
        html = await highlight(text, lang);
      } catch {
        return;
      }
      if (text.length < 20_000) {
        if (this.lit.size > 200) this.lit.delete(this.lit.keys().next().value!);
        this.lit.set(key, html);
      }
    }
    // the block may have been replaced while the grammar loaded
    if (!alive()) return;
    code.innerHTML = html;
    code.classList.add('hl');
  }

  private async diagram(fig: HTMLElement, alive: () => boolean) {
    const pre = fig.querySelector('pre');
    if (!pre) return;
    try {
      const out = await drawFig(kindOf(pre), pre.textContent ?? '', this.live, alive);
      if (out === null || !alive()) return;
      fig.querySelector('.mermaid-svg')?.remove();
      fig.querySelector('.mermaid-error')?.remove();
      const box = document.createElement('div');
      box.className = 'mermaid-svg';
      box.innerHTML = out;
      fig.prepend(box);
      fig.classList.remove('err');
      // a bar to zoom, copy and download the drawing: the page hears this and loads the figure code when the first drawing needs it
      if (this.live) fig.dispatchEvent(new CustomEvent('md-figure', { bubbles: true }));
      // the source stays in a live page, to draw again when the theme changes
      if (this.live) pre.hidden = true;
      else pre.remove();
    } catch (e) {
      if (!alive()) return;
      fig.querySelector('.mermaid-svg')?.remove();
      fig.querySelector('.mermaid-error')?.remove();
      const note = document.createElement('p');
      note.className = 'mermaid-error';
      note.textContent = (e instanceof Error ? e.message : String(e)).split('\n')[0] || 'This diagram could not be drawn.';
      pre.hidden = false;
      fig.classList.add('err');
      fig.prepend(note);
    }
  }

  // ---- events

  private click = (e: MouseEvent) => {
    const target = e.target as Element;
    if (__LOCAL__) {
      // a relative link is a place in the project, not an address on this server: the page asks for it by name, and nothing else follows it
      const a = target.closest?.('a[href]');
      const href = a?.getAttribute('href');
      if (a && href && !e.defaultPrevented && !/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(href)) {
        e.preventDefault();
        if (!e.metaKey && !e.ctrlKey && !e.shiftKey) a.dispatchEvent(new CustomEvent('md-link', { bubbles: true, detail: { href } }));
        return;
      }
    }
    const copy = target.closest?.('button.copy');
    if (copy) {
      const text = copy.closest('.code')?.querySelector('code')?.textContent ?? '';
      navigator.clipboard?.writeText(text).then(
        () => {
          copy.classList.add('done');
          const t = setTimeout(() => (this.timers.delete(t), copy.classList.remove('done')), 1400);
          this.timers.add(t);
        },
        () => {},
      );
      return;
    }
    if (target instanceof HTMLInputElement && target.type === 'checkbox' && target.hasAttribute('data-task-line')) {
      // the source decides; the box follows when the block is drawn again
      e.preventDefault();
      target.dispatchEvent(new CustomEvent('md-task', { bubbles: true, detail: { line: Number(target.getAttribute('data-task-line')) } }));
    }
  };
}

function sameLinks(a: Record<string, { href: string; title?: string }>, b: Record<string, { href: string; title?: string }>) {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((k) => b[k] && a[k].href === b[k].href && a[k].title === b[k].title);
}
