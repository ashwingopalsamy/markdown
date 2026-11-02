import { Compartment, EditorState, Transaction, type ChangeSpec } from '@codemirror/state';
import { EditorView, drawSelection, keymap, placeholder, type KeyBinding } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, isolateHistory, redo, redoDepth, undo, undoDepth } from '@codemirror/commands';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { indentOnInput } from '@codemirror/language';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { theme, inlineCodeProps } from './theme';
import { runCommand, indentList, type CommandName } from './commands';
import { slashMenu } from './slash';
import { findHits, findMarks, findTerm, setFind, setMarks } from './search';
import { dataChips } from './chip';
import { pasteAndDrop } from './paste';

export type { CommandName };

export interface EditorOptions {
  onChange(text: string): void;
  onScroll(topLine: number): void;
  /** null refuses the picture; "" accepts it as read; any other string replaces its data URL. */
  onImage(file: File): Promise<string | null>;
}

// the line being read: the panes scroll under the header's glass, so the top of a pane is not what anyone sees
const READ = 64;
const PAIR = new Set(['*', '_', '`']);
const word = /[\p{L}\p{N}]/u;

// Emphasis and code markers pair only where they can open a span: not inside a word, not as a list bullet.
const markers = EditorView.inputHandler.of((view, from, to, text) => {
  if (from !== to || !PAIR.has(text) || view.composing) return false;
  const d = view.state.doc;
  const at = (p: number) => (p < 0 || p >= d.length ? '' : d.sliceString(p, p + 1).replace('\n', ''));
  const prev = at(from - 1), next = at(from), c = text;
  const put = (insert: string, cur: number) => {
    view.dispatch({ changes: { from, insert }, selection: { anchor: from + cur }, userEvent: 'input.type', scrollIntoView: true });
    return true;
  };
  if (next === c) {
    const pp = at(from - 2);
    // *|* -> **|**, but **bold*|* just steps over the closer
    if (c !== '`' && prev === c && pp !== c && !word.test(pp)) return put(c + c, 1);
    view.dispatch({ selection: { anchor: from + 1 }, userEvent: 'select' });
    return true;
  }
  const line = d.lineAt(from);
  const bullet = c === '*' && !line.text.slice(0, from - line.from).trim();
  if (!bullet && !word.test(prev) && prev !== c && (!next || /[)\]}:;>.,!?]/.test(next))) return put(c + c, 1);
  return false;
});

const bind = (run: (v: EditorView) => boolean, key: string): KeyBinding => ({ key, run, preventDefault: true });
const cmd = (name: CommandName, key: string) => bind((v) => runCommand(v, name), key);

const keys = keymap.of([
  cmd('bold', 'Mod-b'), cmd('italic', 'Mod-i'), cmd('link', 'Mod-k'), cmd('code', 'Mod-e'), cmd('strike', 'Mod-Shift-x'),
  { key: 'Tab', run: indentList(false), shift: indentList(true) },
  // Escape then Tab leaves the editor (indentWithTab-style tab-focus mode); the key still does its normal job
  { key: 'Escape', run: (v) => (v.setTabFocusMode(2000), false) },
  ...closeBracketsKeymap,
  ...historyKeymap,
  ...defaultKeymap,
]);

function diff(a: string, b: string): ChangeSpec {
  const m = Math.min(a.length, b.length);
  let s = 0;
  while (s < m && a.charCodeAt(s) === b.charCodeAt(s)) s++;
  let e = 0;
  while (e < m - s && a.charCodeAt(a.length - 1 - e) === b.charCodeAt(b.length - 1 - e)) e++;
  return { from: s, to: a.length - e, insert: b.slice(s, b.length - e) };
}

// md Local: a second window is editing, or the file is not text. Typing, commands and replaces are refused; text that arrives from the file ('input.sync') still lands.
const lock = __LOCAL__ ? new Compartment() : undefined;
let frozen = false;

export class Editor {
  private view: EditorView;
  private states = new Map<string, EditorState>();
  private tops = new Map<string, number>();
  private cur: string | null = null;
  private spell = false;
  private mute = false;
  private quietUntil = 0;
  private raf = 0;
  private ext;
  private term = '';

  constructor(parent: HTMLElement, private opts: EditorOptions) {
    this.ext = [
      history(), drawSelection(), EditorView.lineWrapping, indentOnInput(),
      EditorState.languageData.of(() => [{ closeBrackets: { brackets: ['(', '[', '{'] } }]),
      closeBrackets(), markers,
      // no codeLanguages (no extra grammars); no tag completion or auto-closing
      markdown({ base: markdownLanguage, completeHTMLTags: false, extensions: [{ props: [inlineCodeProps] }] }),
      keys, findMarks, slashMenu, dataChips,
      // the header's glass floats over the text, so nothing the editor brings into view stops under it
      EditorView.scrollMargins.of(() => ({ top: 64 })),
      pasteAndDrop((f) => this.opts.onImage(f), () => this.cur),
      placeholder('Write, or drop a Markdown file anywhere'),
      EditorView.contentAttributes.of(() => ({ 'aria-label': 'Markdown source', spellcheck: String(this.spell), autocapitalize: 'off' })),
      theme,
      ...(__LOCAL__ ? [lock!.of(EditorView.editable.of(true)), EditorState.transactionFilter.of((tr) => (frozen && tr.docChanged && !tr.isUserEvent('input.sync') ? [] : tr))] : []),
      EditorView.updateListener.of((u) => { if (u.docChanged && !this.mute) this.opts.onChange(u.state.doc.toString()); }),
    ];
    this.view = new EditorView({ state: this.mk(''), parent });
    this.view.scrollDOM.addEventListener('scroll', this.onScr, { passive: true });
  }

