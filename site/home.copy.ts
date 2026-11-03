// Every string on the landing page at `/`, in reading order. site/home.md carries the same text for agents.
// Outside addresses are text, never links: the audit fails a page that links out.

export const meta = {
  title: 'md: a private Markdown editor in your browser',
  description: 'Write Markdown on the rendered page, with Mermaid, PlantUML and draw.io diagrams, math and code. The page cannot make a request, so your text stays on your device. Free, open source, and it works offline.',
} as const

export const header = {
  demo: 'Demo',
} as const

export const hero = {
  h1: 'Markdown, written and read in one place.',
  lede: 'Write on the page as it will read, or in plain Markdown beside it. Diagrams, math and code draw as you type, and your text never leaves this device: the page can’t make a request.',
  start: 'Start writing',
  demo: 'Try the demo',
  hint: 'or drop a .md file anywhere on this page',
  how: 'How it works',
  drop: 'Drop to open',
} as const

export const compared = {
  eyebrow: 'Compared',
  h2: 'Seven ways to write Markdown.',
  intro: 'Typora, Obsidian and VS Code keep files on your disk. StackEdit and Dillinger keep drafts in the browser, and use a server to sync and for some exports. HackMD keeps notes on its servers. **md runs in your browser:** nothing to install, no account, and a page that cannot send your text anywhere.',
  jobs: {
    label: 'What md does, and where. It writes on the page or in Markdown, in this tab. It draws diagrams, math and code on your device. It keeps documents in this browser, and in files you choose.',
    lanes: [
      { job: 'Writes', stops: ['The page', 'Markdown beside it'], note: 'in this tab' },
      { job: 'Draws', stops: ['Mermaid', 'PlantUML', 'draw.io', 'Math', 'Code'], note: 'on your device' },
      { job: 'Keeps', stops: ['This browser', 'Files you choose'], note: 'on your device' },
    ],
  },
  proof: [
    { big: '0', text: 'requests to anywhere else since this page opened. The page can’t make one.', to: '#privacy', link: 'Where your text goes' },
    { big: '0', text: 'accounts. There is no sign-in, and md sets no cookies.', to: '#faq', link: 'In the questions' },
    { big: '{budget}', text: 'is the most the first screen may weigh, gzipped. The build stops above it.' },
    { big: 'Offline', text: 'after the first visit. Reload with the wifi off and md still opens.', to: '#offline', link: 'The offline copy' },
  ],
  teaser: {
    eyebrow: 'The full comparison',
    text: 'Filter by what you care about, hide the rows that are the same everywhere, and see where each answer comes from.',
    go: 'Open the table',
  },
  open: 'Show the full comparison',
  close: 'Hide the full comparison',
  notForTitle: 'Where md isn’t the right pick',
  notFor: [
    'Your notes need to be on every device. md keeps documents in this browser, on this device, and has no sync. Obsidian, StackEdit and HackMD do.',
    'You write with other people at the same time. md is for one person. HackMD edits one note live, together.',
    'You want plugins. md has none and takes none. Obsidian has community plugins, and VS Code has extensions.',
    'You want an app on your phone. md runs in the phone’s browser, without Split view. Obsidian has apps for iOS and Android.',
    'You need Word, ePub or LaTeX, or the whole document as one image. Typora exports these; Word and the rest go through Pandoc.',
    'You save files in Firefox or Safari. Saving back into the same file needs Chrome or Edge; other browsers download a copy.',
  ],
} as const

export const demos = {
  eyebrow: 'Rendering',
  h2: 'Plain text in, a page out.',
  intro: 'The same text, as plain Markdown and as md draws it. In md you can edit either one.',
  pick: 'Try one',
  was: 'As text',
  now: 'In md',
  items: [
    {
      chip: 'A table',
      kind: 'table',
      source: '| Draws | Where | Needs |\n| :-- | :-- | --: |\n| Math | This tab | Nothing |\n| Mermaid | This tab | Nothing |\n| PlantUML | A sandboxed frame | Nothing |',
      why: 'Rows and columns line up, and a column can sit on the right.',
    },
    {
      chip: 'A diagram',
      kind: 'diagram',
      source: '```mermaid\nflowchart LR\n  you[Your text] --> md[md, in this tab]\n  md --> disk[This device]\n```',
      why: 'Three lines of text become a drawing. It is drawn on your device.',
    },
    {
      chip: 'Math',
      kind: 'math',
      source: '$$\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}$$',
      why: 'The formula is set as you type it. No image, and no request.',
    },
  ],
} as const

