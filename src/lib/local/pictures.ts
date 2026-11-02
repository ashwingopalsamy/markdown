// md Local: pictures that sit beside the document (docs/local.md, Pictures and links). The sanitizer leaves a relative picture as a chip that
// remembers its path; this runs after it, in trusted code, and swaps the chip for an <img> whose address it made itself.
import { api } from '../store/server';
import { current } from '../app.svelte';
import { REL } from '../render/sanitize';

/** A path as the document wrote it, without its query or fragment, in plain characters. */
export const plain = (href: string) => {
  const p = href.replace(/[?#].*$/, '');
  try { return decodeURIComponent(p); } catch { return p; }
};

const blobs = new Map<string, Promise<Blob | null>>();
const shown = new Map<HTMLImageElement, string>();
const blobs2 = new WeakMap<HTMLImageElement, Blob>();
/** The file a picture was made from, for saving it as it is. */
export const blobOf = (i: HTMLImageElement) => blobs2.get(i);

const fetchBlob = (id: string, rel: string) => {
  const key = `${id}\0${rel}`;
  let got = blobs.get(key);
  if (!got) {
    got = api(`/api/doc/${id}/asset?p=${encodeURIComponent(rel)}`).then((r) => (r.ok ? r.blob() : null), () => null);
    if (blobs.size > 64) blobs.delete(blobs.keys().next().value!);
    blobs.set(key, got);
    // a picture that failed is asked for again next time
    got.then((b) => b || blobs.delete(key));
  }
  return got;
};

/** Forgets what was fetched: the files may have changed. */
export const forget = () => blobs.clear();

/** Lets go of the address of every picture that is no longer on the page. */
export function sweep() {
  for (const [img, url] of shown) {
    if (img.isConnected) continue;
    URL.revokeObjectURL(url);
    shown.delete(img);
  }
}

/** A .drawio file is not a picture the browser can show: it becomes the same figure a drawio fence makes, and `figure` draws it. */
function sheet(text: string) {
  const fig = document.createElement('figure');
  fig.className = 'mermaid';
  const code = document.createElement('code');
  code.className = 'language-drawio';
  code.textContent = text;
  const pre = document.createElement('pre');
  pre.append(code);
  fig.append(pre);
  return fig;
}

export function draw(els: HTMLElement[], alive: () => boolean, figure: (fig: HTMLElement) => void): Promise<void> {
  const id = current()?.id;
  const all: Promise<void>[] = [];
  if (!id) return Promise.resolve();
  for (const el of els) {
    for (const chip of [...(el.matches(`.rimg[${REL}]`) ? [el] : []), ...el.querySelectorAll<HTMLElement>(`.rimg[${REL}]`)]) {
      const raw = chip.getAttribute(REL)!;
      const rel = plain(raw);
      const alt = chip.textContent!.replace(/(?: · )?image not shown$/, '');
      all.push(fetchBlob(id, rel).then(async (blob) => {
        if (!alive() || !chip.isConnected || current()?.id !== id) return;
        if (!blob) {
          // the chip stays, and now says which file it could not show
          chip.textContent = `${alt ? alt + ' · ' : ''}${rel} not shown`;
          chip.removeAttribute(REL);
          return;
        }
        if (/\.drawio$/i.test(rel)) {
          const fig = sheet(await blob.text());
          if (!alive() || !chip.isConnected) return;
          chip.replaceWith(fig);
          figure(fig);
          return;
        }
        const img = new Image();
        const url = URL.createObjectURL(blob);
        img.alt = alt;
        img.loading = 'lazy';
        img.decoding = 'async';
        img.onerror = () => {
          chip.textContent = `${alt ? alt + ' · ' : ''}${rel} not shown`;
          img.replaceWith(chip);
        };
        img.src = url;
        shown.set(img, url);
        chip.replaceWith(img);
        img.dataset.type = blob.type;
        blobs2.set(img, blob);
        img.dispatchEvent(new CustomEvent('md-figure', { bubbles: true }));
      }));
    }
  }
  return Promise.all(all).then(() => {});
}
