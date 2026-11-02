<script lang="ts">
  import Icon from './Icon.svelte';
  import Pop from './Pop.svelte';
  import { showing } from './ui.svelte';
  import { G } from './glyphs';
  import './sheets.css';
  let { anchor }: { anchor: () => Element | null } = $props();

  // the symbol each row carries is the one the same action has where it is a button
  const KEYS: [string, string, { name?: 'save' | 'file' | 'plus' | 'x' | 'pen' | 'outline' | 'find'; d?: string }][] = [
    ['⌘S', 'Save to a file', { name: 'save' }],
    ['⌘P', 'Download PDF', { d: G.print }],
    ['⌘O', 'Open a file', { name: 'file' }],
    ['⌥N', 'New document', { name: 'plus' }],
    ['⌥W', 'Close document', { name: 'x' }],
    ['⌥[ ⌥]', 'Step through documents', { d: G.repeat }],
    ['⌘\\', 'Change view', { name: 'pen' }],
    ['⌥⌘= ⌥⌘−', 'Text size', { d: G.size }],
    ['⇧⌘O', 'Contents', { name: 'outline' }],
    ['⌘F', 'Find and replace', { name: 'find' }],
    ['⌘B ⌘I', 'Bold, italic', { d: G.bold }],
    ['⌘K ⌘E', 'Link, code', { d: G.link }],
    ['/', 'Insert, at a line start', { d: G.slash }],
  ];
</script>

<Pop id="keys" label="Keyboard shortcuts" width={344} {anchor}>
  {#if showing('keys')}
    <div class="set-group keys">
      {#each KEYS as [k, what, ic]}<div class="set-kv"><Icon name={ic.name} d={ic.d} /><span>{what}</span><span class="kk">{#each k.split(' ') as c}<kbd>{c}</kbd>{/each}</span></div>{/each}
    </div>
  {/if}
</Pop>
