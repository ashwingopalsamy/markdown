export type Pop = 'outline' | 'export' | 'open' | 'privacy' | 'settings' | 'keys' | 'view' | 'search' | 'tabs' | 'diagram' | 'info';

export const ui = $state({ pop: null as Pop | null, leaving: null as Pop | null, seed: '' });

export const toggle = (p: Pop) => (ui.pop = ui.pop === p ? null : p);
/** A card keeps what it showed until it has faded out. */
export const showing = (p: Pop) => ui.pop === p || ui.leaving === p;
