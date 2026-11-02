<script lang="ts">
  import { activate, app, closeTab, dirty, tabs, title, unread, where } from '../app.svelte';
  import type { Doc } from '../store';
  import { fit, short } from './fit';
  import Icon from './Icon.svelte';
  import { toggle, ui } from './ui.svelte';
  import './tabs.css';

  // One chip per open document, inside the left pill. When the chips no longer fit, the count button opens the list (TabList.svelte).
  let row = $state<HTMLElement>();
  let over = $state(false);
  let before = $state(false);
  let after = $state(false);

  // a chip's name in its own type; at most 200px, a chip leaves it 134: 12 + 14 (icon) + 7 + name + 4 + 24 (close) + 5
  const FONT = '500 13px Inter, system-ui, sans-serif';
  const now = $derived(tabs.list.find((d) => d.id === app.active));
  const shape = $derived.by(() => (void app.rev, tabs.list.map((d) => `${d.id}:${title(d)}:${dirty(d)}`).join('\n')));

  // Each end fades only while there is more past it.
  const measure = () => {
    if (!row) return;
    over = row.scrollWidth > row.clientWidth + 1;
    // while they overflow, no chip is wider than the strip less its fades, so the one being read always fits whole
    row.style.setProperty('--most', over ? `${Math.max(64, row.clientWidth - 48)}px` : '');
    before = row.scrollLeft > 1;
    after = row.scrollLeft + row.clientWidth < row.scrollWidth - 1;
  };

  // Brings a chip fully into view, past the fades. The row's own scroll is set: scrollIntoView could move the page around it too.
  const reveal = (chip: Element | null | undefined = row?.querySelector('.tb-chip.on')) => {
    if (!row || !(chip instanceof HTMLElement)) return;
    const pad = row.scrollWidth > row.clientWidth + 1 ? 24 : 0;
    row.scrollLeft = Math.min(Math.max(row.scrollLeft, chip.offsetLeft + chip.offsetWidth + pad - row.clientWidth), chip.offsetLeft - pad);
  };

  $effect(() => {
    void app.active;
    void shape;
    if (!row) return;
    reveal();
    measure();
  });

  $effect(() => {
    if (!row) return;
    const watching = new ResizeObserver(() => (reveal(), measure()));
    watching.observe(row);
    return () => watching.disconnect();
  });

  // The wheel's up and down scroll the chips sideways while they overflow.
  $effect(() => {
    const el = row;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY * (e.deltaMode === 1 ? 16 : 1);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  });

  const focus = (chip?: HTMLElement) => {
    if (!chip) return;
    chip.focus({ preventScroll: true });
    reveal(chip.closest('.tb-chip'));
  };

  // The arrows, Home and End move between chips; Enter and Space switch; Delete and Backspace close the one in hand, and the focus moves to its neighbour first.
  function keys(e: KeyboardEvent, id: string) {
    if (!row || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const chips = [...row.querySelectorAll<HTMLElement>('.tb-go')];
    const i = chips.indexOf(e.currentTarget as HTMLElement);
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      focus(chips[i + 1] ?? chips[i - 1]);
      return void closeTab(id);
    }
    const to = e.key === 'ArrowRight' ? chips[i + 1] : e.key === 'ArrowLeft' ? chips[i - 1] : e.key === 'Home' ? chips[0] : e.key === 'End' ? chips[chips.length - 1] : null;
    if (to === null) return;
    e.preventDefault();
    focus(to);
  }

  // Born empty, a document wears the app's own mark; with something in it, a file's.
  const blank = (d: Doc) => (void app.rev, !d.text && !d.handle && !(__LOCAL__ && d.source));
</script>

{#snippet mark(d: Doc)}
  <span class="tb-ico">{#if blank(d)}<img src="/mark.svg" alt="" width="13" height="16" />{:else}<Icon name="file" size={14} />{/if}</span>
{/snippet}

{#if tabs.list.length === 1 && tabs.list[0]}
  {@const d = tabs.list[0]}
  <div class="tb-chip one" class:dirty={dirty(d) || (__LOCAL__ && unread(d))} title={__LOCAL__ ? where(d) : d.name}>
    <span class="tb-go">{@render mark(d)}<span class="tb-nm">{title(d)}</span></span>
    <span class="tb-end">
      {#if dirty(d) || (__LOCAL__ && unread(d))}<span class="tb-dot" class:news={__LOCAL__ && !dirty(d)} title={__LOCAL__ && !dirty(d) ? 'Changed since you last looked' : 'Not yet saved to the file'}></span>{/if}
      <button class="tb-x" aria-label="Close {title(d)}" title="Close" onclick={() => closeTab(d.id)}><Icon name="x" size={14} /></button>
    </span>
  </div>
{:else}
  <div class="tb-row" class:l={before} class:r={after} bind:this={row} onscroll={measure}>
    {#each tabs.list as d (d.id)}
      {@const on = d.id === app.active}
      <div class="tb-chip" class:on class:dirty={dirty(d) || (__LOCAL__ && unread(d))} class:new={Date.now() - d.created < 800}>
        <button class="tb-go" title={__LOCAL__ ? where(d) : d.name} tabindex={on ? 0 : -1} aria-current={on ? 'page' : undefined} onclick={() => activate(d.id)} onkeydown={(e) => keys(e, d.id)}>
          {@render mark(d)}<span class="tb-nm">{fit(title(d), 134, FONT)}</span>
        </button>
        <span class="tb-end">
          {#if dirty(d) || (__LOCAL__ && unread(d))}<span class="tb-dot" class:news={__LOCAL__ && !dirty(d)} title={__LOCAL__ && !dirty(d) ? 'Changed since you last looked' : 'Not yet saved to the file'}></span>{/if}
          <button class="tb-x" tabindex="-1" aria-label="Close {title(d)}" onclick={() => closeTab(d.id)}><Icon name="x" size={14} /></button>
        </span>
      </div>
    {/each}
  </div>
  <button class="tb-all" class:over data-pop="tabs" aria-haspopup="dialog" aria-expanded={ui.pop === 'tabs'} aria-label="All open documents" onclick={() => toggle('tabs')}>
    <span class="tb-cur">{now ? short(title(now), 26) : ''}</span><span class="tb-n">{tabs.list.length}</span><Icon name="chevron" size={14} />
  </button>
{/if}
