import type { Group, Row, Tool } from '../tools/compare/types.ts'

export const checked = '2026-11'

export const tools: readonly Tool[] = [
  {
    id: 'us',
    name: 'md',
    job: 'Browser',
    docs: 'https://github.com/ashwingopalsamy/markdown',
    choose: { lead: 'To write and read now, on any computer,', rest: 'with nothing to install, no account, and a page that cannot send your text anywhere.' },
  },
  {
    id: 'typora',
    name: 'Typora',
    job: 'App',
    docs: 'https://typora.io/',
    choose: { lead: 'For a paid desktop app', rest: 'that writes on the rendered page, works on files in any folder, and exports PDF, images and, through Pandoc, Word.' },
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    job: 'App',
    docs: 'https://obsidian.md/help/',
    choose: { lead: 'For a library of notes', rest: 'in a folder on your disk, with phone apps, paid sync and community plugins.' },
  },
  {
    id: 'stackedit',
    name: 'StackEdit',
    job: 'Browser',
    docs: 'https://stackedit.io/',
    choose: { lead: 'To keep a browser editor in step', rest: 'with Google Drive, Dropbox or GitHub, and publish to a blog.' },
  },
  {
    id: 'hackmd',
    name: 'HackMD',
    job: 'Cloud',
    docs: 'https://hackmd.io/features?both',
    choose: { lead: 'To write with other people at the same time,', rest: 'when keeping the notes on HackMD’s servers is fine.' },
  },
  {
    id: 'dillinger',
    name: 'Dillinger',
    job: 'Browser',
    docs: 'https://dillinger.io/',
    choose: { lead: 'For a quick editor in a tab', rest: 'that saves to GitHub, Dropbox, Google Drive, OneDrive or Bitbucket.' },
  },
  {
    id: 'vscode',
    name: 'VS Code',
    job: 'App',
    docs: 'https://code.visualstudio.com/docs/languages/markdown',
    choose: { lead: 'When the Markdown sits beside code', rest: 'in a repository you are already working in.' },
  },
]

export const groups: readonly Group[] = [
  { id: 'privacy', name: 'Privacy' },
  { id: 'writing', name: 'Writing' },
  { id: 'export', name: 'Diagrams and export' },
  { id: 'cost', name: 'Cost and setup' },
]

const mdTrust = 'https://md.ashwingopalsamy.in/trust/'
const mdRepo = 'https://github.com/ashwingopalsamy/markdown'
const mdLog = 'https://github.com/ashwingopalsamy/markdown/blob/main/CHANGELOG.md'
const mdSpec = 'https://github.com/ashwingopalsamy/markdown/blob/main/docs/spec.md'
const typora = 'https://typora.io/'
const typoraPrivacy = 'https://support.typora.io/Privacy-Policy'
const typoraBuy = 'https://support.typora.io/purchase'
const typoraActivate = 'https://support.typora.io/activation/'
const typoraDiagrams = 'https://support.typora.io/Draw-Diagrams-With-Markdown/'
const typoraExport = 'https://support.typora.io/Export/'
const obsPricing = 'https://obsidian.md/pricing'
const obsPrivacy = 'https://obsidian.md/privacy'
const obsStorage = 'https://obsidian.md/help/data-storage'
const obsViews = 'https://obsidian.md/help/edit-and-read'
const obsShare = 'https://obsidian.md/help/sync/collaborate'
const obsPlugins = 'https://obsidian.md/help/community-plugins'
const obsSyntax = 'https://obsidian.md/help/advanced-syntax'
const obsPdf = 'https://obsidian.md/help/pdf'
const obsDownload = 'https://obsidian.md/download'
const seHome = 'https://stackedit.io/'
const seGuide = 'https://github.com/benweet/stackedit/blob/master/src/data/welcomeFile.md'
const sePdf = 'https://github.com/benweet/stackedit/blob/master/src/components/modals/PdfExportModal.vue'
const seRepo = 'https://github.com/benweet/stackedit'
const hmFeatures = 'https://hackmd.io/features?both'
const hmPricing = 'https://hackmd.io/pricing'
const dilHome = 'https://dillinger.io/'
const dilRepo = 'https://github.com/joemccann/dillinger'
const dilExport = 'https://github.com/joemccann/dillinger/blob/master/components/navbar/Navbar.tsx'
const dilDeps = 'https://github.com/joemccann/dillinger/blob/master/package.json'
const vscMd = 'https://code.visualstudio.com/docs/languages/markdown'
const vscFaq = 'https://code.visualstudio.com/docs/supporting/faq'
const vscSync = 'https://code.visualstudio.com/docs/configure/settings-sync'
const vscWeb = 'https://code.visualstudio.com/docs/setup/vscode-web'
const liveShare = 'https://learn.microsoft.com/en-us/visualstudio/liveshare/'

