<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { app, current, frozen, getEditor, goto, say } from '../app.svelte';
  import { LEAST, LIMIT, markAt, paint, search, unpaint } from '../search';
  import Icon from './Icon.svelte';
  import Pop from './Pop.svelte';
  import { ui } from './ui.svelte';
  import './search.css';

  let q = $state('');
  let swap = $state('');
  let replacing = $state(false);
  let box = $state<HTMLElement>();
  let field = $state<HTMLInputElement>();
  let at = $state(-1);
  let listing = $state(true);
  let ranges = $state.raw<Range[]>([]);
  // md Local: options, a worker that does the matching, and replace that follows the tab's lock
  let hunt = $state.raw<typeof import('../local/hunt.svelte').hunt>();
  let build: typeof import('../local/rx').build | undefined;
  let after: { at: number; strict: boolean } | null = null;
  if (__LOCAL__)
    import('../local/hunt.svelte').then((m) => ((build = m.build), (hunt = m.hunt)));
  const OPTS = __LOCAL__ ? ([['case', 'Match case', 'Aa'], ['word', 'Whole word', 'ab'], ['regex', 'Regular expression', '.*']] as const) : [];

  const open = $derived(ui.pop === 'search');
  const typed = $derived(__LOCAL__ ? q.length > 0 : q.trim().length >= LEAST);
  const reading = $derived(app.view === 'read' || app.view === 'page');
  // the page is marked by a plain text search only; a pattern is not run on the page's thread
  const ranged = $derived(reading && !(__LOCAL__ && hunt?.opt.regex));
  const locked = $derived(__LOCAL__ && !!frozen());
  const sync = $derived.by(() => {
    void app.rev;
    return typed ? search(current()?.text ?? '', q) : { hits: [], more: false };
  });
  const found = $derived(__LOCAL__ ? (hunt?.found ?? { hits: [], more: false }) : sync);
  const total = $derived(ranged ? ranges.length : found.hits.length);
  const more = $derived(!ranged && found.more);

  const page = () => document.querySelector('.pane.read > div');

  // The source and the page mark the same query. The page is marked again whenever it is redrawn; highlights do not touch the DOM, so this cannot set itself off.
  $effect(() => {
    const term = q;
    void app.view;
    if (!__LOCAL__) getEditor()?.find(term);
    const root = page();
    if (!root) return;
    const rx = __LOCAL__ ? (term && hunt && !hunt.opt.regex ? build!(term, hunt.opt) : null) : undefined;
    const mark = () => (ranges = paint(root, term, rx));
    mark();
    if (__LOCAL__ ? !rx : !term.trim()) return;
    let raf = 0;
    const watching = new MutationObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(mark);
    });
    watching.observe(root, { childList: true, subtree: true, characterData: true });
    return () => {
      cancelAnimationFrame(raf);
      watching.disconnect();
    };
  });

  // The matches come back from the worker; the text and the options each start a new look, and the editor draws what it brings.
  if (__LOCAL__)
    $effect(() => {
      void app.rev;
      void app.active;
      if (hunt) return hunt.look(q, current()?.text ?? '');
    });

  // after a replace, on to the first match past the new text
  if (__LOCAL__)
    $effect(() => {
      const hits = found.hits;
      if (!after) return;
      const next = hits.findIndex((x) => (after!.strict ? x.from > after!.at : x.from >= after!.at));
      after = null;
      untrack(() => {
        at = next < 0 ? 0 : next;
        show(at);
      });
    });

  $effect(() => {
    void q;
    void app.view;
    void app.active;
    if (__LOCAL__) void { ...hunt?.opt };
    untrack(() => {
      at = -1;
      listing = true;
      markAt(null);
    });
  });

  // ⌘F brings what is selected in the source along.
  $effect(() => {
    if (open && ui.seed) untrack(() => ((q = ui.seed), (ui.seed = '')));
  });

  function show(i: number) {
    if (ranged) {
      const r = ranges[i];
      const pane = document.querySelector('.pane.read');
      if (!r || !pane) return;
      const box = r.getBoundingClientRect();
      if (!box.width && !box.height) return;
      markAt(r);
      pane.scrollBy({ top: box.top - pane.clientHeight / 2 });
    } else {
      const h = found.hits[i];
      if (h) getEditor()?.select(h.from, h.to);
    }
  }

  // Enter and Shift+Enter walk the matches, as a browser's find does; the field keeps the keyboard.
  function step(by: 1 | -1) {
    if (!total) return;
    at = at < 0 ? (by > 0 ? 0 : total - 1) : (at + by + total) % total;
    listing = false;
    show(at);
  }

  function go(i: number) {
    const h = found.hits[i];
    ui.pop = null;
    if (h) goto(h.line, '');
  }

  async function one() {
    const h = found.hits[Math.max(at, 0)];
    if (!h) return;
    if (__LOCAL__) {
      if (!hunt || locked) return;
      const [e] = await hunt.replace(q, swap, h.from);
      if (e) after = { at: e.from + e.insert.length, strict: e.from === e.to };
      return;
    }
    getEditor()?.replace([{ from: h.from, to: h.to }], swap);
    const past = h.from + swap.length;
    await tick();
    // on to the next match after the new text; none after it wraps to the first
    const next = found.hits.findIndex((x) => x.from >= past);
    at = next < 0 ? 0 : next;
    show(at);
  }

  async function all() {
    if (__LOCAL__) {
      if (!hunt || locked) return;
      const done = await hunt.replace(q, swap);
      if (done.length) say(`Replaced ${done.length.toLocaleString('en')}. Undo brings them back.`);
      return;
    }
    const { hits } = search(current()?.text ?? '', q, Infinity);
    if (!hits.length) return;
    getEditor()?.replace(hits, swap);
    say(`Replaced ${hits.length.toLocaleString('en')}. Undo brings them back.`);
  }

  // Esc clears the query and its marks and gives the keyboard back to the document.
  function clear() {
    q = '';
    swap = '';
    replacing = false;
    unpaint();
    ui.pop = null;
    field?.blur();
    if (!reading) getEditor()?.focus();
  }

  const rows = () => [...(box?.querySelectorAll<HTMLElement>('.hit') ?? [])];
  function keys(e: KeyboardEvent) {
    if (!open) return;
    const on = document.activeElement as HTMLElement;
    if (e.key === 'Escape') {
      clear();
      e.preventDefault();
      e.stopPropagation();
    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !on?.matches('.rep input')) {
      if (!listing) listing = true;
      const list = rows();
      const i = list.indexOf(on) + (e.key === 'ArrowDown' ? 1 : -1);
      if (i < 0) field?.focus();
      else list[Math.min(i, list.length - 1)]?.focus();
      e.preventDefault();
    } else if (e.key === 'Enter' && on === field && total) {
      step(e.shiftKey ? -1 : 1);
      e.preventDefault();
    } else if (e.key === 'Enter' && on?.matches('.rep input')) {
      one();
      e.preventDefault();
    }
  }

  const count = $derived(!typed || (__LOCAL__ && (hunt?.error || hunt?.slow)) ? '' : !total ? 'None' : at >= 0 ? `${at + 1} of ${more ? `${LIMIT}+` : total}` : more ? `${LIMIT}+` : String(total));
