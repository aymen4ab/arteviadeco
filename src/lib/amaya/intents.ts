import type { AmayaContext, AmayaTurn } from './types'
import { normalize } from './text'

export type Intent =
  | { kind: 'research'; topic: string }
  | { kind: 'research_no_topic' }
  | { kind: 'present' }
  | { kind: 'decline' }
  | { kind: 'clear' }
  | { kind: 'wake_screen' }
  | { kind: 'sleep' }
  | { kind: 'history' }
  | { kind: 'camera_open' }
  | { kind: 'camera_close' }
  | { kind: 'sources' }
  | { kind: 'time' }
  | { kind: 'who' }
  | { kind: 'greet' }
  | { kind: 'help' }
  | { kind: 'thanks' }
  | { kind: 'unknown' }

/** Marker phrases the local brain uses when it asks for a topic. */
export const ASK_TOPIC = {
  ar: 'عن ماذا أبحث يا بوس؟',
  en: 'What should I research, boss?',
}

/* -------------------------------------------------------------- */
/* Token-aligned matching: match on normalised text, but slice the */
/* user's original wording for the topic.                          */
/* -------------------------------------------------------------- */

interface Aligned {
  original: string[]
  norm: string
  starts: number[]
}

function align(text: string): Aligned {
  const original = text.trim().split(/\s+/).filter(Boolean)
  const starts: number[] = []
  let norm = ''
  for (const tok of original) {
    if (norm) norm += ' '
    starts.push(norm.length)
    norm += normalize(tok) || '_'
  }
  return { original, norm, starts }
}

/** Returns the original text that follows the match of `trigger`. */
function restAfter(a: Aligned, trigger: RegExp): string | null {
  const m = trigger.exec(a.norm)
  if (!m) return null
  const end = m.index + m[0].length
  const idx = a.starts.findIndex((s) => s >= end)
  // -1: the match consumed every token
  if (idx === -1) return ''
  return a.original.slice(idx).join(' ')
}

const TRAILING_FILLER =
  /(?:\s+(?:for me|please|now|right now|thanks|لي|من فضلك|لو سمحتي|لو سمحت|بليز|يا بوس|توا|الآن|الان))+\s*$/i

function cleanTopic(raw: string): string {
  let t = raw
    .replace(/[?؟!.,،][\s\S]*$/, '') // cut at first sentence break
    .replace(/^(?:about|on|regarding|into|عن|حول|بخصوص|على|في)\s+/i, '')
    .trim()
  for (let i = 0; i < 3; i++) t = t.replace(TRAILING_FILLER, '').trim()
  return t
}

/* -------------------------------------------------------------- */
/* Patterns                                                       */
/* -------------------------------------------------------------- */

const EN_REPORT_MIDDLE =
  /\b(?:do|make|build|create|write|prepare|put together|give me|get me)\s+(?:me\s+)?(?:a|an|another|one more|the)\s+/
const EN_RESEARCH =
  /\b(?:research|look up|look into|investigate|find out about|dig into|report on|report about|search for|search about|search)\s+/
const AR_REPORT =
  /(?:اعمل|اعملي|سوي|سويلي|سوو|اعد|اعدي|حضر|حضري|جهز|جهزي|اكتب|اكتبي|عطيني|اعطني|اعطيني|اعطيني)(?:\s+لي)?(?:\s+\S+)?\s+تقرير(?:ا)?(?:\s+اخر|\s+جديد)?(?:\s+(?:عن|حول|على|بخصوص|في))?\s+/
const AR_REPORT_BARE = /تقرير(?:ا)?(?:\s+اخر|\s+جديد)?\s+(?:عن|حول|بخصوص|على)\s+/
const AR_RESEARCH =
  /(?:ابحث|ابحثي|دور|دوري|فتش|فتشي|بحث|ابحثيلي|ابحثلي|ادرس|ادرسي)(?:\s+لي)?(?:\s+(?:عن|في|حول|على|بخصوص))?\s+/
const RESEARCH_WORD_ONLY = /^(?:can you |could you )?(?:research|do (?:some )?research|ابحث|ابحثي|بحث|ابحثي عن شي|اعملي بحث)(?=\s|$)/

