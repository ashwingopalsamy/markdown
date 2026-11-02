// md Local: find with options. Matching runs in a worker with a time limit; one that overruns is ended and rebuilt.
import { current, getEditor, remember, stored } from '../app.svelte';
import { LIMIT, type Hit } from '../search';
import type { Edit, Job, Reply } from './hunt.worker';
import { build, type Opt } from './rx';

export { build };

const SLICE = 250;
const WAIT = 150;

let worker: Worker | undefined;
let drop: (() => void) | null = null;

/** One job at a time. A newer job ends an older one that is still running, and a job that overruns ends its worker. */
function ask(job: Job): Promise<Reply | 'slow' | null> {
  drop?.();
  const mine = (worker ??= new Worker(new URL('./hunt.worker.ts', import.meta.url), { type: 'module' }));
  return new Promise((resolve) => {
    const end = (v: Reply | 'slow' | null, kill: boolean) => {
      clearTimeout(timer);
      drop = mine.onmessage = mine.onerror = null;
      if (kill) (mine.terminate(), worker === mine && (worker = undefined));
      resolve(v);
    };
    const timer = setTimeout(() => end('slow', true), SLICE);
    drop = () => end(null, true);
    mine.onmessage = (e) => end(e.data, false);
    mine.onerror = () => end({ error: 'Search could not start.' }, true);
    mine.postMessage(job);
  });
}

const key = (k: keyof Opt) => `md-find-${k}`;

class Hunt {
  opt = $state<Opt>({ case: stored(key('case')) === '1', word: stored(key('word')) === '1', regex: stored(key('regex')) === '1' });
  found = $state.raw<{ hits: Hit[]; more: boolean }>({ hits: [], more: false });
  error = $state('');
  slow = $state(false);
  private seq = 0;
  private last = '';

  toggle(k: keyof Opt) {
    this.opt[k] = !this.opt[k];
    remember(key(k), this.opt[k] ? '1' : '0');
  }

  private show(hits: Hit[], more: boolean, error = '', slow = false) {
    this.found = { hits: hits.slice(0, LIMIT), more: more || hits.length > LIMIT };
    this.error = error;
    this.slow = slow;
    getEditor()?.marks(hits.flatMap((h) => [h.from, h.to]));
  }

  /** Looks for q in text and draws the matches. A change of text alone waits a moment; a reply to an older look is dropped. Gives back a way to call it off. */
  look(q: string, text: string): () => void {
    const id = ++this.seq;
    const o = { ...this.opt };
    if (!q) {
      if (this.found.hits.length || this.error || this.slow) this.show([], false);
      return () => {};
    }
    const now = JSON.stringify([q, o]);
    const same = this.last === now;
    this.last = now;
    const t = setTimeout(async () => {
      const r = await ask({ text, q, opt: o });
      if (id !== this.seq || !r) return;
      if (r === 'slow') this.show([], false, '', true);
      else if ('error' in r) this.show([], false, r.error);
      else if ('hits' in r) this.show(r.hits, r.more);
    }, same ? WAIT : 0);
    return () => (clearTimeout(t), this.seq++);
  }

  /** Replaces q with swap in one transaction: every match, or only the first at or after `from`. Gives the edits made, none when nothing was done. */
  async replace(q: string, swap: string, from?: number): Promise<Edit[]> {
    const text = current()?.text ?? '';
    const r = await ask({ text, q, opt: { ...this.opt }, swap, from });
    if (r === 'slow') this.show([], false, '', true);
    else if (r && 'error' in r) this.show([], false, r.error);
    // not when the text moved on while the worker ran
    else if (r && 'edits' in r && current()?.text === text && r.edits.length) return (getEditor()?.change(r.edits), r.edits);
    return [];
  }
}

export const hunt = new Hunt();
