import Anthropic from '@anthropic-ai/sdk'
import type {
  AmayaBrainRequest,
  AmayaEvent,
  AmayaLang,
  AmayaSource,
  AmayaAction,
} from './types'
import { detectLang } from './text'
import { PUBLISH_REPORT_TOOL, sanitizeReport } from './report-schema'

/**
 * Amaya's real brain, powered by Claude.
 *
 *  - Conversation agent (effort `low` for snappy voice replies) decides
 *    what to say and drives the HUD through two tools: `hud` and
 *    `start_research`.
 *  - Research agent (effort `medium`) uses Anthropic's server-side web
 *    search, then calls `publish_report` with structured blocks. Its
 *    stream is translated into live HUD progress (searches, sources).
 *
 * Everything is emitted as AmayaEvent, the same protocol the demo brain
 * and any external platform brain speak.
 */

export const AMAYA_MODEL = process.env.AMAYA_MODEL || 'claude-opus-5-5'

// Server-side refusal fallback: if a safety classifier declines a
// request, the API re-runs it on Anthropic's recommended fallback model.
const BETAS = ['server-side-fallback-2026-07-01']
const FALLBACKS = 'default' as const

const MAX_AGENT_ROUNDS = 6
const MAX_RESEARCH_ROUNDS = 6
const WEB_SEARCH_MAX_USES = 6

/* ------------------------------------------------------------------ */
/* Prompts                                                             */
/* ------------------------------------------------------------------ */

const AGENT_SYSTEM = `You are Amaya, a voice assistant that lives inside a holographic HUD on the user's screen.

Everything you write as plain text is spoken aloud by text-to-speech, so:
- Keep replies to one to three short sentences. No markdown, lists, emoji, URLs or code.
- Reply in the language the user spoke. For Arabic, use clear Modern Standard Arabic with a warm tone; you understand dialects (Tunisian, Gulf, Levantine, Egyptian and others). For English, use English.
- Personality: confident, quick, a little playful. You sometimes call the user "boss" (in Arabic «يا بوس»). Never fawn.

Tools:
- start_research: when the user asks you to research something or build a report on a topic. Put a short spoken acknowledgement in "ack" (for example: "On it, boss. One VR report, built to be looked at."). If the topic is unclear, ask what to research instead of calling the tool. When it returns, tell the user it is done with its block and source counts, and ask whether to put it on screen.
- hud: control the screen. To present a ready report: call hud with wake_screen (say: "Right. Waking the screen, then the report goes up."), then hud with present_report (say: "Screen's awake."), then reply with one sentence on what is now on screen. Use clear_view, open_history, open_sources, open_camera, close_camera and sleep_screen when the user asks for them.

Answer general questions directly and briefly. If something needs current information, offer to research it.
A system message after the user's turn describes the HUD state. Use it: when a report is pending, a bare "yes" usually means "present it".`

function researchSystem(lang: AmayaLang) {
  const language = lang === 'ar' ? 'Arabic (Modern Standard Arabic)' : 'English'
  return `You are the research agent behind Amaya, a voice assistant with a visual HUD.

Research the topic with web search: run several focused queries and prefer recent, authoritative sources. Then call publish_report exactly once.

Rules for the report:
- Write every title, body, label and list item in ${language}. Tags stay short uppercase English.
- Every number must come from the sources you found. If you could not find a figure, use a text or list block instead of inventing one.
- Charts need real, comparable data points from the sources.
- Text blocks are read on a screen: two to four short sentences each.
- Put caveats and anything you could not verify in notes.

Your prose output is not shown to anyone; only publish_report matters.`
}

/* ------------------------------------------------------------------ */
/* Tools                                                               */
/* ------------------------------------------------------------------ */

const HUD_ACTIONS: AmayaAction[] = [
  'wake_screen',
  'present_report',
  'clear_view',
  'open_history',
  'open_sources',
  'open_camera',
  'close_camera',
  'sleep_screen',
]

const AGENT_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'hud',
    description: 'Perform one action on the HUD, optionally speaking a short line first.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: HUD_ACTIONS },
        say: { type: 'string', description: 'Optional short line spoken before the action.' },
      },
      required: ['action'],
      additionalProperties: false,
    },
  },
  {
    name: 'start_research',
    description:
      'Run the research agent on a topic. Takes a while; it searches the web and builds a visual report the user can put on screen.',
    input_schema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'The research topic, in the user language.' },
        ack: { type: 'string', description: 'Short spoken acknowledgement before research starts.' },
      },
      required: ['topic', 'ack'],
      additionalProperties: false,
    },
  },
]

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const say = (text: string, expectReply = false): AmayaEvent => ({
  type: 'say',
  text,
  ...(expectReply ? { expectReply: true } : {}),
})

const endsWithQuestion = (t: string) => /[?؟]\s*$/.test(t)

const REFUSAL: Record<AmayaLang, string> = {
  ar: 'لا أستطيع المساعدة في هذا الطلب يا بوس.',
  en: "I can't help with that one, boss.",
}

