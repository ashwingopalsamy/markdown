// md Local: a query and its three options as one regular expression, and the replacement text of one match.
export interface Opt {
  case: boolean;
  word: boolean;
  regex: boolean;
}

const WORD = '[\\p{L}\\p{N}_]';

/** Throws the engine's own message when the pattern is not valid. */
export function build(q: string, o: Opt): RegExp {
  const flags = o.case ? 'gmu' : 'gimu';
  const src = o.regex ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp(src, flags);
  // a word is bounded by anything that is not a letter, digit or underscore; \b would see only ASCII
  return o.word ? new RegExp(`(?<!${WORD})(?:${src})(?!${WORD})`, flags) : rx;
}

/** What String.replace would put for this match: $$, $&, $`, $', $1 to $99 and $<name>. */
export function expand(m: RegExpExecArray, swap: string): string {
  const n = m.length - 1;
  return swap.replace(/\$(\$|&|`|'|\d\d?|<[^>]*>)/g, (all, t: string) => {
    if (t === '$') return '$';
    if (t === '&') return m[0];
    if (t === '`') return m.input.slice(0, m.index);
    if (t === "'") return m.input.slice(m.index + m[0].length);
    if (t[0] === '<') return m.groups ? (m.groups[t.slice(1, -1)] ?? '') : all;
    // two digits count only when that group exists; otherwise the first digit is the group and the second is text
    if (t.length === 2 && +t >= 1 && +t <= n) return m[+t] ?? '';
    const one = +t[0];
    return one >= 1 && one <= n ? (m[one] ?? '') + t.slice(1) : all;
  });
}
