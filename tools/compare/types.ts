export type Verdict = 'yes' | 'part' | 'no' | 'unknown'
export type ToolId = 'us' | 'typora' | 'obsidian' | 'stackedit' | 'hackmd' | 'dillinger' | 'vscode'
export type GroupId = 'privacy' | 'writing' | 'export' | 'cost'

export interface Tool { id: ToolId; name: string; job: 'Browser' | 'App' | 'Cloud'; docs: string; choose: { lead: string; rest: string } }
export interface Group { id: GroupId; name: string }
/** `src` is the page that backs the verdict; the build fails without one. */
export interface Cell { v: Verdict; say: string; more?: string; src: string }
export interface Row { id: string; group: GroupId; label: string; cells: Record<ToolId, Cell> }
