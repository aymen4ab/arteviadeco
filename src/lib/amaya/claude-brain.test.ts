import Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it, vi } from 'vitest'
import { classifyError, runClaudeBrain } from './claude-brain'
import { MAX_CELLS, sanitizeReport } from './report-schema'
import type { AmayaBrainRequest, AmayaEvent } from './types'

const baseReq = (text: string, over: Partial<AmayaBrainRequest> = {}): AmayaBrainRequest => ({
  text,
  lang: 'en',
  history: [],
  context: { pendingReport: null, presenting: false, screenAwake: false, researching: false },
  ...over,
})

type Content = Record<string, unknown>[]
const msg = (content: Content, stop_reason = 'end_turn') => ({ content, stop_reason })

/** Fake streaming response: emits start/stop per block, like the SDK. */
function fakeStream(content: Content, stop_reason = 'tool_use') {
  const final = msg(content, stop_reason)
  return {
    currentMessage: final,
    async *[Symbol.asyncIterator]() {
      for (let i = 0; i < content.length; i++) {
        yield { type: 'content_block_start', index: i, content_block: content[i] }
        yield { type: 'content_block_stop', index: i }
      }
    },
    finalMessage: async () => final,
  }
}

function fakeClient(creates: unknown[], streams: unknown[] = []) {
  const create = vi.fn()
  for (const c of creates) create.mockResolvedValueOnce(c)
  const stream = vi.fn()
  for (const s of streams) stream.mockReturnValueOnce(s)
  return {
    client: { beta: { messages: { create, stream } } } as unknown as Anthropic,
    create,
    stream,
  }
}

async function collect(gen: AsyncGenerator<AmayaEvent>) {
  const out: AmayaEvent[] = []
  for await (const e of gen) out.push(e)
  return out
}

const goodReport = {
  title: 'VR',
  blocks: [
    { kind: 'text', title: 'Overview', body: 'VR is growing.' },
    { kind: 'stat', title: 'Units', value: '≈20m', label: 'Headsets sold', caption: 'IDC' },
    { kind: 'chart', title: 'Share', chart: 'bar', series: [{ label: 'A', value: 60 }, { label: 'B', value: 40 }] },
    { kind: 'visual', title: 'Global', visual: 'globe', span_cols: 2 },
  ],
  notes: ['Some figures are estimates.'],
}

