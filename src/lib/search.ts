// One query, two places: the source as text, and the drawn page as ranges for the Custom Highlight API. Neither touches the page's DOM.
export const LIMIT = 200;
export const LEAST = 2;

export const pattern = (q: string) => new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');

export interface Hit {
  from: number;
  to: number;
  line: number;
  before: string;
  match: string;
  after: string;
}

/** Every match in order. A match with no length steps over one character, so `^` and lookarounds end. */
export function* each(text: string, rx: RegExp) {
  for (let m = rx.exec(text); m; m = rx.exec(text)) {
    yield m;
    if (!m[0]) rx.lastIndex += (text.codePointAt(rx.lastIndex) ?? 0) > 0xffff ? 2 : 1;
  }
}

export function search(text: string, q: string, most = LIMIT): { hits: Hit[]; more: boolean } {
  const term = q.trim();
  return term.length < LEAST ? { hits: [], more: false } : scan(text, pattern(term), most);
}

export function scan(text: string, rx: RegExp, most: number): { hits: Hit[]; more: boolean } {
  const hits: Hit[] = [];
  let line = 0;
  let seen = 0;
  for (const m of each(text, rx)) {
    if (hits.length === most) return { hits, more: true };
    for (let i = text.indexOf('\n', seen); i !== -1 && i < m.index; i = text.indexOf('\n', i + 1)) line++, (seen = i + 1);
    const to = m.index + m[0].length;
    const end = text.indexOf('\n', to);
    hits.push({
      from: m.index,
      to,
      line,
      before: text.slice(Math.max(seen, m.index - 28), m.index),
      match: m[0],
      after: text.slice(to, Math.min(end < 0 ? text.length : end, to + 90)),
    });
  }
  return { hits, more: false };
}

const PAINT_MOST = 2000;

/** Marks every match on the drawn page and gives back the ranges in reading order. KaTeX's hidden copy of each formula does not count. */
export function paint(root: Element, q: string, re?: RegExp | null): Range[] {
  const term = q.trim();
  const rx = re === undefined ? (term.length >= LEAST ? pattern(term) : null) : re;
  const ranges: Range[] = [];
  if (rx) {
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement?.closest('.katex-mathml, style, script, [hidden]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let n = walk.nextNode(); n && ranges.length < PAINT_MOST; n = walk.nextNode()) {
      rx.lastIndex = 0;
      for (let m = rx.exec(n.nodeValue ?? ''); m; m = rx.exec(n.nodeValue ?? '')) {
        const r = new Range();
        r.setStart(n, m.index);
        r.setEnd(n, m.index + m[0].length);
        ranges.push(r);
      }
    }
  }
  if (ranges.length) CSS.highlights?.set('find', new Highlight(...ranges));
  else CSS.highlights?.delete('find');
  return ranges;
}

export function markAt(r: Range | null) {
  if (r) CSS.highlights?.set('find-at', new Highlight(r));
  else CSS.highlights?.delete('find-at');
}

export function unpaint() {
  CSS.highlights?.delete('find');
  CSS.highlights?.delete('find-at');
}
