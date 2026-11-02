/** Where a document lives when it is not only in this browser (md Local, docs/local.md): plain data, so it survives IndexedDB. Hosted keeps its file handle in `Doc.handle`; moving it here would rewrite stored documents. */
export type Source = { kind: 'server'; id: string; version: string /* hash of the file's bytes when this window last read or wrote it */ };
export interface Doc { id: string; name: string; text: string; created: number; updated: number; saved: string | null /* text as last written to disk */; open: boolean; order: number; handle?: FileSystemFileHandle; eol?: '\r\n' /* the file used CRLF; text is kept with LF and put back on the way out */; source?: Source }
export interface Snapshot { id: string; doc: string; at: number; text: string }
export interface FolderEntry { path: string; name: string; handle: FileSystemFileHandle; text(): Promise<string> }
