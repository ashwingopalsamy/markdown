// What a drawing or a picture can do once it is on the page (docs/local.md, Raster export). A drawing starts from one seam: it gives an SVG,
// and zoom, copy and download work from that alone. Mermaid and PlantUML give an inline <svg>; draw.io gives an <img> holding an SVG address.
// A picture is the <img> itself: a raster is drawn from it as it is, an SVG one is saved as it is.
import { mount, tick, unmount } from 'svelte';
import { current, remember, say, stored } from '../app.svelte';
import { drawFig, kindOf } from '../render/engines';
import { download } from '../store/files';
import { ui } from '../ui/ui.svelte';
import FigureBar from './FigureBar.svelte';
import FigureCard from './FigureCard.svelte';

export type Fmt = 'png' | 'jpeg' | 'webp' | 'svg';
export type Size = '1' | '2' | '3' | '4' | 'px';
export type Bg = 'clear' | 'white' | 'page';
export interface Opts {
  fmt: Fmt;
  size: Size;
  px: number;
  bg: Bg;
}

const KEY = 'md-diagram';
const DRAWINGS = 'figure.mermaid';
const SVG_NS = 'http://www.w3.org/2000/svg';
// the page's fonts are not in a picture: the stack is one every machine has
const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
// what a canvas can hold in Chrome: 16384 on a side and 268M pixels in all
const SIDE = 16384;
const AREA = 268_000_000;
const SVG_PROPS = ['fill', 'stroke', 'color', 'fill-opacity', 'stroke-opacity', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'display', 'visibility'];
const HTML_PROPS = ['color', 'font-size', 'font-weight', 'font-style', 'line-height', 'text-align', 'white-space', 'display', 'max-width', 'opacity', 'visibility'];

const first = (): Opts => ({ fmt: 'png', size: '2', px: 1600, bg: 'page' });
function load(): Opts {
  const o = first();
  try {
    const s = JSON.parse(stored(KEY) ?? '{}');
    if (['png', 'jpeg', 'webp', 'svg'].includes(s.fmt)) o.fmt = s.fmt;
    if (['1', '2', '3', '4', 'px'].includes(s.size)) o.size = s.size;
    if (Number.isFinite(s.px) && s.px > 0) o.px = s.px;
    if (['clear', 'white', 'page'].includes(s.bg)) o.bg = s.bg;
  } catch {}
  return o;
}

/** The last choice, kept for next time. */
export const prefs = $state(load());
export const keep = () => remember(KEY, JSON.stringify(prefs));

/** The drawing the card or the zoom is about. */
export const dl = $state({ fig: null as HTMLElement | null, vector: true, anchor: null as HTMLElement | null, opener: null as HTMLElement | null, w: 0, h: 0, err: '', note: '', zoom: '' });

export const canWebp = () => {
  try {
    return document.createElement('canvas').toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    return false;
  }
};
/** What is made: the chosen format, or PNG where this target or this browser cannot give it. */
export const fmtOf = (o: Opts, vector: boolean): Fmt => (o.fmt === 'svg' ? (vector ? 'svg' : 'png') : o.fmt === 'webp' && !canWebp() ? 'png' : o.fmt);
const MIME = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' } as const;
const EXT = { png: 'png', jpeg: 'jpg', webp: 'webp' } as const;
const SVG_URL = /^data:image\/svg\+xml(;[^,]*)?,([^]*)$/;

const isPicture = (el: Element): el is HTMLImageElement => el instanceof HTMLImageElement;
/** A drawing is always vector; a picture is when it is an SVG. */
export const isVector = (el: Element) => !isPicture(el) || el.src.startsWith('data:image/svg+xml') || el.dataset.type === 'image/svg+xml';

/** JPEG has no transparency, so it falls back to white. */
export const bgOf = (o: Opts): Bg => (o.fmt === 'jpeg' && o.bg === 'clear' ? 'white' : o.bg);

/** The size of the picture, and whether the canvas cannot hold what was asked for. Null when the width is not a number. */
export function plan(w: number, h: number, o: Opts) {
  const f = o.size === 'px' ? o.px / w : +o.size;
  if (!(f > 0) || !(w > 0) || !(h > 0)) return null;
  let W = Math.max(1, Math.round(w * f));
  let H = Math.max(1, Math.round(h * f));
  const k = Math.min(1, SIDE / W, SIDE / H, Math.sqrt(AREA / (W * H)));
  const capped = k < 1;
  if (capped) (W = Math.max(1, Math.floor(W * k)), (H = Math.max(1, Math.floor(H * k))));
  return { W, H, capped };
}

