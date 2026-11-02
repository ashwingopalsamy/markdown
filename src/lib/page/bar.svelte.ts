import type { Cmd, Type } from './Toolbar.svelte';
/** What the open block tells the toolbar; null while no block is open. */
export interface Live { root: () => HTMLElement | undefined; source: boolean; type: Type | null; shapes: boolean; flip: boolean; heading: boolean; history: (forward: boolean) => boolean; run: (cmd: Cmd) => void; resume: () => void; onleave: (e: FocusEvent) => void }
export const bar = $state<{ live: Live | null }>({ live: null });
/** The toolbar's own focus(), for Alt+F10 from an open block. */
export const keys = { focus: () => {} };
