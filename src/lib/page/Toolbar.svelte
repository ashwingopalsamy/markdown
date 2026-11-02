<script lang="ts" module>
  export type Mark = 'strong' | 'em' | 'del' | 'code' | 'link';
  export type Type = 'p' | 'h1' | 'h2' | 'h3' | 'ul' | 'ol';
  export type Cmd = 'undo' | 'redo' | Mark | Type | 'source' | 'done';

  const MARKS = new Set<Cmd>(['strong', 'em', 'del', 'code', 'link']);
  const TYPES = new Set<Cmd>(['p', 'h1', 'h2', 'h3', 'ul', 'ol']);
</script>

<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { app } from '../app.svelte';
  import { bar as store, keys } from './bar.svelte';
  import type { Host } from './host';
  import { GLYPHS, type Glyph } from './glyphs';

  // The editing toolbar, there for as long as the Page view is on. While a block is open it is that block's: history, marks, the block's
  // kind, the markdown source and Done, never taking the focus from the text, so the selection it acts on stays put. With nothing open it
  // offers undo and redo, and the buttons that start a new block at the end.
  let { idle }: { idle: { history: Host['history']; start: (t: Type) => void; ok: () => boolean } } = $props();
  const live = $derived(store.live);

  type Tool = { cmd: Cmd; icon: Glyph; name: string; key?: string };
  const GROUPS: Tool[][] = [
    [
      { cmd: 'undo', icon: 'undo', name: 'Undo', key: '⌘Z' },
      { cmd: 'redo', icon: 'redo', name: 'Redo', key: '⇧⌘Z' },
    ],
    [
      { cmd: 'strong', icon: 'bold', name: 'Bold', key: '⌘B' },
      { cmd: 'em', icon: 'italic', name: 'Italic', key: '⌘I' },
      { cmd: 'del', icon: 'strikethrough', name: 'Strikethrough', key: '⌘⇧X' },
      { cmd: 'code', icon: 'code', name: 'Code', key: '⌘E' },
      { cmd: 'link', icon: 'link', name: 'Link', key: '⌘K' },
    ],
    [
      { cmd: 'p', icon: 'pilcrow', name: 'Paragraph' },
      { cmd: 'h1', icon: 'heading-1', name: 'Heading 1', key: '#' },
      { cmd: 'h2', icon: 'heading-2', name: 'Heading 2', key: '##' },
      { cmd: 'h3', icon: 'heading-3', name: 'Heading 3', key: '###' },
      { cmd: 'ul', icon: 'list', name: 'Bulleted list', key: '-' },
      { cmd: 'ol', icon: 'order', name: 'Numbered list', key: '1.' },
    ],
    [{ cmd: 'source', icon: 'hash', name: 'Markdown source', key: '⌘/' }],
    [{ cmd: 'done', icon: 'check', name: 'Done', key: 'Esc' }],
  ];
  const FLAT = GROUPS.flat();

  const NONE: Record<Mark, boolean> = { strong: false, em: false, del: false, code: false, link: false };
  let on = $state.raw<Record<Mark, boolean>>(NONE);
  let span = $state(false);
  let can = $state({ undo: false, redo: false });
  let bar: HTMLElement;

  // What the selection is in, read from the page as the browser sees it.
  function sync() {
    can = live ? { undo: live.history(false), redo: live.history(true) } : { undo: idle.history.can(false), redo: idle.history.can(true) };
    const el = live?.root();
    const sel = getSelection();
    if (!live || live.source || !el || !sel?.rangeCount || !el.contains(sel.anchorNode)) {
      on = NONE;
      span = false;
      return;
    }
    span = !sel.isCollapsed;
    const near = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement;
    // a heading is bold already, which is not the mark
    on = { strong: !live.heading && document.queryCommandState('bold'), em: document.queryCommandState('italic'), del: document.queryCommandState('strikeThrough'), code: !!near?.closest('code'), link: !!near?.closest('a') };
  }

  // the open block says what it is now; the selection and the history are read on every change
  $effect(() => {
    void store.live;
    void app.rev;
    sync();
  });

  // Opening a block adds Done at the end of the bar, which is centred, so it would slide every button along under the pointer. The bar grows to the right instead: its
  // other buttons stay where they are, and the one that was pressed is the one the pointer is still on.
  const open = $derived(!!live);
  $effect(() => {
    const on = open;
    void tick().then(() => {
      bar?.style.removeProperty('--shift');
      const seps = bar?.querySelectorAll<HTMLElement>('.sep');
      const done = bar?.querySelector<HTMLElement>('[data-cmd=done]');
      if (!bar || !on || !done || !seps?.length || innerWidth <= 720 || bar.classList.contains('tight')) return bar?.style.removeProperty('--shift');
      const extra = done.getBoundingClientRect().right - seps[seps.length - 1].getBoundingClientRect().left;
      const hi = (document.querySelector('.bar .tools')?.getBoundingClientRect().left ?? innerWidth - 12) - 8;
      bar.style.setProperty('--shift', `${Math.max(0, Math.min(extra / 2, hi - bar.getBoundingClientRect().right))}px`);
    });
  });

  onMount(() => {
    document.addEventListener('selectionchange', sync);
    document.addEventListener('input', sync, true);
    // Centred on the window, within the room between the tabs and the dock. Where that is too little, the tabs give way to the active one
    // (`pg-crowd`), and only then, if it still does not fit, does the bar scroll. Decided in one go, so nothing flickers between the two.
    const root = document.documentElement;
    const edge = (sel: string, side: 'left' | 'right') => document.querySelector(sel)?.getBoundingClientRect()[side];
    const centre = () => {
      root.classList.remove('pg-crowd');
      bar.style.removeProperty('--room');
      if (innerWidth <= 720) return;
      // the bar's own width: scrollWidth would count its hover names too
      const need = bar.offsetWidth;
      const hi = (edge('.bar .tools', 'left') ?? innerWidth - 12) - 8;
      root.classList.toggle('pg-crowd', need > hi - ((edge('.bar .tb', 'right') ?? 12) + 8));
      const lo = (edge('.bar .tb', 'right') ?? 12) + 8;
      bar.style.setProperty('--room', `${Math.max(0, hi - lo)}px`);
      bar.classList.toggle('tight', need > hi - lo);
      const half = Math.min(need, hi - lo) / 2;
      bar.style.setProperty('--x', `${Math.min(Math.max(innerWidth / 2, lo + half), hi - half)}px`);
    };
    keys.focus = focus;
    centre();
    const look = new ResizeObserver(centre);
    for (const sel of ['.bar .tb', '.bar .tools']) {
      const pill = document.querySelector(sel);
      if (pill) look.observe(pill);
    }
    addEventListener('resize', centre);
    return () => {
      look.disconnect();
      removeEventListener('resize', centre);
      root.classList.remove('pg-crowd');
      document.removeEventListener('selectionchange', sync);
      document.removeEventListener('input', sync, true);
    };
  });

  const off = (cmd: Cmd): boolean => {
    if (cmd === 'undo' || cmd === 'redo') return !can[cmd];
    if (cmd === 'done') return false;
    if (!live) return TYPES.has(cmd) ? !idle.ok() : true;
    if (cmd === 'source') return !live.flip;
    if (TYPES.has(cmd)) return !live.shapes;
    // a link or code needs some text, unless the caret is in one, which it then takes away
    return live.source || (cmd === 'strong' && live.heading) || ((cmd === 'code' || cmd === 'link') && !span && !on[cmd]);
  };

  const pressed = (cmd: Cmd): boolean | undefined => !live ? undefined : (cmd === 'source' ? live.source : TYPES.has(cmd) ? !live.source && live.type === cmd : MARKS.has(cmd) ? on[cmd as Mark] : undefined);

  const enabled = () => [...bar.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
  let at = $state(0);

  function run(cmd: Cmd) {
    if (live) return live.run(cmd);
    if (cmd === 'undo') idle.history.undo();
    else if (cmd === 'redo') idle.history.redo();
    else if (TYPES.has(cmd)) idle.start(cmd as Type);
  }

  /** Alt+F10 from the text: the keys move along the bar, Esc or Tab goes back to the text. */
  function focus() {
    const all = enabled();
    (all.find((b) => b.tabIndex === 0) ?? all[0])?.focus();
  }

  function key(e: KeyboardEvent) {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && !e.altKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      e.stopPropagation();
      return run(e.shiftKey ? 'redo' : 'undo');
    }
    // the page's one-key shortcuts are for reading, not for here
    if (!mod) e.stopPropagation();
    const all = enabled();
    const i = all.indexOf(document.activeElement as HTMLButtonElement);
    let to = -1;
    if (e.key === 'ArrowRight') to = (i + 1) % all.length;
    else if (e.key === 'ArrowLeft') to = (i - 1 + all.length) % all.length;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = all.length - 1;
    else if (e.key === 'Escape' || e.key === 'Tab') (e.preventDefault(), live?.resume());
    if (to >= 0) (e.preventDefault(), all[to]?.focus());
  }
