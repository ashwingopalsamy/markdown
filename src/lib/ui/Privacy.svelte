<script lang="ts">
  import { onChange, policy, requests, violations, type Probe } from '../trust';
  import { durable } from '../store';
  import Icon from './Icon.svelte';
  import { G } from './glyphs';
  import Pop from './Pop.svelte';
  import { showing } from './ui.svelte';
  import './sheets.css';
  let { anchor }: { anchor: () => Element | null } = $props();

  let tick = $state(0);
  let probes = $state.raw<Probe[]>([]);
  let running = $state(false);
  let showList = $state(false);
  let showPolicy = $state(false);

  $effect(() => onChange(() => tick++));
  const seen = $derived.by(() => {
    void tick;
    return showing('privacy') ? requests() : { total: 0, external: 0, list: [] };
  });
  const refusedCount = $derived.by(() => {
    void tick;
    return violations().length;
  });
  const held = $derived(probes.filter((p) => p.refused).length);

  async function run() {
    running = true;
    const [{ selfTest }, { sanitize }] = await Promise.all([import('../trust/selftest'), import('../render')]);
    probes = await selfTest(sanitize);
    running = false;
  }
</script>

<Pop id="privacy" label="Privacy" width={344} {anchor}>
  {#if showing('privacy')}
    <div class="set priv">
      <div class="big">
        <b class:bad={seen.external > 0}>{seen.external}</b>
        <span>{__LOCAL__ ? 'requests past md on this machine' : 'requests to anywhere else'}<small>Since this page opened</small></span>
      </div>
      <div class="set-group">
        <button class="row-b" aria-expanded={showList} onclick={() => (showList = !showList)}><Icon name="file" /><span>{#if __LOCAL__}{seen.total} requests to md on this machine<small>The app, and your files as they load and save.</small>{:else}{seen.total} files from this site<small>The app itself. None carry your text.</small>{/if}</span></button>
        {#if showList}
          <ul class="mono scroll short">{#each seen.list as r}<li>{r.url}</li>{/each}</ul>
        {/if}
        <button class="row-b" aria-expanded={showPolicy} onclick={() => (showPolicy = !showPolicy)}><Icon name="shield" /><span>The rule this page runs under<small>{__LOCAL__ ? "connect-src 'self': md on this machine only" : "connect-src 'none', enforced by the browser"}</small></span></button>
        {#if showPolicy}
          <pre class="mono scroll short">{(policy() ?? 'Not set on the development server. The built page always has it.').replace(/; /g, ';\n')}</pre>
        {/if}
      </div>
      {#if probes.length}
        <p class="set-note" class:bad={held !== probes.length}>{held} of {probes.length} refused</p>
        <ul class="probes scroll">
          {#each probes as p}
            <li class:bad={!p.refused}><Icon d={G[p.refused ? 'check' : 'no']} size={14} /><span>{p.name}<small>{p.detail}</small></span></li>
          {/each}
        </ul>
      {/if}
      {#if refusedCount}<p class="set-note">{refusedCount} blocked by the browser on this page so far.</p>{/if}
      {#if !durable()}<p class="set-note bad">This browser is not letting the page store anything, so {__LOCAL__ ? 'unsaved edits last' : 'documents last'} only until the tab closes.</p>{/if}
      <div class="set-foot">
        <button class="btn quiet" title={__LOCAL__ ? 'Tries to reach the internet, another port on this machine, a file by its path and the network from a diagram engine, and pushes known attacks through the cleaner.' : 'Tries to send, fetch and run things, from the page and from a diagram engine, and pushes known attacks through the cleaner. Every address ends in .invalid, which cannot exist.'} disabled={running} onclick={run}><Icon name="shield" />{running ? 'Trying…' : probes.length ? 'Try again' : 'Try to break out'}</button>
        <a class="btn quiet" href="/trust/" target="_blank" rel="noopener" title="Headers, hashes, and how to check a deployment"><Icon d={G.link} />For security teams</a>
      </div>
    </div>
  {/if}
</Pop>
