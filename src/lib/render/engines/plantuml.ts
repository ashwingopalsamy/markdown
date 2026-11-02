// PlantUML (docs/local.md, Diagram engines). @plantuml/core builds its SVG through `document`, so it cannot run in a Worker. It runs in one
// sandboxed frame, made on the first drawing: one render at a time, 20 s each, and a frame that does not answer is removed and made again.
import { INK, palette, type Ink } from '../ink';
import { sanitize } from '../sanitize';

const LIMIT = 20_000;
const BOOT = 6_500;
const TRIES = 3;
const FRAME = '/engine/plantuml.html';

/** On a dark page the drawing gets light lines and text; the background is always clear, so the page and the exports can paint their own. */
const DARK = [
  'skinparam backgroundColor transparent',
  'skinparam shadowing false',
  'skinparam defaultFontColor #e4e4ea',
  'skinparam ArrowColor #a8a8b3',
  'skinparam ArrowFontColor #e4e4ea',
  'skinparam BorderColor #a8a8b3',
  'skinparam LineColor #a8a8b3',
  'skinparam NoteBackgroundColor #3a3a46',
  'skinparam ClassHeaderBackgroundColor #34343f',
  'skinparam SequenceLifeLineBorderColor #a8a8b3',
  'skinparam ActivityStartColor #e4e4ea',
  'skinparam ActivityEndColor #e4e4ea',
  'skinparam ActivityBarColor #e4e4ea',
  '<style>',
  'root { FontColor #e4e4ea; LineColor #a8a8b3 }',
  'element { BackgroundColor #2a2a33 }',
  '</style>',
];
/** The warm palettes' skin, line for line the same as DARK. */
const skinOf = (k: Ink) => [
  'skinparam backgroundColor transparent',
  'skinparam shadowing false',
  `skinparam defaultFontColor ${k.fg}`,
  `skinparam ArrowColor ${k.line}`,
  `skinparam ArrowFontColor ${k.fg}`,
  `skinparam BorderColor ${k.line}`,
  `skinparam LineColor ${k.line}`,
  `skinparam NoteBackgroundColor ${k.note}`,
  `skinparam ClassHeaderBackgroundColor ${k.fill}`,
  `skinparam SequenceLifeLineBorderColor ${k.line}`,
  `skinparam ActivityStartColor ${k.fg}`,
  `skinparam ActivityEndColor ${k.fg}`,
  `skinparam ActivityBarColor ${k.fg}`,
  '<style>',
  `root { FontColor ${k.fg}; LineColor ${k.line} }`,
  `element { BackgroundColor ${k.fill} }`,
  '</style>',
];
const LIGHT = ['skinparam backgroundColor transparent', 'skinparam shadowing false'];

let frame: HTMLIFrameElement | null = null;
let up: Promise<void> | null = null;
let turn: Promise<unknown> = Promise.resolve();
let count = 0;
type Reply = { id?: number; svg?: string; err?: string; ready?: boolean };
let waiting: ((m: Reply) => void) | null = null;

/** Only what the current frame sent, in the shape it sends. */
function onMessage(e: MessageEvent) {
  const m = e.data;
  if (!frame || e.source !== frame.contentWindow || !m || typeof m !== 'object') return;
  if (m.ready === true || (typeof m.id === 'number' && (typeof m.svg === 'string' || typeof m.err === 'string'))) waiting?.(m);
}
addEventListener('message', onMessage);

function drop() {
  frame?.remove();
  frame = waiting = null;
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

/** A frame that has said it is ready. A busy frame that was just removed can hold its process for a few seconds, so a new one that is slow to start is made again. */
async function boot() {
  for (let n = 1; ; n++) {
    const f = document.createElement('iframe');
    f.setAttribute('sandbox', 'allow-scripts');
    f.setAttribute('aria-hidden', 'true');
    f.tabIndex = -1;
    f.style.display = 'none';
    frame = f;
    const ready = next((m) => m.ready === true, BOOT);
    f.src = FRAME;
    document.body.append(f);
    try {
      return void (await ready);
    } catch {
      drop();
      if (n === TRIES) throw new Error('PlantUML did not start.');
    }
  }
}

/** The source as PlantUML wants it: between @startuml and @enduml, with the skin just after the opening line (PlantUML applies it only to what follows). `added` says the opening line was put in. */
function prepare(source: string, skin: string[]) {
  const lines = source.replace(/\s+$/, '').split('\n');
  const first = lines.findIndex((l) => l.trim());
  const added = !/^\s*@start/.test(lines[first] ?? '');
  if (added) lines.unshift('@startuml');
  if (!lines.some((l) => /^\s*@end/.test(l))) lines.push('@enduml');
  lines.splice(added ? 1 : first + 1, 0, ...skin);
  return { text: lines.join('\n'), added };
}

// PlantUML's error drawing names the line it stopped at, counted in the text it was given.
const AT_LINE = /(\[From [^\]\n]*\(line )(\d+)(\) \])/;

/**
 * One drawing as sanitized SVG (dark on a dark page when `live`, light otherwise), or null when `alive` said no by the time its turn came. PlantUML's own error drawings come back as drawings;
 * a frame that fails or runs past the limit rejects with a message.
 */
export function render(source: string, live: boolean, alive: () => boolean = () => true): Promise<string | null> {
  const run = turn.then(async () => {
    if (!alive()) return null;
    await (up ??= boot().catch((e) => ((up = null), Promise.reject(e))));
    if (!alive()) return null;
    const dark = live && document.documentElement.dataset.theme === 'dark';
    const p = palette();
    const ask = async (src: string) => {
      const id = ++count;
      const answer = next((m) => m.id === id, LIMIT);
      frame!.contentWindow!.postMessage({ id, src }, '*');
      try {
        return await answer;
      } catch {
        // the frame is removed, which stops it; the next drawing makes a new one
        drop();
        up = null;
        throw new Error(`PlantUML took longer than ${LIMIT / 1000} seconds and was stopped.`);
      }
    };
    let m = await ask(prepare(source, p ? skinOf(INK[p][dark ? 'dark' : 'light']) : dark ? DARK : LIGHT).text);
    if (m.svg !== undefined && AT_LINE.test(m.svg)) {
      // An error drawing ignores the skin but counts its lines. Drawn again from the person's lines alone, it names their line, and lists only what they wrote.
      const plain = prepare(source, []);
      m = await ask(plain.text);
      if (plain.added && m.svg !== undefined) m.svg = m.svg.replace(AT_LINE, (_, a, n, b) => `${a}${Number(n) - 1}${b}`);
    }
    if (m.err !== undefined) throw new Error(m.err.split('\n')[0] || 'This diagram could not be drawn.');
    return sanitize(m.svg!, 'svg');
  });
  turn = run.catch(() => {});
  return run;
}
