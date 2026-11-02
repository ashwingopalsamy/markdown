<script lang="ts">
  import { app, current, tabs } from '../app.svelte';
  import Icon from '../ui/Icon.svelte';
  import { G } from '../ui/glyphs';
  import { lstate, note, resolve, reveal, tour } from './sync.svelte';

  // What only md Local shows: the pairing screen, the quiet reconnecting state, the one-line note for a tab, and the conflict choice.
  const line = $derived(note());
  const clash = $derived(lstate.conflict !== '' && lstate.conflict === app.active);
</script>

{#if lstate.pair}
  <main class="pair">
    <div>
      <img src="/mark.svg" alt="" width="26" height="32" />
      <p>Run <code>md &lt;file&gt;</code> to connect this window.</p>
    </div>
  </main>
{:else}
  {#if lstate.offline}<div class="lnote" role="status">Reconnecting</div>{:else if line}<div class="lnote" role="status">{line}</div>{/if}
  {#if clash}
    <div class="note" role="alert">
      <span>{current()?.name} changed on disk.</span>
      <button onclick={() => resolve('overwrite')}>Overwrite</button>
      <button onclick={() => resolve('load')}>Load it</button>
    </div>
  {/if}
  {#if app.ready && current()?.source}<button class="corner l pill" onclick={() => reveal(current()!)}><Icon d={G.folder} size={16} /><span>Show in Finder</span></button>{/if}
  {#if app.ready && !tabs.list.length}<p class="lempty"><span>Run <code>md &lt;file&gt;</code> to open a file here, or <button onclick={tour}>take the tour</button>.</span></p>{/if}
{/if}