</script>

<svelte:window onkeydown={keys} />

{#snippet results()}
  {#if __LOCAL__ && (hunt?.error || hunt?.slow)}
    <p class="none" role="alert">{hunt.error || 'Pattern too slow'}</p>
  {:else if found.hits.length}
    <ul>
      {#each found.hits as h, i}
        <li>
          <button class="hit" class:at={!reading && i === at} onclick={() => go(i)}>
            <span class="kind">{h.line + 1}</span>
            <span class="snip">{h.before}<mark>{h.match}</mark>{h.after}</span>
          </button>
        </li>
      {/each}
    </ul>
    {#if found.more}<p class="none">The first {LIMIT} matches. Narrow it down to see the rest.</p>{/if}
  {:else}
    <p class="none" role="status">Nothing matches that.</p>
  {/if}
{/snippet}

{#snippet replacer()}
  {#if !reading && found.hits.length}
    {#if replacing}
      <div class="rep">
        <input type="text" bind:value={swap} placeholder="Replace with" aria-label="Replace with" autocomplete="off" spellcheck="false" disabled={locked} />
        <button class="btn quiet" type="button" onclick={one} disabled={locked}>Replace</button>
        <button class="btn quiet" type="button" onclick={all} disabled={locked}>All</button>
      </div>
    {:else}
      <button class="rep-open" type="button" onclick={() => (replacing = true)}>Replace</button>
    {/if}
  {/if}
{/snippet}

<Pop id="search" label="Search" width={520} bare anchor={() => document.querySelector('[data-pop=search]')}>
  <div class="find" bind:this={box} role="search">
    <label class="field">
      <Icon name="find" />
      <input bind:this={field} type="search" bind:value={q} onfocus={(e) => e.currentTarget.select()} placeholder="Search this document" aria-label="Search this document" autocomplete="off" spellcheck="false" />
      {#if __LOCAL__ && hunt}
        {#each OPTS as [k, name, glyph]}
          <button class="opt {k}" class:on={hunt.opt[k]} type="button" aria-pressed={hunt.opt[k]} aria-label={name} title={name} onclick={() => (field?.focus(), hunt?.toggle(k))}><span>{glyph}</span></button>
        {/each}
      {/if}
      {#if count}<span class="n" role="status">{count}</span>{/if}
      {#if typed && total}
        <button class="walk" type="button" aria-label="Previous match" title="Previous · ⇧Enter" onclick={() => (field?.focus(), step(-1))}><Icon name="chevron" /></button>
        <button class="walk next" type="button" aria-label="Next match" title="Next · Enter" onclick={() => (field?.focus(), step(1))}><Icon name="chevron" /></button>
      {/if}
      <kbd>esc</kbd>
    </label>
    {#if typed && (listing || replacing)}
      <div class="res">
        {#if listing}{@render results()}{/if}
        {@render replacer()}
      </div>
    {/if}
  </div>
</Pop>
