// The hosted editor, brought in by the landing page (home.ts) when someone starts, opens the demo or drops a file: it mounts in place of the landing page.
import { mount } from 'svelte'
import '../app.css'
import App from '../App.svelte'
import { booted, openDemo, openFiles } from '../lib/app.svelte'

export type Intent =
  | { kind: 'start' }
  | { kind: 'demo' }
  | { kind: 'files'; files: File[]; handles: Promise<(FileSystemHandle | null)[]> }

export async function begin(intent: Intent) {
  mount(App, { target: document.getElementById('app')! })
  if (intent.kind === 'start') return
  await booted
  if (intent.kind === 'demo') return openDemo()
  const handles = new Map<string, FileSystemFileHandle>()
  for (const h of await intent.handles) if (h?.kind === 'file') handles.set(h.name, h as FileSystemFileHandle)
  return openFiles(intent.files, handles)
}
