import { getEditor, pref, remember } from './app.svelte';

export type Choice = 'system' | 'light' | 'dark';

const root = document.documentElement;
const dark = matchMedia('(prefers-color-scheme: dark)');
const saved = pref('md-theme');

export const theme = $state<{ choice: Choice; value: 'light' | 'dark' }>({
  choice: saved === 'light' || saved === 'dark' ? saved : 'system',
  value: root.dataset.theme === 'dark' ? 'dark' : 'light',
});

export const TEXT = [90, 100, 110, 125, 140];
const num = (v: string | null) => (TEXT.includes(Number(v)) ? Number(v) : 100);
const ps = pref('md-palette'), fs = pref('md-face');
export const look = $state({ text: num(pref('md-text')), palette: ps === 'paper' || ps === 'calm' ? ps : 'neutral', face: fs === 'literata' || fs === 'newsreader' ? fs : 'sans' } as { text: number; palette: string; face: string });

export const tint = () => ((document.getElementsByName('theme-color')[0] as HTMLMetaElement).content = getComputedStyle(root).getPropertyValue('--page').trim());

// The browser's own chrome (an installed window's title bar, a phone's address bar) follows the page, not the system.
function apply() {
  theme.value = theme.choice === 'system' ? (dark.matches ? 'dark' : 'light') : theme.choice;
  root.dataset.theme = theme.value;
  tint();
}
apply();

function applyText() {
  look.text === 100 ? root.style.removeProperty('--text') : root.style.setProperty('--text', String(look.text / 100));
  getEditor()?.remeasure();
}
export function setText(n: number, keep = true) {
  if (!TEXT.includes(n)) return;
  look.text = n;
  if (keep) remember('md-text', String(n));
  applyText();
}
export const stepText = (by: 1 | -1) => {
  const n = TEXT[TEXT.indexOf(look.text) + by];
  if (n) setText(n);
};

export function setTheme(choice: Choice) {
  theme.choice = choice;
  remember('md-theme', choice);
  apply();
}
export const toggleTheme = () => setTheme(theme.value === 'dark' ? 'light' : 'dark');

dark.addEventListener('change', apply);
// a choice made in another window of the app is followed here, and never written back
addEventListener('storage', (e) => {
  if (e.key === 'md-text') return setText(num(e.newValue), false);
  if (e.key === 'md-palette') return void import('./ui/look').then((m) => m.setLook('palette', e.newValue === 'paper' || e.newValue === 'calm' ? e.newValue : 'neutral', false));
  if (e.key === 'md-face') return void import('./ui/look').then((m) => m.setLook('face', e.newValue === 'literata' || e.newValue === 'newsreader' ? e.newValue : 'sans', false));
  if (e.key !== 'md-theme') return;
  theme.choice = e.newValue === 'light' || e.newValue === 'dark' ? e.newValue : 'system';
  apply();
});
