// Drawing colours for the warm palettes; Neutral keeps Mermaid's own themes and PlantUML's skins.
export type Ink = { fg: string; line: string; fill: string; fill2: string; note: string; page: string };
export const INK: Record<'paper' | 'calm', Record<'light' | 'dark', Ink>> = {
  paper: { light: { fg: '#3a2718', line: '#735b49', fill: '#f0e7d8', fill2: '#f6efe3', note: '#f5e4c6', page: '#f6efe3' }, dark: { fg: '#f2e7d7', line: '#a8957f', fill: '#2b221b', fill2: '#211913', note: '#3a2c20', page: '#16100c' } },
  calm: { light: { fg: '#45372a', line: '#6b5b4b', fill: '#e5dccb', fill2: '#eee6d6', note: '#ece2cb', page: '#eee6d6' }, dark: { fg: '#e6ddcf', line: '#a39988', fill: '#2e2a25', fill2: '#24211d', note: '#3a352d', page: '#1c1a17' } },
};
export const palette = (): 'paper' | 'calm' | null => { const p = document.documentElement.dataset.palette; return p === 'paper' || p === 'calm' ? p : null; };
