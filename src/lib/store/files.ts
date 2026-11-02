import { LIMIT } from './limit';
import { MD_EXT } from './name';
import type { FolderEntry } from './types';

type Dir = FileSystemDirectoryHandle & { values(): AsyncIterable<FileSystemHandle> };

const TYPES = [{ description: 'Markdown and text', accept: { 'text/markdown': ['.md', '.markdown', '.mdx'], 'text/plain': ['.txt'] } }];
const abort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

/** UTF-8 with the BOM dropped and nothing else touched, so saving writes back what was read. */
export function decode(buf: ArrayBuffer | Uint8Array, name = 'This file'): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (b.length > LIMIT) throw new Error(`${name} is larger than ${LIMIT / 1024 / 1024} MB.`);
  if (b.subarray(0, 8192).includes(0)) throw new Error(`${name} is not a text file.`);
  return new TextDecoder().decode(b);
}

/** The editor joins lines with \n, so text is held that way; a file's CRLF is noted on its document (`eol`) and put back when it is written. */
export const lf = (t: string) => t.replace(/\r\n?/g, '\n');
export const crlf = (t: string) => t.replace(/\n/g, '\r\n');

export async function readFile(f: File): Promise<string> {
  if (f.size > LIMIT) throw new Error(`${f.name} is larger than ${LIMIT / 1024 / 1024} MB.`);
  return decode(await f.arrayBuffer(), f.name);
}

export async function pickFile(): Promise<{ text: string; name: string; handle?: FileSystemFileHandle }[]> {
  if (window.showOpenFilePicker) {
    let hs: FileSystemFileHandle[];
    try { hs = await window.showOpenFilePicker({ multiple: true, types: TYPES }); } catch (e) { if (abort(e)) return []; throw e; }
    return Promise.all(hs.map(async (handle) => {
      const f = await handle.getFile();
      return { text: await readFile(f), name: f.name, handle };
    }));
  }
  const files = await new Promise<File[]>((res) => {
    const i = document.createElement('input');
    i.type = 'file';
    i.multiple = true;
    i.accept = '.md,.markdown,.mdx,.txt,text/markdown,text/plain';
    i.onchange = () => res([...(i.files ?? [])]);
    i.oncancel = () => res([]);
    i.click();
  });
  return Promise.all(files.map(async (f) => ({ text: await readFile(f), name: f.name })));
}

export async function pickFolder(): Promise<FolderEntry[] | null> {
  if (!window.showDirectoryPicker) return null;
  let root: FileSystemDirectoryHandle;
  try { root = await window.showDirectoryPicker({ mode: 'read' }); } catch (e) { if (abort(e)) return []; throw e; }
  const out: FolderEntry[] = [];
  const walk = async (dir: Dir, prefix: string) => {
    for await (const h of dir.values()) {
      if (out.length >= 5000) return;
      if (h.kind === 'directory') {
        if (!h.name.startsWith('.') && h.name !== 'node_modules') await walk(h as Dir, `${prefix}${h.name}/`);
      } else if (MD_EXT.test(h.name)) {
        const handle = h as FileSystemFileHandle;
        out.push({ path: prefix + h.name, name: h.name, handle, text: async () => readFile(await handle.getFile()) });
      }
    }
  };
  await walk(root as Dir, '');
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

export async function ensurePermission(handle: FileSystemHandle, mode: 'read' | 'readwrite'): Promise<boolean> {
  if (!handle.queryPermission) return true;
  try {
    if ((await handle.queryPermission({ mode })) === 'granted') return true;
    // requestPermission only prompts from a user gesture; outside one it resolves 'prompt' or throws.
    return (await handle.requestPermission?.({ mode })) === 'granted';
  } catch {
    return false;
  }
}

export async function saveToHandle(handle: FileSystemFileHandle, text: string): Promise<void> {
  if (!(await ensurePermission(handle, 'readwrite'))) throw new Error(`md is not allowed to write ${handle.name}. Save again and allow it.`);
  const w = await handle.createWritable();
  try { await w.write(text); } catch (e) { await w.abort().catch(() => {}); throw e; }
  await w.close();
}

/** The handle it was saved to, or null when the browser has no picker and the text was downloaded. Cancelling throws AbortError. */
export async function saveAs(name: string, text: string): Promise<FileSystemFileHandle | null> {
  if (!window.showSaveFilePicker) {
    download(name, new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    return null;
  }
  // a cancelled picker throws AbortError, so null can only mean the text was downloaded
  const handle = await window.showSaveFilePicker({ suggestedName: name, types: TYPES });
  await saveToHandle(handle, text);
  return handle;
}

export function download(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function watch(handle: FileSystemFileHandle, last: number, fn: (text: string, modified: number) => void): () => void {
  let stopped = false;
  let busy = false;
  const tick = async () => {
    if (stopped || busy || document.hidden) return;
    busy = true;
    try {
      const f = await handle.getFile();
      if (f.lastModified === last) return;
      last = f.lastModified; // set first so an unreadable file isn't retried every tick
      const text = await readFile(f);
      if (!stopped) fn(text, f.lastModified);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotFoundError') stop();
      // Permission lost or a transient read error: keep polling, the next tick may succeed.
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(tick, 1500);
  const stop = () => { stopped = true; clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  document.addEventListener('visibilitychange', tick);
  return stop;
}

export async function persist(): Promise<boolean> {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}
