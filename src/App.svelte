<script lang="ts">
  import { onMount } from 'svelte';
  import { app, tabs, activate, boot, closeTab, current, cycleView, fresh, getEditor, isDemo, openFiles, openPicked, openTour, remember, pageTitle, rememberActive, save, title, wantOutline } from './lib/app.svelte';
  import { look, setText, stepText, theme, toggleTheme } from './lib/theme.svelte';
  import { requests, violations, onChange } from './lib/trust';
  import Icon from './lib/ui/Icon.svelte';
  import Tabs from './lib/ui/Tabs.svelte';
  import Search from './lib/ui/Search.svelte';
  import { ui, toggle } from './lib/ui/ui.svelte';

  // the text of a document is a plain property: `app.rev` says it changed
  const empty = $derived((void app.rev, !current()?.text));
  let host = $state<HTMLElement>();
  let root = $state<HTMLElement>();
  let desk = $state<HTMLElement>();
  let clean = $state(true);
  let depth = 0;
  // The cards come after the first paint: at once when one is asked for, and otherwise as soon as the page is idle, so opening one never waits.
  let Sheets = $state<typeof import('./lib/ui/Sheets.svelte').default>();
  const sheets = () => import('./lib/ui/Sheets.svelte').then((m) => (Sheets = m.default));
  // The demo's strip is only needed while a demo is open
  let Strip = $state<typeof import('./lib/ui/Demo.svelte').default>();
  $effect(() => {
    if (!__LOCAL__ && isDemo() && !Strip) import('./lib/ui/Demo.svelte').then((m) => (Strip = m.default));
  });

  onMount(() => {
    boot(() => host, () => root);
    (window.requestIdleCallback ?? setTimeout)(() => sheets());
    const off = onChange(() => (clean = requests().external === 0 && !violations().some((v) => v.directive !== 'script-src')));
    return off;
  });

  $effect(() => {
    if (app.active) rememberActive();
  });
  $effect(() => wantOutline(app.view !== 'write' || ui.pop === 'outline' || ui.pop === 'info'));
  $effect(() => {
    if (ui.pop && ui.pop !== 'search' && !Sheets) sheets();
  });
  $effect(() => {
    void app.rev;
    const d = tabs.list.find((x) => x.id === app.active);
    if (d) document.title = __LOCAL__ ? pageTitle(d) : `${title(d)} · md`;
  });

  function find(seed = '') {
    ui.seed = seed;
    ui.pop = 'search';
  }

  function keys(e: KeyboardEvent) {
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    const at = e.target as Element;
    // search's own Esc also clears its query (Search.svelte)
    if (e.key === 'Escape' && ui.pop && ui.pop !== 'search') return (ui.pop = null);
    if (e.key === 'Tab' || (e.key.startsWith('Arrow') && at.closest?.('.pop, .tb, [role=radiogroup]'))) document.documentElement.toggleAttribute('data-kb', true);
    if (mod && !e.altKey && !e.shiftKey && k === 's') return e.preventDefault(), save();
    if (mod && !e.altKey && !e.shiftKey && k === 'o') return e.preventDefault(), openPicked();
    if (mod && !e.altKey && !e.shiftKey && k === 'p') return e.preventDefault(), void import('./lib/ui/print').then((m) => m.printDoc());
    if (mod && !e.altKey && !e.shiftKey && k === 'f') return e.preventDefault(), find(getEditor()?.selected ?? '');
    // inside the source, ⌘K has already made a link
    if (mod && !e.altKey && !e.shiftKey && k === 'k' && !e.defaultPrevented) return e.preventDefault(), find();
    if (e.key === '/' && !mod && !e.altKey && !at.closest?.('input, textarea, [contenteditable]')) return e.preventDefault(), find();
    if (mod && !e.altKey && e.key === '\\') return e.preventDefault(), cycleView();
    if (mod && e.shiftKey && !e.altKey && k === 'o') return e.preventDefault(), innerWidth > 720 ? dispatchEvent(new Event('tocpin')) : toggle('outline');
    if (mod && e.altKey && !e.shiftKey && /^(Equal|NumpadAdd|Minus|NumpadSubtract|Digit0|Numpad0)$/.test(e.code)) return e.preventDefault(), /0$/.test(e.code) ? setText(100) : stepText(/Equal|Add/.test(e.code) ? 1 : -1);
    if (e.altKey && !mod && e.code === 'KeyN') return e.preventDefault(), fresh();
    if (e.altKey && !mod && e.code === 'KeyW') return e.preventDefault(), closeTab(app.active);
    if (e.altKey && !mod && (e.code === 'BracketLeft' || e.code === 'BracketRight')) {
      const i = tabs.list.findIndex((d) => d.id === app.active);
      const next = tabs.list[(i + (e.code === 'BracketRight' ? 1 : -1) + tabs.list.length) % tabs.list.length];
      if (next) return e.preventDefault(), activate(next.id);
    }
  }

  const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');
  // pictures go to the editor (it places them where they land); only text files open as documents
  const allImages = (e: DragEvent) => [...(e.dataTransfer?.items ?? [])].every((i) => i.type.startsWith('image/'));

  function drag(e: PointerEvent) {
    const box = desk?.getBoundingClientRect();
    if (!box) return;
    const bar = e.currentTarget as HTMLElement;
    bar.setPointerCapture(e.pointerId);
    const move = (m: PointerEvent) => (app.split = Math.min(0.8, Math.max(0.2, (m.clientX - box.left) / box.width)));
    const up = () => {
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', up);
      remember('md-split', String(app.split));
    };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up);
  }
