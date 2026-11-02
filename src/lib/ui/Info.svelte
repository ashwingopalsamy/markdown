<script lang="ts">
  import { app, current, dirty, fileInfo, goto } from '../app.svelte';
  import Icon from './Icon.svelte';
  import { G } from './glyphs';
  import Pop from './Pop.svelte';
  import { showing, ui } from './ui.svelte';
  import './sheets.css';
  let { anchor }: { anchor: () => Element | null } = $props();

  const n = (v: number) => v.toLocaleString('en');
  // the counts come from the page as drawn; its stats land a moment after it is
  const found = $derived.by(() => {
    void app.stats;
    void app.headings;
    const root = document.querySelector('.pane.read > div');
    const all = (sel: string) => [...(root?.querySelectorAll(sel) ?? [])];
    return {
      Links: ['link', all('a[href]:not(.anchor, .rimg, .fnback, .fnref a, nav.toc a)')] as const,
      Pictures: ['image', all('img:not(.drawio), a.rimg')] as const,
      Diagrams: ['diagram', all('figure.mermaid')] as const,
    };
  });
  const lineOf = (el: Element) => Number(el.closest('[data-line]')?.getAttribute('data-line') ?? 0);
  function jump(go: () => void) {
    ui.pop = null;
    go();
  }
  const kept = $derived.by(() => {
    void app.rev;
    const d = current();
    return !d?.handle ? 'On this device' : !dirty(d) ? 'Saved to the file' : app.stale ? 'Changed on disk too' : 'Not yet saved to the file';
  });
  const f = $derived(__LOCAL__ && current()?.source ? fileInfo(current()!) : null);
  const disk = $derived.by(() => {
    const d = current();
    if (!f || !d) return null;
    return f.gone ? ['bad', 'Gone from disk'] : f.changed ? ['wait', 'Changed on disk'] : dirty(d) ? ['on', 'Not yet saved'] : ['ok', 'Same as here'];
  });
</script>

<Pop id="info" label="Info" width={344} {anchor}>
  {#if showing('info')}
    <div class="set">
      <div class="set-group">
        <div class="set-kv"><Icon d={G.type} /><span>Words</span><b>{n(app.stats.words)}</b></div>
        <div class="set-kv"><Icon d={G.hash} /><span>Characters</span><b>{n(app.stats.chars)}</b></div>
        <div class="set-kv"><Icon d={G.book} /><span>Reading time</span><b>{app.stats.minutes ? `${app.stats.minutes} min` : '—'}</b></div>
      </div>
      <div class="set-group">
        <button class="row-b kv" disabled={!app.headings.length} onclick={() => jump(() => goto(app.headings[0].line, app.headings[0].id))}><Icon d={G.heading} /><span>Headings</span><b>{app.headings.length}</b></button>
        {#each Object.entries(found) as [label, [icon, els]]}
          <button class="row-b kv" disabled={!els.length} onclick={() => jump(() => goto(lineOf(els[0]), ''))}><Icon d={G[icon]} /><span>{label}</span><b>{els.length}</b></button>
        {/each}
      </div>
      <div class="set-group">
        {#if f && disk}
          <div class="set-kv"><Icon name="file" /><span>File</span><code class="path">{f.path}</code></div>
          <div class="set-kv"><Icon d={G.folder} /><span>Project</span><b>{f.project || '—'}</b></div>
          <div class="set-kv"><Icon name="save" /><span>Last saved</span><b>{f.savedAt ? new Date(f.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Not from this window'}</b></div>
          <div class="set-kv"><Icon d={G.check} /><span>On disk</span><span class="st" data-s={disk[0]}>{disk[1]}</span></div>
        {:else if !__LOCAL__}
          <div class="set-kv"><Icon name="lock" /><span>Kept</span><b>{kept}</b></div>
        {/if}
      </div>
    </div>
  {/if}
</Pop>
