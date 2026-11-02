<script lang="ts">
  import Icon from '../ui/Icon.svelte';
  import { G } from '../ui/glyphs';
  import Pop from '../ui/Pop.svelte';
  import Seg from '../ui/Seg.svelte';
  import { showing, ui } from '../ui/ui.svelte';
  import '../ui/sheets.css';
  import { bgOf, canWebp, dl, fmtOf, keep, plan, prefs, reason, save, type Bg, type Fmt, type Size } from './figure.svelte';
  import './figure.css';

  // The download card, and the full-window view a drawing zooms into. One of each lives on the page; the drawing they are about is `dl.fig`.
  const formats = (): readonly (readonly [Fmt, string])[] => [['png', 'PNG'], ['jpeg', 'JPEG'], ...(canWebp() ? [['webp', 'WEBP'] as const] : []), ...(dl.vector ? [['svg', 'SVG'] as const] : [])];
  const SIZES: readonly (readonly [Size, string])[] = [['1', '1×'], ['2', '2×'], ['3', '3×'], ['4', '4×'], ['px', 'px']];
  const BACKS: readonly (readonly [Bg, string])[] = [['clear', 'Clear'], ['white', 'White'], ['page', 'Page']];
  const n = (v: number) => v.toLocaleString('en');

  let busy = $state(false);
  const fmt = $derived(fmtOf(prefs, dl.vector));
  const vector = $derived(fmt === 'svg');
  const made = $derived(plan(dl.w, dl.h, prefs));
  const say = $derived(
    vector ? `Any size · ${n(Math.round(dl.w))} × ${n(Math.round(dl.h))}` : !made ? 'Enter a width in pixels.' : made.capped ? `Capped at ${n(made.W)} × ${n(made.H)} px` : `${n(made.W)} × ${n(made.H)} px`,
  );
  const pick = <K extends keyof typeof prefs>(k: K) => (v: (typeof prefs)[K]) => ((prefs[k] = v), (dl.err = ''), (dl.note = ''), keep());

  async function go() {
    if (busy || (!vector && !made) || !dl.fig) return;
    busy = true;
    dl.err = '';
    dl.note = '';
    try {
      // a note to read keeps the card open
      dl.note = await save(dl.fig, prefs);
      if (!dl.note) ui.pop = null;
    } catch (e) {
      dl.err = reason(e);
    } finally {
      busy = false;
    }
  }

  let x = $state<HTMLButtonElement>();
  const close = () => {
    dl.zoom = '';
    dl.opener?.focus({ preventScroll: true });
  };
  $effect(() => {
    if (dl.zoom) x?.focus({ preventScroll: true });
  });
  // the card shows which button it hangs from while it is open, so the bar stays in view
  $effect(() => void dl.anchor?.setAttribute('aria-expanded', String(ui.pop === 'diagram')));
  function keys(e: KeyboardEvent) {
    if (!dl.zoom) return;
    if (e.key === 'Escape') (e.preventDefault(), e.stopPropagation(), close());
    // the view holds one button, so focus has nowhere else to go
    else if (e.key === 'Tab') (e.preventDefault(), x?.focus());
  }
</script>

<svelte:window onkeydowncapture={keys} />

<Pop id="diagram" label="Download image" width={344} near anchor={() => dl.anchor}>
  {#if showing('diagram')}
    <div class="set">
      <div class="set-group">
        <div class="set-row under"><Icon d={G.image} /><span>Format</span><div class="set-ctl"><Seg label="Format" options={formats()} value={fmt} onchange={pick('fmt')} /></div></div>
        <div class="set-row under"><Icon d={G.zoom} /><span>Size</span><div class="set-ctl"><Seg label="Size" options={SIZES} value={prefs.size} onchange={pick('size')} disabled={vector ? SIZES.map(([v]) => v) : []} /></div></div>
        {#if prefs.size === 'px'}
          <div class="set-row"><Icon d={G.width} /><span>Width</span><div class="set-ctl px"><input class="field" type="number" min="1" step="1" aria-label="Width in pixels" disabled={vector} value={prefs.px} oninput={(e) => ((prefs.px = e.currentTarget.valueAsNumber), (dl.err = ''), e.currentTarget.valueAsNumber > 0 && keep())} onkeydown={(e) => e.key === 'Enter' && go()} /><small>px</small></div></div>
        {/if}
        <div class="set-row"><Icon d={G.palette} /><span>Background</span><div class="set-ctl"><Seg label="Background" options={BACKS} value={bgOf({ ...prefs, fmt })} onchange={pick('bg')} disabled={fmt === 'jpeg' ? ['clear'] : []} /></div></div>
      </div>
      <p class="set-note" class:bad={!!dl.err} role={dl.err ? 'alert' : 'status'}>{dl.err || dl.note || say}</p>
      <div class="set-foot"><button class="btn solid" disabled={busy || (!vector && !made)} onclick={go}><Icon name="save" />Download</button></div>
    </div>
  {/if}
</Pop>

{#if dl.zoom}
  <div class="fig-zoom" role="dialog" aria-modal="true" aria-label="Image, enlarged">
    <button class="fig-back" tabindex="-1" aria-label="Close" onclick={close}></button>
    <img src={dl.zoom} alt="" />
    <button class="x fig-x" bind:this={x} title="Close" aria-label="Close" onclick={close}><Icon name="x" size={16} /></button>
  </div>
{/if}
