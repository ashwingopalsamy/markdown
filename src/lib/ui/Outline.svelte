<script lang="ts">
  import { app, goto } from '../app.svelte';
  import Pop from './Pop.svelte';
  import { showing } from './ui.svelte';
  import './sheets.css';
  let { anchor }: { anchor: () => Element | null } = $props();
  const top = $derived(Math.min(...app.headings.map((h) => h.level), 6));
</script>

<Pop id="outline" label="Contents" width={344} {anchor}>
  {#if showing('outline')}
    <div class="set outline">
      {#if app.headings.length}
        <nav>
          {#each app.headings as h}
            <button class="ol" style:--d={h.level - top} class:top={h.level === top} onclick={() => goto(h.line, h.id)}>{h.text}</button>
          {/each}
        </nav>
      {:else}
        <p class="set-note empty">Headings you write show up here.</p>
      {/if}
    </div>
  {/if}
</Pop>
