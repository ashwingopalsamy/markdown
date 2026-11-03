// The landing page at `/` (web edition only). index.html holds the markup between <!--home--> and <!--/home-->; its words come from
// site/home.copy.ts and its table from site/compare.ts, filled in here at build time. md Local drops the block (vite.config.ts).
import { readFileSync } from 'node:fs'
import * as copy from '../site/home.copy.ts'
import { compareHtml, compareMd, esc } from './compare.ts'
import { BUDGET, demos, jobs, proof, routes, teaser } from './home-parts.ts'

export { BUDGET }

const BLOCK = /<!--home-->[\s\S]*?<!--\/home-->/

/** Words in the copy that are code get a code face, **words** between double stars are bold; everything else is escaped text. */
const text = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/connect-src &#39;none&#39;|connect-src 'none'/g, "<code>connect-src 'none'</code>").replace(/(^|[ (])(\.md)(?=[ ,.)]|$)/g, '$1<code>$2</code>')

// ⌘\ and the like stay as typed
const ic = (name: string, cls = 'ic') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`
const keys = () => copy.inside.keys.map(([k, what]) => `<li><kbd>${esc(k)}</kbd>${esc(what)}</li>`).join('')
const tiles = () => copy.inside.tiles.map((t) => `<li>${ic(t.icon)}<b>${esc(t.title)}</b>${'key' in t ? `<kbd>${esc(t.key)}</kbd>` : ''}<span>${text(t.text)}</span></li>`).join('')
const notFor = () => copy.compared.notFor.map((t) => `<li>${text(t)}</li>`).join('')
const check = () => copy.privacy.check.map((t) => `<li>${text(t)}</li>`).join('')
const sheet = () => copy.privacy.sheetRows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${text(v)}</dd></div>`).join('')
const faq = () =>
  copy.faq.items
    .map((f, i) => `<details><summary><i>${i + 1}</i><span>${text(f.q)}</span>${ic('chev', 'chev')}</summary><div class="ans"><p>${text(f.a)}</p></div></details>`)
    .join('')
// compare/ is the table on this page; the others are the guide pages
const href = (h: string) => (h === 'compare/' ? '#compared' : `/${h}`)
const links = () => copy.footer.links.map(([h, label, icon]) => `<a href="${href(h)}">${ic(icon)}${esc(label)}</a>`).join('')

const lookup = (path: string): string => {
  let v: unknown = copy
  for (const k of path.split('.')) v = (v as Record<string, unknown>)?.[k]
  if (typeof v !== 'string') throw new Error(`index.html asks for {{${path}}}, which site/home.copy.ts does not have`)
  return v
}

// 1.4 kB, inline: a file in public/ would also be copied into md Local's build, which has no landing page
const avatar = () => `data:image/webp;base64,${readFileSync(new URL('../site/ashwin.webp', import.meta.url)).toString('base64')}`

const parts: Record<string, () => string> = { keys, tiles, avatar, notfor: notFor, check, sheet, faq, links, compare: compareHtml, jobs, proof, teaser, demos, routes }

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
  return raw.replace('<!--compare-->', compareMd()).replace('<!--budget-->', `${BUDGET / 1000} kB`)
}

export const meta = copy.meta
