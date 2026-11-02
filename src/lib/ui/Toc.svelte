<script lang="ts">
  import { app, goto, lineTop } from '../app.svelte';
  import { ui } from './ui.svelte';
  import './toc.css';

  // Tick marks along the right edge; hovering them opens the list.
  const LINE = 150;
  const ROWS = 22;
  const PITCH = 20;
  const BREAK = 14;
  const STEP = 7;
  let current = $state(-1);
  let pin = $state(false);
  let panel = $state<HTMLElement>();

  const top = $derived(Math.min(...app.headings.map((h) => h.level), 6));
  const entries = $derived(app.headings.map((h) => ({ ...h, depth: h.level - top })));
  const at = $derived(Math.max(0, current));
  // A long outline slides under a fixed window that keeps the current row in view.
  const shift = $derived(Math.min(Math.max(0, at - (ROWS >> 1)), Math.max(0, entries.length - ROWS)));
  const away = $derived(!!ui.pop);

  // Room before a heading that starts something new: a bigger step before a top-level heading, a small one
  // when the outline climbs back out of a deeper level. The ticks and the list share it.
  const lead = $derived(entries.map((h, i) => (!i ? 0 : !h.depth ? BREAK : h.depth < entries[i - 1].depth ? STEP : 0)));
  const pos = $derived.by(() => {
    let sum = 0;
    return entries.map((_, i) => i * PITCH + (sum += lead[i]));
  });
  // The rows in view run from `shift` to the end of the window; the rail keeps the tallest window's height.
  const span = (s: number) => pos[Math.min(s + ROWS, entries.length) - 1] + PITCH - pos[s];
  const height = $derived.by(() => {
    if (!entries.length) return 0;
    let h = 0;
    for (let s = 0; s <= Math.max(0, entries.length - ROWS); s++) h = Math.max(h, span(s));
    return h;
  });
  const slide = $derived(entries.length ? pos[shift] - (height - span(shift)) / 2 : 0);

  const pane = () => document.querySelector<HTMLElement>('.pane.read');
  function locate() {
    const box = pane();
    const last = entries.length - 1;
    if (!box || last < 0) return void (current = -1);
    if (box.scrollTop > 0 && box.clientHeight + box.scrollTop >= box.scrollHeight - 4) return void (current = last);
    let found = -1;
    let lo = 0;
    let hi = last;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if ((lineTop(entries[mid].line) ?? Infinity) - box.scrollTop <= LINE) (found = mid), (lo = mid + 1);
      else hi = mid - 1;
    }
    current = found;
  }

  let queued = 0;
  const queue = () => (queued ||= requestAnimationFrame(() => ((queued = 0), locate())));

  $effect(() => {
    void entries;
    void app.view;
    queue();
    const box = pane();
    box?.addEventListener('scroll', queue, { passive: true });
    return () => box?.removeEventListener('scroll', queue);
  });

  function go(i: number) {
    pin = false;
    // the list closes once the pointer leaves; focus left inside would keep it open for a keyboard user only
    if (panel?.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    goto(entries[i].line, entries[i].id);
  }

  // A tap opens the list and a second one closes it. The mouse needs no click: hovering already opens it.
  const tap = (e: MouseEvent) => {
    if ((e as PointerEvent).pointerType !== 'mouse') pin = !pin;
  };

  // The list opens with the current row in the middle.
  function centre() {
    const row = panel?.querySelector<HTMLElement>('[aria-current], .t[tabindex="0"]');
    if (panel && row) panel.scrollTop = row.offsetTop - (panel.clientHeight - row.offsetHeight) / 2;
  }

  function keys(e: KeyboardEvent) {
    const k = e.key;
    const on = document.activeElement as HTMLElement | null;
    if (k === 'Escape' && (pin || on?.closest('.rail'))) {
      pin = false;
      on?.blur();
      return;
    }
    // From the ticks, an arrow steps into the list.
    if (on?.matches('.stack') && (k === 'ArrowDown' || k === 'ArrowUp' || k === 'ArrowLeft')) {
      panel?.querySelector<HTMLElement>('.t[tabindex="0"]')?.focus({ preventScroll: true });
      return e.preventDefault();
    }
    // Up and down walk the rows.
    if (on?.matches('.t') && (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Home' || k === 'End')) {
      const rows = [...panel!.querySelectorAll<HTMLElement>('.t')];
      const i = rows.indexOf(on);
      rows[k === 'Home' ? 0 : k === 'End' ? rows.length - 1 : Math.min(rows.length - 1, Math.max(0, i + (k === 'ArrowDown' ? 1 : -1)))].focus({ preventScroll: true });
      return e.preventDefault();
    }
    if ((k !== '[' && k !== ']') || e.metaKey || e.ctrlKey || e.altKey || !entries.length || on?.closest('input, textarea, [contenteditable]')) return;
    go(Math.min(entries.length - 1, Math.max(0, k === ']' ? current + 1 : current - 1)));
  }
</script>

<svelte:window onresize={queue} onkeydown={keys} ontocpin={() => ((pin = !pin), queueMicrotask(centre))} onpointerdown={(e) => pin && !(e.target as Element).closest('.rail') && (pin = false)} />

{#if entries.length > 1 && app.view !== 'write'}
  <nav class="rail" class:pin class:away class:tight={app.view === 'split'} aria-label="Contents" style:--span={height} style:--slide={slide} onpointerenter={centre} onfocusin={(e) => (e.target as Element).matches(':focus-visible') && centre()}>
    <button class="stack" aria-label="Contents" aria-expanded={pin} aria-controls="toc-panel" onclick={tap}>
      <span class="ticks" aria-hidden="true">
        {#each entries as h, i}
          {@const out = i < shift || i >= shift + ROWS}
          {@const edge = Math.min(shift > 0 ? i - shift + 1 : 9, shift + ROWS < entries.length ? shift + ROWS - i : 9)}
          <span class="tr" class:near={Math.abs(i - at) === 1} class:now={i === at} style:--d={h.depth} style:--y={pos[i]} style:opacity={out ? 0 : edge < 3 ? edge / 3 : undefined}>
            <span class="lbl">{h.text}</span><i class="tk"></i>
          </span>
        {/each}
      </span>
    </button>
    <div class="panel" id="toc-panel" bind:this={panel}>
      {#each entries as h, i}
        {#if lead[i]}<i class="sep" class:big={!h.depth} aria-hidden="true"></i>{/if}
        <button class="t" class:top={!h.depth} class:near={Math.abs(i - at) === 1} style:--d={h.depth} title={h.text} aria-current={i === current ? 'location' : undefined} tabindex={i === at ? 0 : -1} onclick={() => go(i)}>{h.text}</button>
      {/each}
    </div>
  </nav>
{/if}
