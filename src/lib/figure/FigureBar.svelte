<script lang="ts">
  import Icon from '../ui/Icon.svelte';
  import { G } from '../ui/glyphs';
  import './figure.css';
  // what the buttons do is handed in, so this file stays clear of figure.svelte.ts, which makes it
  let { fig, zoom, copy, card, shown }: { fig: HTMLElement; zoom: (fig: HTMLElement, from: HTMLElement) => void; copy: (fig: HTMLElement) => Promise<boolean>; card: (fig: HTMLElement, from: HTMLElement) => void; shown: (from: HTMLElement | undefined) => boolean } = $props();

  // like the code block's copy button: a check for a moment once it has worked
  let done = $state(false);
  let timer = 0;
  async function copied() {
    if (!(await copy(fig))) return;
    done = true;
    clearTimeout(timer);
    timer = window.setTimeout(() => (done = false), 1400);
  }
  let down = $state<HTMLButtonElement>();
</script>

<button type="button" title="Zoom" aria-label="Zoom" onclick={(e) => zoom(fig, e.currentTarget)}><Icon d={G.zoom} size={16} /></button>
<button type="button" class:done title="Copy image" aria-label="Copy image" onclick={copied}>{#if done}<Icon d={G.check} size={16} />{:else}<Icon d={G.copy} size={16} />{/if}</button>
<button type="button" bind:this={down} data-pop="diagram" title="Download image" aria-label="Download image" aria-haspopup="dialog" aria-expanded={shown(down)} onclick={() => card(fig, down!)}><Icon name="save" size={16} /></button>
