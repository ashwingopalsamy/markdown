export type Kind = 'mermaid' | 'plantuml' | 'drawio';
export const kindOf = (pre: Element): Kind => (pre.querySelector('code.language-plantuml') ? 'plantuml' : pre.querySelector('code.language-drawio') ? 'drawio' : 'mermaid');
/** One drawing as markup. `live` draws for the page's theme; otherwise light, for export and print. */
export function drawFig(kind: Kind, text: string, live: boolean, alive: () => boolean = () => true): Promise<string | null> {
  if (kind === 'plantuml') return import('./plantuml').then((m) => m.render(text, live, alive));
  if (kind === 'drawio') return import('./drawio').then((m) => m.render(text, alive));
  return import('../mermaid').then((m) => m.draw(text, live && document.documentElement.dataset.theme === 'dark', alive));
}
