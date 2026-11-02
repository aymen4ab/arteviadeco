import type { AmayaBrainRequest, AmayaEvent, AmayaLang } from './types'
import { ASK_TOPIC, detectIntent } from './intents'
import { buildDemoReport } from './demo-report'
import { detectLang } from './text'

/**
 * Local (built-in) brain. Rule-based intents + a demo research agent.
 * It exists so the full HUD experience works before the Amaya platform
 * brain is connected; set AMAYA_BRAIN_URL to replace it.
 */

export type Sleep = (ms: number) => Promise<void>
const realSleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const say = (text: string, expectReply = false): AmayaEvent => ({
  type: 'say',
  text,
  ...(expectReply ? { expectReply: true } : {}),
})

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

const L = {
  ar: {
    ack: (t: string) => `حاضر يا بوس. تقرير واحد عن ${t}، مبنيّ ليُشاهَد. أنا عليه.`,
    done: (t: string, b: number, s: number) =>
      `يا بوس، تقرير ${t} جاهز. ${b} بلوك و${s} مصدر. أعرضه على الشاشة وأمشي بك فيه؟`,
    present1: 'تمام. أوقظ الشاشة، ثم يصعد التقرير.',
    present2: 'الشاشة مستيقظة.',
    present3: (b: number, s: number) =>
      `التقرير على الشاشة. ${b} بلوك على الواجهة، الملاحظات مكدّسة في الخلف و${s} مصدر وراءها.`,
    noReport: 'لا يوجد تقرير جاهز بعد يا بوس. قل لي عن ماذا أبحث.',
    busy: 'ما زلت أعمل على التقرير الحالي يا بوس، لحظات.',
    decline: 'تمام، التقرير محفوظ. قل «اعرضي التقرير» متى أردت.',
    clear: ['تم تنظيف الشاشة.', 'الشاشة نظيفة يا بوس.'],
    wake: 'الشاشة مستيقظة.',
    sleep: 'سأرتاح قليلاً. نادني بـ«أمايا» متى احتجتني.',
    history: 'هذا سجل المحادثة.',
    cameraOn: 'الكاميرا تعمل. أراك الآن.',
    cameraOff: 'أغلقت الكاميرا.',
    sources: 'هذه المصادر.',
    noSources: 'لا توجد مصادر بعد، لم أُعِدّ أي تقرير.',
    time: (d: Date) =>
      `الساعة الآن ${d.toLocaleTimeString('ar', { hour: 'numeric', minute: '2-digit' })}.`,
    who: 'أنا أمايا، مساعدتك. حالياً أعمل بعقل محلي تجريبي، وقريباً سأتصل بعقل منصة أمايا الكامل.',
    greet: ['أهلاً يا بوس. ماذا نفعل اليوم؟', 'مرحباً يا بوس، أنا هنا.'],
    help: 'أستطيع إعداد تقارير بحث وعرضها على الشاشة، فتح السجل والكاميرا، وتنظيف الواجهة. جرّب: «أمايا، اعملي تقرير عن الطاقة الشمسية».',
    thanks: ['في الخدمة يا بوس.', 'دائماً.'],
    unknown:
      'لم أفهم هذا بعد يا بوس. عقلي الحالي محدود، وعند ربطي بمنصة أمايا سأفهم أكثر بكثير.',
    statuses: [
      'تشغيل وكيل البحث',
      'استعلام المصادر',
      'قراءة الصفحات',
      'استخراج الأرقام',
      'بناء الرسوم البيانية',
      'تركيب البلوكات',
      'التحقق المتقاطع',
      'اللمسات الأخيرة',
    ],
  },
  en: {
    ack: (t: string) => `Fine boss. One ${t} report, built to be looked at. On it.`,
    done: (t: string, b: number, s: number) =>
      `Boss, ${t} report's done. ${b} blocks, ${s} sources. Want me to put it on screen and walk you through it?`,
    present1: 'Right. Wake the screen, then the report goes up.',
    present2: "Screen's awake.",
    present3: (b: number, s: number) =>
      `Report's up. ${b} blocks on the HUD. Notes stacked at the back and ${s} sources behind it.`,
    noReport: "There's no report ready yet, boss. Tell me what to research.",
    busy: 'Still working on the current report, boss. Give me a second.',
    decline: 'Fine, the report is saved. Say "present the report" whenever you want.',
    clear: ['Screen cleared.', 'Clean slate, boss.'],
    wake: "Screen's awake.",
    sleep: 'Going quiet. Say "Amaya" when you need me.',
    history: "Here's the conversation log.",
    cameraOn: 'Camera on. I can see you.',
    cameraOff: 'Camera off.',
    sources: 'Here are the sources.',
    noSources: "No sources yet — I haven't built a report.",
    time: (d: Date) =>
      `It's ${d.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })}.`,
    who: "I'm Amaya, your assistant. Right now I'm running a local demo brain; soon I'll be connected to the full Amaya platform brain.",
    greet: ["Hey boss. What are we doing today?", "I'm here, boss."],
    help: 'I can build research reports and put them on screen, open the history and the camera, and clear the HUD. Try: "Amaya, do a report on solar energy."',
    thanks: ['Anytime, boss.', 'Always.'],
    unknown:
      "I don't get that one yet, boss. My current brain is limited — once I'm connected to the Amaya platform I'll understand a lot more.",
    statuses: [
      'Starting research agent',
      'Querying sources',
      'Reading pages',
      'Extracting figures',
      'Building charts',
      'Composing blocks',
      'Cross-checking',
      'Finalising',
    ],
  },
}

