// draw.io (docs/local.md, Diagram engines). The viewer runs in one sandboxed frame, made on the first drawing: one render at a time, 20 s each,
// and a frame that does not answer is removed and made again. Its SVG has foreignObject for HTML labels, which the sanitizer would strip, so it is shown only
// as <img src="data:image/svg+xml,…">, where scripts do not run and nothing is fetched. It is cleaned once more, because the same SVG is what gets downloaded.

const LIMIT = 20_000;
const BOOT = 8_000;
const TRIES = 3;
const FRAME = '/engine/drawio.html';
const STENCILS = '/engine/stencils/';
const SOURCE_MAX = 4_000_000;
const SVG_MAX = 30_000_000;
const SET = /^[\w-]{1,40}(?:\/[\w-]{1,40})*$/;
const FETCH = /@import|expression|javascript|url\s*\(\s*(?!['"]?#)/i;
const GONE = /^(?:script|iframe|object|embed|link|meta|base|audio|video|set|animate\w*)$/;

let frame: HTMLIFrameElement | null = null;
let up: Promise<void> | null = null;
let turn: Promise<unknown> = Promise.resolve();
let count = 0;
type Reply = { id?: number; svg?: string; err?: string; need?: string[]; ready?: boolean };
let waiting: ((m: Reply) => void) | null = null;
// the stencil sets this frame holds, and the ones this edition does not have (not asked for twice)
let held = new Set<string>();
const absent = new Set<string>();
const drawn = new Map<string, string>();

/** Only what the current frame sent, in the shape it sends. */
function onMessage(e: MessageEvent) {
  const m = e.data;
  if (!frame || e.source !== frame.contentWindow || !m || typeof m !== 'object') return;
  const ok = typeof m.id === 'number' && (typeof m.svg === 'string' || typeof m.err === 'string') && Array.isArray(m.need) && m.need.length <= 32 && m.need.every((n: unknown) => typeof n === 'string' && SET.test(n));
  if (m.ready === true || ok) waiting?.(m);
}
addEventListener('message', onMessage);

function drop() {
  frame?.remove();
  frame = waiting = null;
  held = new Set();
}

/** The frame's next message that `ok` accepts, or a rejection when `ms` pass. */
function next(ok: (m: Reply) => boolean, ms: number): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    waiting = (m) => {
      if (!ok(m)) return;
      clearTimeout(timer);
      waiting = null;
      resolve(m);
    };
  });
}

/** A frame that has said it is ready. The viewer measures its labels, so the frame has a size and a place, off the screen; display:none would give every label no width. */
async function boot() {
  for (let n = 1; ; n++) {
    const f = document.createElement('iframe');
    f.setAttribute('sandbox', 'allow-scripts');
    f.setAttribute('aria-hidden', 'true');
    f.tabIndex = -1;
    f.style.cssText = 'position:fixed;left:-10000px;top:0;width:1100px;height:800px;border:0;visibility:hidden;pointer-events:none';
    frame = f;
    const ready = next((m) => m.ready === true, BOOT);
    f.src = FRAME;
    document.body.append(f);
    try {
      return void (await ready);
    } catch {
      drop();
      if (n === TRIES) throw new Error('draw.io did not start.');
    }
  }
}

/** One ask of the frame: a reply, or a rejection that has removed the frame. */
async function ask(xml: string, stencils?: Record<string, string>) {
  const id = ++count;
  const answer = next((m) => m.id === id, LIMIT);
  frame!.contentWindow!.postMessage({ id, xml, stencils }, '*');
  try {
    return await answer;
  } catch {
    // the frame is removed, which stops it; the next drawing makes a new one
    drop();
    up = null;
    throw new Error(`draw.io took longer than ${LIMIT / 1000} seconds and was stopped.`);
  }
}

/** A stencil set from this site, as the module the build made from it (an import is governed by script-src, so connect-src stays closed), or null when there is none. */
async function fetchSet(name: string) {
  try {
    const m = await import(/* @vite-ignore */ `${STENCILS}${name}.js`);
    return typeof m.default === 'string' && /^\s*<shapes[\s>]/.test(m.default) ? m.default : null;
  } catch {
    return null;
  }
}

/** The frame's SVG with nothing in it that runs or fetches, as one string. */
function clean(svg: string) {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg') throw new Error('This diagram could not be drawn.');
  for (const el of [...doc.querySelectorAll('*')]) {
    if (GONE.test(el.localName) || (el.localName === 'style' && FETCH.test(el.textContent ?? ''))) {
      el.remove();
      continue;
    }
    for (const a of [...el.attributes]) {
      const link = /^(?:xlink:)?href$|^(?:src|action|formaction)$/i.test(a.name);
      if (/^on/i.test(a.name) || (link ? !/^(?:#|data:image\/)/i.test(a.value.trim()) : a.name === 'style' ? FETCH.test(a.value) : /url\s*\(\s*(?!['"]?#)/i.test(a.value))) el.removeAttribute(a.name);
    }
  }
  return new XMLSerializer().serializeToString(doc.documentElement);
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/**
 * One drawing as the markup for the page's figure (an <img> and, when sets are missing, a note), or null when `alive` said no by the time its turn came. The picture is always the light one;
 * the page shows it on a light surface. Stencils load in two passes: the first ask names the sets it needs, the page fetches them, the second draws with them.
 */
export function render(source: string, alive: () => boolean = () => true): Promise<string | null> {
  const run = turn.then(async () => {
    if (!alive()) return null;
    if (source.length > SOURCE_MAX) throw new Error('This diagram is too large to draw.');
    if (!/<(?:mxfile|mxGraphModel)[\s>]/.test(source)) throw new Error('This is not a draw.io diagram.');
    const cached = drawn.get(source);
    if (cached) return cached;
    await (up ??= boot().catch((e) => ((up = null), Promise.reject(e))));
    if (!alive()) return null;
    let m = await ask(source);
    const want = (m.need ?? []).filter((n) => !held.has(n) && !absent.has(n));
    if (want.length) {
      const sets: Record<string, string> = {};
      await Promise.all(
        want.map(async (n) => {
          const text = await fetchSet(n);
          if (text === null) absent.add(n);
          else sets[n] = text;
        }),
      );
      if (!alive()) return null;
      if (Object.keys(sets).length) {
        const was = frame;
        m = await ask(source, sets);
        if (frame === was) for (const n of Object.keys(sets)) held.add(n);
      }
    }
    if (m.err !== undefined) throw new Error(m.err.split('\n')[0] || 'This diagram could not be drawn.');
    if (m.svg!.length > SVG_MAX || !/^<svg[\s>]/.test(m.svg!)) throw new Error('This diagram could not be drawn.');
    const uri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(clean(m.svg!));
    const missing = m.need ?? [];
    const out = `<img class="drawio" alt="Diagram" src="${uri}">${missing.length ? `<p class="drawio-note">Some shapes are not in the sets md has: ${esc(missing.join(', '))}</p>` : ''}`;
    if (drawn.size >= 16) drawn.delete(drawn.keys().next().value!);
    drawn.set(source, out);
    return out;
  });
  turn = run.catch(() => {});
  return run;
}