  private mk(doc: string) { return EditorState.create({ doc, extensions: this.ext }); }
  private quiet() { this.quietUntil = performance.now() + 150; }

  private onScr = () => {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      if (performance.now() < this.quietUntil) return;
      this.opts.onScroll(this.topLine());
    });
  };

  load(docId: string, text: string): void {
    const v = this.view;
    if (docId === this.cur) { this.set(text, true); return; }
    if (this.cur !== null) { this.states.set(this.cur, v.state); this.tops.set(this.cur, v.scrollDOM.scrollTop); }
    this.cur = docId;
    const st = this.states.get(docId);
    this.quiet();
    v.setState(st ?? this.mk(text));
    if (st) this.set(text, true, false);
    this.find(this.term);
    const top = this.tops.get(docId) ?? 0;
    v.scrollDOM.scrollTop = top;
    // heights are estimates until measured; settle once more
    requestAnimationFrame(() => { this.quiet(); v.scrollDOM.scrollTop = top; });
  }

  drop(docId: string): void {
    this.states.delete(docId);
    this.tops.delete(docId);
    if (this.cur === docId) this.cur = null;
  }

  get text(): string { return this.view.state.doc.toString(); }

  /** `past` false: the text came from outside (md Local), so it stays out of undo and keeps the caret and scroll where they were. */
  set(text: string, silent = false, past = true): void {
    const old = this.view.state.doc.toString();
    if (old === text) return;
    this.mute = silent;
    try { this.view.dispatch({ changes: diff(old, text), annotations: __LOCAL__ && !past ? [Transaction.userEvent.of('input.sync'), Transaction.addToHistory.of(false)] : Transaction.userEvent.of('input.set') }); }
    finally { this.mute = false; }
  }

  toLine(line: number): void {
    const d = this.view.state.doc;
    const pos = d.line(Math.min(d.lines, Math.max(1, line + 1))).from;
    this.view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 0 }) });
    this.view.focus();
  }

  /** The line at the reading line, with how far through it: 12.5 is halfway down line 12 (from 0). */
  topLine(): number {
    const v = this.view;
    const h = Math.max(0, v.scrollDOM.scrollTop + READ - v.documentPadding.top);
    const b = v.lineBlockAtHeight(h);
    const line = v.state.doc.lineAt(b.from).number - 1;
    return line + (b.height ? Math.min(1, Math.max(0, (h - b.top) / b.height)) : 0);
  }

  /** Puts a position from topLine() at the reading line. Heights off screen are estimates until drawn, so it lands, lets the editor measure, and lands again. */
  scrollToLine(at: number): void {
    const v = this.view;
    const put = () => {
      const d = v.state.doc;
      const n = Math.min(d.lines, Math.max(1, Math.floor(at) + 1));
      const b = v.lineBlockAt(d.line(n).from);
      this.quiet();
      v.scrollDOM.scrollTop = b.top + (at - (n - 1)) * b.height + v.documentPadding.top - READ;
    };
    put();
    v.requestMeasure({ key: this.settle, read() {}, write: put });
  }
  private settle = {};

  focus(): void { this.view.focus(); }

  freeze(on: boolean): void {
    frozen = on;
    this.view.dispatch({ effects: lock!.reconfigure(EditorView.editable.of(!on)) });
  }

  /** The document's history, for the Page view: one step, and whether there is one. */
  step(forward: boolean): boolean { return (forward ? redo : undo)(this.view); }
  canStep(forward: boolean): boolean { return (forward ? redoDepth : undoDepth)(this.view.state) > 0; }

  /** The header's query. A document opened later picks it up in load(). */
  find(term: string): void {
    this.term = term;
    if (this.view.state.field(findTerm) !== term) this.view.dispatch({ effects: setFind.of(term) });
  }

  /** Selects a match and brings it to the middle, leaving the keyboard where it is. */
  select(from: number, to: number): void {
    this.view.dispatch({ selection: { anchor: from, head: to }, effects: EditorView.scrollIntoView(from, { y: 'center' }) });
  }

  replace(ranges: readonly { from: number; to: number }[], insert: string): void {
    this.view.dispatch({ changes: ranges.map(({ from, to }) => ({ from, to, insert })), userEvent: 'input.replace' });
  }

  /** md Local: the worker's matches, as from/to pairs. */
  marks(pairs: number[]): void {
    if (__LOCAL__ && (pairs.length || this.view.state.field(findHits!).length)) this.view.dispatch({ effects: setMarks!.of(pairs) });
  }

  /** md Local: edits as one transaction and one step of history. */
  change(edits: readonly ChangeSpec[]): void {
    if (__LOCAL__) this.view.dispatch({ changes: edits, userEvent: 'input.replace', annotations: isolateHistory.of('full') });
  }

  /** What is selected, when it is short and on one line. */
  get selected(): string {
    const { from, to } = this.view.state.selection.main;
    const s = this.view.state.sliceDoc(from, Math.min(to, from + 200));
    return s.includes('\n') ? '' : s;
  }

  command(name: CommandName): void {
    runCommand(this.view, name);
    this.view.focus();
  }

  setSpellcheck(on: boolean): void {
    this.spell = on;
    this.view.dispatch({}); // attribute sources re-run on every update
  }

  remeasure(): void {
    this.view.requestMeasure();
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.view.scrollDOM.removeEventListener('scroll', this.onScr);
    this.view.destroy();
    this.states.clear();
    this.tops.clear();
  }
}
