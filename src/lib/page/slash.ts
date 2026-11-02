import type { Glyph } from './glyphs';
// The kinds of block `/` offers. The snippets are the source view's; ‸ marks where the caret goes.
const CODE = '```‸\n\n```';
const TABLE = '| ‸Column | Column | Column |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |';
const MATH = '$$\n‸\n$$';
const DIAGRAM = '```mermaid\nflowchart TD\n  A[‸Start] --> B{Choice}\n  B -->|yes| C[Done]\n  B -->|no| A\n```';

export const BLOCKS: readonly (readonly [name: string, hint: string, snippet: string, glyph: Glyph])[] = [
  ['Heading 1', '#', '# ‸', 'heading-1'],
  ['Heading 2', '##', '## ‸', 'heading-2'],
  ['Heading 3', '###', '### ‸', 'heading-3'],
  ['Bulleted list', '-', '- ‸', 'list'],
  ['Numbered list', '1.', '1. ‸', 'order'],
  ['Task', '[ ]', '- [ ] ‸', 'task'],
  ['Quote', '>', '> ‸', 'quote'],
  ['Code', '```', CODE, 'code'],
  ['Table', '| |', TABLE, 'table'],
  ['Divider', '---', '‸---', 'divider'],
  ['Math', '$$', MATH, 'math'],
  ['Diagram', 'mermaid', DIAGRAM, 'diagram'],
];

export function parseSnippet(s: string) {
  return { text: s.replace('‸', ''), anchor: Math.max(0, s.indexOf('‸')) };
}
