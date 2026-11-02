import { StateEffect, StateField, RangeSetBuilder } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { LEAST, pattern } from '../search';

// The header's field owns the query; the editor only draws its matches in the part of the document on screen.
export const setFind = StateEffect.define<string>();
export const findTerm = StateField.define<string>({
  create: () => '',
  update(v, tr) {
    for (const e of tr.effects) if (e.is(setFind)) v = e.value;
    return v;
  },
});

// md Local: the matches the worker found, as from/to pairs. They move with the text until the next result arrives.
export const setMarks = __LOCAL__ ? StateEffect.define<number[]>() : undefined;
export const findHits = __LOCAL__
  ? StateField.define<number[]>({
      create: () => [],
      update(v, tr) {
        for (const e of tr.effects) if (e.is(setMarks!)) return e.value;
        return tr.docChanged ? v.map((p, i) => tr.changes.mapPos(p, i % 2 ? -1 : 1)) : v;
      },
    })
  : undefined;

const hit = Decoration.mark({ class: 'cm-searchMatch' });
const chosen = Decoration.mark({ class: 'cm-searchMatch cm-searchMatch-selected' });

function drawHits(view: EditorView): DecorationSet {
  const m = view.state.field(findHits!);
  const out = new RangeSetBuilder<Decoration>();
  const main = view.state.selection.main;
  const { from, to } = view.viewport;
  // a match that lost its text, or never had any, has nothing to colour
  for (let i = 0; i < m.length; i += 2) if (m[i] < m[i + 1] && m[i + 1] >= from && m[i] <= to) out.add(m[i], m[i + 1], m[i] === main.from && m[i + 1] === main.to ? chosen : hit);
  return out.finish();
}

function draw(view: EditorView): DecorationSet {
  if (__LOCAL__) return drawHits(view);
  const term = view.state.field(findTerm).trim();
  if (term.length < LEAST) return Decoration.none;
  const out = new RangeSetBuilder<Decoration>();
  const main = view.state.selection.main;
  const rx = pattern(term);
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    rx.lastIndex = 0;
    for (let m = rx.exec(text); m; m = rx.exec(text)) {
      const a = from + m.index;
      const b = a + m[0].length;
      out.add(a, b, a === main.from && b === main.to ? chosen : hit);
    }
  }
  return out.finish();
}

const marks = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = draw(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged || u.state.field(findTerm) !== u.startState.field(findTerm) || (__LOCAL__ && u.state.field(findHits!) !== u.startState.field(findHits!))) this.decorations = draw(u.view);
    }
  },
  { decorations: (p) => p.decorations },
);

export const findMarks = [findTerm, ...(__LOCAL__ ? [findHits!] : []), marks];