type MessageParam = Anthropic.Beta.BetaMessageParam

/** Rebuilds the conversation from the HUD's plain-text history. */
function buildMessages(req: AmayaBrainRequest): MessageParam[] {
  const history = [...req.history]
  const last = history[history.length - 1]
  if (last && last.role === 'user' && last.text.trim() === req.text.trim()) history.pop()
  const firstUser = history.findIndex((t) => t.role === 'user')
  const turns = firstUser === -1 ? [] : history.slice(firstUser)

  const messages: MessageParam[] = turns.map((t) => ({
    role: t.role === 'user' ? 'user' : 'assistant',
    content: t.text,
  }))
  messages.push({ role: 'user', content: req.text })

  const c = req.context
  const state = [
    `Pending report: ${
      c.pendingReport
        ? `"${c.pendingReport.topic}" (${c.pendingReport.blocks} blocks, ${c.pendingReport.sources} sources)`
        : 'none'
    }`,
    `Report on screen: ${c.presenting ? 'yes' : 'no'}`,
    `Research running: ${c.researching ? 'yes' : 'no'}`,
    `Current time: ${new Date().toISOString()}`,
  ].join('. ')
  // Mid-conversation system message: operator-authored state that does
  // not disturb the cached system prompt.
  messages.push({ role: 'system', content: `HUD state. ${state}.` })
  return messages
}

export function classifyError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError)
    return 'brain_auth'
  if (err instanceof Anthropic.RateLimitError) return 'brain_busy'
  if (err instanceof Anthropic.APIConnectionError) return 'brain_unreachable'
  return 'brain_failed'
}

/* ------------------------------------------------------------------ */
/* Conversation agent                                                  */
/* ------------------------------------------------------------------ */

