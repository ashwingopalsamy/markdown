// Set by vite.config.ts: true in the md Local build (docs/local.md), false in the hosted one.
declare const __LOCAL__: boolean

// Chosen by vite.config.ts: src/about/home.ts on the hosted site, src/about/entry-local.ts in md Local.
declare module '@entry' {
  export function enter(): void
}
