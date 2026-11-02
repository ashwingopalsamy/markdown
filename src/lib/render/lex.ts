import { Marked, Renderer, type Token, type TokenizerAndRendererExtension, type Tokens } from 'marked';
import { TASK } from './sanitize';

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Footnote definitions found by the last `lexDoc`. Inline references resolve against them: all blocks are lexed before any inline run. */
let defs = new Map<string, Tokens.Generic>();

// An extension's `start` runs on everything left of the document for each paragraph; a paragraph ends at its first
// blank line, so looking further only makes a long document quadratic.
const head = (src: string) => {
  const end = src.indexOf('\n\n');
  return end < 0 ? src : src.slice(0, end);
};

// KaTeX renders these placeholders on demand; until then the source stays readable.
const math = (tex: string, display: boolean) =>
  `<span class="math${display ? ' display' : ''}" data-tex="${escapeHtml(tex)}">${escapeHtml(tex)}</span>`;

interface MathToken extends Tokens.Generic {
  type: 'inlineMath' | 'blockMath';
  text: string;
  display: boolean;
}

const INLINE_MATH = [/^\$\$([\s\S]+?)\$\$/, /^\\\(([\s\S]+?)\\\)/, /^\\\[([\s\S]+?)\\\]/];
// $x$ but not a price: no space inside the delimiters, no digit right after the closing one.
const DOLLAR = /^\$(?!\s)((?:\\.|[^\\$\n]|\n(?!\n))+?)(?<!\s)\$(?!\d)/;

const ALERTS: Record<string, string> = { note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution' };
const ALERT = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\n|$)/i;

const EMOJI: Record<string, string> = Object.fromEntries(
  `smile 😄|grin 😁|joy 😂|laughing 😆|wink 😉|blush 😊|heart_eyes 😍|sunglasses 😎|thinking 🤔|neutral_face 😐|confused 😕|cry 😢|sob 😭|angry 😠|scream 😱|sweat_smile 😅|innocent 😇|rofl 🤣|slightly_smiling_face 🙂|upside_down_face 🙃|+1 👍|thumbsup 👍|-1 👎|thumbsdown 👎|clap 👏|wave 👋|pray 🙏|ok_hand 👌|raised_hands 🙌|muscle 💪|eyes 👀|heart ❤️|broken_heart 💔|sparkles ✨|star ⭐|fire 🔥|zap ⚡|boom 💥|tada 🎉|rocket 🚀|bulb 💡|warning ⚠️|x ❌|white_check_mark ✅|heavy_check_mark ✔️|question ❓|exclamation ❗|bug 🐛|memo 📝|book 📖|bookmark 🔖|link 🔗|lock 🔒|key 🔑|mag 🔍|bell 🔔|hourglass ⏳|calendar 📅|pushpin 📌|paperclip 📎|package 📦|gear ⚙️|wrench 🔧|hammer 🔨|computer 💻|email 📧|phone ☎️|sun ☀️|cloud ☁️|umbrella ☂️|snowflake ❄️|rainbow 🌈|coffee ☕|pizza 🍕|beer 🍺|trophy 🏆|100 💯|checkered_flag 🏁|construction 🚧|skull 💀|ghost 👻|see_no_evil 🙈|shrug 🤷|point_right 👉|point_left 👈|point_up ☝️|arrow_right ➡️|arrow_left ⬅️`
    .split('|')
    .map((s) => s.split(' ')),
);

