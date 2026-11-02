import { INK, palette } from './ink';
import { sanitize } from './sanitize';

let lib: Promise<typeof import('mermaid').default> | undefined;
let turn: Promise<unknown> = Promise.resolve();
let count = 0;

/**
 * One drawing as sanitized SVG, or null when `alive` said no by the time its turn came. Mermaid keeps global state
 * and builds in the page, so drawings are strictly one at a time. A syntax error rejects with its message.
 */
export function draw(source: string, dark: boolean, alive: () => boolean = () => true): Promise<string | null> {
  const run = turn.then(async () => {
    if (!alive()) return null;
    const mermaid = await (lib ??= import('mermaid').then((m) => m.default));
    if (!alive()) return null;
    const p = palette();
    const k = p && INK[p][dark ? 'dark' : 'light'];
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      suppressErrorRendering: true,
      theme: k ? 'base' : dark ? 'dark' : 'default',
      themeVariables: k ? { darkMode: dark, background: k.page, primaryColor: k.fill, primaryTextColor: k.fg, primaryBorderColor: k.line, secondaryColor: k.fill2, tertiaryColor: k.fill2, lineColor: k.line, textColor: k.fg, mainBkg: k.fill, nodeBorder: k.line, clusterBkg: k.fill2, clusterBorder: k.line, noteBkgColor: k.note, noteTextColor: k.fg, noteBorderColor: k.line, actorBkg: k.fill, actorBorder: k.line, actorTextColor: k.fg, signalColor: k.fg, signalTextColor: k.fg, labelBoxBkgColor: k.fill, labelBoxBorderColor: k.line, labelTextColor: k.fg, edgeLabelBackground: k.fill2 } : {},
      fontFamily: 'Inter, -apple-system, system-ui, sans-serif',
    });
    const id = `md-mmd-${++count}`;
    try {
      return sanitize((await mermaid.render(id, source)).svg, 'svg');
    } finally {
      // a failed render leaves its scratch element behind
      document.getElementById('d' + id)?.remove();
      document.getElementById(id)?.remove();
    }
  });
  turn = run.catch(() => {});
  return run;
}
