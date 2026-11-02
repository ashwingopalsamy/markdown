// md Local: the pattern runs here, so one that never finishes costs this worker and not the page. The page ends it after a time limit.
import { each, scan } from '../search';
import { build, expand, type Opt } from './rx';

/** Marks beyond this many are not drawn. */
const MARKS = 5000;

/** `swap` absent: find. `swap` present: the edits that replace, all of them or, with `from`, the first match at or after it. */
export interface Job {
  text: string;
  q: string;
  opt: Opt;
  swap?: string;
  from?: number;
}
export interface Edit {
  from: number;
  to: number;
  insert: string;
}
export type Reply = { error: string } | { hits: Hit[]; more: boolean } | { edits: Edit[] };
type Hit = ReturnType<typeof scan>['hits'][number];

self.onmessage = ({ data: { text, q, opt, swap, from } }: MessageEvent<Job>) => {
  try {
    const rx = build(q, opt);
    if (swap === undefined) return postMessage(scan(text, rx, MARKS) satisfies Reply);
    const edits: Edit[] = [];
    rx.lastIndex = from ?? 0;
    for (const m of each(text, rx)) {
      edits.push({ from: m.index, to: m.index + m[0].length, insert: expand(m, swap) });
      if (from !== undefined) break;
    }
    postMessage({ edits } satisfies Reply);
  } catch (e) {
    // the engine's reason alone, without its echo of the pattern and flags
    postMessage({ error: (e instanceof Error ? e.message : String(e)).replace(/^Invalid regular expression: \/.*\/\w*: /s, '') } satisfies Reply);
  }
};
