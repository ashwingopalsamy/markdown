import { remember } from '../app.svelte';
import { look, tint } from '../theme.svelte';

const root = document.documentElement;
// Paper, Calm and the two serifs are sheets of their own, fetched the first time they are chosen (public/theme.js does the same before paint when one is stored).
const BASE = { palette: 'neutral', face: 'sans' } as const;
export function setLook(kind: 'palette' | 'face', v: string, keep = true) {
  look[kind] = v;
  if (keep) remember(`md-${kind}`, v);
  if (v === BASE[kind]) return delete root.dataset[kind], tint();
  const href = `/look/${v}.css`;
  let link = document.querySelector<HTMLLinkElement>(`link[href="${href}"]`);
  const on = () => look[kind] === v && ((root.dataset[kind] = v), tint());
  if (link?.sheet) return on();
  if (!link) (link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href })), document.head.append(link);
  link.addEventListener('load', on, { once: true });
}