</script>

<!-- the bar never takes the focus from a click, so the text keeps its selection and its caret -->
<div
  bind:this={bar}
  class="pg-bar"
  class:idle={!live}
  role="toolbar"
  aria-label="Editing"
  tabindex="-1"
  onpointerdown={(e) => e.preventDefault()}
  onmousedown={(e) => e.preventDefault()}
  onkeydown={key}
  onfocusin={(e) => (at = Math.max(0, FLAT.findIndex((t) => t.cmd === (e.target as HTMLElement).closest<HTMLElement>('[data-cmd]')?.dataset.cmd)))}
  onfocusout={(e) => live?.onleave(e)}
>
  {#each live ? GROUPS : GROUPS.slice(0, -1) as group, g}
    {#if g}<span class="sep" aria-hidden="true"></span>{/if}
    {#each group as t}
      <button
        type="button"
        class="icon"
        title={t.key ? `${t.name} · ${t.key}` : t.name}
        data-cmd={t.cmd}
        aria-label={t.name}
        data-tip={t.key ? `${t.name} · ${t.key}` : t.name}
        aria-pressed={pressed(t.cmd)}
        disabled={off(t.cmd)}
        tabindex={FLAT[at] === t ? 0 : -1}
        onclick={() => {
          run(t.cmd);
          queueMicrotask(sync);
        }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={GLYPHS[t.icon]} /></svg>
      </button>
    {/each}
  {/each}
</div>