export async function* runLocalBrain(
  req: AmayaBrainRequest,
  sleep: Sleep = realSleep
): AsyncGenerator<AmayaEvent> {
  const lang: AmayaLang = detectLang(req.text, req.lang)
  const T = L[lang]
  const ctx = req.context
  const intent = detectIntent(req.text, ctx, req.history)

  switch (intent.kind) {
    case 'research': {
      if (ctx.researching) {
        yield say(T.busy)
        break
      }
      yield* research(intent.topic, lang, sleep)
      break
    }
    case 'research_no_topic':
      yield say(ASK_TOPIC[lang], true)
      break
    case 'present': {
      const rep = ctx.pendingReport
      if (!rep) {
        yield say(T.noReport, true)
        break
      }
      yield say(T.present1)
      yield { type: 'action', action: 'wake_screen' }
      await sleep(700)
      yield say(T.present2)
      yield { type: 'action', action: 'present_report' }
      await sleep(400)
      yield say(T.present3(rep.blocks, rep.sources))
      break
    }
    case 'decline':
      yield say(T.decline)
      break
    case 'clear':
      yield { type: 'action', action: 'clear_view' }
      yield say(pick(T.clear))
      break
    case 'wake_screen':
      yield { type: 'action', action: 'wake_screen' }
      yield say(T.wake)
      break
    case 'sleep':
      yield say(T.sleep)
      yield { type: 'action', action: 'sleep_screen' }
      break
    case 'history':
      yield { type: 'action', action: 'open_history' }
      yield say(T.history)
      break
    case 'camera_open':
      yield { type: 'action', action: 'open_camera' }
      yield say(T.cameraOn)
      break
    case 'camera_close':
      yield { type: 'action', action: 'close_camera' }
      yield say(T.cameraOff)
      break
    case 'sources':
      if (ctx.pendingReport || ctx.presenting) {
        yield { type: 'action', action: 'open_sources' }
        yield say(T.sources)
      } else {
        yield say(T.noSources)
      }
      break
    case 'time':
      yield say(T.time(new Date()))
      break
    case 'who':
      yield say(T.who)
      break
    case 'greet':
      yield say(pick(T.greet), true)
      break
    case 'help':
      yield say(T.help, true)
      break
    case 'thanks':
      yield say(pick(T.thanks))
      break
    default:
      yield say(T.unknown)
  }
  yield { type: 'done' }
}

async function* research(topic: string, lang: AmayaLang, sleep: Sleep): AsyncGenerator<AmayaEvent> {
  const T = L[lang]
  const id = `r_${Date.now().toString(36)}`
  const report = buildDemoReport(topic, lang)

  yield say(T.ack(topic))
  yield { type: 'research_start', id, topic }

  const steps = T.statuses.length
  const blocksPerStep = Math.ceil(report.blocks.length / (steps - 1))
  const sourcesPerStep = Math.ceil(report.sources.length / (steps - 2))
  let b = 0
  let s = 0

  for (let i = 0; i < steps; i++) {
    await sleep(i === 0 ? 1600 : 900 + Math.random() * 700)
    // sources arrive first, blocks from step 2 onwards
    if (i >= 1) {
      for (const src of report.sources.slice(s, s + sourcesPerStep)) {
        yield { type: 'source', reportId: id, source: src }
      }
      s = Math.min(report.sources.length, s + sourcesPerStep)
    }
    if (i >= 2) {
      for (const block of report.blocks.slice(b, b + blocksPerStep)) {
        yield { type: 'block', reportId: id, block }
      }
      b = Math.min(report.blocks.length, b + blocksPerStep)
    }
    yield {
      type: 'research_progress',
      id,
      progress: (i + 1) / steps,
      blocks: b,
      sources: s,
      status: T.statuses[i],
    }
  }
  // flush anything left
  for (const block of report.blocks.slice(b)) yield { type: 'block', reportId: id, block }
  for (const src of report.sources.slice(s)) yield { type: 'source', reportId: id, source: src }
  for (const note of report.notes) yield { type: 'note', reportId: id, note }

  yield {
    type: 'research_progress',
    id,
    progress: 1,
    blocks: report.blocks.length,
    sources: report.sources.length,
    status: lang === 'ar' ? 'اكتمل' : 'Complete',
  }
  yield { type: 'research_done', id, demo: true }
  await sleep(500)
  yield say(T.done(topic, report.blocks.length, report.sources.length), true)
}