/** The drawing as an element. `live` is the one on the page, whose computed styles the copy takes. */
type Src = { root: SVGSVGElement; live?: SVGSVGElement };
function svgOf(fig: Element): Src | null {
  const box = fig.querySelector('.mermaid-svg');
  const live = box?.querySelector('svg');
  if (live) return { root: live.cloneNode(true) as SVGSVGElement, live };
  const m = /^data:image\/svg\+xml(;[^,]*)?,([^]*)$/.exec(box?.querySelector('img')?.getAttribute('src') ?? '');
  if (!m) return null;
  const text = /;base64/.test(m[1] ?? '') ? new TextDecoder().decode(Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0))) : decodeURIComponent(m[2]);
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  return doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg' ? null : { root: doc.documentElement as unknown as SVGSVGElement };
}

function natural(root: SVGSVGElement, live?: SVGSVGElement): [number, number] {
  const vb = root.viewBox.baseVal;
  if (vb?.width > 0 && vb.height > 0) return [vb.width, vb.height];
  const r = live?.getBoundingClientRect();
  if (r && r.width > 0 && r.height > 0) return [r.width, r.height];
  const w = parseFloat(root.getAttribute('width') ?? '');
  const h = parseFloat(root.getAttribute('height') ?? '');
  if (w > 0 && h > 0) return [w, h];
  throw new Error('This drawing has no size to draw from.');
}

/** What the page paints behind a drawing: the first background on the way up. */
function behind(el: Element) {
  for (let n: Element | null = el; n; n = n.parentElement) {
    const c = getComputedStyle(n).backgroundColor;
    if (c && c !== 'transparent' && !/rgba\(.*, 0\)$/.test(c)) return c;
  }
  return getComputedStyle(document.documentElement).getPropertyValue('--paper').trim() || '#fff';
}
// a draw.io drawing is light on its own surface, so the page's colour is not what it sits on
const paint = (fig: Element, bg: Bg) => (bg === 'white' || (bg === 'page' && fig.querySelector('img.drawio')) ? '#ffffff' : bg === 'page' ? behind(fig) : null);

/** A copy of the drawing that needs nothing from the page: what the page's styles and variables resolve to is written onto each element. */
function prepare(src: Src | null, bg: string | null) {
  if (!src) throw new Error('There is no drawing here to save.');
  const { root, live } = src;
  const [w, h] = natural(root, live);
  if (live) {
    const from = [live, ...live.querySelectorAll('*')];
    const to = [root, ...root.querySelectorAll('*')];
    from.forEach((el, i) => {
      const copy = to[i] as SVGElement | undefined;
      if (!copy?.style || /^(?:style|title|desc|metadata|script)$/.test(el.localName)) return;
      const cs = getComputedStyle(el);
      for (const p of el.namespaceURI === SVG_NS ? SVG_PROPS : HTML_PROPS) {
        const v = cs.getPropertyValue(p);
        // a reference such as url(#arrow) would point at the page, not at the picture
        if (v && !v.startsWith('url(')) copy.style.setProperty(p, v);
      }
      copy.style.setProperty('font-family', /mono|courier|menlo|consolas/i.test(cs.fontFamily) ? MONO : SANS);
    });
  }
  root.setAttribute('width', String(w));
  root.setAttribute('height', String(h));
  root.style.removeProperty('max-width');
  root.style.setProperty('background', 'none');
  if (!root.getAttribute('viewBox')) root.setAttribute('viewBox', `0 0 ${w} ${h}`);
  if (bg) {
    const vb = root.viewBox.baseVal;
    const rect = document.createElementNS(SVG_NS, 'rect');
    for (const [k, v] of Object.entries({ x: vb.x, y: vb.y, width: w, height: h, fill: bg })) rect.setAttribute(k, String(v));
    root.prepend(rect);
  }
  return { xml: '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(root), w, h };
}

/** A drawing made for a light page, or null when it cannot give one. Mermaid and PlantUML are drawn again from their source. A draw.io drawing is already the light one, so `pick` uses it as it is. */
const lightOf = (fig: Element) => {
  const pre = fig.querySelector('pre');
  const text = pre?.textContent;
  if (!text || pre?.querySelector('code.language-drawio')) return Promise.resolve(null);
  return drawFig(kindOf(pre!), text, false).catch(() => null);
};

/** What to export: the drawing as the page shows it, except on white from a dark page, where light text would vanish and the light drawing is used. */
async function pick(fig: Element, o: Opts) {
  if (document.documentElement.dataset.theme !== 'dark' || bgOf(o) !== 'white' || fig.querySelector('img.drawio')) return { src: svgOf(fig), note: '', done() {} };
  const svg = await lightOf(fig);
  if (!svg) return { src: svgOf(fig), note: 'No light version of this drawing, so it is saved as shown.', done() {} };
  // off the screen but in the page, so its styles can be read like any drawing's
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-99999px;top:0';
  host.innerHTML = svg;
  document.body.append(host);
  const live = host.querySelector('svg') as SVGSVGElement | null;
  return { src: live && { root: live.cloneNode(true) as SVGSVGElement, live }, note: '', done: () => host.remove() };
}

const address = (xml: string) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);

