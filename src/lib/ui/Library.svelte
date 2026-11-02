<script lang="ts">
  import { app, tabs, current, erase, fresh, openPicked, openText, openTour, rename, reopen, restore, say, title } from '../app.svelte';
  import { docs, pickFolder, readLink, type Doc, type Snapshot } from '../store';
  import Icon from './Icon.svelte';
  import { G } from './glyphs';
  import Pop from './Pop.svelte';
  import { showing, ui } from './ui.svelte';
  import './sheets.css';
  let { anchor }: { anchor: () => Element | null } = $props();

  let all = $state.raw<Doc[]>([]);
  let q = $state('');
  let snaps = $state.raw<Snapshot[]>([]);
  let showSnaps = $state(false);
  let folder = $state.raw<FolderEntry[]>([]);
  let renaming = $state('');

  $effect(() => {
    if (!showing('open')) return;
    void app.rev;
    docs.all().then((d) => (all = d.sort((a, b) => b.updated - a.updated)));
  });
  const shown = $derived(all.filter((d) => !q || title(d).toLowerCase().includes(q.toLowerCase()) || d.text.toLowerCase().includes(q.toLowerCase())).slice(0, 200));
  const when = (t: number) => {
    const s = (Date.now() - t) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };
  const pick = (id: string) => ((ui.pop = null), reopen(id));
  const tour = () => ((ui.pop = null), openTour());
  async function openFolder() {
    const got = await pickFolder().catch((e) => ((e as Error).name === 'AbortError' ? [] : (say('That folder could not be read.'), [])));
    if (got === null) return say('This browser cannot open folders. Chrome and Edge can.');
    folder = got;
  }
  async function openEntry(e: FolderEntry) {
    ui.pop = null;
    try {
      await openText(e.name, await e.text(), e.handle);
    } catch (err) {
      say(err instanceof Error ? err.message : 'That file could not be read.');
    }
  }
  // A link that carries its text opens here, with no request. This page cannot fetch anything else, so any other address opens in its own browser tab.
  let link = $state('');
  async function follow() {
    let url: URL;
    try {
      url = new URL(link.trim());
    } catch {
      return say('That is not a link.');
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return say('Only web links can be opened.');
    link = '';
    ui.pop = null;
    const carried = readLink(url.hash);
    if (carried) return void openText(carried.name, await carried.text);
    window.open(url.href, '_blank', 'noopener,noreferrer');
    say('This page cannot fetch. Save it as a file, then drop it here.');
  }
  async function history() {
    showSnaps = !showSnaps;
    if (showSnaps && current()) snaps = (await docs.snapshots(current()!.id)).sort((a, b) => b.at - a.at);
  }
</script>

<Pop id="open" label="Open" width={344} {anchor}>
  {#if showing('open')}
    <div class="set lib">
      {#if __LOCAL__}
        <!-- md Local keeps no documents of its own: its tabs are files on disk, opened from a terminal -->
        <p class="set-note">Open a file with <code>md &lt;file&gt;</code> in a terminal.</p>
        <div class="set-group acts"><button class="row-b" onclick={tour}><Icon d={G.tour} /><span>Open the tour</span></button></div>
      {:else}
      <div class="set-group acts">
        <button class="row-b" onclick={() => ((ui.pop = null), fresh())}><Icon name="plus" /><span>New document</span><kbd>⌥N</kbd></button>
        <button class="row-b" onclick={() => ((ui.pop = null), openPicked())}><Icon name="file" /><span>Open a file</span><kbd>⌘O</kbd></button>
        <button class="row-b" onclick={openFolder}><Icon d={G.folder} /><span>Open a folder</span></button>
        <button class="row-b" onclick={tour}><Icon d={G.tour} /><span>Open the tour</span></button>
        <form class="set-row open-link" novalidate onsubmit={(e) => (e.preventDefault(), follow())}>
          <Icon d={G.link} />
          <input type="url" inputmode="url" placeholder="Paste a link" aria-label="Paste a link" autocomplete="off" spellcheck="false" bind:value={link} />
          {#if link.trim()}<button type="submit">Open</button>{:else}<kbd>⌘V</kbd>{/if}
        </form>
      </div>
      {#if folder.length}
        <div class="set-cat">Folder</div>
        <div class="set-group scroll">
          {#each folder as e}
            <button class="row-b" onclick={() => openEntry(e)}><Icon name="file" /><span>{e.name}<small>{e.path}</small></span></button>
          {/each}
        </div>
      {/if}
      <div class="set-cat">On this device</div>
      <div class="set-row open-link"><Icon name="find" /><input type="search" placeholder="Search documents" aria-label="Search documents" autocomplete="off" spellcheck="false" bind:value={q} /></div>
      <div class="set-group scroll">
        {#each shown as d (d.id)}
          <div class="doc-row" class:on={d.id === app.active}>
            {#if renaming === d.id}
              <!-- svelte-ignore a11y_autofocus -->
              <input class="field" autofocus value={d.name} aria-label="Name" onkeydown={(e) => { if (e.key === 'Enter') { const live = tabs.list.find((x) => x.id === d.id) ?? d; rename(live, e.currentTarget.value); renaming = ''; } else if (e.key === 'Escape') { e.stopPropagation(); renaming = ''; } }} onblur={() => (renaming = '')} />
            {:else}
              <button class="row-b" onclick={() => pick(d.id)}><Icon name="file" /><span>{title(d)}<small>{when(d.updated)}{d.handle ? ' · linked to a file' : ''}{d.open ? ' · open' : ''}</small></span></button>
              <button class="x" aria-label="Rename {title(d)}" title="Rename" onclick={() => (renaming = d.id)}><Icon name="pen" size={14} /></button>
              <button class="x" aria-label="Delete {title(d)}" title="Delete" onclick={() => erase(d.id)}><Icon d={G.trash} size={14} /></button>
            {/if}
          </div>
        {:else}
          <p class="set-note empty">{q ? 'Nothing matches.' : 'No documents yet.'}</p>
        {/each}
      </div>
      {/if}
      <div class="set-group">
        <button class="row-b" aria-expanded={showSnaps} onclick={history}><Icon d={G.clock} /><span>Earlier versions of this document</span></button>
        {#if showSnaps}
          <div class="scroll short">
            {#each snaps as s (s.id)}
              <button class="row-b" onclick={() => ((ui.pop = null), restore(s.text))}><Icon d={G.clock} /><span>{new Date(s.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}<small>{s.text.length.toLocaleString('en')} characters</small></span></button>
            {:else}
              <p class="set-note empty">Versions are kept every few minutes while you write.</p>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</Pop>