export const privacy = {
  eyebrow: 'Privacy',
  h2: 'Where your text goes.',
  body: 'Nowhere. md’s page runs under one rule, connect-src \'none\', and the browser enforces it: no script on the page can make a request, so a document has no way out. Your documents are kept in this browser, on this device, and written to files you choose.',
  aside: 'Grey stops are someone else’s computer.',
  routes: {
    label: 'Where your text goes in each tool. In md it goes from your text to md in this tab and stays on this device. Other tools end in their own verdict.',
    lanes: [
      { who: 'us', stops: ['Your text', 'md, in this tab', 'This device'] },
      { who: 'typora', stops: ['Your text', 'Typora', 'Your files'] },
      { who: 'obsidian', stops: ['Your text', 'Obsidian', 'A folder on your disk'] },
      { who: 'stackedit', stops: ['Your text', 'StackEdit, in a tab', 'Your browser', ['StackEdit’s server, for a PDF', 'cloud']] },
      { who: 'hackmd', stops: ['Your text', ['HackMD’s servers', 'cloud']] },
      { who: 'dillinger', stops: ['Your text', 'Dillinger, in a tab', 'Your browser', ['Dillinger’s server, on download', 'cloud']] },
      { who: 'vscode', stops: ['Your text', 'VS Code', 'Your files'] },
    ],
  },
  sheet: 'The Privacy sheet: zero requests to anywhere else, the rule the page runs under, and every break-out attempt refused.',
  stat: '0',
  statLabel: 'requests to anywhere else since this page opened.',
  sheetRows: [
    ['The rule', 'connect-src \'none\''],
    ['Break-out attempts', 'All refused'],
  ],
  statCaption: 'The Privacy sheet, behind the shield.',
  offlineTitle: 'The offline copy',
  offline: 'After the first visit, md keeps its own files on your device. Reload with the wifi off and it still opens.',
  checkTitle: 'Check it yourself',
  check: [
    'Open the browser’s developer tools, on the Network tab.',
    'Write a page. Anything that loads is one of md’s own files, from its own site, such as the code that draws math.',
    'Switch the wifi off and reload. md still opens.',
    'Open the shield and press Try to break out. Every attempt is refused.',
  ],
  checkNote: 'A typeface you choose, and the PlantUML and draw.io engines, come from md’s site the first time a page needs them. Your text never goes the other way.',
  trust: 'Trust and network notes →',
} as const

export const inside = {
  eyebrow: 'What’s inside',
  h2: 'Made for writing, and for reading back.',
  tiles: [
    { icon: 'page', key: '⌘\\', title: 'Page editing', text: 'Click any sentence and type. Write, Split and Read are one key away.' },
    { icon: 'diagram', title: 'Diagrams', text: 'Mermaid, PlantUML and draw.io, drawn on your device. Zoom one, copy it as an image, or download it.' },
    { icon: 'export', key: '⌘P', title: 'Export', text: 'PDF in md’s own print layout, one self-contained HTML file, or the Markdown. Diagrams and pictures save as PNG, JPEG, WEBP or SVG.' },
    { icon: 'palette', title: 'Themes and typefaces', text: 'Light and dark, in Neutral, Paper or Calm. Set the text in Sans, Literata or Newsreader, from 90% to 140%.' },
    { icon: 'find', key: '⌘F', title: 'Search', text: 'Find and replace in the document, and search every document on this device. md Local adds patterns, match case and whole word.' },
    { icon: 'folder', key: '⌘S', title: 'Files and folders', text: 'Open a file or a whole folder. In Chrome and Edge, save writes back to the file, and changes made elsewhere show up live.' },
    { icon: 'code', title: 'md Local', text: 'For files on your Mac. Run md notes.md and the file opens as a tab; ⌘S writes it. Built from the source with one script.' },
    { icon: 'shield', title: 'Privacy shield', text: 'Counts requests to anywhere else, shows the rule the page runs under, and tries to break out when you ask.' },
  ],
  keys: [
    ['⌘\\', 'views'],
    ['⌘F', 'find'],
    ['⇧⌘O', 'outline'],
    ['⌘S', 'save'],
    ['⌘P', 'PDF'],
  ],
} as const