/** The file name: the document, the word diagram, the drawing's place among the document's drawings. */
function nameFor(fig: Element, ext: string) {
  const doc = (current()?.name ?? '').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|\x00-\x1f]+/g, '-').trim() || 'untitled';
  if (isPicture(fig)) return `${doc}-picture-${([...(fig.closest('.md') ?? document).querySelectorAll('img:not(.drawio)')].indexOf(fig) + 1) || 1}.${ext}`;
  const n = [...(fig.closest('.md') ?? document).querySelectorAll(DRAWINGS)].indexOf(fig) + 1;
  return `${doc}-diagram-${n || 1}.${ext}`;
}

export const reason = (e: unknown) => (e instanceof Error ? e.message : String(e)).split('\n')[0] || 'That did not work.';

/** A canvas of `w` × `h` at the chosen size, painted from `src`, written out as a raster. */
async function raster(src: CanvasImageSource, w: number, h: number, o: Opts, fmt: keyof typeof MIME, fill: string | null) {
  const p = plan(w, h, o);
  if (!p) throw new Error('Enter a width in pixels.');
  const canvas = document.createElement('canvas');
  canvas.width = p.W;
  canvas.height = p.H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(`The browser cannot make a picture ${p.W} × ${p.H} px. Try a smaller size.`);
  if (fill) (ctx.fillStyle = fill), ctx.fillRect(0, 0, p.W, p.H);
  ctx.drawImage(src, 0, 0, p.W, p.H);
  let blob: Blob | null;
  try {
    blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, MIME[fmt], 0.92));
  } catch {
    throw new Error('The browser would not let the page read the picture back (it treated the drawing as from another site).');
  }
  if (!blob || blob.type !== MIME[fmt]) throw new Error(`The browser could not write a ${fmt === 'jpeg' ? 'JPEG' : fmt.toUpperCase()} this size. Try a smaller one.`);
  return blob;
}

/** A picture as the document has it: the bytes of an SVG address, or the file a local picture was made from. */
async function original(img: HTMLImageElement) {
  const m = SVG_URL.exec(img.currentSrc || img.src);
  if (m) return new Blob([/;base64/.test(m[1] ?? '') ? Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0)) : new TextEncoder().encode(decodeURIComponent(m[2]))], { type: 'image/svg+xml' });
  const b = __LOCAL__ ? await import('../local/pictures').then((p) => p.blobOf(img)) : undefined;
  if (!b) throw new Error('This picture is not here to save.');
  return b;
}

/** The target in the format chosen. A failure says what failed. */
export async function make(fig: HTMLElement, o: Opts) {
  const fmt = fmtOf(o, isVector(fig));
  const bg = bgOf({ ...o, fmt });
  if (isPicture(fig)) {
    if (fmt === 'svg') return { blob: await original(fig), name: nameFor(fig, 'svg'), note: '' };
    const w = fig.naturalWidth;
    const h = fig.naturalHeight;
    if (!(w > 0 && h > 0)) throw new Error('This picture has no size to draw from.');
    return { blob: await raster(fig, w, h, o, fmt as keyof typeof MIME, paint(fig, bg)), name: nameFor(fig, EXT[fmt as keyof typeof EXT]), note: '' };
  }
  const { src, note, done } = await pick(fig, { ...o, fmt });
  let ready: ReturnType<typeof prepare>;
  try {
    ready = prepare(src, fmt === 'svg' ? paint(fig, bg) : null);
  } finally {
    done();
  }
  const { xml, w, h } = ready;
  if (fmt === 'svg') return { blob: new Blob([xml], { type: 'image/svg+xml' }), name: nameFor(fig, 'svg'), note };
  if (!plan(w, h, o)) throw new Error('Enter a width in pixels.');
  // always from a data: address; a blob: SVG with foreignObject taints the canvas in Chrome
  const img = new Image();
  img.src = address(xml);
  try {
    await img.decode();
  } catch {
    throw new Error('The browser could not read this drawing as a picture.');
  }
  return { blob: await raster(img, w, h, o, fmt as keyof typeof MIME, paint(fig, bg)), name: nameFor(fig, EXT[fmt as keyof typeof EXT]), note };
}

