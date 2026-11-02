import { createNdjsonDecoder } from './ndjson'
import type { AmayaBrainRequest, AmayaEvent } from './types'

export const BRAIN_ENDPOINT = '/api/amaya/brain'

/**
 * Sends one utterance to the brain and calls `onEvent` for every
 * streamed event, in order. Resolves when the stream ends.
 */
export async function streamBrain(
  req: AmayaBrainRequest,
  onEvent: (e: AmayaEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(BRAIN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
    body: JSON.stringify(req),
    signal,
  })
  if (!res.ok || !res.body) {
    onEvent({ type: 'error', message: res.status === 401 ? 'unauthorized' : `http_${res.status}` })
    onEvent({ type: 'done' })
    return
  }
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  const nd = createNdjsonDecoder()
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    for (const e of nd.push(dec.decode(value, { stream: true }))) onEvent(e)
  }
  for (const e of nd.flush()) onEvent(e)
}

export async function fetchBrainMode(): Promise<'local' | 'remote' | 'offline'> {
  try {
    const res = await fetch(BRAIN_ENDPOINT, { cache: 'no-store' })
    if (!res.ok) return 'offline'
    const j = (await res.json()) as { mode?: string }
    return j.mode === 'remote' ? 'remote' : 'local'
  } catch {
    return 'offline'
  }
}