const NUMBER = /^[+\-−]?[$€£¥]?\s?(?:\d[\d,_]*(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?\s?%?$/;

/** A definition list group: a term line, then one or more `: definition` lines. */
const GROUP = /^(?![\s:#>*+|`-])[^\n]+\n(?: {0,3}:[ \t]+[^\n]*(?:\n|$))+/;

const nl = (s: string) => {
  let n = 0;
  for (let i = s.indexOf('\n'); i >= 0; i = s.indexOf('\n', i + 1)) n++;
  return n;
};

/** Inline `==x==`, `~x~`, `^x^`: the same shape, a different element. */
const wrap = (name: string, tag: string, re: RegExp, mark: string): TokenizerAndRendererExtension => ({
  name,
  level: 'inline',
  start: (src: string) => {
    const at = src.indexOf(mark);
    return at < 0 ? undefined : at;
  },
  tokenizer(this: any, src: string) {
    const m = re.exec(src);
    if (m) return { type: name, raw: m[0], tokens: this.lexer.inlineTokens(m[1]) };
  },
  renderer(this: any, t: Tokens.Generic) {
    return `<${tag}>${this.parser.parseInline(t.tokens!)}</${tag}>`;
  },
});

// The checkbox renderer has no view of its list item, so the item leaves its line here (relative to its block).
let task = 0;

export const marked = new Marked({
  gfm: true,
  extensions: [
    {
      name: 'inlineMath',
      level: 'inline',
      start: (src: string) => src.search(/\$|\\[([]/),
      tokenizer(src: string): MathToken | undefined {
        for (const re of INLINE_MATH) {
          const m = re.exec(src);
          if (m) return { type: 'inlineMath', raw: m[0], text: m[1].trim(), display: re !== INLINE_MATH[1] };
        }
        const m = DOLLAR.exec(src);
        if (m) return { type: 'inlineMath', raw: m[0], text: m[1], display: false };
      },
      renderer: (t) => math((t as MathToken).text, (t as MathToken).display),
    },
    {
      name: 'blockMath',
      level: 'block',
      start: (src: string) => head(src).search(/(?<=\n)(?:\$\$|\\begin\{)/),
      tokenizer(src: string): MathToken | undefined {
        const dollars = /^\$\$[ \t]*\n?([\s\S]+?)\n?\$\$[ \t]*(?:\n|$)/.exec(src);
        if (dollars) return { type: 'blockMath', raw: dollars[0], text: dollars[1].trim(), display: true };
        const env = /^\\begin\{([a-zA-Z*]+)\}[\s\S]+?\\end\{\1\}[ \t]*(?:\n|$)/.exec(src);
        if (env) return { type: 'blockMath', raw: env[0], text: env[0].trim(), display: true };
      },
      renderer: (t) => `<div class="math-block">${math((t as MathToken).text, true)}</div>\n`,
    },
    {
      // [^id]: text, with indented lines continuing it
      name: 'footnoteDef',
      level: 'block',
      start: (src: string) => head(src).search(/(?<=\n) {0,3}\[\^[^\]\s]+\]:/),
      tokenizer(this: any, src: string) {
        const m = /^ {0,3}\[\^([^\]\s]+)\]:[ \t]*([^\n]*)(?:\n|$)/.exec(src);
        if (!m) return;
        let raw = m[0];
        const body = [m[2]];
        const more = /^((?:[ \t]*\n)*)( {2,}|\t)([^\n]*)(?:\n|$)/;
        for (let rest = src.slice(raw.length), c; (c = more.exec(rest)); rest = rest.slice(c[0].length)) {
          raw += c[0];
          for (let i = c[1].split('\n').length - 1; i > 0; i--) body.push('');
          body.push(c[2].slice(c[2] === '\t' ? 1 : 4) + c[3]);
        }
        const token = { type: 'footnoteDef', raw, id: m[1], tokens: this.lexer.blockTokens(body.join('\n'), []) };
        if (!defs.has(m[1])) defs.set(m[1], token);
        return token;
      },
      renderer: () => '',
    },
    {
      name: 'footnoteRef',
      level: 'inline',
      start: (src: string) => {
        const at = src.indexOf('[^');
        return at < 0 ? undefined : at;
      },
      tokenizer(src: string) {
        const m = /^\[\^([^\]\s]+)\]/.exec(src);
        if (m && defs.has(m[1])) return { type: 'footnoteRef', raw: m[0], id: m[1] };
      },
      // numbered, linked and given its backref once the whole document is known
      renderer: (t) => `<sup class="fnref"><a class="fnref" data-fn="${escapeHtml(t.id)}" href="#">${escapeHtml(t.id)}</a></sup>`,
    },
    {
      // Term\n: definition
      name: 'deflist',
      level: 'block',
      start: (src: string) => {
        const m = /(?<=\n)(?![\s:#>*+|`-])[^\n]+\n {0,3}:[ \t]+\S/.exec(head(src));
        return m ? m.index : undefined;
      },
      tokenizer(this: any, src: string) {
        let raw = '';
        for (let rest = src, g; (g = GROUP.exec(rest)); ) {
          raw += g[0];
          rest = rest.slice(g[0].length);
          // groups may be separated by blank lines
          const gap = /^\n+/.exec(rest)?.[0] ?? '';
          if (!gap || !GROUP.test(rest.slice(gap.length))) break;
          raw += gap;
          rest = rest.slice(gap.length);
        }
        if (!raw) return;
        const items: { term: Token[]; defs: Token[][] }[] = [];
        for (const line of raw.split('\n')) {
          const d = /^ {0,3}:[ \t]+(.*)$/.exec(line);
          if (d) items.at(-1)?.defs.push(this.lexer.inline(d[1].trim(), []));
          else if (line.trim()) items.push({ term: this.lexer.inline(line.trim(), []), defs: [] });
        }
        return { type: 'deflist', raw, items };
      },
      renderer(this: any, t: Tokens.Generic) {
        const out = (t.items as { term: Token[]; defs: Token[][] }[]).map(
          (i) => `<dt>${this.parser.parseInline(i.term)}</dt>\n` + i.defs.map((d) => `<dd>${this.parser.parseInline(d)}</dd>\n`).join(''),
        );
        return `<dl>\n${out.join('')}</dl>\n`;
      },
    },
    {
      name: 'toc',
      level: 'block',
      start: (src: string) => head(src).search(/(?<=\n)\[\[toc\]\]/i),
      tokenizer(src: string) {
        const m = /^\[\[toc\]\][ \t]*(?:\n|$)/i.exec(src);
        if (m) return { type: 'toc', raw: m[0] };
      },
      renderer: () => '<nav class="toc" aria-label="Contents"></nav>\n',
    },
    wrap('mark', 'mark', /^==(?!=)(?=\S)([^\n]*?\S)==(?!=)/, '=='),
    // ~~x~~ stays strikethrough: sub needs a lone tilde, and no space inside
    wrap('sub', 'sub', /^~(?!~)([^\s~]+)~(?!~)/, '~'),
    wrap('sup', 'sup', /^\^([^\s^]+)\^/, '^'),
    {
      name: 'emoji',
      level: 'inline',
      start: (src: string) => {
        const at = src.indexOf(':');
        return at < 0 ? undefined : at;
      },
      tokenizer(src: string) {
        const m = /^:([\w+-]+):/.exec(src);
        if (m && EMOJI[m[1]]) return { type: 'emoji', raw: m[0], text: EMOJI[m[1]] };
      },
      renderer: (t) => t.text,
    },
  ],
});

marked.use({
  renderer: {
    code({ text, lang }) {
      const l = (lang ?? '').match(/^\S+/)?.[0] ?? '';
      const body = escapeHtml(text);
      // the drawing replaces the source when Mermaid is done, and the source stays if it cannot be drawn
      if (l.toLowerCase() === 'mermaid') return `<figure class="mermaid"><pre><code>${body}</code></pre></figure>\n`;
      // PlantUML is drawn the same way, and the language on the code tells the page which engine to ask
      if ((/^(?:plantuml|puml)$/i.test(l) || (!l && /^\s*@start\w+/.test(text)))) return `<figure class="mermaid"><pre><code class="language-plantuml">${body}</code></pre></figure>\n`;
      // draw.io, the same way
      if (/^drawio$/i.test(l)) return `<figure class="mermaid"><pre><code class="language-drawio">${body}</code></pre></figure>\n`;
      return `<pre><code${l ? ` class="language-${escapeHtml(l)}"` : ''}>${body}</code></pre>\n`;
    },
    blockquote(this: Renderer, token) {
      const first = token.tokens[0];
      const m = first?.type === 'paragraph' && ALERT.exec(first.text);
      if (!m) return false;
      const lead = (first as Tokens.Paragraph).tokens;
      for (let n = m[0].length; n > 0 && lead.length; ) {
        const t = lead[0];
        if (t.raw.length <= n) (lead.shift(), (n -= t.raw.length));
        else {
          if (t.type === 'text') ((t.text = t.text.slice(n)), (t.raw = t.raw.slice(n)));
          break;
        }
      }
      const kind = m[1].toLowerCase();
      const body = this.parser.parse(lead.length ? token.tokens : token.tokens.slice(1));
      return `<div class="alert alert-${kind}" role="note"><p class="alert-title">${ALERTS[kind]}</p>\n${body}</div>\n`;
    },
    // numeric columns line up on the right unless the author aligned them
    table(this: Renderer, token) {
      token.header.forEach((h, k) => {
        const body = token.rows.map((r) => r[k]).filter((c) => c?.text.trim());
        if (body.length && body.every((c) => NUMBER.test(c.text.trim()))) for (const c of [h, ...body]) c.align ??= 'right';
      });
      return `<div class="tbl">${Renderer.prototype.table.call(this, token)}</div>\n`;
    },
    listitem(token) {
      task = (token as Tokens.ListItem & { line?: number }).line ?? 0;
      return false;
    },
    checkbox({ checked }) {
      return `<input type="checkbox"${checked ? ' checked' : ''} ${TASK}="${task}"> `;
    },
  },
});

/** Gives lists and quotes their line within the block, so a task knows which source line it is. */
function lines(tokens: Token[], at: number) {
  for (const t of tokens) {
    (t as Token & { line?: number }).line = at;
    if (t.type === 'list') lines(t.items, at);
    else if (t.type === 'list_item' || t.type === 'blockquote') lines(t.tokens ?? [], at);
    at += nl(t.raw);
  }
}

/** Block tokens of a document body, with the reference links and footnote definitions it declares. */
export function lexDoc(body: string): { tokens: Token[]; links: Record<string, { href: string; title?: string }>; defs: Map<string, Tokens.Generic> } {
  defs = new Map();
  const tokens = marked.lexer(body);
  return { tokens, links: (tokens as unknown as { links: Record<string, { href: string; title?: string }> }).links, defs };
}

/** HTML for the tokens of one piece (not yet sanitized). Lines inside it count from its first. */
export function renderTokens(tokens: Token[]): string {
  lines(tokens, 0);
  return marked.parser(tokens);
}

export { nl };
