<script lang="ts">
  const PATHS = {
    plus: 'M5 12h14M12 5v14',
    lock: 'M7 11V7a5 5 0 0 1 10 0v4M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z',
    github: 'M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4M9 18c-4.51 2-5-2-7-2',
    pen: 'M12 20h9M16.4 3.6a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z',
    find: 'M20 20l-3.6-3.6M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',
    info: 'M12 16v-4M12 8h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
    moon: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
    sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
    outline: 'M4 6h16M8 12h12M12 18h8',
    save: 'M12 3v12M7.5 10.5 12 15l4.5-4.5M20 15v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4',
    settings: 'M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4',
    shield: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1ZM9 12l2 2 4-4',
    chevron: 'm6 9 6 6 6-6',
    file: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7ZM14 2v4a2 2 0 0 0 2 2h4',
    x: 'M6 6l12 12M18 6 6 18',
  } as const;
  // `d` is a path from ./glyphs.ts, which cards and the like import, so their symbols stay out of the first screen
  let { name, d, size = 18 }: { name?: keyof typeof PATHS; d?: string; size?: number } = $props();
</script>

<svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={d ?? PATHS[name!]} /></svg>
