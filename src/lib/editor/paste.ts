import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

export const MAX_IMAGE = 8 * 1024 * 1024;

const isImages = (files: FileList | undefined | null): files is FileList =>
  !!files && files.length > 0 && [...files].every((f) => f.type.startsWith('image/'));

const read = (f: File) => new Promise<string | null>((ok) => {
  const r = new FileReader();
  r.onload = () => ok(typeof r.result === 'string' ? r.result : null);
  r.onerror = () => ok(null);
  r.readAsDataURL(f);
});

async function insertImages(view: EditorView, files: File[], at: number | null, onImage: (f: File) => Promise<string | null>, alive: () => boolean) {
  const found: { name: string; data: string }[] = [];
  for (const f of files) {
    // "" from the shell means "accept as is"; a string replaces the data; null refuses
    const r = await onImage(f);
    if (r === null) continue;
    const data = r || (f.size <= MAX_IMAGE ? await read(f) : null);
    if (data) found.push({ name: f.name.replace(/\.[^.]+$/, '').replace(/[\[\]\n\r]/g, ' ').trim() || 'picture', data });
  }
  if (!found.length || !alive()) return;

  const doc = view.state.doc;
  // ids must be unique within this document, including ones already used
  const text = doc.toString();
  let n = 0;
  for (const m of text.matchAll(/\[img-(\d+)\]/g)) n = Math.max(n, +m[1]);
  const refs: string[] = [];
  let defs = '';
  const last = doc.line(doc.lines).text;
  let sep = !doc.length ? '' : last === '' ? (doc.lines > 1 && doc.line(doc.lines - 1).text === '' ? '' : '\n') : /^\[img-\d+\]:/.test(last) ? '\n' : '\n\n';
  for (const { name, data } of found) {
    const id = `img-${++n}`;
    refs.push(`![${name}][${id}]`);
    defs += `${sep}[${id}]: ${data}`;
    sep = '\n';
  }
  const pos = Math.min(at ?? view.state.selection.main.head, doc.length);
  const ref = refs.join('\n\n');
  view.dispatch({
    changes: [{ from: pos, insert: ref }, { from: doc.length, insert: defs }],
    selection: EditorSelection.cursor(pos + ref.length),
    userEvent: 'input.paste', scrollIntoView: true,
  });
}

export function pasteAndDrop(onImage: (f: File) => Promise<string | null>, docId: () => string | null) {
  const run = (view: EditorView, files: FileList, at: number | null) => {
    const id = docId();
    void insertImages(view, [...files], at, onImage, () => docId() === id);
  };
  return EditorView.domEventHandlers({
    paste(e, view) {
      const cd = e.clipboardData;
      if (!cd) return false;
      if (isImages(cd.files)) { e.preventDefault(); run(view, cd.files, null); return true; }
      const r = view.state.selection.main;
      const url = cd.getData('text/plain').trim();
      if (!r.empty && /^https?:\/\/\S+$/i.test(url) && !view.state.sliceDoc(r.from, r.to).includes('\n')) {
        e.preventDefault();
        const sel = view.state.sliceDoc(r.from, r.to);
        const ins = `[${sel}](${url})`;
        view.dispatch({ changes: { from: r.from, to: r.to, insert: ins }, selection: EditorSelection.cursor(r.from + ins.length), userEvent: 'input.paste', scrollIntoView: true });
        return true;
      }
      return false;
    },
    // Pictures only. Other files must reach the shell (no stopPropagation); returning true just keeps
    // CM's own handler from pasting a dropped file's text into the document.
    drop(e, view) {
      const files = e.dataTransfer?.files;
      if (!files?.length) return false;
      if (!isImages(files)) return true;
      run(view, files, view.posAtCoords({ x: e.clientX, y: e.clientY }));
      return true;
    },
  });
}
