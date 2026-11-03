// The hosted site's `/` is a landing page (index.html, between <!--home-->…<!--/home-->). It is the whole first screen: this script, home.css and
// the markup. The editor is not loaded until someone starts, opens the demo, drops a file or follows a link that carries one; then the landing
// page goes and the editor mounts on the same page, same address.
import './home.css'
import type { Intent } from './begin'

const root = document.documentElement
const home = document.getElementById('home')!
const listening = new AbortController()
const { signal } = listening
let opened = false

// The same switch as lib/theme.svelte.ts, without its runes: that module pulls the Svelte runtime into this small first script.
const paint = (value: string) => {
  root.dataset.theme = value
  ;(document.getElementsByName('theme-color')[0] as HTMLMetaElement).content = getComputedStyle(root).getPropertyValue('--page').trim()
}
const labelTheme = () => document.querySelector('[data-theme-toggle]')?.setAttribute('aria-label', root.dataset.theme === 'dark' ? 'Switch to light' : 'Switch to dark')
labelTheme()
document.querySelector('[data-theme-toggle]')?.addEventListener(
  'click',
  () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark'
    paint(next)
    labelTheme()
    try {
      localStorage.setItem('md-theme', next)
    } catch {
      // storage can be blocked; the choice then lasts for this visit only
    }
  },
  { signal },
)

async function open(intent: Intent) {
  if (opened) return
  opened = true
  root.classList.add('opening')
  try {
    const { begin } = await import('./begin')
    // the editor brings its own styles; the landing page's go with its markup and listeners
    listening.abort()
    home.remove()
    root.classList.remove('opening')
    await begin(intent)
  } catch {
    opened = false
    root.classList.remove('opening')
  }
}

document.querySelectorAll<HTMLElement>('[data-act]').forEach((el) => el.addEventListener('click', () => open({ kind: el.dataset.act === 'demo' ? 'demo' : 'start' }), { signal }))

// A link that carries a document (#md=…) skips the landing page; theme.js has already hidden it. The editor reads the link itself.
const carries = () => /[#&]md=/.test(location.hash)
if (carries()) open({ kind: 'start' })
addEventListener('hashchange', () => carries() && open({ kind: 'start' }), { signal })

// A file dropped anywhere on the page opens in the editor. The file's handle can only be asked for during the drop, so it is asked for here.
const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false
let depth = 0
addEventListener('dragenter', (e) => hasFiles(e) && (depth++, home.classList.add('over')), { signal })
addEventListener('dragleave', () => depth && --depth === 0 && home.classList.remove('over'), { signal })
addEventListener('dragover', (e) => hasFiles(e) && e.preventDefault(), { signal })
addEventListener(
  'drop',
  (e) => {
    depth = 0
    home.classList.remove('over')
    if (!hasFiles(e)) return
    e.preventDefault()
    const dt = e.dataTransfer!
    const items = [...dt.items].filter((i) => i.kind === 'file')
    const handles = 'getAsFileSystemHandle' in DataTransferItem.prototype ? Promise.all(items.map((i) => (i as unknown as { getAsFileSystemHandle(): Promise<FileSystemHandle | null> }).getAsFileSystemHandle().catch(() => null))) : Promise.resolve([])
    open({ kind: 'files', files: [...dt.files], handles })
  },
  { signal },
)

// Sections settle in as they scroll into view. Where the browser has scroll timelines home.css does it with no script; elsewhere each section
// is shown as it arrives (theme.js sets .js, which is what hides them first), and at once for anyone who asked for less motion.
const sections = document.querySelectorAll('#home .reveal')
if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) sections.forEach((s) => s.classList.add('in'))
else if (!CSS.supports('animation-timeline: view()')) {
  const seen = new IntersectionObserver((list) => list.forEach((e) => e.isIntersecting && (e.target.classList.add('in'), seen.unobserve(e.target))), { rootMargin: '0px 0px -8% 0px' })
  sections.forEach((s) => seen.observe(s))
}

// The table sits behind a pill; the card above it, and a link to #table, open it. Without script the pill still opens it.
const table = document.getElementById('table') as HTMLDetailsElement | null
const showTable = () => {
  if (table) table.open = true
}
document.querySelector('[data-open=table]')?.addEventListener('click', showTable, { signal })
addEventListener('hashchange', () => location.hash === '#table' && showTable(), { signal })
if (location.hash === '#table') showTable()

export const enter = () => {
  if (import.meta.env.PROD) navigator.serviceWorker?.register('/sw.js').catch(() => {})
}
