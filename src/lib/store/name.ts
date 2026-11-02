export const MD_EXT = /\.(?:md|markdown|mdx|txt)$/i;

/** A file name that is safe to show and to save under: no separators or control characters, at most 120 characters. */
export function cleanName(raw: string): string {
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\\/]/g, '_').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120);
}