describe('runClaudeBrain', () => {
  it('speaks a plain reply and marks questions as expecting a reply', async () => {
    const { client, create } = fakeClient([msg([{ type: 'text', text: 'Hey boss. What are we doing?' }])])
    const events = await collect(runClaudeBrain(baseReq('hello'), client))
    expect(events).toEqual([
      { type: 'say', text: 'Hey boss. What are we doing?', expectReply: true },
      { type: 'done' },
    ])
    const params = create.mock.calls[0][0]
    expect(params.model).toBe('claude-opus-5-5')
    expect(params.output_config).toEqual({ effort: 'low' })
    expect(params.fallbacks).toBe('default')
    expect(params.betas).toContain('server-side-fallback-2026-07-01')
    // HUD state rides as a trailing mid-conversation system message
    expect(params.messages.at(-1).role).toBe('system')
    expect(params.messages.at(-2)).toEqual({ role: 'user', content: 'hello' })
  })

  it('drives the HUD through the hud tool', async () => {
    const { client } = fakeClient([
      msg(
        [
          { type: 'tool_use', id: 't1', name: 'hud', input: { action: 'wake_screen', say: 'Waking the screen.' } },
          { type: 'tool_use', id: 't2', name: 'hud', input: { action: 'present_report' } },
        ],
        'tool_use'
      ),
      msg([{ type: 'text', text: 'Report is up.' }]),
    ])
    const events = await collect(
      runClaudeBrain(
        baseReq('yes', { context: { pendingReport: { id: 'r', topic: 'VR', blocks: 4, sources: 2 }, presenting: false, screenAwake: false, researching: false } }),
        client
      )
    )
    expect(events.map((e) => e.type)).toEqual(['say', 'action', 'action', 'say', 'done'])
    expect(events[1]).toEqual({ type: 'action', action: 'wake_screen' })
    expect(events[2]).toEqual({ type: 'action', action: 'present_report' })
  })

  it('runs a research turn: ack, live sources, sanitized blocks, then reports back', async () => {
    const researchContent = [
      { type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'vr market 2026' } },
      {
        type: 'web_search_tool_result',
        tool_use_id: 's1',
        content: [
          { type: 'web_search_result', url: 'https://a.example', title: 'A', encrypted_content: 'x', page_age: null },
          { type: 'web_search_result', url: 'https://b.example', title: 'B', encrypted_content: 'x', page_age: null },
          { type: 'web_search_result', url: 'https://a.example', title: 'A again', encrypted_content: 'x', page_age: null },
        ],
      },
      { type: 'tool_use', id: 'p1', name: 'publish_report', input: goodReport },
    ]
    const { client, create, stream } = fakeClient(
      [
        msg([{ type: 'tool_use', id: 't1', name: 'start_research', input: { topic: 'VR', ack: 'On it, boss.' } }], 'tool_use'),
        msg([{ type: 'text', text: 'Done: 4 blocks, 2 sources. Put it on screen?' }]),
      ],
      [fakeStream(researchContent)]
    )
    const events = await collect(runClaudeBrain(baseReq('do a VR report'), client))
    const types = events.map((e) => e.type)

    expect(events[0]).toEqual({ type: 'say', text: 'On it, boss.' })
    expect(types).toContain('research_start')
    expect(events.filter((e) => e.type === 'source')).toHaveLength(2) // deduped
    expect(events.filter((e) => e.type === 'block')).toHaveLength(4)
    expect(events.find((e) => e.type === 'research_done')).toMatchObject({ demo: false })
    expect(events.at(-2)).toMatchObject({ type: 'say', expectReply: true })
    expect(types.at(-1)).toBe('done')

    const researchParams = stream.mock.calls[0][0]
    expect(researchParams.tools[0]).toMatchObject({ type: 'web_search_20260209', name: 'web_search' })
    expect(researchParams.output_config).toEqual({ effort: 'medium' })

    // tool result handed back to the conversation agent
    const second = create.mock.calls[1][0]
    const toolResult = second.messages.at(-1).content[0]
    expect(toolResult.type).toBe('tool_result')
    expect(JSON.parse(toolResult.content)).toMatchObject({ ok: true, blocks: 4, sources: 2 })
  })

  it('refuses to start a second research run', async () => {
    const { client, stream } = fakeClient([
      msg([{ type: 'tool_use', id: 't1', name: 'start_research', input: { topic: 'X', ack: 'ok' } }], 'tool_use'),
      msg([{ type: 'text', text: 'Still on the last one.' }]),
    ])
    const req = baseReq('research X', {
      context: { pendingReport: null, presenting: false, screenAwake: false, researching: true },
    })
    const events = await collect(runClaudeBrain(req, client))
    expect(stream).not.toHaveBeenCalled()
    expect(events.map((e) => e.type)).toEqual(['say', 'done'])
  })

  it('turns refusals and API errors into HUD-friendly events', async () => {
    const { client } = fakeClient([msg([], 'refusal')])
    const events = await collect(runClaudeBrain(baseReq('hi'), client))
    expect(events[0]).toMatchObject({ type: 'say' })

    const failing = {
      beta: { messages: { create: vi.fn().mockRejectedValue(new Error('boom')), stream: vi.fn() } },
    } as unknown as Anthropic
    const errEvents = await collect(runClaudeBrain(baseReq('hi'), failing))
    expect(errEvents).toEqual([{ type: 'error', message: 'brain_failed' }, { type: 'done' }])
  })

  it('classifies typed SDK errors', () => {
    const rate = Object.create(Anthropic.RateLimitError.prototype)
    const auth = Object.create(Anthropic.AuthenticationError.prototype)
    expect(classifyError(rate)).toBe('brain_busy')
    expect(classifyError(auth)).toBe('brain_auth')
  })
})

describe('sanitizeReport', () => {
  it('keeps valid blocks and assigns ids', () => {
    const r = sanitizeReport(goodReport)!
    expect(r.blocks.map((b) => b.id)).toEqual(['b1', 'b2', 'b3', 'b4'])
    expect(r.blocks[3]).toMatchObject({ kind: 'visual', visual: 'globe', span: { cols: 2 } })
    expect(r.notes).toEqual(['Some figures are estimates.'])
  })
  it('drops malformed blocks', () => {
    const r = sanitizeReport({
      title: 't',
      blocks: [
        { kind: 'chart', title: 'bad', series: [{ label: 'x', value: 'NaN' }] },
        { kind: 'text', title: 'no body' },
        { kind: 'nope', title: 'x' },
        { kind: 'list', title: 'ok', items: ['a', 3, 'b'] },
      ],
    })!
    expect(r.blocks).toHaveLength(1)
    expect(r.blocks[0]).toMatchObject({ kind: 'list', items: ['a', 'b'] })
  })
  it('never exceeds the grid', () => {
    const blocks = Array.from({ length: 20 }, () => ({ kind: 'visual', title: 'v', span_cols: 2 }))
    const r = sanitizeReport({ title: 't', blocks })!
    const cells = r.blocks.reduce((n, b) => n + (b.span?.cols ?? 1), 0)
    expect(cells).toBeLessThanOrEqual(MAX_CELLS)
    expect(r.blocks.length).toBeLessThanOrEqual(12)
  })
  it('rejects empty input', () => {
    expect(sanitizeReport(null)).toBeNull()
    expect(sanitizeReport({ blocks: [] })).toBeNull()
  })
})
