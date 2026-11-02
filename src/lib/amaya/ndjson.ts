import type { AmayaEvent } from './types'

const EVENT_TYPES = new Set([
  'say',
  'action',
  'research_start',
  'research_progress',
  'block',
  'source',
  'note',
  'research_done',
  'error',
  'done',
])

/** Minimal shape check — an external brain may send anything. */
export function isAmayaEvent(value: unknown): value is AmayaEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string' &&
    EVENT_TYPES.has((value as { type: string }).type)
  )
}

/**
 * Incremental NDJSON decoder. Feed it text chunks as they arrive; it
 * returns every complete, valid event and keeps any partial trailing
 * line for the next call. Malformed lines are skipped.
 */
export function createNdjsonDecoder() {
  let buffer = ''
  return {
    push(chunk: string): AmayaEvent[] {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      return parseLines(lines)
    },
    flush(): AmayaEvent[] {
      const rest = buffer
      buffer = ''
      return parseLines([rest])
    },
  }
}

function parseLines(lines: string[]): AmayaEvent[] {
  const out: AmayaEvent[] = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    try {
      const parsed: unknown = JSON.parse(line)
      if (isAmayaEvent(parsed)) out.push(parsed)
    } catch {
      // skip malformed line
    }
  }
  return out
}

export function encodeEvent(event: AmayaEvent): string {
  return JSON.stringify(event) + '\n'
}
