// The comparison table on the landing page, written from site/compare.ts at build time. Lighter than a matrix with a picker:
// four chips, one switch and a details switch, all CSS (no script). Sources are plain text: the audit rejects a link to another site.
import { checked, groups, rows, tools } from '../site/compare.ts'
import type { Cell, Row, Verdict } from './compare/types.ts'

const VERDICTS: Verdict[] = ['yes', 'part', 'no', 'unknown']
export const WORDS: Record<Verdict, string> = { yes: 'Yes', part: 'Partly', no: 'No', unknown: 'Not stated' }
// the symbols are in index.html's sprite: a blue seal, a grey seal, a dash, a fainter dash
const SYMBOL: Record<Verdict, string> = { yes: 'v-y', part: 'v-p', no: 'v-n', unknown: 'v-u' }

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const month = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/** Stops the build when a verdict has no source address or the date is not a month. */
export function checkCompare() {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(checked)) throw new Error(`site/compare.ts: checked must be YYYY-MM, not "${checked}"`)
  if (!tools.some((t) => t.id === 'us')) throw new Error('site/compare.ts has no "us" tool')
  for (const r of rows) {
    if (!groups.some((g) => g.id === r.group)) throw new Error(`site/compare.ts: row ${r.id} is in an unknown group: ${r.group}`)
    for (const t of tools) {
      const c = r.cells[t.id] as Cell | undefined
      const at = `site/compare.ts: ${r.id} / ${t.id}`
      if (!c) throw new Error(`${at} has no cell`)
      if (!VERDICTS.includes(c.v)) throw new Error(`${at} has the verdict "${c.v}"`)
      if (!c.say) throw new Error(`${at} says nothing`)
      if (!c.src || !/^https:\/\/[^\s]+$/.test(c.src)) throw new Error(`${at} has no source address (verdict "${c.v}")`)
    }
  }
}

const where = (url: string) => {
  const u = new URL(url)
  return `${u.hostname.replace(/^www\./, '')}${u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '')}${u.search}`
}
export const onlyHere = (r: Row) => r.cells.us.v === 'yes' && Object.entries(r.cells).every(([id, c]) => id === 'us' || c.v !== 'yes')
const same = (r: Row) => Object.values(r.cells).every((c) => c.v === r.cells.us.v)
const cls = (id: string) => (id === 'us' ? ' class="us"' : '')

const SPARK = '<svg class="g v-s" aria-hidden="true"><use href="#v-s"/></svg>'
export const glyph = (v: Verdict) => `<svg class="g ${SYMBOL[v]}" aria-hidden="true"><use href="#${SYMBOL[v]}"/></svg><span class="vh">${WORDS[v]}: </span>`

/** The comparison as a table with its controls, for the landing page. */
export function compareHtml(): string {
  checkCompare()
  const chip = (id: string, name: string, n: number, only = false) =>
    `<label class="chip${only ? ' only' : ''}"><input type="radio" name="grp" id="g-${id}"${id === 'all' ? ' checked' : ''}>${only ? SPARK : ''}${esc(name)} <em>${n}</em></label>`
  // a row where md says yes and no other tool does; the chip, the caption and the legend entry appear when there is one
  const alone = rows.filter(onlyHere).length
  const chips = [chip('all', 'All', rows.length), ...groups.map((g) => chip(g.id, g.name, rows.filter((r) => r.group === g.id).length)), ...(alone ? [chip('only', 'Only here', alone, true)] : [])].join('')
  const head = `<tr><th class="lab" scope="col"><span class="vh">What was checked</span></th>${tools.map((t) => `<th scope="col"${cls(t.id)}>${esc(t.name)}<small>${t.job}</small></th>`).join('')}</tr>`
  const body = rows
    .map((r) => {
      const f = `g-${r.group}${onlyHere(r) ? ' g-only' : ''}${same(r) ? ' same' : ''}`
      const note = onlyHere(r) ? `<small class="oh">${SPARK}Only here</small>` : ''
      const cells = tools.map((t) => `<td${cls(t.id)}><span class="v">${glyph(r.cells[t.id].v)}${esc(r.cells[t.id].say)}</span></td>`).join('')
      const notes = tools
        .map((t) => {
          const c = r.cells[t.id]
          return `<td${cls(t.id)}>${c.more ? `${esc(c.more)} ` : ''}<span class="src">${esc(where(c.src))}</span></td>`
        })
        .join('')
      return `<tr class="${f}"><th scope="row">${esc(r.label)}${note}</th>${cells}</tr><tr class="${f} more"><td></td>${notes}</tr>`
    })
    .join('')
  const key = [...VERDICTS.map((v) => `<span class="key" aria-hidden="true">${glyph(v).replace(/<span class="vh">.*$/, '')}${WORDS[v]}</span>`), ...(alone ? [`<span class="key" aria-hidden="true">${SPARK}Only here</span>`] : [])].join('')
  return `<div class="mxw">
<div class="ctl"><fieldset><legend class="vh">Show</legend>${chips}</fieldset>
<label class="sw"><input type="checkbox" id="mx-diff"><i aria-hidden="true"></i>Only differences</label>
<label class="sw"><input type="checkbox" id="mx-more"><i aria-hidden="true"></i>Details and sources</label></div>
<div class="mxs" tabindex="0" role="region" aria-label="Comparison table, scrolls sideways on a narrow screen"><table class="mx"><caption class="vh">One row for each thing checked, with an answer for each tool.</caption><colgroup><col class="lab">${tools.map(() => '<col>').join('')}</colgroup><thead>${head}</thead><tbody>${body}</tbody></table></div>
<p class="mxfoot">${key}<span>Checked ${month(checked)} against each tool’s own documentation.</span></p>
</div>`
}

/** The same comparison as Markdown, for index.md. */
export function compareMd(): string {
  checkCompare()
  const cell = (c: Cell) => `${WORDS[c.v]}: ${c.say.replace(/\|/g, '\\|')}`
  const out = groups.map((g) => {
    const rs = rows.filter((r) => r.group === g.id)
    const table = [`| | ${tools.map((t) => t.name).join(' | ')} |`, `| --- |${tools.map(() => ' --- |').join('')}`, ...rs.map((r) => `| ${r.label} | ${tools.map((t) => cell(r.cells[t.id])).join(' | ')} |`)].join('\n')
    const notes = rs.flatMap((r) => tools.map((t) => `- ${r.label}, ${t.name}: ${r.cells[t.id].more ? `${r.cells[t.id].more} ` : ''}(${where(r.cells[t.id].src)})`))
    return [`### ${g.name}`, table, notes.join('\n')].join('\n\n')
  })
  return [...out, `Checked ${month(checked)} against each tool's own documentation.`].join('\n\n')
}