</script>

<svelte:window
  onkeydown={keys}
  onpointerdown={(e) => {
    document.documentElement.removeAttribute('data-kb');
    if (ui.pop && !(e.target as Element).closest?.('.pop, [data-pop]')) ui.pop = null;
  }}
  ondragenter={(e) => {
    // md Local opens files from a terminal; a drop says how (openFiles)
    if (!__LOCAL__ && hasFiles(e) && !allImages(e)) {
      depth++;
      app.dragging = true;
    }
  }}
  ondragleave={() => {
    if (depth && --depth === 0) app.dragging = false;
  }}
  ondragover={(e) => {
    if (hasFiles(e) && !allImages(e)) e.preventDefault();
  }}
  ondrop={(e) => {
    depth = 0;
    app.dragging = false;
    if (!hasFiles(e) || allImages(e)) return;
    e.preventDefault();
    openFiles(e.dataTransfer!.files, e.dataTransfer!.items);
  }}
/>

<header class="bar">
  <div class="inner">
    <nav class="tb pill" aria-label="Open documents">
      {#if !__LOCAL__}<a class="icon tb-home" href="/" data-tip="Home" aria-label="Home"><Icon name="home" /></a>{/if}
      <Tabs />
      <button class="icon tb-new" data-pop="open" data-tip="Open · ⌘O" aria-label="Open" aria-haspopup="dialog" aria-expanded={ui.pop === 'open'} onclick={() => toggle('open')}><Icon name="plus" /></button>
    </nav>
    <div class="tools pill">
      <button class="icon" data-pop="search" data-tip="Search · /" aria-label="Search" aria-expanded={ui.pop === 'search'} onclick={() => toggle('search')}><Icon name="find" /></button>
      <i class="sep" aria-hidden="true"></i>
      <button class="icon" data-pop="view" data-tip="View · ⌘\\" aria-label="View" aria-haspopup="dialog" aria-expanded={ui.pop === 'view'} aria-pressed={app.view !== 'page'} onclick={() => toggle('view')}><Icon name="pen" /></button>
      <button class="icon" data-pop="info" data-tip="Info" aria-label="Info" aria-haspopup="dialog" aria-expanded={ui.pop === 'info'} onclick={() => toggle('info')}><Icon name="info" /></button>
      <i class="sep" aria-hidden="true"></i>
      <button class="icon" data-pop="outline" data-tip="Contents" aria-label="Contents" aria-haspopup="dialog" aria-expanded={ui.pop === 'outline'} onclick={() => toggle('outline')}><Icon name="outline" /></button>
      <button class="icon" data-pop="export" data-tip="Export" aria-label="Export" aria-haspopup="dialog" aria-expanded={ui.pop === 'export'} onclick={() => toggle('export')}><Icon name="save" /></button>
      <button class="icon" data-pop="privacy" data-tip={clean ? (__LOCAL__ ? 'Nothing has left this machine' : 'Nothing has left this page') : 'See what this page did'} aria-label="Privacy" aria-haspopup="dialog" aria-expanded={ui.pop === 'privacy'} onclick={() => toggle('privacy')}>
        <Icon name="shield" /><i class="safe" class:warn={!clean}></i>
      </button>
      <i class="sep" aria-hidden="true"></i>
      <button class="icon" data-pop="settings" data-tip="Settings" aria-label="Settings" aria-haspopup="dialog" aria-expanded={ui.pop === 'settings'} onclick={() => toggle('settings')}><Icon name="settings" /></button>
      <button class="icon swap" onclick={toggleTheme} aria-label={theme.value === 'dark' ? 'Switch to light' : 'Switch to dark'} data-tip={theme.value === 'dark' ? 'Switch to light' : 'Switch to dark'}>
        <span class="glyph" class:on={theme.value === 'light'}><Icon name="moon" /></span>
        <span class="glyph" class:on={theme.value === 'dark'}><Icon name="sun" /></span>
      </button>
    </div>
  </div>
</header>

<Search />

{#if Strip && isDemo()}<Strip />{/if}

<main class="desk {app.view}" bind:this={desk} style:--split={app.split}>
  <section class="pane write" aria-label="Source" bind:this={host}></section>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="grip" role="separator" aria-orientation="vertical" aria-label="Resize panes" onpointerdown={drag}></div>
  <section class="pane read" aria-label="Preview">
    <div bind:this={root}></div>
    {#if !__LOCAL__ && app.ready && empty}<p class="first">New to md? <button onclick={openTour}>Take the tour</button></p>{/if}
    <footer class="made">
      <nav aria-label="About this editor">
        <a href="/trust/" target="_blank" rel="noopener" aria-label="How the promise is kept" title="How the promise is kept"><Icon name="lock" /></a>
        <a href="https://github.com/ashwingopalsamy/markdown" target="_blank" rel="noopener noreferrer" aria-label="Contribute on GitHub" title="Contribute on GitHub"><Icon name="github" /></a>
      </nav>
      <a class="by" href="https://ashwingopalsamy.in" target="_blank" rel="noopener noreferrer">
        With love<svg class="heart" viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M12 20.6c-.4 0-.8-.15-1.1-.4C6.1 16.2 3 13.3 3 9.3 3 6.4 5.2 4.2 8 4.2c1.6 0 3 .8 4 2.1 1-1.3 2.4-2.1 4-2.1 2.8 0 5 2.2 5 5.1 0 4-3.1 6.9-7.9 10.9-.3.25-.7.4-1.1.4Z" /></svg><span class="sr">by</span><b>Ashwin Gopalsamy</b>
      </a>
    </footer>
  </section>
</main>

<div class="corner r pill" role="group" aria-label="Text size">
  <button class="icon" aria-label="Smaller text" data-tip="Smaller · ⌥⌘−" disabled={look.text <= 90} onclick={() => stepText(-1)}><b class="a s">A</b></button>
  <button class="icon pct" aria-label="Text size {look.text}%. Reset to 100%" data-tip="Reset · ⌥⌘0" onclick={() => setText(100)}>{look.text}%</button>
  <button class="icon" aria-label="Larger text" data-tip="Larger · ⌥⌘=" disabled={look.text >= 140} onclick={() => stepText(1)}><b class="a l">A</b></button>
</div>

{#if app.dragging}
  <div class="droop" aria-hidden="true"><span>Drop to open. It stays on this device.</span></div>
{/if}

{#if app.notice}
  {#key app.notice.id}
    <div class="note" role="status">
      <span>{app.notice.text}</span>
      {#if app.notice.label}<button onclick={() => { app.notice?.run?.(); app.notice = null; }}>{app.notice.label}</button>{/if}
    </div>
  {/key}
{/if}

{#if Sheets}<Sheets />{/if}
<div id="print" class="md"></div>