export const rows: readonly Row[] = [
  {
    id: 'where',
    group: 'privacy',
    label: 'Where your text is kept',
    cells: {
      us: { v: 'yes', say: 'This browser', more: 'In the browser’s own storage on this device, not in cookies. A file opened from disk in Chrome or Edge is saved back to that file.', src: mdTrust },
      typora: { v: 'yes', say: 'Your files', more: 'Typora edits Markdown files in folders you choose, including folders kept by Dropbox or iCloud.', src: typora },
      obsidian: { v: 'yes', say: 'A local folder', more: 'A vault is a folder on your file system, holding plain Markdown files that other editors can open too.', src: obsStorage },
      stackedit: { v: 'yes', say: 'Your browser', more: 'Files are stored in the browser, and can also be linked to Google Drive, Dropbox or GitHub.', src: seGuide },
      hackmd: { v: 'no', say: 'Its servers', more: 'Notes live on HackMD, where per-note permissions decide who can read and edit them. Copies can be downloaded or saved to Dropbox, Google Drive or a gist.', src: hmFeatures },
      dillinger: { v: 'yes', say: 'Your browser', more: 'Documents are saved to the browser’s local storage as you type, so a closed tab keeps its draft.', src: dilHome },
      vscode: { v: 'yes', say: 'Your files', more: 'VS Code opens and saves Markdown files on your own disk.', src: vscMd },
    },
  },
  {
    id: 'stays',
    group: 'privacy',
    label: 'Stays on your device',
    cells: {
      us: { v: 'yes', say: 'Cannot leave', more: 'The page runs under connect-src \'none\', sent as a header and repeated in the page, so no script on it can send a request. Its own files, a typeface you choose and the diagram engines come from md’s site; your text never goes the other way.', src: mdTrust },
      typora: { v: 'yes', say: 'Stays local', more: 'Files stay on your disk. Anonymous usage data is sent only while that option is on, and pictures linked from the web load from their own sites.', src: typoraPrivacy },
      obsidian: { v: 'yes', say: 'Stays local', more: 'Notes are saved on your device and are not sent to Obsidian’s servers unless you use Sync, which is end-to-end encrypted. Update checks can be turned off.', src: obsPrivacy },
      stackedit: { v: 'part', say: 'Until you sync', more: 'Files stay in the browser until you link a cloud account. Making a PDF posts the document to StackEdit’s server.', src: sePdf },
      hackmd: { v: 'no', say: 'Sent to HackMD', more: 'Notes are written on HackMD’s servers, which is what lets several people edit one note.', src: hmFeatures },
      dillinger: { v: 'part', say: 'Until you export', more: 'Drafts stay in the browser, but every download, Markdown included, posts the document to Dillinger’s server first. Syncing sends it to the service you link.', src: dilExport },
      vscode: { v: 'yes', say: 'Stays on disk', more: 'Files are read and saved on your machine. VS Code sends usage and crash data to Microsoft until you set the telemetry level to off, and extensions collect their own.', src: vscFaq },
    },
  },
  {
    id: 'account',
    group: 'privacy',
    label: 'Account needed',
    cells: {
      us: { v: 'yes', say: 'None', more: 'No sign-in, and no cookies.', src: mdTrust },
      typora: { v: 'yes', say: 'None', more: 'No account. A bought licence arrives as a code by email, and activating it needs a connection.', src: typoraActivate },
      obsidian: { v: 'yes', say: 'None', more: 'No sign-up is required. An account comes in only to buy Sync, Publish or a licence.', src: obsPricing },
      stackedit: { v: 'yes', say: 'None', more: 'Files live in the browser with no sign-in. A Google, Dropbox or GitHub account is needed only to sync with that service.', src: seGuide },
      hackmd: { v: 'unknown', say: 'Not stated', more: 'The pricing page puts you on the free plan when you sign up, and invitees may be asked to sign in. No page found says whether a note can be started signed out.', src: hmPricing },
      dillinger: { v: 'yes', say: 'None', more: 'No sign-up. An account is needed only to connect GitHub, Dropbox or another service.', src: dilHome },
      vscode: { v: 'yes', say: 'None', more: 'No sign-in is needed to edit or preview a Markdown file.', src: vscMd },
    },
  },
  {
    id: 'page',
    group: 'writing',
    label: 'Write on the rendered page',
    cells: {
      us: { v: 'yes', say: 'Page view', more: 'Click any sentence in Page view and type. Write, Split and Read show the Markdown; Split needs a window at least 860 px wide.', src: mdSpec },
      typora: { v: 'yes', say: 'Seamless', more: 'There is no preview window or mode switch: Markdown symbols are hidden and text is formatted as you type.', src: typora },
      obsidian: { v: 'yes', say: 'Live Preview', more: 'The default mode formats text in place and shows the syntax only where the cursor is. Source mode and Reading view are a switch away.', src: obsViews },
      stackedit: { v: 'no', say: 'Side by side', more: 'An editor beside a preview, with Scroll Sync keeping the two in step, and formatting buttons.', src: seHome },
      hackmd: { v: 'no', say: 'Split view', more: 'Edit, View, or Both side by side. Phones get View and Edit only.', src: hmFeatures },
      dillinger: { v: 'no', say: 'Side by side', more: 'A Monaco code editor beside a live preview, with scroll sync.', src: dilRepo },
      vscode: { v: 'part', say: 'Experimental', more: 'Source with a preview beside it. An experimental Markdown Editor edits the rendered text, and the docs say it might change or be removed.', src: vscMd },
    },
  },
  {
    id: 'files',
    group: 'writing',
    label: 'Saves into your files',
    cells: {
      us: { v: 'part', say: 'Chrome and Edge', more: 'In Chromium browsers a file or folder opened from disk saves back in place with ⌘S and follows changes made to it. Other browsers download a copy, and cannot open folders.', src: mdRepo },
      typora: { v: 'yes', say: 'Any folder', more: 'It is a file editor: it opens and saves Markdown files where they are.', src: typora },
      obsidian: { v: 'yes', say: 'Vault files', more: 'Notes are plain files in the vault folder, so other editors and file managers can work on them too.', src: obsStorage },
      stackedit: { v: 'no', say: 'Export only', more: 'Files are kept in the browser and in linked cloud accounts. The guide describes exporting a copy, not saving into a file on your disk.', src: seGuide },
      hackmd: { v: 'no', say: 'Download', more: 'Notes live on HackMD. A copy can be downloaded as .md or .html.', src: hmFeatures },
      dillinger: { v: 'no', say: 'Drop in, download', more: 'A dropped .md file is read into the browser; changes go out as a download or to a linked service.', src: dilRepo },
      vscode: { v: 'yes', say: 'Same file', more: 'A Markdown file is edited and saved where it is on disk.', src: vscMd },
    },
  },
  {
    id: 'sync',
    group: 'writing',
    label: 'Sync between devices',
    cells: {
      us: { v: 'no', say: 'None', more: 'Documents stay in this browser on this device. To move one, save it as a file or copy a link that carries the text.', src: mdTrust },
      typora: { v: 'part', say: 'Your own cloud', more: 'No sync service of its own; files can sit in a Dropbox or iCloud folder.', src: typora },
      obsidian: { v: 'yes', say: 'Paid Sync', more: 'Obsidian Sync is $4 a month, billed yearly, and end-to-end encrypted.', src: obsPricing },
      stackedit: { v: 'yes', say: 'Drive, Dropbox, GitHub', more: 'Single files, or a whole workspace with its folders and settings, sync with Google Drive, Dropbox or GitHub.', src: seGuide },
      hackmd: { v: 'yes', say: 'Its cloud', more: 'Notes are kept on HackMD, so they open wherever you sign in. The free plan allows 20 GitHub pushes a month.', src: hmPricing },
      dillinger: { v: 'yes', say: 'Linked services', more: 'Links to GitHub, Dropbox, Google Drive, OneDrive and Bitbucket. Cloud sync needs a connection.', src: dilHome },
      vscode: { v: 'no', say: 'Settings only', more: 'Settings Sync carries settings, shortcuts, snippets and extensions; documents are not among the things it lists.', src: vscSync },
    },
  },
  {
    id: 'together',
    group: 'writing',
    label: 'Write together',
    cells: {
      us: { v: 'no', say: 'One person', more: 'A copied link can carry a document to someone else, but there is no shared or live editing.', src: mdRepo },
      typora: { v: 'no', say: 'One person', more: 'No shared editing is described; it edits files on one machine.', src: typora },
      obsidian: { v: 'part', say: 'Shared vaults', more: 'Sync can share a vault with up to 20 people, each with a Sync subscription. Changes merge as they sync; Obsidian says it does not yet support live editing of one file.', src: obsShare },
      stackedit: { v: 'part', say: 'Shared workspaces', more: 'Workspaces can be shared, and StackEdit merges changes when two people edit the same file.', src: seHome },
      hackmd: { v: 'yes', say: 'Real time', more: 'Several people edit one note at once. The free plan allows up to three teammates.', src: hmPricing },
      dillinger: { v: 'no', say: 'None found', more: 'No shared editing is described.', src: dilHome },
      vscode: { v: 'part', say: 'Live Share', more: 'The Live Share extension edits in real time, each person with their own cursor. Microsoft has put it in maintenance mode, with no new features planned.', src: liveShare },
    },
  },
  {
    id: 'plugins',
    group: 'writing',
    label: 'Plugins',
    cells: {
      us: { v: 'no', say: 'None', more: 'Nothing can be added. The page runs only md’s own scripts, from its own site.', src: mdTrust },
      typora: { v: 'no', say: 'Themes only', more: 'A gallery of themes changes how it looks. No plugin system is documented.', src: 'https://theme.typora.io/' },
      obsidian: { v: 'yes', say: 'Community', more: 'Community plugins extend it. Obsidian warns that they run third-party code that could do harm.', src: obsPlugins },
      stackedit: { v: 'no', say: 'None found', more: 'No plugin system is documented.', src: seHome },
      hackmd: { v: 'no', say: 'None found', more: 'No plugin system is documented.', src: hmFeatures },
      dillinger: { v: 'no', say: 'None found', more: 'No plugin system is documented.', src: dilRepo },
      vscode: { v: 'yes', say: 'Extensions', more: 'Extensions add to Markdown editing, and can add styles and scripts to the preview.', src: vscMd },
    },
  },
  {
    id: 'diagrams',
    group: 'export',
    label: 'Diagrams',
    cells: {
      us: { v: 'yes', say: 'Mermaid, PlantUML, draw.io', more: 'All three are drawn on your device. PlantUML and draw.io load from md’s site only when a document has one, and run in sandboxed frames that cannot reach the network.', src: mdLog },
      typora: { v: 'yes', say: 'Mermaid and more', more: 'Mermaid, flowchart.js and js-sequence. PlantUML and draw.io are not listed.', src: typoraDiagrams },
      obsidian: { v: 'yes', say: 'Mermaid', more: 'Mermaid code blocks are drawn as diagrams. PlantUML and draw.io are not mentioned.', src: obsSyntax },
      stackedit: { v: 'yes', say: 'Mermaid', more: 'Sequence diagrams and flow charts through Mermaid.', src: seGuide },
      hackmd: { v: 'yes', say: 'Many kinds', more: 'Mermaid, PlantUML, Graphviz, sequence, flow chart, abc and Vega-Lite. The docs do not say where PlantUML is drawn.', src: hmFeatures },
      dillinger: { v: 'no', say: 'None', more: 'No diagram renderer is among its dependencies, and its site does not mention diagrams.', src: dilDeps },
      vscode: { v: 'yes', say: 'Mermaid', more: 'The built-in preview draws Mermaid code blocks.', src: vscMd },
    },
  },
  {
    id: 'pdf',
    group: 'export',
    label: 'PDF',
    cells: {
      us: { v: 'yes', say: 'Print layout', more: 'Download PDF (⌘P) opens the print dialog with md’s own layout; choose Save as PDF. Pages are numbered in Chrome 131 and later.', src: mdLog },
      typora: { v: 'yes', say: 'With bookmarks', more: 'Exports PDF with bookmarks, built in.', src: typora },
      obsidian: { v: 'part', say: 'Desktop only', more: 'Any note exports as a PDF on desktop. The mobile app cannot.', src: obsPdf },
      stackedit: { v: 'part', say: 'Sponsors, on a server', more: 'The document is posted to StackEdit’s server to be made into a PDF, and a refusal from it opens a sponsors-only notice.', src: sePdf },
      hackmd: { v: 'part', say: 'Prime plan', more: 'PDF export is listed for the Prime plan, not the free one.', src: hmPricing },
      dillinger: { v: 'yes', say: 'On its server', more: 'One click downloads a PDF, which Dillinger’s server makes from the Markdown sent to it.', src: dilExport },
      vscode: { v: 'no', say: 'Extension', more: 'The Markdown docs mention no PDF or print export, so it takes an extension.', src: vscMd },
    },
  },
  {
    id: 'image',
    group: 'export',
    label: 'Save as an image',
    cells: {
      us: { v: 'part', say: 'Diagrams, pictures', more: 'Each diagram or picture downloads as PNG, JPEG, WEBP (where the browser can write it) or SVG. A whole document cannot be saved as one image.', src: mdLog },
      typora: { v: 'yes', say: 'Whole document', more: 'Exports the document as an image, 640 px wide by default for social posts. The docs do not name the file type.', src: typoraExport },
      obsidian: { v: 'no', say: 'None found', more: 'Its export help covers PDF only.', src: obsPdf },
      stackedit: { v: 'no', say: 'None found', more: 'Exports are Markdown, HTML and PDF.', src: seGuide },
      hackmd: { v: 'no', say: 'None found', more: 'Downloads are Markdown, HTML and raw HTML.', src: hmFeatures },
      dillinger: { v: 'no', say: 'None found', more: 'Exports are Markdown, styled HTML and PDF.', src: dilHome },
      vscode: { v: 'no', say: 'None found', more: 'No image export is documented; a diagram’s Mermaid source can be copied.', src: vscMd },
    },
  },
  {
    id: 'html',
    group: 'export',
    label: 'HTML file',
    cells: {
      us: { v: 'yes', say: 'Self-contained', more: 'Download HTML writes one file that opens anywhere. Copy rich text puts the formatted document on the clipboard.', src: mdRepo },
      typora: { v: 'yes', say: 'Built in', more: 'HTML with or without its styles.', src: typoraExport },
      obsidian: { v: 'no', say: 'Not built in', more: 'Its export help covers PDF only.', src: obsPdf },
      stackedit: { v: 'yes', say: 'Templates', more: 'HTML through a Handlebars template.', src: seGuide },
      hackmd: { v: 'yes', say: 'Download', more: 'HTML or raw HTML from the Download menu.', src: hmFeatures },
      dillinger: { v: 'yes', say: 'On its server', more: 'Plain or styled HTML, made by Dillinger’s server from the Markdown sent to it.', src: dilExport },
      vscode: { v: 'no', say: 'Extension', more: 'The Markdown docs mention no HTML export, so it takes an extension.', src: vscMd },
    },
  },
  {
    id: 'price',
    group: 'cost',
    label: 'Price',
    cells: {
      us: { v: 'yes', say: 'Free, MIT', more: 'Free, and open source under the MIT licence.', src: mdRepo },
      typora: { v: 'part', say: '$14.99 once', more: 'A one-time licence for up to three devices, after a 15-day trial. typora.io lists $14.99 before tax.', src: typoraBuy },
      obsidian: { v: 'yes', say: 'Free', more: 'Free for personal and commercial use. Sync is $4 and Publish $8 a month, billed yearly.', src: obsPricing },
      stackedit: { v: 'yes', say: 'Free', more: 'Free and open source under Apache 2.0; PDF export asks for sponsorship. Its repository was last changed in May 2023.', src: seRepo },
      hackmd: { v: 'part', say: 'Free plan', more: 'The free plan allows three teammates and 20 GitHub pushes a month. Prime is $5 a seat a month, billed yearly.', src: hmPricing },
      dillinger: { v: 'yes', say: 'Free, MIT', more: 'Free with no paid tiers, and open source under MIT.', src: dilHome },
      vscode: { v: 'yes', say: 'Free', more: 'Free for private or commercial use, under a Microsoft product licence; the source it is built from is MIT.', src: vscFaq },
    },
  },
  {
    id: 'install',
    group: 'cost',
    label: 'Install needed',
    cells: {
      us: { v: 'yes', say: 'None', more: 'It runs in a current browser. md Local, a separate edition for files on a Mac, is built from the source.', src: mdRepo },
      typora: { v: 'no', say: 'Desktop app', more: 'An app for macOS, Windows and Linux.', src: typora },
      obsidian: { v: 'no', say: 'App', more: 'Apps for Windows, macOS, Linux, iOS and Android. No web version is listed.', src: obsDownload },
      stackedit: { v: 'yes', say: 'None', more: 'It runs in the browser.', src: seHome },
      hackmd: { v: 'yes', say: 'None', more: 'It runs in the browser.', src: hmFeatures },
      dillinger: { v: 'yes', say: 'None', more: 'It runs in the browser.', src: dilHome },
      vscode: { v: 'part', say: 'App, or web', more: 'An app for macOS, Linux and Windows. VS Code for the Web runs in a browser.', src: vscWeb },
    },
  },
  {
    id: 'offline',
    group: 'cost',
    label: 'Works offline',
    cells: {
      us: { v: 'yes', say: 'After one visit', more: 'A service worker keeps the app’s files on the device, so later visits make no request and work with the network off.', src: mdTrust },
      typora: { v: 'yes', say: 'Desktop app', more: 'Files are edited on your machine. Activating a licence needs a connection.', src: typoraActivate },
      obsidian: { v: 'yes', say: 'Local vault', more: 'Notes are saved on your device; it goes online to check for updates, browse plugins or sync.', src: obsPrivacy },
      stackedit: { v: 'yes', say: 'Writes offline', more: 'StackEdit says it stays usable and lets you write offline.', src: seHome },
      hackmd: { v: 'unknown', say: 'Not stated', more: 'No page found says whether a note opens or edits without a connection.', src: hmFeatures },
      dillinger: { v: 'yes', say: 'After first load', more: 'Editing and preview work without a connection after the first load. Cloud sync does not.', src: dilHome },
      vscode: { v: 'yes', say: 'Once installed', more: 'A desktop app, so editing and the preview need no network.', src: vscFaq },
    },
  },
  {
    id: 'phone',
    group: 'cost',
    label: 'On a phone',
    cells: {
      us: { v: 'part', say: 'Browser only', more: 'Page, Write and Read work in a phone’s browser; Split needs a wider window. There is no phone app.', src: mdSpec },
      typora: { v: 'no', say: 'No mobile app', more: 'typora.io lists macOS, Windows and Linux only.', src: typora },
      obsidian: { v: 'yes', say: 'iOS, Android', more: 'Apps for iOS and Android. PDF export is not in the mobile app.', src: obsDownload },
      stackedit: { v: 'unknown', say: 'Not stated', more: 'Its site does not mention phones.', src: seHome },
      hackmd: { v: 'part', say: 'No split view', more: 'Phones get View and Edit, without the side-by-side mode.', src: hmFeatures },
      dillinger: { v: 'unknown', say: 'Not stated', more: 'Its site does not mention phones.', src: dilHome },
      vscode: { v: 'part', say: 'Web, limited', more: 'VS Code for the Web runs on mobile devices, and its docs say smaller screens have certain limitations.', src: vscWeb },
    },
  },
]
