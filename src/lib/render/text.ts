import { escapeHtml } from './lex';

export interface Stats {
  words: number;
  chars: number;
  minutes: number;
}

const FRONT = /^---[ \t]*\r?\n([\s\S]*?\r?\n)?(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;
// what the first line of a real header looks like; a document that opens with a rule is not one
const KEYED = /^\s*(?:#.*\r?\n\s*)*(?:[\w."'-]+[ \t]*:|$)/;

/** The front matter block at the very start of a document, and the body after it. */
export function splitFront(source: string): { raw: string; inner: string; body: string } | null {
  if (!source.startsWith('---')) return null;
  const m = FRONT.exec(source);
  if (!m || !KEYED.test(m[1] ?? '')) return null;
  return { raw: m[0], inner: m[1] ?? '', body: source.slice(m[0].length) };
}

const unquote = (v: string) => v.replace(/^(["'])(.*)\1$/, '$2').replace(/^\[(.*)\]$/, '$1');

/** Front matter as a quiet key and value table; text that is not key: value is shown as it is. */
export function frontHtml(inner: string): string {
  const rows: [string, string][] = [];
  for (const line of inner.split(/\r?\n/)) {
    const m = /^([^\s#:][^:]*?)[ \t]*:[ \t]*(.*)$/.exec(line);
    const text = line.trim();
    if (m) rows.push([m[1], unquote(m[2].trim())]);
    else if (rows.length && text && text[0] !== '#') {
      const last = rows[rows.length - 1];
      last[1] += (last[1] ? ', ' : '') + unquote(text.replace(/^-\s+/, ''));
    }
  }
  const box = (body: string) => `<details class="props"><summary>Properties</summary>${body}</details>`;
  if (!rows.length) return inner.trim() ? box(`<pre class="fm">${escapeHtml(inner.trimEnd())}</pre>`) : '';
  const body = rows.map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join('');
  return box(`<table class="fm"><tbody>${body}</tbody></table>`);
}

// a run of letters and digits, or one character of a script written without spaces
const NOSPACE = '\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}';
const WORD = new RegExp(`[${NOSPACE}]|(?![${NOSPACE}])[\\p{L}\\p{N}][^\\s${NOSPACE}]*`, 'gu');

export function statsOf(source: string): Stats {
  let text = splitFront(source)?.body ?? source;
  // pasted pictures are a wall of base64 that is not reading
  if (text.includes('data:')) text = text.replace(/data:[^\s)]{64,}/g, '');
  let words = 0;
  WORD.lastIndex = 0;
  while (WORD.test(text)) words++;
  return { words, chars: text.length, minutes: words ? Math.max(1, Math.round(words / 220)) : 0 };
}
