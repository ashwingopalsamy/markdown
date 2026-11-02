import { EditorSelection, type ChangeSpec, type EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

export type CommandName =
  | 'bold' | 'italic' | 'code' | 'strike' | 'link' | 'h1' | 'h2' | 'h3' | 'ul' | 'ol' | 'task' | 'quote'
  | 'codeblock' | 'table' | 'hr' | 'math' | 'mermaid';

/** Snippet text; the first ‸ is the cursor (or selection start), an optional second ends the selection. */
export const SNIPPETS = {
  codeblock: '```‸\n\n```',
  table: '| ‸Column‸ | Column | Column |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |',
  hr: '---\n‸',
  math: '$$\n‸\n$$',
  mermaid: '```mermaid\nflowchart TD\n  A[‸Start‸] --> B{Choice}\n  B -->|yes| C[Done]\n  B -->|no| A\n```',
} as const;

export function parseSnippet(s: string): { text: string; anchor: number; head: number } {
  const a = s.indexOf('‸');
  const b = s.indexOf('‸', a + 1);
  const text = s.replace(/‸/g, '');
  return { text, anchor: a, head: b < 0 ? a : b - 1 };
}

// Counts a run of `c` ending at (dir -1) or starting at (dir 1) pos, bounded to a few chars.
function run(st: EditorState, pos: number, c: string, dir: 1 | -1): number {
  let n = 0;
  const d = st.doc;
  while (n < 4) {
    const p = dir < 0 ? pos - n - 1 : pos + n;
    if (p < 0 || p >= d.length || d.sliceString(p, p + 1) !== c) break;
    n++;
  }
  return n;
}

function wrapped(st: EditorState, from: number, to: number, m: string): boolean {
  const c = m[0];
  if (c === '*') {
    const k = Math.min(run(st, from, c, -1), run(st, to, c, 1));
    return m === '**' ? k >= 2 : k === 1 || k === 3;
  }
  const d = st.doc;
  return d.sliceString(Math.max(0, from - m.length), from) === m && d.sliceString(to, to + m.length) === m;
}

function toggleWrap(m: string) {
  return (view: EditorView): boolean => {
    view.dispatch(view.state.changeByRange((r) => {
      const st = view.state;
      const txt = st.sliceDoc(r.from, r.to);
      if (wrapped(st, r.from, r.to, m)) {
        const k = m.length;
        return {
          changes: [{ from: r.from - k, to: r.from }, { from: r.to, to: r.to + k }],
          range: EditorSelection.range(r.anchor - k, r.head - k),
        };
      }
      // selection that includes its own markers: **bold** selected -> unwrap inside
      if (txt.length >= m.length * 2 && txt.startsWith(m) && txt.endsWith(m) && !(m === '*' && txt[1] === '*')) {
        const k = m.length;
        return {
          changes: [{ from: r.from, to: r.from + k }, { from: r.to - k, to: r.to }],
          range: EditorSelection.range(r.from, r.to - 2 * k),
        };
      }
      return {
        changes: [{ from: r.from, insert: m }, { from: r.to, insert: m }],
        range: EditorSelection.range(r.anchor + m.length, r.head + m.length),
      };
    }), { userEvent: 'input', scrollIntoView: true });
    return true;
  };
}

function link(view: EditorView): boolean {
  view.dispatch(view.state.changeByRange((r) => {
    const sel = view.state.sliceDoc(r.from, r.to);
    if (!sel) return { changes: { from: r.from, insert: '[]()' }, range: EditorSelection.cursor(r.from + 1) };
    const s = r.from + sel.length + 3;
    return { changes: { from: r.from, to: r.to, insert: `[${sel}](url)` }, range: EditorSelection.range(s, s + 3) };
  }), { userEvent: 'input', scrollIntoView: true });
  return true;
}

function selectedLines(st: EditorState) {
  const seen = new Set<number>();
  const out = [];
  for (const r of st.selection.ranges) {
    const a = st.doc.lineAt(r.from).number;
    // a selection ending at the start of a line doesn't include that line
    let b = st.doc.lineAt(r.to).number;
    if (b > a && r.to === st.doc.line(b).from) b--;
    for (let n = a; n <= b; n++) if (!seen.has(n)) { seen.add(n); out.push(st.doc.line(n)); }
  }
  return out;
}

const LIST = /^(\s*)(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/;
const ANY_PREFIX = /^(\s*)(?:#{1,6}\s+|>\s?|(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)/;

function heading(level: number) {
  const mark = '#'.repeat(level) + ' ';
  return (view: EditorView): boolean => {
    const lines = selectedLines(view.state);
    const off = lines.every((l) => l.text.startsWith(mark));
    const changes: ChangeSpec[] = lines.map((l) => {
      const m = /^#{1,6}\s+/.exec(l.text);
      return { from: l.from, to: l.from + (m ? m[0].length : 0), insert: off ? '' : mark };
    });
    view.dispatch({ changes, userEvent: 'input', scrollIntoView: true });
    return true;
  };
}

const KINDS = {
  ul: { has: /^\s*[-*+]\s+(?!\[[ xX]\])/, mk: () => '- ' },
  ol: { has: /^\s*\d+[.)]\s+/, mk: (i: number) => `${i + 1}. ` },
  task: { has: /^\s*[-*+]\s+\[[ xX]\]\s+/, mk: () => '- [ ] ' },
  quote: { has: /^\s*>/, mk: () => '> ' },
};

function prefixed(kind: keyof typeof KINDS) {
  return (view: EditorView): boolean => {
    const k = KINDS[kind];
    let lines = selectedLines(view.state);
    const nonBlank = lines.filter((l) => l.text.trim());
    if (nonBlank.length) lines = nonBlank;
    const off = lines.every((l) => k.has.test(l.text));
    const changes: ChangeSpec[] = lines.map((l, i) => {
      // quote may sit in front of a list; the other kinds replace any existing block prefix
      const m = (kind === 'quote' ? /^\s*>\s?/ : ANY_PREFIX).exec(l.text);
      const ws = /^\s*/.exec(l.text)![0].length;
      return { from: l.from + ws, to: l.from + (m ? m[0].length : ws), insert: off ? '' : k.mk(i) };
    });
    view.dispatch({ changes, userEvent: 'input', scrollIntoView: true });
    return true;
  };
}

/** Inserts a snippet as its own block, padded with blank lines; wraps the selection for fenced kinds. */
export function block(view: EditorView, snippet: string, wrapSel = false): boolean {
  const st = view.state;
  const r = st.selection.main;
  if (wrapSel && !r.empty) {
    const body = st.sliceDoc(r.from, r.to);
    const { text } = parseSnippet(snippet);
    const at = text.indexOf('\n') + 1;
    const ins = text.slice(0, at) + body + text.slice(at);
    view.dispatch({ changes: { from: r.from, to: r.to, insert: ins }, selection: EditorSelection.cursor(r.from + ins.length), userEvent: 'input', scrollIntoView: true });
    return true;
  }
  const line = st.doc.lineAt(r.head);
  const blank = !line.text.trim();
  const from = blank ? line.from : line.to;
  const pre = blank ? (line.number > 1 && st.doc.line(line.number - 1).text.trim() ? '\n' : '') : '\n\n';
  const post = line.number < st.doc.lines && st.doc.line(line.number + 1).text.trim() ? '\n' : '';
  const s = parseSnippet(snippet);
  view.dispatch({
    changes: { from, to: line.to, insert: pre + s.text + post },
    selection: EditorSelection.range(from + pre.length + s.anchor, from + pre.length + s.head),
    userEvent: 'input', scrollIntoView: true,
  });
  return true;
}

const table: Record<CommandName, (v: EditorView) => boolean> = {
  bold: toggleWrap('**'),
  italic: toggleWrap('*'),
  code: toggleWrap('`'),
  strike: toggleWrap('~~'),
  link,
  h1: heading(1), h2: heading(2), h3: heading(3),
  ul: prefixed('ul'), ol: prefixed('ol'), task: prefixed('task'), quote: prefixed('quote'),
  codeblock: (v) => block(v, SNIPPETS.codeblock, true),
  table: (v) => block(v, SNIPPETS.table),
  hr: (v) => block(v, SNIPPETS.hr),
  math: (v) => block(v, SNIPPETS.math, true),
  mermaid: (v) => block(v, SNIPPETS.mermaid),
};

export const runCommand = (view: EditorView, name: CommandName): boolean => table[name]?.(view) ?? false;

const INDENT = '    ';
/** Tab/Shift-Tab on list lines only; anywhere else the key falls through so focus can leave. */
export function indentList(out: boolean) {
  return (view: EditorView): boolean => {
    const lines = selectedLines(view.state).filter((l) => l.text.trim());
    if (!lines.length || !lines.every((l) => LIST.test(l.text))) return false;
    const changes: ChangeSpec[] = [];
    for (const l of lines) {
      if (!out) { changes.push({ from: l.from, insert: INDENT }); continue; }
      const m = /^(?: {1,4}|\t)/.exec(l.text);
      if (m) changes.push({ from: l.from, to: l.from + m[0].length });
    }
    if (!changes.length) return false;
    view.dispatch({ changes, userEvent: out ? 'delete.dedent' : 'input.indent', scrollIntoView: true });
    return true;
  };
}
