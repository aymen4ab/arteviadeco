import { describe, expect, it } from 'vitest'
import { detectIntent } from './intents'
import { runLocalBrain } from './local-brain'
import { createNdjsonDecoder, encodeEvent } from './ndjson'
import { detectLang, extractWake } from './text'
import type { AmayaBrainRequest, AmayaContext, AmayaEvent } from './types'

const ctx = (over: Partial<AmayaContext> = {}): AmayaContext => ({
  pendingReport: null,
  presenting: false,
  screenAwake: false,
  researching: false,
  ...over,
})

const pending = { id: 'r1', topic: 'VR', blocks: 12, sources: 42 }

describe('extractWake', () => {
  it('finds the wake word in English and Arabic, keeping the user wording', () => {
    expect(extractWake('Hey Amaya, can you research something for me?')).toBe(
      'can you research something for me?'
    )
    expect(extractWake('أمايا اعملي تقرير عن الطاقة الشمسية')).toBe('اعملي تقرير عن الطاقة الشمسية')
    expect(extractWake('يا امايا')).toBe('')
    expect(extractWake('a maya do a VR report')).toBe('do a VR report')
  })
  it('returns null without the wake word', () => {
    expect(extractWake('do a VR report')).toBeNull()
    expect(extractWake('maya is here')).toBeNull()
  })
})

describe('detectLang', () => {
  it('detects Arabic vs English', () => {
    expect(detectLang('مرحبا', 'en')).toBe('ar')
    expect(detectLang('hello', 'ar')).toBe('en')
    expect(detectLang('123', 'ar')).toBe('ar')
  })
})

describe('detectIntent', () => {
  it('extracts research topics (EN)', () => {
    expect(detectIntent('Can you do another VR report for me? Just, uh, I am making a video', ctx(), [])).toEqual({
      kind: 'research',
      topic: 'VR',
    })
    expect(detectIntent('research the electric car market please', ctx(), [])).toEqual({
      kind: 'research',
      topic: 'the electric car market',
    })
  })
  it('extracts research topics (AR) with original spelling', () => {
    expect(detectIntent('اعملي تقرير عن الطاقة الشمسية', ctx(), [])).toEqual({
      kind: 'research',
      topic: 'الطاقة الشمسية',
    })
    expect(detectIntent('ابحثي لي عن السيارات الكهربائية من فضلك', ctx(), [])).toEqual({
      kind: 'research',
      topic: 'السيارات الكهربائية',
    })
  })
  it('asks for a topic when none is given', () => {
    expect(detectIntent('can you research something for me?', ctx(), []).kind).toBe('research_no_topic')
    expect(detectIntent('ابحثي عن شي', ctx(), []).kind).toBe('research_no_topic')
  })
  it('treats the reply to "what should I research" as the topic', () => {
    const history = [{ role: 'amaya' as const, text: 'What should I research, boss?', at: 0 }]
    expect(detectIntent('quantum computing', ctx(), history)).toEqual({ kind: 'research', topic: 'quantum computing' })
  })
  it('presents on yes / present when a report is pending', () => {
    expect(detectIntent('Yes please, um, please present the report.', ctx({ pendingReport: pending }), []).kind).toBe('present')
    expect(detectIntent('نعم', ctx({ pendingReport: pending }), []).kind).toBe('present')
    expect(detectIntent('اعرضي التقرير', ctx(), []).kind).toBe('present')
    expect(detectIntent('لا', ctx({ pendingReport: pending }), []).kind).toBe('decline')
  })
  it('maps HUD commands', () => {
    expect(detectIntent('clear the screen', ctx(), []).kind).toBe('clear')
    expect(detectIntent('امسحي الشاشة', ctx(), []).kind).toBe('clear')
    expect(detectIntent('open the camera', ctx(), []).kind).toBe('camera_open')
    expect(detectIntent('سكري الكاميرا', ctx(), []).kind).toBe('camera_close')
    expect(detectIntent('show history', ctx(), []).kind).toBe('history')
    expect(detectIntent('كم الساعة', ctx(), []).kind).toBe('time')
    expect(detectIntent('blah blah', ctx(), []).kind).toBe('unknown')
  })
})

async function collect(req: AmayaBrainRequest) {
  const out: AmayaEvent[] = []
  for await (const e of runLocalBrain(req, async () => {})) out.push(e)
  return out
}

describe('runLocalBrain', () => {
  it('runs a full demo research flow', async () => {
    const events = await collect({ text: 'do a VR report', lang: 'en', history: [], context: ctx() })
    const types = events.map((e) => e.type)
    expect(types[0]).toBe('say')
    expect(types).toContain('research_start')
    expect(events.filter((e) => e.type === 'block')).toHaveLength(12)
    expect(events.filter((e) => e.type === 'source')).toHaveLength(42)
    const done = events.find((e) => e.type === 'research_done')
    expect(done).toMatchObject({ demo: true })
    const finalSay = events.filter((e) => e.type === 'say').at(-1)
    expect(finalSay).toMatchObject({ expectReply: true })
    expect(types.at(-1)).toBe('done')
  })
  it('presents a pending report with wake + present actions in order', async () => {
    const events = await collect({ text: 'yes please', lang: 'en', history: [], context: ctx({ pendingReport: pending }) })
    const actions = events.filter((e) => e.type === 'action').map((e) => (e as { action: string }).action)
    expect(actions).toEqual(['wake_screen', 'present_report'])
  })
  it('answers in Arabic when spoken to in Arabic', async () => {
    const events = await collect({ text: 'مرحبا', lang: 'en', history: [], context: ctx() })
    const s = events.find((e) => e.type === 'say') as { text: string }
    expect(detectLang(s.text, 'en')).toBe('ar')
  })
})

describe('ndjson', () => {
  it('decodes events split across chunks and skips junk', () => {
    const d = createNdjsonDecoder()
    const wire = encodeEvent({ type: 'say', text: 'hi' }) + 'garbage\n' + encodeEvent({ type: 'done' })
    const a = d.push(wire.slice(0, 10))
    const b = d.push(wire.slice(10))
    expect([...a, ...b, ...d.flush()]).toEqual([{ type: 'say', text: 'hi' }, { type: 'done' }])
  })
  it('ignores unknown event types', () => {
    const d = createNdjsonDecoder()
    expect(d.push('{"type":"hack"}\n')).toEqual([])
  })
})