const RE = {
  present:
    /\b(?:present|show (?:me |it|the)|display|put (?:it|that|the report) (?:up|on)|on (?:the )?screen|walk me through)|(?:اعرض|اعرضي|وريني|ورين|فرجيني|اظهر|اظهري|شغلي التقرير|حطيه|على الشاشه|اعرضيه|ورجيني)/,
  yes: /^(?:yes|yeah|yep|yup|sure|ok|okay|go ahead|do it|please do|yes please|of course|نعم|ايه|ايوه|اي|اكيد|طبعا|تمام|ماشي|تفضلي|يلا|اوكي|باهي|واه|اه|ايه نعم|موافق)(?=\s|$)/,
  no: /^(?:no|nope|not now|later|لا|لاء|مش توا|بعدين|ليس الان|موش توا)(?=\s|$)/,
  cameraClose: /(?:close|hide|stop|turn off)\s+(?:the\s+)?camera|(?:اغلق|اغلقي|سكر|سكري|طفي|اطفي)\s+(?:ال)?كاميرا/,
  camera: /\bcamera\b|كاميرا|الكاميرا|شوفيني|انظري الي/,
  clear: /\b(?:clear|close|hide|dismiss|clean up|clean the screen)\b|(?:امسح|امسحي|اغلق|اغلقي|سكر|سكري|اخفي|نظف|نظفي|فرغي الشاشه|نحي)/,
  wakeScreen: /\bwake (?:up )?(?:the )?screen\b|(?:شغلي|صحي|فيقي|اوقظي)\s+(?:ال)?شاشه/,
  sleep: /\b(?:go to sleep|sleep now|stop listening|goodnight|good night)\b|(?:نامي|توقفي عن الاستماع|اسكتي|تصبحي على خير)/,
  history: /\bhistory\b|السجل|سجل المحادثه|المحادثات السابقه/,
  sources: /\bsources\b|المصادر|مصادرك/,
  time: /\bwhat(?:'s| is)? (?:the )?time\b|\bwhat time\b|كم الساعه|الساعه كم|قداش الوقت|قداه الوقت|الوقت كم/,
  who: /\bwho are you\b|\byour name\b|\bwhat are you\b|من انت|مين انت|مين انتي|شنو اسمك|ما اسمك|شكون انتي|عرفي بنفسك/,
  greet: /^(?:hi|hello|hey|yo|good (?:morning|evening|afternoon))\b|^(?:مرحبا|اهلا|السلام|سلام|صباح|مساء|هاي|عسلامه|هلا)/,
  help: /\bhelp\b|what can you do|ساعديني|ماذا تستطيعين|شو تقدري|شنوا تنجم|شنوه تنجمي|وش تقدرين|ماذا يمكنك|شو بتعرفي/,
  thanks: /\bthank|\bthanks\b|شكرا|يعطيك العافيه|برافو|عيشك|مرسي/,
}

export function detectIntent(text: string, ctx: AmayaContext, history: AmayaTurn[]): Intent {
  const a = align(text)
  const n = a.norm

  // Reply to "what should I research?"
  const lastAmaya = [...history].reverse().find((t) => t.role === 'amaya')
  if (
    lastAmaya &&
    (lastAmaya.text === ASK_TOPIC.ar || lastAmaya.text === ASK_TOPIC.en) &&
    !RE.no.test(n)
  ) {
    const topic = cleanTopic(text)
    if (topic) return { kind: 'research', topic }
  }

  // --- research -------------------------------------------------
  const enMiddle = restAfter(a, EN_REPORT_MIDDLE)
  if (enMiddle !== null && /\breport\b/i.test(enMiddle)) {
    const topic = cleanTopic(enMiddle.replace(/\s*\breport\b[\s\S]*$/i, ''))
    if (topic) return { kind: 'research', topic }
  }
  for (const re of [AR_REPORT, AR_REPORT_BARE, AR_RESEARCH, EN_RESEARCH]) {
    const rest = restAfter(a, re)
    if (rest !== null) {
      const topic = cleanTopic(rest)
      if (topic && !/^(?:something|anything|شي|شيء|حاجه)(?:\s+(?:for me|لي))?$/i.test(topic)) {
        return { kind: 'research', topic }
      }
      return { kind: 'research_no_topic' }
    }
  }
  if (RESEARCH_WORD_ONLY.test(n)) return { kind: 'research_no_topic' }

  // --- report presentation --------------------------------------
  if (ctx.pendingReport && !ctx.presenting) {
    if (RE.no.test(n)) return { kind: 'decline' }
    if (RE.yes.test(n) || RE.present.test(n)) return { kind: 'present' }
  }
  if (RE.present.test(n) && !RE.camera.test(n)) return { kind: 'present' }

  // --- HUD control ----------------------------------------------
  if (RE.cameraClose.test(n)) return { kind: 'camera_close' }
  if (RE.camera.test(n)) return { kind: 'camera_open' }
  if (RE.wakeScreen.test(n)) return { kind: 'wake_screen' }
  if (RE.sleep.test(n)) return { kind: 'sleep' }
  if (RE.history.test(n)) return { kind: 'history' }
  if (RE.sources.test(n)) return { kind: 'sources' }
  if (RE.clear.test(n)) return { kind: 'clear' }

  // --- small talk -----------------------------------------------
  if (RE.time.test(n)) return { kind: 'time' }
  if (RE.who.test(n)) return { kind: 'who' }
  if (RE.help.test(n)) return { kind: 'help' }
  if (RE.thanks.test(n)) return { kind: 'thanks' }
  if (RE.greet.test(n)) return { kind: 'greet' }

  return { kind: 'unknown' }
}