export async function save(fig: HTMLElement, o: Opts) {
  const { blob, name, note } = await make(fig, o);
  download(name, blob);
  return note;
}

/** PNG on the clipboard, at the last size and background chosen. The picture is handed over as a promise, so the click still counts as the gesture. */
export async function copy(fig: HTMLElement) {
  try {
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) throw new Error('This browser cannot copy pictures.');
    let note = '';
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': make(fig, { ...prefs, fmt: 'png' }).then((m) => ((note = m.note), m.blob)) })]);
    if (note) say(note);
    return true;
  } catch (e) {
    say(`Could not copy the image. ${reason(e)}`);
    return false;
  }
}

// the one card and the zoom live in a component made when first asked for
let host: Record<string, unknown> | undefined;
const ready = () => (host ??= mount(FigureCard, { target: document.body }));

export async function zoom(fig: HTMLElement, opener: HTMLElement) {
  try {
    ready();
    dl.opener = opener;
    dl.zoom = isPicture(fig) ? fig.currentSrc || fig.src : address(prepare(svgOf(fig), null).xml);
  } catch (e) {
    say(`Could not open the drawing. ${reason(e)}`);
  }
}

export async function card(fig: HTMLElement, anchor: HTMLElement) {
  const was = ui.pop === 'diagram';
  if (was) ui.pop = null;
  if (was && dl.anchor === anchor) return;
  dl.fig = fig;
  dl.anchor = anchor;
  dl.err = '';
  dl.note = '';
  dl.vector = isVector(fig);
  try {
    if (isPicture(fig)) [dl.w, dl.h] = [fig.naturalWidth, fig.naturalHeight];
    else {
      const src = svgOf(fig);
      if (!src) throw new Error('There is no drawing here to save.');
      [dl.w, dl.h] = natural(src.root, src.live);
    }
  } catch (e) {
    dl.err = reason(e);
  }
  ready();
  if (was) await tick();
  ui.pop = 'diagram';
}

const bars = new Map<HTMLElement, Record<string, unknown>>();

/** Puts the bar on a drawing or a picture, once. A bar whose target has left the page is let go. */
function bar(host: HTMLElement, fig: HTMLElement) {
  for (const [f, c] of bars) if (!f.isConnected) (unmount(c), bars.delete(f));
  if (bars.has(fig) && host.querySelector(':scope > .fig-bar')) return;
  host.querySelector(':scope > .fig-bar')?.remove();
  const box = document.createElement('div');
  box.className = 'fig-bar';
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', isPicture(fig) ? 'Picture tools' : 'Diagram tools');
  host.append(box);
  bars.set(fig, mount(FigureBar, { target: box, props: { fig, zoom, copy, card, shown: (b) => ui.pop === 'diagram' && dl.anchor === b } }));
}

/** What the page's `md-figure` event names: a drawing, or a picture, which gets a box of its own to hang the bar on. */
export function attach(t: HTMLElement) {
  if (!isPicture(t)) return t.matches(DRAWINGS) ? bar(t, t) : undefined;
  if (t.closest('figure.mermaid, .drawio')) return;
  const wrap = t.parentElement?.classList.contains('fig-pic') ? t.parentElement : null;
  if (wrap) return (bar(wrap, t), small(wrap, t));
  const box = document.createElement('span');
  box.className = 'fig-pic';
  t.replaceWith(box);
  box.append(t);
  bar(box, t);
  small(box, t);
}
// three 28px buttons do not fit on less than this
const small = (box: HTMLElement, img: HTMLImageElement) => {
  const mark = () => box.classList.toggle('small', img.clientWidth < 120 || img.clientHeight < 56);
  img.complete ? mark() : img.addEventListener('load', mark, { once: true });
};
