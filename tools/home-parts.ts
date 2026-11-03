// The figures on the landing page (index.html's {{@jobs}}, {{@proof}}, {{@teaser}}, {{@demos}}, {{@routes}}), written at build time from
// site/home.copy.ts and site/compare.ts. Nothing here is a picture of a screenshot: the demos are marked and KaTeX output for the text beside them.
import katex from 'katex'
import { marked } from 'marked'
import * as copy from '../site/home.copy.ts'
import { checked, rows, tools } from '../site/compare.ts'
import { esc, glyph, month } from './compare.ts'

/** The most the first screen may weigh, gzipped. vite.config.ts stops the build above it; the landing page quotes it. */
export const BUDGET = 45_000

const mark = '<svg class="mk" aria-hidden="true"><use href="#mark"/></svg>'
const arrow = '<svg class="arrow" aria-hidden="true"><use href="#ar"/></svg>'
const NUMBERS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty']
const word = (n: number) => {
  if (!NUMBERS[n]) throw new Error(`No word for ${n}; extend NUMBERS in tools/home-parts.ts`)
  return NUMBERS[n]
}
const rivals = tools.filter((t) => t.id !== 'us')
const toolName = (id: string) => {
  const t = tools.find((x) => x.id === id)
  if (!t) throw new Error(`site/home.copy.ts names a tool that site/compare.ts does not have: ${id}`)
  return t.name
}

/** What md does and where: three lanes, one for each job. */
export const jobs = () =>
  `<div class="jobs" role="img" aria-label="${esc(copy.compared.jobs.label)}">${copy.compared.jobs.lanes
    .map((l) => `<div class="lane"><b>${l.job}</b>${l.stops.map((s) => `<span class="node">${esc(s)}</span>`).join('')}<small>${l.note}</small></div>`)
    .join('')}</div>`

/** Four proofs, each pointing at its evidence. The size is the budget the build enforces, not a number typed here. */
export const proof = () =>
  `<div class="figs">${copy.compared.proof
    .map((p) => {
      const big = p.big.replace('{budget}', `${BUDGET / 1000} kB`)
      return `<div class="fig"><b>${esc(big)}</b><span>${esc(p.text)}</span>${'to' in p ? `<a href="${p.to}">${esc(p.link)}</a>` : ''}</div>`
    })
    .join('')}</div>`

/** The card above the table: what it holds, the six tools, and the way in. */
export const teaser = () =>
  `<a class="teaser" href="#table" data-open="table" aria-labelledby="teaser-h teaser-go"><div><p class="k">${esc(copy.compared.teaser.eyebrow)}</p><h3 id="teaser-h">${word(rows.length)} things, checked against ${word(rivals.length).toLowerCase()} tools.</h3><p>${esc(copy.compared.teaser.text)} Checked ${month(checked)}.</p></div><div class="cr"><div class="tl" aria-hidden="true">${rivals.map((t) => `<span>${esc(t.name)}</span>`).join('')}</div><span class="go" id="teaser-go">${esc(copy.compared.teaser.go)}<i aria-hidden="true">↓</i></span></div></a>`

const DIAGRAM =
  '<svg class="dg" viewBox="0 0 396 64" role="img" aria-label="Your text, then md in this tab, then this device."><rect class="nd" x="1" y="14" width="104" height="36" rx="18"/><rect class="nd" x="148" y="14" width="118" height="36" rx="18"/><rect class="nd" x="310" y="14" width="85" height="36" rx="18"/><path d="M107 32h39m-5-5 5 5-5 5M268 32h40m-5-5 5 5-5 5"/><text x="53" y="37" text-anchor="middle">Your text</text><text x="207" y="37" text-anchor="middle">md, in this tab</text><text x="352" y="37" text-anchor="middle">This device</text></svg>'

// The text between the $$ marks, set by KaTeX as MathML: the browser draws it with no stylesheet and no font of ours.
const drawn = (kind: string, source: string) => {
  if (kind === 'table') return marked.parse(source, { async: false }) as string
  if (kind === 'diagram') return DIAGRAM
  if (kind === 'math') return `<div class="math">${katex.renderToString(source.replace(/^\$\$|\$\$$/g, ''), { displayMode: true, output: 'mathml', throwOnError: true })}</div>`
  throw new Error(`site/home.copy.ts: no demo of kind "${kind}"`)
}

/** Plain text beside what md makes of it, three states in one grid area. Radios and :has() switch them: no script. */
export const demos = () => {
  const d = copy.demos
  const chips = d.items.map((x, i) => `<label class="chip"><input type="radio" name="demo" id="dm${i + 1}"${i ? '' : ' checked'}>${esc(x.chip)}</label>`).join('')
  const plain = d.items.map((x, i) => `<pre class="draw s s${i + 1}">${esc(x.source)}</pre>`).join('')
  const made = d.items.map((x, i) => `<div class="s s${i + 1}">${drawn(x.kind, x.source)}</div>`).join('')
  const whys = d.items.map((x, i) => `<p class="why s s${i + 1}"><svg class="g" aria-hidden="true"><use href="#v-s"/></svg><span>${esc(x.why)}</span></p>`).join('')
  return (
    `<div class="demos"><fieldset class="dbar"><legend class="vh">${esc(d.pick)}</legend><span class="k" aria-hidden="true">${esc(d.pick)}</span>${chips}</fieldset>` +
    `<fieldset class="seg"><legend class="vh">Show</legend><label><input type="radio" name="side" id="dw">${esc(d.was)}</label><label><input type="radio" name="side" id="dn" checked>${mark}${esc(d.now)}</label></fieldset>` +
    `<div class="pair"><div class="pane was"><div class="ph">${esc(d.was)}</div><div class="body">${plain}</div></div>` +
    `<div class="pane now"><div class="ph">${mark}${esc(d.now)}</div><div class="body">${made}</div></div></div>` +
    `<div class="whys">${whys}</div></div>`
  )
}

/** Where a document goes in each tool, ending in that tool's own answer from the table's "Stays on your device" row. */
export const routes = () => {
  const stays = rows.find((r) => r.id === 'stays')
  if (!stays) throw new Error('site/compare.ts has no "stays" row; the routes diagram ends in it')
  return `<div class="routes" role="img" aria-label="${esc(copy.privacy.routes.label)}">${copy.privacy.routes.lanes
    .map((l) => {
      const c = stays.cells[l.who as keyof typeof stays.cells]
      if (!c) throw new Error(`site/home.copy.ts: no cell for ${l.who} in the "stays" row`)
      const stop = (s: string | readonly [string, string]) => (typeof s === 'string' ? `<span class="node">${esc(s)}</span>` : `<span class="node ${s[1]}">${esc(s[0])}</span>`)
      const path = l.stops.map((s, i) => (i ? `<span class="step">${arrow}<span class="vh">then </span>${stop(s)}</span>` : stop(s))).join('')
      return `<div class="lane${l.who === 'us' ? ' us' : ''}"><b>${l.who === 'us' ? mark : ''}${esc(toolName(l.who))}</b>${path}<small>${glyph(c.v)}${esc(c.say)}</small></div>`
    })
    .join('')}</div>`
}
