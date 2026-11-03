<script lang="ts">
  import { demo } from '../../../site/home.copy';
  import { clearDemo } from '../app.svelte';
  import { G } from './glyphs';
  import Icon from './Icon.svelte';
</script>

<!-- The landing page's demo is open: a pill under the header says so, and Clear deletes it from this device. -->
<div class="demo-strip pill" role="status">
  <Icon d={G.tour} size={16} />
  <span>{demo.label}</span>
  <i class="sep" aria-hidden="true"></i>
  <button class="clear" title={demo.clearTitle} onclick={clearDemo}>{demo.clear}</button>
</div>

<style>
  .demo-strip { position: fixed; z-index: 15; top: 60px; left: 50%; transform: translateX(-50%); gap: 10px; height: 36px; padding: 0 6px 0 14px; font-size: var(--fs-sm); font-weight: 500; color: var(--fg-2); white-space: nowrap; animation: rise var(--t3) var(--out); }
  .sep { width: 1px; height: 16px; background: var(--line-2); }
  .clear { height: 28px; padding: 0 12px; border-radius: 999px; font-weight: 600; color: var(--fg); transition: background var(--t1) var(--out); }
  .clear:hover { background: var(--fill); }
</style>
