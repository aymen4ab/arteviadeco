import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runLocalBrain } from '@/lib/amaya/local-brain'
import { encodeEvent } from '@/lib/amaya/ndjson'
import type { AmayaBrainRequest, AmayaContext, AmayaTurn } from '@/lib/amaya/types'

/**
 * Amaya brain endpoint.
 *
 *   GET  /api/amaya/brain  → { mode: 'local' | 'remote' }
 *   POST /api/amaya/brain  → NDJSON stream of AmayaEvent (see lib/amaya/types.ts)
 *
 * If AMAYA_BRAIN_URL is set, the request is forwarded to the Amaya
 * platform brain (Bearer AMAYA_BRAIN_KEY) and its NDJSON stream is
 * piped straight back. Otherwise the built-in local demo brain answers.
 */

export const dynamic = 'force-dynamic'

const MAX_TEXT = 2000
const MAX_HISTORY = 20

async function getUserId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

function brainMode(): 'local' | 'remote' {
  return process.env.AMAYA_BRAIN_URL ? 'remote' : 'local'
}

export async function GET() {
  if (!(await getUserId())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json({ mode: brainMode() })
}

function parseBody(raw: unknown): AmayaBrainRequest | null {
  if (typeof raw !== 'object' || raw === null) return null
  const b = raw as Record<string, unknown>
  if (typeof b.text !== 'string' || !b.text.trim()) return null
  const lang = b.lang === 'en' ? 'en' : 'ar'
  const history: AmayaTurn[] = Array.isArray(b.history)
    ? b.history
        .filter(
          (t): t is AmayaTurn =>
            typeof t === 'object' &&
            t !== null &&
            (t.role === 'user' || t.role === 'amaya') &&
            typeof t.text === 'string'
        )
        .slice(-MAX_HISTORY)
        .map((t) => ({ role: t.role, text: t.text.slice(0, MAX_TEXT), at: Number(t.at) || 0 }))
    : []
  const c = (typeof b.context === 'object' && b.context !== null ? b.context : {}) as Record<
    string,
    unknown
  >
  const pr = c.pendingReport as Record<string, unknown> | null | undefined
  const context: AmayaContext = {
    pendingReport:
      pr && typeof pr === 'object' && typeof pr.id === 'string'
        ? {
            id: pr.id,
            topic: String(pr.topic ?? ''),
            blocks: Number(pr.blocks) || 0,
            sources: Number(pr.sources) || 0,
          }
        : null,
    presenting: c.presenting === true,
    screenAwake: c.screenAwake === true,
    researching: c.researching === true,
  }
  return { text: b.text.slice(0, MAX_TEXT), lang, history, context }
}

export async function POST(request: Request) {
  const userId = await getUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: AmayaBrainRequest | null = null
  try {
    body = parseBody(await request.json())
  } catch {
    body = null
  }
  if (!body) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const headers = {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Amaya-Brain': brainMode(),
  }

  /* ---------------- remote: Amaya platform brain ---------------- */
  const remote = process.env.AMAYA_BRAIN_URL
  if (remote) {
    try {
      const upstream = await fetch(remote, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/x-ndjson',
          ...(process.env.AMAYA_BRAIN_KEY
            ? { Authorization: `Bearer ${process.env.AMAYA_BRAIN_KEY}` }
            : {}),
        },
        body: JSON.stringify({ ...body, userId }),
        signal: request.signal,
      })
      if (!upstream.ok || !upstream.body) {
        return new Response(
          encodeEvent({ type: 'error', message: `brain_upstream_${upstream.status}` }) +
            encodeEvent({ type: 'done' }),
          { headers }
        )
      }
      return new Response(upstream.body, { headers })
    } catch {
      return new Response(
        encodeEvent({ type: 'error', message: 'brain_unreachable' }) +
          encodeEvent({ type: 'done' }),
        { headers }
      )
    }
  }

  /* ---------------- local: built-in demo brain ------------------ */
  const encoder = new TextEncoder()
  const iterator = runLocalBrain(body)
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next()
        if (done) {
          controller.close()
          return
        }
        controller.enqueue(encoder.encode(encodeEvent(value)))
      } catch {
        controller.enqueue(
          encoder.encode(encodeEvent({ type: 'error', message: 'brain_failed' }))
        )
        controller.close()
      }
    },
    async cancel() {
      await iterator.return(undefined)
    },
  })
  return new Response(stream, { headers })
}
