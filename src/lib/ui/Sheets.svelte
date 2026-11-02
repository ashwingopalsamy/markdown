<script lang="ts">
  import TabList from './TabList.svelte';
  import Outline from './Outline.svelte';
  import Exporter from './Exporter.svelte';
  import Library from './Library.svelte';
  import ViewCard from './ViewCard.svelte';
  import Privacy from './Privacy.svelte';
  import Settings from './Settings.svelte';
  import Keys from './Keys.svelte';
  import Toc from './Toc.svelte';
  import Info from './Info.svelte';

  const anchorOf = (p: string) => () => document.querySelector(`[data-pop="${p}"]`);
</script>

<TabList />
<Outline anchor={anchorOf('outline')} />
<Exporter anchor={anchorOf('export')} />
<Library anchor={anchorOf('open')} />
<ViewCard anchor={anchorOf('view')} />
<Info anchor={anchorOf('info')} />
<Privacy anchor={anchorOf('privacy')} />
<Settings anchor={anchorOf('settings')} />
<Keys anchor={anchorOf('settings')} />
<Toc />
