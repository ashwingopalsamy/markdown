<script lang="ts">
  import { applyEditorPrefs, pref, remember } from '../app.svelte';
  import { look, stepText, TEXT, theme } from '../theme.svelte';
  import { setLook } from './look';
  import { docs } from '../store';
  import Icon from './Icon.svelte';
  import { G } from './glyphs';
  import Pop from './Pop.svelte';
  import Seg from './Seg.svelte';
  import { showing, ui } from './ui.svelte';
  import './sheets.css';
  let { anchor }: { anchor: () => Element | null } = $props();

  const SW: Record<string, Record<'light' | 'dark', [string, string]>> = {
    neutral: { light: ['#f5f5f7', '#1d1d1f'], dark: ['#0a0a0c', '#f5f5f7'] },
    paper: { light: ['#f6efe3', '#3a2718'], dark: ['#16100c', '#f2e7d7'] },
    calm: { light: ['#eee6d6', '#45372a'], dark: ['#1c1a17', '#e6ddcf'] },
  };
  let width = $state(pref('md-width') ?? 'narrow');
  let spell = $state(pref('md-spell') === '1');
  let confirming = $state(false);

  $effect(() => {
    remember('md-width', width);
    document.documentElement.dataset.width = width;
  });
  function setSpell() {
    spell = !spell;
    remember('md-spell', spell ? '1' : '0');
    applyEditorPrefs();
  }
  async function eraseAll() {
    await docs.wipe();
    try {
      localStorage.clear();
    } catch {}
    location.replace('/');
  }
</script>

{#snippet widthIcon(v: string)}<Icon d={G[v as 'narrow' | 'normal' | 'wide']} />{/snippet}
{#snippet faceItem(v: string)}<b class="aa" data-f={v}>Aa</b>{/snippet}
{#snippet palItem(v: string)}<i class="pal" style:--a={SW[v][theme.value][0]} style:--b={SW[v][theme.value][1]}></i>{/snippet}

<Pop id="settings" label="Settings" width={344} {anchor}>
  {#if showing('settings')}
    <div class="set">
      <div class="set-group">
        <div class="set-row"><Icon d={G.width} /><span>Page width</span><div class="set-ctl"><Seg label="Page width" options={[['narrow', 'Narrow'], ['normal', 'Normal'], ['wide', 'Wide']]} value={width} onchange={(v) => (width = v)} item={widthIcon} /></div></div>
        <div class="set-row"><Icon d={G.type} /><span>Typeface</span><div class="set-ctl"><Seg label="Typeface" options={[['sans', 'Sans'], ['literata', 'Literata'], ['newsreader', 'Newsreader']]} value={look.face} onchange={(v) => setLook('face', v)} item={faceItem} /></div></div>
        <div class="set-row"><Icon d={G.palette} /><span>Colours</span><div class="set-ctl"><Seg label="Colours" options={[['neutral', 'Neutral'], ['paper', 'Paper'], ['calm', 'Calm']]} value={look.palette} onchange={(v) => setLook('palette', v)} item={palItem} /></div></div>
        <div class="set-row phone">
          <Icon d={G.size} /><span>Text size</span>
          <div class="set-ctl step" role="group" aria-label="Text size">
            <button aria-label="Smaller text" disabled={look.text <= TEXT[0]} onclick={() => stepText(-1)}><b class="s">A</b></button>
            <output>{look.text}%</output>
            <button aria-label="Larger text" disabled={look.text >= TEXT[TEXT.length - 1]} onclick={() => stepText(1)}><b class="l">A</b></button>
          </div>
        </div>
        <button class="sw" role="switch" aria-checked={spell} title="Some browsers offer an online mode; it is theirs and off by default." onclick={setSpell}><Icon d={G.spell} /><span>Check spelling</span><i class="track"><i class="knob"></i></i></button>
      </div>
      {#if confirming}
        <p class="set-note bad">This deletes every document, version and setting here. Files on your disk stay.</p>
        <div class="set-foot"><button class="btn quiet warn" onclick={eraseAll}><Icon d={G.trash} />Erase</button><button class="btn quiet" onclick={() => (confirming = false)}>Keep it</button></div>
      {:else}
        <div class="set-foot"><button class="btn quiet" onclick={() => (ui.pop = 'keys')}><Icon d={G.keys} />Shortcuts</button><button class="btn quiet warn" onclick={() => (confirming = true)}><Icon d={G.trash} />Erase</button></div>
      {/if}
    </div>
  {/if}
</Pop>
