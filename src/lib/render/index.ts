import { View, type Heading } from './view';
import { sanitize } from './sanitize';

export type { Heading };
export { statsOf, type Stats } from './text';
export { sanitize };

/** Keeps one live view of a document. Only blocks whose source changed touch the DOM. */
export class Preview {
  private view: View;

  constructor(root: HTMLElement) {
    this.view = new View(root, true);
  }

  update(source: string, fresh = false): void {
    this.view.update(source, fresh);
  }

  get headings(): Heading[] {
    return this.view.headings;
  }

  destroy(): void {
    this.view.destroy();
  }

  /** Source line <-> vertical position in the scroller, for scroll sync. */
  topOfLine(line: number): number | null {
    return this.view.topOfLine(line);
  }

  lineAtTop(y: number): number {
    return this.view.lineAtTop(y);
  }
}

/** The document as body HTML with code, math and diagrams already done. Math keeps KaTeX's own markup. */
export async function renderToHtml(source: string): Promise<string> {
  const box = document.createElement('div');
  const view = new View(box, false);
  try {
    view.update(source);
    await view.settle();
    return box.innerHTML;
  } finally {
    view.destroy();
  }
}
