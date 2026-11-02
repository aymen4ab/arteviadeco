import type { AmayaBlock, VisualKind } from './types'

/**
 * The `publish_report` tool the research agent calls once it has
 * finished researching. Its input is validated with `sanitizeReport`
 * before anything reaches the HUD — model output is untrusted.
 */

export const MAX_BLOCKS = 12
/** 4×4 grid minus the bottom-right cell where the orb docks. */
export const MAX_CELLS = 15

const VISUALS: VisualKind[] = ['globe', 'terrain', 'radar', 'network']

export const PUBLISH_REPORT_TOOL = {
  name: 'publish_report',
  description:
    'Publish the finished research report to the HUD. Call this exactly once, after researching, with 9-12 blocks. ' +
    'Every number must come from the sources you found; do not invent figures.',
  input_schema: {
    type: 'object' as const,
    properties: {
      title: { type: 'string', description: 'Short report title (2-5 words), in the user language.' },
      blocks: {
        type: 'array',
        description:
          'Panels shown on a 4-column grid. Mix kinds: 3-4 text, 2-3 stat, 2-3 chart, 1 list, 1-2 visual. ' +
          'Use span_cols 2 for at most three blocks (visuals or line charts read best wide).',
        items: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: ['text', 'stat', 'chart', 'list', 'visual'] },
            tag: { type: 'string', description: 'Tiny uppercase English label, e.g. "MARKET // 03".' },
            title: { type: 'string' },
            body: { type: 'string', description: 'text: 2-4 short sentences.' },
            value: { type: 'string', description: 'stat: the headline figure, e.g. "≈20m" or "+34%".' },
            label: { type: 'string', description: 'stat: what the figure measures.' },
            caption: { type: 'string', description: 'Optional source or time hint, e.g. "IDC, 2025".' },
            chart: { type: 'string', enum: ['bar', 'line'] },
            series: {
              type: 'array',
              description: 'chart: 3-8 points.',
              items: {
                type: 'object',
                properties: { label: { type: 'string' }, value: { type: 'number' } },
                required: ['label', 'value'],
              },
            },
            unit: { type: 'string' },
            items: { type: 'array', items: { type: 'string' }, description: 'list: 3-5 short items.' },
            visual: {
              type: 'string',
              enum: VISUALS,
              description:
                'visual: animated illustration — globe (geography/global), terrain (trend/market), radar (competitors/scan), network (ecosystem/connections).',
            },
            span_cols: { type: 'integer', enum: [1, 2] },
          },
          required: ['kind', 'title'],
        },
      },
      notes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Caveats, open questions, things that could not be verified.',
      },
    },
    required: ['title', 'blocks'],
  },
}

export interface SanitizedReport {
  title: string
  blocks: AmayaBlock[]
  notes: string[]
}

const str = (v: unknown, max = 400): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : ''

/** Turns untrusted `publish_report` input into valid HUD blocks (or null). */
export function sanitizeReport(input: unknown): SanitizedReport | null {
  if (typeof input !== 'object' || input === null) return null
  const raw = input as Record<string, unknown>
  const rawBlocks = Array.isArray(raw.blocks) ? raw.blocks : []
  const blocks: AmayaBlock[] = []
  let cells = 0

  for (const item of rawBlocks) {
    if (blocks.length >= MAX_BLOCKS) break
    if (typeof item !== 'object' || item === null) continue
    const b = item as Record<string, unknown>
    const title = str(b.title, 120)
    const tag = str(b.tag, 32) || undefined
    const caption = str(b.caption, 120) || undefined
    let cols: 1 | 2 = b.span_cols === 2 ? 2 : 1
    if (cells + cols > MAX_CELLS) cols = 1
    if (cells + cols > MAX_CELLS) break
    const id = `b${blocks.length + 1}`
    const span = cols === 2 ? { cols } : undefined
    let block: AmayaBlock | null = null

    switch (b.kind) {
      case 'text': {
        const body = str(b.body, 600)
        if (title && body) block = { id, kind: 'text', title, body, tag, span }
        break
      }
      case 'stat': {
        const value = str(b.value, 24)
        const label = str(b.label, 120) || title
        if (value && label) block = { id, kind: 'stat', value, label, caption, tag, span }
        break
      }
      case 'chart': {
        const series = (Array.isArray(b.series) ? b.series : [])
          .map((p) => {
            const pt = (typeof p === 'object' && p !== null ? p : {}) as Record<string, unknown>
            const value = typeof pt.value === 'number' ? pt.value : Number(pt.value)
            return { label: str(pt.label, 24), value }
          })
          .filter((p) => p.label && Number.isFinite(p.value) && p.value >= 0)
          .slice(0, 8)
        if (title && series.length >= 2) {
          block = {
            id,
            kind: 'chart',
            chart: b.chart === 'line' ? 'line' : 'bar',
            title,
            series,
            unit: str(b.unit, 12) || undefined,
            caption,
            tag,
            span,
          }
        }
        break
      }
      case 'list': {
        const items = (Array.isArray(b.items) ? b.items : [])
          .map((x) => str(x, 140))
          .filter(Boolean)
          .slice(0, 6)
        if (title && items.length) block = { id, kind: 'list', title, items, tag, span }
        break
      }
      case 'visual': {
        const visual = VISUALS.includes(b.visual as VisualKind) ? (b.visual as VisualKind) : 'network'
        block = { id, kind: 'visual', visual, title: title || undefined, caption, tag, span }
        break
      }
    }
    if (block) {
      blocks.push(block)
      cells += cols
    }
  }

  if (!blocks.length) return null
  const notes = (Array.isArray(raw.notes) ? raw.notes : [])
    .map((n) => str(n, 300))
    .filter(Boolean)
    .slice(0, 8)
  return { title: str(raw.title, 80), blocks, notes }
}
