---
title: md: a private Markdown editor in your browser
description: Write Markdown on the rendered page, with Mermaid, PlantUML and draw.io diagrams, math and code. The page cannot make a request, so your text stays on your device. Free, open source, and it works offline.
---

# md

Markdown, written and read in one place. Write on the page as it will be read, or in plain Markdown beside it, with diagrams, math and code drawn as you type. The page cannot make a request, so your text stays on this device.

md is a free, open source (MIT) web page at https://md.ashwingopalsamy.in/. Start writing, try the demo (the tour, which Clear deletes again), or drop a `.md` file anywhere on the page. It works offline after the first visit.

## Compared

Seven ways to write Markdown. Typora and Obsidian are apps that keep files on your disk. StackEdit and Dillinger keep drafts in your browser, and send them to a server to sync and for some exports. HackMD keeps notes on its servers so people can write together, and VS Code shows Markdown beside its source. md runs in your browser: nothing to install, no account, and a page that cannot send your text anywhere. Every answer names the tool's own page, checked in November 2026.

<!--compare-->

Where md isn't the right pick:

- Your notes need to be on every device. md keeps documents in this browser, on this device, and has no sync. Obsidian, StackEdit and HackMD do.
- You write with other people at the same time. md is for one person. HackMD edits one note live, together.
- You want plugins. md has none and takes none. Obsidian has community plugins, and VS Code has extensions.
- You want an app on your phone. md runs in the phone's browser, without Split view. Obsidian has apps for iOS and Android.
- You need Word, ePub or LaTeX, or the whole document as one image. Typora exports these; Word and the rest go through Pandoc.
- You save files in Firefox or Safari. Saving back into the same file needs Chrome or Edge; other browsers download a copy.

## Where your text goes

Nowhere. md's page runs under one rule, `connect-src 'none'`, and the browser enforces it: no script on the page can make a request, so a document has no way out. Your documents are kept in this browser, on this device, and written to files you choose. The Privacy sheet, behind the shield, counts requests to anywhere else since the page opened; it should read 0. After the first visit md keeps its own files on your device, so it opens with the wifi off.

Check it yourself:

1. Open the browser's developer tools, on the Network tab.
2. Write a page. Anything that loads is one of md's own files, from its own site, such as the code that draws math.
3. Switch the wifi off and reload. md still opens.
4. Open the shield and press Try to break out. Every attempt is refused.

A typeface you choose, and the PlantUML and draw.io engines, come from md's site the first time a page needs them. Your text never goes the other way. [Trust and network notes](trust/index.md) has the exact policy and how to check each claim.

## What's inside

- Page editing: click any sentence and type. Write, Split and Read are one key away, `⌘\`.
- Diagrams: Mermaid, PlantUML and draw.io, drawn on your device. Zoom one, copy it as an image, or download it.
- Export: PDF in md's own print layout, one self-contained HTML file, or the Markdown. Diagrams and pictures save as PNG, JPEG, WEBP or SVG.
- Themes and typefaces: light and dark, in Neutral, Paper or Calm. Set the text in Sans, Literata or Newsreader, from 90% to 140%.
- Search: find and replace in the document, and search every document on this device. md Local adds patterns, match case and whole word.
- Files and folders: open a file or a whole folder. In Chrome and Edge, `⌘S` saves back to the file, and changes made elsewhere show up live.
- md Local: for files on your Mac. Run `md notes.md` and the file opens as a tab; `⌘S` writes it. Built from the source with one script.
- Privacy shield: counts requests to anywhere else, shows the rule the page runs under, and tries to break out when you ask.

Keys: `⌘\` views, `⌘F` find, `⇧⌘O` outline, `⌘S` save, `⌘P` PDF.

## Questions

### Is my text uploaded?

No. md's page runs under a rule, `connect-src 'none'`, sent by the server and repeated inside the page, and the browser enforces it: no script on the page can make a request. Your documents are kept in this browser's storage on this device. The only files that come down are md's own, from md's own site.

### Where are my documents kept?

In this browser, on this device, in its IndexedDB storage, never in cookies. md keeps up to 30 earlier versions of each document. A file you open from disk in Chrome or Edge is saved back into that file. If you clear this site's data in the browser, the documents kept there go with it, so save anything you would miss as a file.

### Does it work offline?

Yes, after the first visit. A service worker keeps md's files on the device, so later visits make no request and work with the network off. A typeface you choose, and the PlantUML and draw.io engines, come from md's site the first time a page needs them.

### Do I need an account?

No. There is no sign-in, and md sets no cookies. It is free and open source under the MIT licence.

### Can I sync between devices, or write with someone?

No. md is for one person on one device. To move a document, save it as a file, or use Export, Copy link: the text travels in the link after the `#`, which browsers do not send to a server. For notes on every device or live editing with others, the comparison above names tools that do it.

### Which browsers does it work in?

Any current browser. Saving into the same file, opening a folder and following changes made on disk need a Chromium browser, such as Chrome or Edge; other browsers download a copy instead. Split view needs a window at least 860 px wide, so a phone gets Page, Write and Read.

### How do I make a PDF?

Export, then Download PDF, or `⌘P`. It opens the browser's print dialog with md's own print layout; choose Save as PDF. Pages are numbered in Chrome 131 and later, and diagrams print light. Diagrams and pictures also save one at a time as PNG, JPEG, WEBP or SVG.

### Can an AI agent open a file in md?

Yes, and it cannot read one back. An agent builds a link with the file after the `#`, which the browser does not send to a server, and opens it in your browser. md Local, for files on a Mac, adds a command: `md notes.md` opens the file as a tab. [The agent guide](agents/index.md) has the details.

## Start

Start with a blank page, or with the tour. It opens in this tab. Nothing is uploaded.

Pages: [trust](trust/index.md), [for agents](agents/index.md), [syntax](syntax/index.md). Source: github.com/ashwingopalsamy/markdown, under the MIT licence.
