import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Tag, tags as t, styleTags } from '@lezer/highlight';

// A child of `monospace` so inline code can get a chip while fenced text stays plain.
const inlineCode = Tag.define(t.monospace);
export const inlineCodeProps = styleTags({ InlineCode: inlineCode });

const sel = 'color-mix(in srgb, var(--fg) 14%, transparent)';
const hit = 'color-mix(in srgb, var(--accent) 22%, transparent)';

const base = EditorView.theme({
  '&': { height: '100%', color: 'var(--fg)', backgroundColor: 'transparent', fontSize: 'calc(13.5px * var(--text, 1))' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.7', overflow: 'auto', scrollbarWidth: 'thin' },
  '.cm-content': { width: '100%', maxWidth: 'var(--ed-col, none)', margin: '0 auto', padding: '72px var(--ed-pad, 40px) 40vh', caretColor: 'var(--fg)' },
  '.cm-line': { padding: '0' },
  '.cm-cursor, .cm-dropCursor': { borderLeft: '1.5px solid var(--fg)', marginLeft: '-0.75px' },
  '.cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': { background: `${sel} !important` },
  '.cm-placeholder': { color: 'var(--fg-3)' },
  '.cm-dchip': {
    display: 'inline-block', padding: '0 7px', margin: '0 1px', borderRadius: '999px', background: 'var(--well)',
    color: 'var(--fg-2)', fontFamily: 'var(--sans)', fontSize: '0.85em', lineHeight: '1.5', verticalAlign: '1px', userSelect: 'none',
  },
  '.cm-searchMatch': { background: hit, borderRadius: '2px' },
  '.cm-searchMatch-selected': { background: 'color-mix(in srgb, var(--accent) 42%, transparent)' },

  // slash menu: same sheet as the app's .pop
  '.cm-tooltip.cm-tooltip-autocomplete': {
    background: 'var(--paper)', border: '0', borderRadius: 'var(--r-sheet, 18px)', boxShadow: 'var(--float)', padding: '8px',
    fontFamily: 'var(--sans)', overflow: 'hidden',
  },
  '.cm-tooltip-autocomplete > ul': { fontFamily: 'var(--sans)', maxHeight: '320px', minWidth: '220px' },
  '.cm-tooltip-autocomplete > ul > li': {
    display: 'flex', alignItems: 'baseline', gap: '12px', padding: '6px 10px', borderRadius: 'var(--r-group, 10px)',
    color: 'var(--fg)', fontSize: 'var(--fs-md, 14px)', lineHeight: '1.4',
  },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { background: 'var(--fill)', color: 'var(--fg)' },
  '.cm-tooltip-autocomplete .cm-completionLabel': { flex: '1' },
  '.cm-tooltip-autocomplete .cm-completionDetail': { margin: '0', fontStyle: 'normal', color: 'var(--fg-3)', fontSize: 'var(--fs-xs, 12px)', fontFamily: 'var(--mono)' },
  '.cm-completionMatchedText': { textDecoration: 'none', fontWeight: '650' },
});

const hl = HighlightStyle.define([
  { tag: t.heading, color: 'var(--fg)', fontWeight: '650' },
  { tag: t.strong, fontWeight: '650' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.processingInstruction, color: 'var(--fg-3)' },
  { tag: t.url, color: 'var(--fg-3)' },
  { tag: t.link, color: 'var(--accent)' },
  { tag: t.quote, color: 'var(--fg-2)' },
  { tag: t.contentSeparator, color: 'var(--fg-3)' },
  { tag: t.monospace, color: 'var(--fg-2)' },
  { tag: inlineCode, color: 'var(--fg)', background: 'var(--well)', borderRadius: '4px', padding: '0 3px' },
]);

export const theme = [base, syntaxHighlighting(hl)];
