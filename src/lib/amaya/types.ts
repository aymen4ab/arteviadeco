/**
 * Amaya — shared protocol types.
 *
 * Everything that crosses the wire between the HUD (browser) and the
 * brain (`/api/amaya/brain`, which either runs the built-in local brain
 * or proxies to the external Amaya platform brain) is described here.
 * The external brain only has to speak this protocol to plug in.
 */

export type AmayaLang = 'ar' | 'en'

/* ------------------------------------------------------------------ */
/* Report blocks                                                       */
/* ------------------------------------------------------------------ */

interface BlockBase {
  id: string
  /** Grid footprint on the HUD (defaults to 1×1). */
  span?: { cols?: 1 | 2 | 3; rows?: 1 | 2 }
  /** Ids into `AmayaReport.sources`. */
  sourceIds?: string[]
  /** Small label shown in the panel header, e.g. "MARKET // 01". */
  tag?: string
}

export interface TextBlock extends BlockBase {
  kind: 'text'
  title: string
  body: string
}

export interface StatBlock extends BlockBase {
  kind: 'stat'
  value: string
  label: string
  caption?: string
}

export interface ChartBlock extends BlockBase {
  kind: 'chart'
  title: string
  chart: 'bar' | 'line'
  series: { label: string; value: number }[]
  unit?: string
  caption?: string
}

export interface ListBlock extends BlockBase {
  kind: 'list'
  title: string
  items: string[]
}

export interface ImageBlock extends BlockBase {
  kind: 'image'
  src: string
  title?: string
  caption?: string
}

export interface VideoBlock extends BlockBase {
  kind: 'video'
  src: string
  poster?: string
  title?: string
  caption?: string
}

/** Procedural animated visual rendered by the HUD itself (no media needed). */
export type VisualKind = 'globe' | 'terrain' | 'radar' | 'network'
export interface VisualBlock extends BlockBase {
  kind: 'visual'
  visual: VisualKind
  title?: string
  caption?: string
}

export type AmayaBlock =
  | TextBlock
  | StatBlock
  | ChartBlock
  | ListBlock
  | ImageBlock
  | VideoBlock
  | VisualBlock

export interface AmayaSource {
  id: string
  title: string
  url?: string
}

export interface AmayaReport {
  id: string
  topic: string
  createdAt: number
  /** True when the content is illustrative (local demo brain), not real research. */
  demo: boolean
  blocks: AmayaBlock[]
  sources: AmayaSource[]
  notes: string[]
}

/* ------------------------------------------------------------------ */
/* HUD actions the brain can trigger                                   */
/* ------------------------------------------------------------------ */

export type AmayaAction =
  | 'wake_screen'
  | 'sleep_screen'
  | 'present_report'
  | 'clear_view'
  | 'open_history'
  | 'open_text'
  | 'open_camera'
  | 'close_camera'
  | 'open_sources'
  | 'mute_mic'
  | 'listen'

/* ------------------------------------------------------------------ */
/* Brain request / streamed events (NDJSON, one JSON object per line)  */
/* ------------------------------------------------------------------ */

export interface AmayaTurn {
  role: 'user' | 'amaya'
  text: string
  at: number
}

export interface AmayaContext {
  /** A finished report exists that has not been presented yet. */
  pendingReport: { id: string; topic: string; blocks: number; sources: number } | null
  presenting: boolean
  screenAwake: boolean
  researching: boolean
}

export interface AmayaBrainRequest {
  text: string
  lang: AmayaLang
  history: AmayaTurn[]
  context: AmayaContext
}

export type AmayaEvent =
  /** Speak (and print) a line. `audioUrl` lets an external brain supply its own TTS audio. */
  | { type: 'say'; text: string; audioUrl?: string; expectReply?: boolean }
  | { type: 'action'; action: AmayaAction }
  | { type: 'research_start'; id: string; topic: string }
  | {
      type: 'research_progress'
      id: string
      progress: number
      blocks: number
      sources: number
      status: string
    }
  | { type: 'block'; reportId: string; block: AmayaBlock }
  | { type: 'source'; reportId: string; source: AmayaSource }
  | { type: 'note'; reportId: string; note: string }
  | { type: 'research_done'; id: string; demo: boolean }
  | { type: 'error'; message: string }
  | { type: 'done' }
