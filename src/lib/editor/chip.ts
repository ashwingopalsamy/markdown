import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

class Chip extends WidgetType {
  constructor(readonly label: string) { super(); }
  eq(o: Chip) { return o.label === this.label; }
  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-dchip';
    s.textContent = this.label;
    return s;
  }
}

// Linear, no backtracking: runs of non-delimiters after the comma.
const RE = /data:image\/[\w.+-]+(?:;[\w=.+-]+)*,[^\s)\]"'<>]+/g;

const size = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`);

function build(view: EditorView): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.sliceDoc(from, to);
    // cheap precheck so ordinary text never runs the regex
    if (!text.includes('data:image/')) continue;
    for (const m of text.matchAll(RE)) {
      if (m[0].length <= 200) continue;
      const head = m[0].slice(0, m[0].indexOf(',') + 1);
      const payload = m[0].length - head.length;
      const bytes = /;base64,$/.test(head) ? Math.floor(payload * 0.75) : payload;
      const s = from + m.index!;
      b.add(s, s + m[0].length, Decoration.replace({ widget: new Chip(`picture · ${size(bytes)}`) }));
    }
  }
  return b.finish();
}

const plugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(v: EditorView) { this.decorations = build(v); }
  update(u: ViewUpdate) { if (u.docChanged || u.viewportChanged) this.decorations = build(u.view); }
}, {
  decorations: (p) => p.decorations,
  provide: (p) => EditorView.atomicRanges.of((v) => v.plugin(p)?.decorations ?? Decoration.none),
});

export const dataChips = plugin;
