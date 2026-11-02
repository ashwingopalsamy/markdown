import { autocompletion, type Completion, type CompletionContext } from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';
import { EditorSelection } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { SNIPPETS, parseSnippet } from './commands';

type Def = [label: string, hint: string, snippet: string, block?: boolean];

const DEFS: Def[] = [
  ['Heading 1', '#', '# ‸'],
  ['Heading 2', '##', '## ‸'],
  ['Heading 3', '###', '### ‸'],
  ['Bulleted list', '-', '- ‸'],
  ['Numbered list', '1.', '1. ‸'],
  ['Task', '- [ ]', '- [ ] ‸'],
  ['Quote', '>', '> ‸'],
  ['Code', '```', SNIPPETS.codeblock, true],
  ['Table', '| |', SNIPPETS.table, true],
  ['Divider', '---', SNIPPETS.hr, true],
  ['Link', '[ ]( )', '[‸text‸](url)'],
  ['Picture', '![ ]( )', '![‸alt‸](url)'],
  ['Note', '> [!NOTE]', '> [!NOTE]\n> ‸'],
  ['Tip', '> [!TIP]', '> [!TIP]\n> ‸'],
  ['Warning', '> [!WARNING]', '> [!WARNING]\n> ‸'],
  ['Math', '$$', SNIPPETS.math, true],
  ['Diagram', 'mermaid', SNIPPETS.mermaid, true],
];

function apply(view: EditorView, snippet: string, blockish: boolean, from: number, to: number) {
  const st = view.state;
  const slash = from - 1;
  const line = st.doc.lineAt(slash);
  // keep the indent before the slash; block kinds start at column 0 after a blank line
  const start = blockish ? line.from : slash;
  const pre = blockish && line.number > 1 && st.doc.line(line.number - 1).text.trim() ? '\n' : '';
  const s = parseSnippet(snippet);
  view.dispatch({
    changes: { from: start, to, insert: pre + s.text },
    selection: EditorSelection.range(start + pre.length + s.anchor, start + pre.length + s.head),
    userEvent: 'input.complete', scrollIntoView: true,
  });
}

function footnote(view: EditorView, _c: Completion, from: number, to: number) {
  const doc = view.state.doc;
  const text = doc.toString();
  const used = new Set([...text.matchAll(/\[\^(\d+)\]/g)].map((m) => +m[1]));
  let n = 1;
  while (used.has(n)) n++;
  const ref = `[^${n}]`;
  const last = doc.line(doc.lines);
  const sep = !last.text ? (doc.lines > 1 && !doc.line(doc.lines - 1).text ? '' : '\n') : /^\[\^\d+\]:/.test(last.text) ? '\n' : '\n\n';
  const def = `${sep}[^${n}]: `;
  const end = doc.length + (from - 1 + ref.length - to);
  view.dispatch({
    changes: [{ from: from - 1, to, insert: ref }, { from: doc.length, insert: def }],
    selection: EditorSelection.cursor(end + def.length),
    userEvent: 'input.complete', scrollIntoView: true,
  });
}

const today = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const options: Completion[] = [
  ...DEFS.map(([label, detail, snip, blockish]): Completion => ({
    label, detail, apply: (v, _c, f, t) => apply(v, snip, !!blockish, f, t),
  })),
  { label: 'Footnote', detail: '[^1]', apply: footnote },
  { label: 'Date', detail: 'today', apply: (v, _c, f, t) => apply(v, today() + '‸', false, f, t) },
];

function source(ctx: CompletionContext) {
  const m = ctx.matchBefore(/^[ \t]*\/[\w-]*/);
  if (!m) return null;
  if (ctx.state.sliceDoc(ctx.state.doc.lineAt(m.from).from, m.from).trim()) return null;
  const from = m.from + m.text.indexOf('/') + 1;
  // a path or comment inside a code block is not a command
  for (let n = syntaxTree(ctx.state).resolveInner(ctx.pos, -1); n; n = n.parent!) {
    if (n.name === 'FencedCode' || n.name === 'CodeBlock') return null;
    if (!n.parent) break;
  }
  return { from, options, validFor: /^[\w-]*$/ };
}

export const slashMenu = autocompletion({
  override: [source], icons: false, closeOnBlur: true, maxRenderedOptions: 20, activateOnTypingDelay: 0,
});
