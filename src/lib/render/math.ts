/** Typesets the `.math` placeholders under `root`. KaTeX and its stylesheet load on first use. */
export async function typeset(root: ParentNode, alive: () => boolean = () => true): Promise<void> {
  if (!root.querySelector('.math[data-tex]')) return;
  const [{ default: katex }] = await Promise.all([import('katex'), import('katex/dist/katex.min.css')]);
  // the block may have been replaced while the library loaded
  if (!alive()) return;
  for (const node of root.querySelectorAll<HTMLElement>('.math[data-tex]')) {
    katex.render(node.dataset.tex!, node, {
      displayMode: node.classList.contains('display'),
      throwOnError: false,
      trust: false,
      strict: 'ignore',
      maxExpand: 500,
    });
    node.removeAttribute('data-tex');
  }
}