export async function* runClaudeBrain(
  req: AmayaBrainRequest,
  client: Anthropic = new Anthropic(),
  signal?: AbortSignal
): AsyncGenerator<AmayaEvent> {
  const lang = detectLang(req.text, req.lang)
  const messages = buildMessages(req)

  try {
    for (let round = 0; round < MAX_AGENT_ROUNDS; round++) {
      const response = await client.beta.messages.create(
        {
          model: AMAYA_MODEL,
          max_tokens: 8000,
          system: AGENT_SYSTEM,
          cache_control: { type: 'ephemeral' },
          output_config: { effort: 'low' },
          tools: AGENT_TOOLS,
          messages,
          betas: BETAS,
          fallbacks: FALLBACKS,
        },
        { signal }
      )

      if (response.stop_reason === 'refusal') {
        yield say(REFUSAL[lang])
        break
      }

      const toolUses = response.content.filter(
        (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use'
      )
      const texts = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
        .map((b) => b.text.trim())
        .filter(Boolean)

      if (!toolUses.length) {
        const text = texts.join(' ')
        if (text) yield say(text, endsWithQuestion(text))
        break
      }
      // A tool input cut off by max_tokens must never run.
      if (response.stop_reason === 'max_tokens') {
        yield { type: 'error', message: 'brain_truncated' }
        break
      }

      for (const t of texts) yield say(t)
      messages.push({ role: 'assistant', content: response.content })

      const results: Anthropic.Beta.BetaToolResultBlockParam[] = []
      for (const use of toolUses) {
        const input = (use.input ?? {}) as Record<string, unknown>
        if (use.name === 'hud') {
          const action = input.action as AmayaAction
          if (!HUD_ACTIONS.includes(action)) {
            results.push({ type: 'tool_result', tool_use_id: use.id, is_error: true, content: 'unknown action' })
            continue
          }
          if (typeof input.say === 'string' && input.say.trim()) yield say(input.say.trim())
          yield { type: 'action', action }
          results.push({ type: 'tool_result', tool_use_id: use.id, content: 'done' })
        } else if (use.name === 'start_research') {
          const topic = typeof input.topic === 'string' ? input.topic.trim() : ''
          if (!topic || req.context.researching) {
            results.push({
              type: 'tool_result',
              tool_use_id: use.id,
              is_error: true,
              content: topic ? 'A research run is already in progress.' : 'Missing topic.',
            })
            continue
          }
          if (typeof input.ack === 'string' && input.ack.trim()) yield say(input.ack.trim())
          const outcome = yield* runResearch(client, topic, lang, signal)
          results.push({
            type: 'tool_result',
            tool_use_id: use.id,
            is_error: !outcome.ok,
            content: JSON.stringify(outcome),
          })
        } else {
          results.push({ type: 'tool_result', tool_use_id: use.id, is_error: true, content: 'unknown tool' })
        }
      }
      messages.push({ role: 'user', content: results })
    }
  } catch (err) {
    if (signal?.aborted) return
    yield { type: 'error', message: classifyError(err) }
  }
  yield { type: 'done' }
}

/* ------------------------------------------------------------------ */
/* Research agent                                                      */
/* ------------------------------------------------------------------ */

interface ResearchOutcome {
  ok: boolean
  title?: string
  blocks?: number
  sources?: number
  error?: string
}

const STATUS = {
  ar: {
    start: 'تشغيل وكيل البحث',
    search: (q: string) => `بحث: ${q}`,
    read: 'قراءة النتائج',
    compose: 'تركيب البلوكات',
    done: 'اكتمل',
  },
  en: {
    start: 'Starting research agent',
    search: (q: string) => `Searching: ${q}`,
    read: 'Reading results',
    compose: 'Composing blocks',
    done: 'Complete',
  },
}

async function* runResearch(
  client: Anthropic,
  topic: string,
  lang: AmayaLang,
  signal?: AbortSignal
): AsyncGenerator<AmayaEvent, ResearchOutcome> {
  const id = `r_${Date.now().toString(36)}`
  const S = STATUS[lang]
  const sources: AmayaSource[] = []
  const seen = new Set<string>()
  let searches = 0
  const progress = (status: string, p: number): AmayaEvent => ({
    type: 'research_progress',
    id,
    progress: Math.min(0.95, p),
    blocks: 0,
    sources: sources.length,
    status,
  })

  yield { type: 'research_start', id, topic }
  yield progress(S.start, 0.05)

  const messages: MessageParam[] = [
    {
      role: 'user',
      content: `Topic: ${topic}\nToday's date: ${new Date().toISOString().slice(0, 10)}`,
    },
  ]

  try {
    for (let round = 0; round < MAX_RESEARCH_ROUNDS; round++) {
      const stream = client.beta.messages.stream(
        {
          model: AMAYA_MODEL,
          max_tokens: 32000,
          system: researchSystem(lang),
          output_config: { effort: 'medium' },
          tools: [
            { type: 'web_search_20260209', name: 'web_search', max_uses: WEB_SEARCH_MAX_USES },
            PUBLISH_REPORT_TOOL,
          ],
          messages,
          betas: BETAS,
          fallbacks: FALLBACKS,
        },
        { signal }
      )

      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          const b = event.content_block
          if (b.type === 'tool_use' && b.name === 'publish_report') {
            yield progress(S.compose, 0.9)
          }
          continue
        }
        if (event.type !== 'content_block_stop') continue
        const block = stream.currentMessage?.content[event.index]
        if (!block) continue
        if (block.type === 'server_tool_use' && block.name === 'web_search') {
          searches++
          const q = typeof block.input?.query === 'string' ? block.input.query : ''
          yield progress(S.search(q.slice(0, 60)), 0.1 + (searches / WEB_SEARCH_MAX_USES) * 0.7)
        } else if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
          for (const r of block.content) {
            if (seen.has(r.url)) continue
            seen.add(r.url)
            const source: AmayaSource = { id: `s${sources.length + 1}`, title: r.title || r.url, url: r.url }
            sources.push(source)
            yield { type: 'source', reportId: id, source }
          }
          yield progress(S.read, 0.1 + (searches / WEB_SEARCH_MAX_USES) * 0.7)
        }
      }

      const message = await stream.finalMessage()
      if (message.stop_reason === 'refusal') {
        return yield* failResearch(id, 'refused')
      }
      if (message.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: message.content })
        continue
      }

      const publish = message.content.find(
        (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use' && b.name === 'publish_report'
      )
      const report = publish && message.stop_reason !== 'max_tokens' ? sanitizeReport(publish.input) : null

      if (!report) {
        // Ask again, append-only (keeps the conversation prefix intact).
        messages.push({ role: 'assistant', content: message.content })
        const followUp: Anthropic.Beta.BetaContentBlockParam[] = message.content
          .filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
          .map((b) => ({
            type: 'tool_result' as const,
            tool_use_id: b.id,
            is_error: true,
            content: 'Invalid report: provide 9-12 well-formed blocks.',
          }))
        followUp.push({ type: 'text', text: 'Now call publish_report with the finished report.' })
        messages.push({ role: 'user', content: followUp })
        continue
      }

      for (const block of report.blocks) yield { type: 'block', reportId: id, block }
      for (const note of report.notes) yield { type: 'note', reportId: id, note }
      yield {
        type: 'research_progress',
        id,
        progress: 1,
        blocks: report.blocks.length,
        sources: sources.length,
        status: S.done,
      }
      yield { type: 'research_done', id, demo: false }
      return { ok: true, title: report.title, blocks: report.blocks.length, sources: sources.length }
    }
    return yield* failResearch(id, 'no_report')
  } catch (err) {
    if (signal?.aborted) return { ok: false, error: 'aborted' }
    return yield* failResearch(id, classifyError(err))
  }
}

async function* failResearch(id: string, error: string): AsyncGenerator<AmayaEvent, ResearchOutcome> {
  yield { type: 'research_failed', id, message: error }
  return { ok: false, error }
}
