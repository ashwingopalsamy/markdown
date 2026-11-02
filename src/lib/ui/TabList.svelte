<script lang="ts">
  import { activate, app, closeTab, dirty, fresh, tabs, title, unread, where } from '../app.svelte';
  import type { Doc } from '../store';
  import { fit } from './fit';
  import Icon from './Icon.svelte';
  import Pop from './Pop.svelte';
  import { showing, ui } from './ui.svelte';
  import './tabs.css';

  // Every open document in one list: where the chips do not fit, and on a phone.
  const open = $derived(ui.pop === 'tabs');
  let list = $state<HTMLElement>();

  // A long list scrolls on its own, under the row that opens another; it opens on the document being read.
  $effect(() => {
    if (!open || !list) return;
    const on = list.querySelector<HTMLElement>('.tb-item.on');
    if (on) list.scrollTop = on.offsetTop - (list.clientHeight - on.offsetHeight) / 2;
  });
  // a file md Local opened says where it lives; the rest are in this browser
  const line = (d: Doc) => (dirty(d) ? 'Not yet saved to the file' : __LOCAL__ && d.source ? `…/${where(d).split('/').slice(-3).join('/')}` : d.handle ? 'A file on this device' : 'Saved on this device');

  function go(id: string) {
    ui.pop = null;
    activate(id);
  }

  // Up and down move between the rows.
  function keys(e: KeyboardEvent) {
    if (!open || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
    const picks = [...document.querySelectorAll<HTMLElement>('#pop-tabs .tb-pick')];
    const i = picks.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    e.preventDefault();
    picks[Math.min(picks.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))].focus();
  }
</script>

<svelte:window onkeydown={keys} />

<Pop id="tabs" label="Open documents" width={344} anchor={() => document.querySelector('[data-pop=tabs]')}>
  {#if showing('tabs')}
    <ul class="tb-list" bind:this={list}>
      {#each tabs.list as d (d.id)}
        {@const on = d.id === app.active}
        <li class="tb-item" class:on>
          <button class="tb-pick" title={__LOCAL__ ? where(d) : d.name} aria-current={on ? 'page' : undefined} onclick={() => go(d.id)}>
            <Icon name="file" size={14} />
            <span class="tb-txt"><b>{fit(title(d), 236, '600 14px Inter, system-ui, sans-serif')}</b><small>{#if __LOCAL__ && unread(d)}New · {/if}{line(d)}</small></span>
          </button>
          <button class="tb-x" aria-label="Close {title(d)}" title="Close" onclick={() => closeTab(d.id)}><Icon name="x" size={14} /></button>
        </li>
      {/each}
    </ul>
    {#if !__LOCAL__}<button class="tb-foot" onclick={() => ((ui.pop = null), fresh())}><Icon name="plus" /><span>New document</span><kbd>⌥N</kbd></button>{/if}
  {/if}
</Pop>
