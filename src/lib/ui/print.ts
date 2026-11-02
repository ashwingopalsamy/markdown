import './print.css';
import { current, fileName, settlePage } from '../app.svelte';
let was = '';
const done = () => { const slot = document.getElementById('print'); if (slot) slot.textContent = ''; if (was) document.title = was; was = ''; };
export async function printDoc() {
  const d = current(); if (!d || was) return;
  settlePage();
  const slot = document.getElementById('print')!;
  slot.innerHTML = await (await import('../render')).renderToHtml(d.text);
  if (__LOCAL__) await (await import('../local/pictures')).draw([...slot.children] as HTMLElement[], () => true, () => {});
  for (const x of slot.querySelectorAll<HTMLDetailsElement>('details:not(.props)')) x.open = true;
  const bare = (s: string) => s.trim().replace(/^https?:\/\/(?:www\.)?/, '').replace(/\/$/, '');
  for (const a of slot.querySelectorAll<HTMLAnchorElement>('a[href^="http"]')) if (bare(a.textContent ?? '') === bare(a.getAttribute('href')!)) a.classList.add('bare');
  await document.fonts.ready;
  was = document.title;
  document.title = fileName(d).replace(/\.[^.]+$/, '');
  addEventListener('afterprint', done, { once: true });
  window.print();
}
// the browser's own Print menu: what is on the page, if nothing was prepared
addEventListener('beforeprint', () => { const slot = document.getElementById('print'); const live = document.querySelector('.pane.read > div'); if (slot && !slot.childElementCount && live) { slot.innerHTML = live.innerHTML; slot.querySelectorAll('.fig-bar, .pg-slash, .copy').forEach((n) => n.remove()); addEventListener('afterprint', () => (slot.textContent = ''), { once: true }); } });
