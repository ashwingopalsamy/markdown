<script lang="ts">
  import { app, setView, type View } from '../app.svelte';
  import Icon from './Icon.svelte';
  import { G } from './glyphs';
  import Pop from './Pop.svelte';
  import Seg from './Seg.svelte';
  import { showing } from './ui.svelte';
  import './sheets.css';
  let { anchor }: { anchor: () => Element | null } = $props();

  const VIEWS: readonly (readonly [View, string])[] = [['page', 'Page'], ['write', 'Write'], ['split', 'Split'], ['read', 'Read']];
  const ICONS = { page: 'page', write: 'source', split: 'columns', read: 'book' } as const;
  const SAY = { page: 'Click anywhere and write.', write: 'The Markdown itself.', split: 'The Markdown beside the page.', read: 'The page, nothing to edit.' };
  const small = $derived(matchMedia('(max-width: 860px)').matches);
</script>

{#snippet viewIcon(v: View)}<Icon d={G[ICONS[v]]} />{/snippet}

<Pop id="view" label="View" width={344} {anchor}>
  {#if showing('view')}
    <div class="set">
      <Seg label="View" options={VIEWS} value={app.view} onchange={setView} disabled={small ? ['split'] : []} item={viewIcon} />
      <p class="set-note">{SAY[app.view]} <kbd>⌘\</kbd></p>
    </div>
  {/if}
</Pop>