export const faq = {
  eyebrow: 'Questions',
  h2: 'Asked often.',
  items: [
    {
      q: 'Is my text uploaded?',
      a: 'No. md’s page runs under a rule, connect-src \'none\', sent by the server and repeated inside the page, and the browser enforces it: no script on the page can make a request. Your documents are kept in this browser’s storage on this device. The only files that come down are md’s own, from md’s own site.',
    },
    {
      q: 'Where are my documents kept?',
      a: 'In this browser, on this device, in its IndexedDB storage, never in cookies. md keeps up to 30 earlier versions of each document. A file you open from disk in Chrome or Edge is saved back into that file. If you clear this site’s data in the browser, the documents kept there go with it, so save anything you would miss as a file.',
    },
    {
      q: 'Does it work offline?',
      a: 'Yes, after the first visit. A service worker keeps md’s files on the device, so later visits make no request and work with the network off. A typeface you choose, and the PlantUML and draw.io engines, come from md’s site the first time a page needs them.',
    },
    {
      q: 'Do I need an account?',
      a: 'No. There is no sign-in, and md sets no cookies. It is free and open source under the MIT licence.',
    },
    {
      q: 'Can I sync between devices, or write with someone?',
      a: 'No. md is for one person on one device. To move a document, save it as a file, or use Export, Copy link: the text travels in the link after the #, which browsers do not send to a server. For notes on every device or live editing with others, the comparison names tools that do it.',
    },
    {
      q: 'Which browsers does it work in?',
      a: 'Any current browser. Saving into the same file, opening a folder and following changes made on disk need a Chromium browser, such as Chrome or Edge; other browsers download a copy instead. Split view needs a window at least 860 px wide, so a phone gets Page, Write and Read.',
    },
    {
      q: 'How do I make a PDF?',
      a: 'Export, then Download PDF, or ⌘P. It opens the browser’s print dialog with md’s own print layout; choose Save as PDF. Pages are numbered in Chrome 131 and later, and diagrams print light. Diagrams and pictures also save one at a time as PNG, JPEG, WEBP or SVG.',
    },
    {
      q: 'Can an AI agent open a file in md?',
      a: 'Yes, and it cannot read one back. An agent builds a link with the file after the #, which the browser does not send to a server, and opens it in your browser. md Local, for files on a Mac, adds a command: md notes.md opens the file as a tab. The agent guide has the details.',
    },
  ],
} as const

export const closing = {
  h2: 'Start with a blank page, or with the tour.',
  sub: 'It opens in this tab. Nothing is uploaded.',
  start: 'Start writing',
  demo: 'Try the demo',
  more: 'The full comparison →',
} as const

// Outside addresses are text here, never links: the audit fails a page that links out.
export const footer = {
  source: 'Source: github.com/ashwingopalsamy/markdown',
  love: 'With love',
  author: 'Ashwin Gopalsamy',
  site: 'ashwingopalsamy.in',
  licence: 'MIT licence',
  links: [
    ['compare/', 'Compare', 'compare'],
    ['trust/', 'Trust', 'shield'],
    ['agents/', 'For agents', 'bot'],
    ['syntax/', 'Syntax', 'hash'],
  ],
} as const

export const demo = {
  label: 'This is a demo',
  clear: 'Clear',
  clearTitle: 'Delete the demo from this device and start a blank page',
} as const
