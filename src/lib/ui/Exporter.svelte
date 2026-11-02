<script lang="ts">
  import { current, downloadText, fileName, save, say } from '../app.svelte';
  import { download, encodeInbound } from '../store';
  import { look } from '../theme.svelte';
  import Icon from './Icon.svelte';
  import { G } from './glyphs';
  import Pop from './Pop.svelte';
  import { printDoc } from './print';
  import { ui } from './ui.svelte';
  import './sheets.css';
  let { anchor }: { anchor: () => Element | null } = $props();

  const go = (fn: () => unknown) => async () => {
    ui.pop = null;
    try {
      await fn();
    } catch (e) {
      say(e instanceof Error ? e.message : 'That did not work.');
    }
  };
  const body = async () => (await import('../render')).renderToHtml(current()?.text ?? '');

  // The page cannot fetch its own stylesheets, so they are read from what it has already loaded. Math leaves as MathML, which needs no font file.
  function sheetText() {
    const out: string[] = [];
    const take = (rule: CSSRule) => {
      if (rule instanceof CSSFontFaceRule) return;
      // the screen-only rules (dark tokens, the palettes) are what the file needs, so they come out of their wrapper
      if (rule instanceof CSSMediaRule && rule.media.mediaText === 'screen') return void [...rule.cssRules].forEach(take);
      const t = rule.cssText;
      if (/\.md\b|\.katex|\.shiki|--shiki|\.alert|\.rimg|^:root/.test(t)) out.push(t);
    };
    for (const sheet of document.styleSheets) for (const rule of sheet.cssRules) take(rule);
    return out.join('\n');
  }
  async function html() {
    const box = document.createElement('template');
    box.innerHTML = await body();
    box.content.querySelectorAll('.katex-html').forEach((n) => n.remove());
    box.content.querySelectorAll('.copy, [data-copy]').forEach((n) => n.remove());
    const d = current()!;
    const name = d.name.replace(/\.[^.]+$/, '').replace(/[<&]/g, '');
    const theme = document.documentElement.dataset.theme ?? 'light';
    const root = document.documentElement;
    const w = root.dataset.width;
    const col = w === 'normal' ? '1120px' : w === 'wide' ? 'none' : '760px';
    const gut = w === 'wide' ? '80px' : '24px';
    return `<!doctype html>
<html lang="en" data-theme="${theme}"${root.dataset.palette ? ` data-palette="${root.dataset.palette}"` : ''}${root.dataset.face ? ` data-face="${root.dataset.face}"` : ''}${look.text === 100 ? '' : ` style="--text:${look.text / 100}"`}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><title>${name}</title><style>
${sheetText()}
body{margin:0;background:var(--paper);color:var(--fg);font:16px/1.6 Inter,-apple-system,system-ui,sans-serif}
.md{max-width:${col};margin:0 auto;padding:48px ${gut}}
.katex-mathml{position:static!important;clip:auto!important;width:auto!important;height:auto!important;overflow:visible!important;padding:0!important;border:0!important}
</style></head><body><main class="md">${box.innerHTML}</main></body></html>`;
  }
  async function copyRich() {
    const h = await body();
    const box = document.createElement('div');
    box.innerHTML = h;
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([h], { type: 'text/html' }), 'text/plain': new Blob([box.textContent ?? ''], { type: 'text/plain' }) })]);
    say('Copied as rich text.');
  }
  async function copyLink() {
    const d = current()!;
    const frag = await encodeInbound(d.text, fileName(d));
    const url = `${location.origin}/${frag}`;
    await navigator.clipboard.writeText(url);
    say(url.length > 60_000 ? 'Copied. This link is long and some apps will cut it off.' : 'Copied. The file is inside the link; anyone with the link has it.');
  }
</script>

<Pop id="export" label="Export" width={344} {anchor}>
  <div class="set">
    <div class="set-group">
      <button class="row-b" onclick={go(save)}><Icon name="save" /><span>Save to a file</span><kbd>⌘S</kbd></button>
      <button class="row-b" onclick={go(() => current() && downloadText(current()!))}><Icon name="file" /><span>Download Markdown</span></button>
      <button class="row-b" onclick={go(async () => { const d = current()!; download(fileName(d).replace(/\.[^.]+$/, '') + '.html', new Blob([await html()], { type: 'text/html;charset=utf-8' })); })}><Icon d={G.code} /><span>Download HTML</span></button>
      <button class="row-b" onclick={go(printDoc)}><Icon d={G.print} /><span>Download PDF</span><kbd>⌘P</kbd></button>
    </div>
    <div class="set-group">
      <button class="row-b" onclick={go(async () => { await navigator.clipboard.writeText(current()?.text ?? ''); say('Copied the Markdown.'); })}><Icon d={G.copy} /><span>Copy Markdown</span></button>
      <button class="row-b" onclick={go(copyRich)}><Icon d={G.type} /><span>Copy rich text</span></button>
      <!-- md Local opens files, not links: a link to its document would open nothing -->
      {#if !__LOCAL__}
        <button class="row-b" title="The text travels in the link and reaches no server" onclick={go(copyLink)}><Icon d={G.link} /><span>Copy link</span></button>
      {/if}
    </div>
  </div>
</Pop>
