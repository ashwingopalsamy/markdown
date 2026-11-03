// The landing page at `/` (web edition only). index.html holds the markup between <!--home--> and <!--/home-->; its words come from
// site/home.copy.ts and its table from site/compare.ts, filled in here at build time. md Local drops the block (vite.config.ts).
import * as copy from '../site/home.copy.ts'
import { compareHtml, compareMd, esc } from './compare.ts'

const BLOCK = /<!--home-->[\s\S]*?<!--\/home-->/

/** Words in the copy that are code get a code face; everything else is escaped text. */
const text = (s: string) => esc(s).replace(/connect-src &#39;none&#39;|connect-src 'none'/g, "<code>connect-src 'none'</code>").replace(/(^|[ (])(\.md)(?=[ ,.)]|$)/g, '$1<code>$2</code>')

// ⌘\ and the like stay as typed
const keys = () => copy.inside.keys.map(([k, what]) => `<li><kbd>${esc(k)}</kbd> ${esc(what)}</li>`).join('')
const tiles = () => copy.inside.tiles.map((t) => `<li class="tile"><h3>${esc(t.title)}</h3><p>${text(t.text)}</p></li>`).join('')
const notFor = () => copy.compared.notFor.map((t) => `<li>${text(t)}</li>`).join('')
const check = () => copy.privacy.check.map((t) => `<li>${text(t)}</li>`).join('')
const faq = () => copy.faq.items.map((f) => `<details><summary>${text(f.q)}</summary><p>${text(f.a)}</p></details>`).join('')
// compare/ is the table on this page; the others are the guide pages
const href = (h: string) => (h === 'compare/' ? '#compared' : `/${h}`)
const links = () => copy.footer.links.map(([h, label]) => `<a href="${href(h)}">${esc(label)}</a>`).join('')

const lookup = (path: string): string => {
  let v: unknown = copy
  for (const k of path.split('.')) v = (v as Record<string, unknown>)?.[k]
  if (typeof v !== 'string') throw new Error(`index.html asks for {{${path}}}, which site/home.copy.ts does not have`)
  return v
}

const parts: Record<string, () => string> = { keys, tiles, notfor: notFor, check, faq, links, compare: compareHtml }

/** Fills {{a.b}} (escaped copy) and {{@part}} (generated markup) in the landing block. */
export function fillHome(html: string): string {
  return html.replace(/\{\{(@?)([\w.]+)\}\}/g, (_, at: string, name: string) => {
    if (at) {
      if (!parts[name]) throw new Error(`index.html asks for {{@${name}}}, which tools/home.ts does not make`)
      return parts[name]()
    }
    return text(lookup(name))
  })
}

/** index.html for the web edition: the landing block filled in. Throws when the block is gone. */
export function withHome(html: string): string {
  if (!BLOCK.test(html)) throw new Error('index.html has no <!--home-->…<!--/home--> block')
  return html.replace(BLOCK, (block) => fillHome(block))
}

/** index.html for md Local: no landing page. */
export function withoutHome(html: string): string {
  if (!BLOCK.test(html)) throw new Error('index.html has no <!--home-->…<!--/home--> block')
  return html.replace(BLOCK, '')
}

/** site/home.md with its comparison filled in; the front matter is read by the caller. */
export const homeMd = (raw: string) => {
  if (!raw.includes('<!--compare-->')) throw new Error('site/home.md has no <!--compare--> marker')
  return raw.replace('<!--compare-->', compareMd())
}

export const meta = copy.meta
