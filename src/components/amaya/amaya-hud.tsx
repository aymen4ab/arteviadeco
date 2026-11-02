'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { AmayaAction, AmayaEvent, AmayaLang, AmayaReport, AmayaTurn } from '@/lib/amaya/types'
import { fetchBrainMode, streamBrain } from '@/lib/amaya/brain-client'
import { sfx } from '@/lib/amaya/sfx'
import { detectLang, extractWake } from '@/lib/amaya/text'
import {
  MicMeter,
  Recognizer,
  cancelSpeech,
  speakAudioUrl,
  speakText,
  speechRecognitionSupported,
} from '@/lib/amaya/voice'
import { AmayaOrb, type OrbMode } from './orb'
import { BottomBar, TopBar } from './bars'
import { ReportGrid } from './report-grid'
import { ResearchCard, type ResearchState } from './research-card'
import { CameraWindow, HistoryWindow, SourcesWindow, TextWindow } from './windows'

type Status = 'idle' | 'listening' | 'thinking' | 'speaking'
type WinKey = 'history' | 'text' | 'camera' | 'sources'
type BrainMode = 'local' | 'remote' | 'offline' | 'checking'

const ARM_MS = 9000
const NO_WINDOWS = { history: false, text: false, camera: false, sources: false }
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

const UI = {
  ar: {
    standby: 'في الانتظار — قل «أمايا»',
    listening: 'أستمع…',
    thinking: 'أفكّر…',
    speaking: 'أتحدث',
    asleep: 'نائمة — قل «أمايا» للإيقاظ',
    muted: 'الميكروفون مكتوم',
    greet: 'أنا هنا يا بوس. نادني «أمايا» واطلب ما تريد.',
    placeholder: 'اكتب أمراً… مثال: اعملي تقرير عن الطاقة الشمسية',
    errors: {
      unauthorized: 'انتهت الجلسة — سجّل الدخول من جديد.',
      default: 'تعذّر الوصول إلى العقل. حاول مرة أخرى.',
    },
  },
  en: {
    standby: 'STANDBY — SAY "AMAYA"',
    listening: 'LISTENING…',
    thinking: 'THINKING…',
    speaking: 'SPEAKING',
    asleep: 'ASLEEP — SAY "AMAYA" TO WAKE',
    muted: 'MIC MUTED',
    greet: "I'm here, boss. Say “Amaya” and tell me what you need.",
    placeholder: 'Type a command… e.g. do a report on solar energy',
    errors: {
      unauthorized: 'Session expired — please sign in again.',
      default: "Couldn't reach the brain. Try again.",
    },
  },
}

export function AmayaHud({ displayFont }: { displayFont?: string }) {
  /* ------------------------------ state ------------------------------ */
  const [phase, setPhase] = useState<'boot' | 'booting' | 'online'>('boot')
  const [bootLines, setBootLines] = useState<string[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [asleep, setAsleep] = useState(false)
  const [armed, setArmed] = useState(false)
  const [screenAwake, setScreenAwake] = useState(false)
  const [presenting, setPresenting] = useState(false)
  const [research, setResearch] = useState<ResearchState | null>(null)
  const [researchHidden, setResearchHidden] = useState(false)
  const [report, setReport] = useState<AmayaReport | null>(null)
  const [windows, setWindows] = useState(NO_WINDOWS)
  const [transcript, setTranscript] = useState({ text: '', final: false })
  const [caption, setCaption] = useState('')
  const [history, setHistory] = useState<AmayaTurn[]>([])
  const [muted, setMuted] = useState(false)
  const [sfxOn, setSfxOn] = useState(true)
  const [lang, setLang] = useState<AmayaLang>('ar')
  const [brainMode, setBrainMode] = useState<BrainMode>('checking')
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [cameraId, setCameraId] = useState('')
  const [speechSupported, setSpeechSupported] = useState(true)

  /* ------------------------------ refs ------------------------------- */
  const levelRef = useRef(0)
  const speakLevel = useRef(0)
  const mic = useRef(new MicMeter())
  const recognizer = useRef<Recognizer | null>(null)
  const queue = useRef<AmayaEvent[]>([])
  const processing = useRef(false)
  const armTimer = useRef<number | null>(null)
  const captionTimer = useRef<number | null>(null)
  const lastSourceTick = useRef(0)

  // Live mirror of state for async callbacks (recognizer, stream, timers).
  const live = useRef({
    status, asleep, armed, muted, lang, report, research, presenting, history,
  })
  useEffect(() => {
    live.current = { status, asleep, armed, muted, lang, report, research, presenting, history }
  })

  /* ------------------------------ helpers ---------------------------- */
  const addTurn = useCallback((role: AmayaTurn['role'], text: string) => {
    setHistory((h) => [...h.slice(-199), { role, text, at: Date.now() }])
  }, [])

  const showCaption = useCallback((text: string, holdMs = 0) => {
    if (captionTimer.current) window.clearTimeout(captionTimer.current)
    setCaption(text)
    if (holdMs) captionTimer.current = window.setTimeout(() => setCaption(''), holdMs)
  }, [])

  const disarm = useCallback((withSound = false) => {
    if (armTimer.current) window.clearTimeout(armTimer.current)
    armTimer.current = null
    if (!live.current.armed) return
    live.current.armed = false
    setArmed(false)
    setStatus((s) => (s === 'listening' ? 'idle' : s))
    if (withSound) sfx.listenEnd()
  }, [])

  const arm = useCallback(
    (ms = ARM_MS, sound: 'wake' | 'listen' = 'listen') => {
      if (live.current.muted) return
      if (armTimer.current) window.clearTimeout(armTimer.current)
      if (!live.current.armed) {
        if (sound === 'wake') sfx.wake()
        sfx.listenStart()
      }
      live.current.armed = true
      setArmed(true)
      setAsleep(false)
      setStatus((s) => (s === 'speaking' || s === 'thinking' ? s : 'listening'))
      armTimer.current = window.setTimeout(() => disarm(true), ms)
    },
    [disarm]
  )

  /* --------------------------- HUD actions --------------------------- */
  const runAction = useCallback(async (action: AmayaAction) => {
    switch (action) {
      case 'wake_screen':
        setAsleep(false)
        setScreenAwake(true)
        sfx.screenWake()
        await wait(900)
        break
      case 'sleep_screen':
        setPresenting(false)
        setWindows(NO_WINDOWS)
        setScreenAwake(false)
        setAsleep(true)
        sfx.screenSleep()
        break
      case 'present_report':
        if (!live.current.report) break
        setScreenAwake(true)
        setResearchHidden(true)
        setWindows((w) => ({ ...w, history: false, text: false }))
        setPresenting(true)
        sfx.present()
        await wait(350)
        break
      case 'clear_view':
        setPresenting(false)
        setWindows(NO_WINDOWS)
        setResearchHidden(true)
        await wait(250)
        break
      case 'open_history':
        setWindows((w) => ({ ...w, history: true }))
        break
      case 'open_text':
        setWindows((w) => ({ ...w, text: true }))
        break
      case 'open_camera':
        setWindows((w) => ({ ...w, camera: true }))
        break
      case 'close_camera':
        setWindows((w) => ({ ...w, camera: false }))
        break
      case 'open_sources':
        setWindows((w) => ({ ...w, sources: true }))
        break
      case 'mute_mic':
        setMuted(true)
        break
      case 'listen':
        arm()
        break
    }
  }, [arm])

  /* ------------------------ event processing ------------------------- */
  const handleEvent = useCallback(
    async (e: AmayaEvent) => {
      switch (e.type) {
        case 'say': {
          addTurn('amaya', e.text)
          showCaption(e.text)
          disarm()
          setStatus('speaking')
          recognizer.current?.stop()
          sfx.speakStart()
          await wait(140)
          const hooks = { onLevel: (l: number) => (speakLevel.current = l) }
          if (e.audioUrl) await speakAudioUrl(e.audioUrl, sfx.ctx, hooks)
          else await speakText(e.text, detectLang(e.text, live.current.lang), hooks)
          setStatus('idle')
          showCaption(e.text, 3500)
          if (!live.current.muted) recognizer.current?.start()
          if (e.expectReply) arm()
          break
        }
        case 'action':
          await runAction(e.action)
          break
        case 'research_start':
          setResearch({
            id: e.id, topic: e.topic, startedAt: Date.now(), progress: 0,
            blocks: 0, sources: 0, status: '', done: false,
          })
          setResearchHidden(false)
          setPresenting(false)
          setReport({ id: e.id, topic: e.topic, createdAt: Date.now(), demo: false, blocks: [], sources: [], notes: [] })
          sfx.scanStart()
          break
        case 'research_progress':
          setResearch((r) =>
            r && r.id === e.id
              ? { ...r, progress: e.progress, blocks: e.blocks, sources: e.sources, status: e.status }
              : r
          )
          sfx.progressTick()
          break
        case 'block':
          setReport((r) => (r && r.id === e.reportId ? { ...r, blocks: [...r.blocks, e.block] } : r))
          break
        case 'source': {
          setReport((r) => (r && r.id === e.reportId ? { ...r, sources: [...r.sources, e.source] } : r))
          const now = performance.now()
          if (now - lastSourceTick.current > 45) {
            lastSourceTick.current = now
            sfx.sourceTick()
          }
          break
        }
        case 'note':
          setReport((r) => (r && r.id === e.reportId ? { ...r, notes: [...r.notes, e.note] } : r))
          break
        case 'research_done':
          setResearch((r) => (r && r.id === e.id ? { ...r, done: true, progress: 1 } : r))
          setReport((r) => (r && r.id === e.id ? { ...r, demo: e.demo } : r))
          sfx.scanStop()
          sfx.complete()
          break
        case 'error': {
          sfx.error()
          sfx.scanStop()
          const L = UI[live.current.lang].errors
          showCaption(`⚠ ${e.message === 'unauthorized' ? L.unauthorized : L.default}`, 5000)
          setStatus('idle')
          break
        }
        case 'done':
          setStatus((s) => (s === 'thinking' ? 'idle' : s))
          break
      }
    },
    [addTurn, arm, disarm, runAction, showCaption]
  )

  const enqueue = useCallback(
    (e: AmayaEvent) => {
      queue.current.push(e)
      if (processing.current) return
      processing.current = true
      void (async () => {
        while (queue.current.length) {
          const next = queue.current.shift()!
          try {
            await handleEvent(next)
          } catch {
            // keep the queue alive
          }
        }
        processing.current = false
      })()
    },
    [handleEvent]
  )

  /* ------------------------- talk to brain --------------------------- */
  const send = useCallback(
    (raw: string) => {
      const text = raw.trim()
      if (!text) return
      disarm()
      addTurn('user', text)
      setTranscript({ text, final: true })
      setStatus('thinking')
      sfx.listenEnd()
      const s = live.current
      const rep = s.report
      const doneReport = rep && s.research?.done && s.research.id === rep.id ? rep : null
      void streamBrain(
        {
          text,
          lang: detectLang(text, s.lang),
          history: s.history.slice(-12),
          context: {
            pendingReport: doneReport
              ? { id: doneReport.id, topic: doneReport.topic, blocks: doneReport.blocks.length, sources: doneReport.sources.length }
              : null,
            presenting: s.presenting,
            screenAwake: true,
            researching: !!s.research && !s.research.done,
          },
        },
        enqueue
      ).catch(() => {
        enqueue({ type: 'error', message: 'network' })
        enqueue({ type: 'done' })
      })
    },
    [addTurn, disarm, enqueue]
  )

  /* --------------------------- recognition --------------------------- */
  const onFinal = useCallback(
    (text: string) => {
      const s = live.current
      if (s.muted || s.status === 'speaking') return
      setTranscript({ text, final: true })
      const rest = extractWake(text)
      if (s.armed) {
        const cmd = rest ?? text
        if (cmd.replace(/\s/g, '').length > 1) send(cmd)
        else arm()
        return
      }
      if (rest !== null) {
        if (rest.replace(/\s/g, '').length > 1) {
          sfx.wake()
          send(rest)
        } else arm(ARM_MS, 'wake')
      }
    },
    [arm, send]
  )

  const onInterim = useCallback(
    (text: string) => {
      const s = live.current
      if (s.muted || s.status === 'speaking') return
      setTranscript({ text, final: false })
      if (!s.armed && extractWake(text) !== null) arm(ARM_MS, 'wake')
      else if (s.armed) arm() // keep the window open while the user talks
    },
    [arm]
  )

  // Stable trampolines so the recognizer always calls the latest handlers.
  const onFinalRef = useRef(onFinal)
  const onInterimRef = useRef(onInterim)
  useEffect(() => {
    onFinalRef.current = onFinal
    onInterimRef.current = onInterim
  }, [onFinal, onInterim])

  /* ------------------------------ boot ------------------------------- */
  const boot = useCallback(async () => {
    if (phase !== 'boot') return
    setPhase('booting')
    const started = performance.now()
    // Saved preferences (read here, in the click handler, to keep SSR stable)
    let bootLang = live.current.lang
    try {
      const l = localStorage.getItem('amaya.lang')
      if (l === 'ar' || l === 'en') bootLang = l
      if (localStorage.getItem('amaya.sfx') === 'off') {
        setSfxOn(false)
        sfx.setEnabled(false)
      }
    } catch {
      // storage unavailable
    }
    live.current.lang = bootLang
    setLang(bootLang)
    const ctx = sfx.unlock()
    sfx.boot()
    const line = async (t: string, ms = 260) => {
      setBootLines((l) => [...l, t])
      sfx.progressTick()
      await wait(ms)
    }
    await line('AMAYA CORE ............... ONLINE')
    await line('AUDIO ENGINE ............. OK')
    const micOk = ctx ? await mic.current.start(ctx) : false
    await line(`MICROPHONE ............... ${micOk ? 'OK' : 'DENIED'}`)
    const sr = speechRecognitionSupported()
    setSpeechSupported(sr)
    await line(`SPEECH I/O ............... ${sr ? 'OK' : 'TEXT ONLY'}`)
    const mode = await fetchBrainMode()
    setBrainMode(mode)
    await line(
      `BRAIN LINK ............... ${mode === 'remote' ? 'AMAYA PLATFORM' : mode === 'local' ? 'LOCAL · DEMO' : 'OFFLINE'}`
    )
    await line('OPTICS ................... STANDBY')
    const left = 2700 - (performance.now() - started)
    if (left > 0) await wait(left)
    setPhase('online')

    recognizer.current = new Recognizer(live.current.lang, {
      onInterim: (t) => onInterimRef.current(t),
      onFinal: (t) => onFinalRef.current(t),
      onError: (code) => {
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          setSpeechSupported(false)
        }
      },
    })
    if (sr && micOk) recognizer.current.start()
    if (!sr || !micOk) setWindows((w) => ({ ...w, text: true }))
    await wait(900)
    enqueue({ type: 'say', text: UI[live.current.lang].greet })
  }, [phase, enqueue])

  /* --------------------------- level feed ---------------------------- */
  useEffect(() => {
    let raf = 0
    const loop = () => {
      levelRef.current =
        live.current.status === 'speaking' ? speakLevel.current : mic.current.read().level
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  /* ------------------------- orb placement --------------------------- */
  const researching = !!research && !research.done && !researchHidden
  const orbCorner = presenting || researching
  const firstOrbMove = useRef(true)
  useEffect(() => {
    if (firstOrbMove.current) {
      firstOrbMove.current = false
      return
    }
    sfx.orbMove(orbCorner)
  }, [orbCorner])

  /* ---------------------------- controls ----------------------------- */
  const toggleWindow = useCallback((w: WinKey) => {
    setWindows((s) => ({ ...s, [w]: !s[w] }))
  }, [])

  const clearView = useCallback(() => {
    void runAction('clear_view')
  }, [runAction])

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m
      sfx.mute(next)
      if (next) {
        recognizer.current?.stop()
        setTranscript({ text: '', final: false })
      } else if (live.current.status !== 'speaking') recognizer.current?.start()
      return next
    })
    disarm()
  }, [disarm])

  const toggleLang = useCallback(() => {
    setLang((l) => {
      const next: AmayaLang = l === 'ar' ? 'en' : 'ar'
      recognizer.current?.setLang(next)
      try {
        localStorage.setItem('amaya.lang', next)
      } catch {
        // ignore
      }
      return next
    })
  }, [])

  const toggleSfx = useCallback(() => {
    setSfxOn((on) => {
      const next = !on
      sfx.setEnabled(next)
      if (next) sfx.click()
      try {
        localStorage.setItem('amaya.sfx', next ? 'on' : 'off')
      } catch {
        // ignore
      }
      return next
    })
  }, [])

  const presentNow = useCallback(() => send(lang === 'ar' ? 'اعرضي التقرير' : 'present the report'), [send, lang])

  const onOrbClick = useCallback(() => {
    if (phase !== 'online') return
    if (live.current.status === 'speaking') {
      cancelSpeech()
      return
    }
    if (live.current.armed) disarm(true)
    else arm()
  }, [phase, arm, disarm])

  /* --------------------------- keyboard ------------------------------ */
  useEffect(() => {
    if (phase !== 'online') return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === ' ') {
        e.preventDefault()
        onOrbClick()
      } else if (k === 'h') toggleWindow('history')
      else if (k === 't') toggleWindow('text')
      else if (k === 'c') clearView()
      else if (k === 'm') toggleMute()
      else if (k === 'escape') {
        setWindows(NO_WINDOWS)
        disarm(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, onOrbClick, toggleWindow, clearView, toggleMute, disarm])

  // Cleanup on unmount
  useEffect(() => {
    const m = mic.current
    return () => {
      recognizer.current?.stop()
      m.stop()
      cancelSpeech()
      sfx.scanStop()
    }
  }, [])

  /* ------------------------------ render ----------------------------- */
  const T = UI[lang]
  const orbMode: OrbMode =
    phase !== 'online'
      ? phase === 'booting'
        ? 'idle'
        : 'offline'
      : status === 'speaking'
        ? 'speaking'
        : status === 'thinking' || researching
          ? 'thinking'
          : armed || status === 'listening'
            ? 'listening'
            : asleep
              ? 'sleeping'
              : presenting || Object.values(windows).some(Boolean)
                ? 'locked'
                : 'idle'

  const statusText = muted
    ? T.muted
    : status === 'speaking'
      ? T.speaking
      : status === 'thinking'
        ? T.thinking
        : armed
          ? T.listening
          : asleep
            ? T.asleep
            : T.standby

  return (
    <div
      className={`amy-root ${screenAwake ? 'is-awake' : ''} ${asleep ? 'is-asleep' : ''} ${phase !== 'online' ? 'is-offline' : ''}`}
      lang={lang}
    >
      <div className="amy-bg" aria-hidden>
        <i className="amy-bg-glow" />
        <i className="amy-bg-grid" />
        <i className="amy-bg-scan" />
        <i className="amy-bg-vignette" />
        <i className="amy-bg-flash" key={screenAwake ? 'awake' : 'asleep'} />
      </div>

      {phase === 'online' && (
        <TopBar
          brainMode={brainMode}
          lang={lang}
          sfxOn={sfxOn}
          windows={windows}
          hasReport={!!report && (report.sources.length > 0 || report.notes.length > 0)}
          cameras={cameras}
          cameraId={cameraId}
          onToggle={toggleWindow}
          onClear={clearView}
          onLang={toggleLang}
          onSfx={toggleSfx}
          onCamera={setCameraId}
        />
      )}

      <main className="amy-stage">
        <ReportGrid report={report} presenting={presenting} />

        <ResearchCard
          research={research}
          mini={!!research?.done}
          visible={!!research && !researchHidden && !presenting}
          onPresent={presentNow}
        />

        <div className="amy-wins">
          <HistoryWindow open={windows.history} history={history} onClose={() => toggleWindow('history')} />
          <SourcesWindow open={windows.sources} report={report} onClose={() => toggleWindow('sources')} />
          <CameraWindow open={windows.camera} deviceId={cameraId} onClose={() => toggleWindow('camera')} onDevices={setCameras} />
          <TextWindow open={windows.text} onSend={send} onClose={() => toggleWindow('text')} placeholder={T.placeholder} />
        </div>
      </main>

      <div className={`amy-orb ${orbCorner ? 'is-corner' : ''}`}>
        <AmayaOrb mode={orbMode} levelRef={levelRef} fontFamily={displayFont} onClick={onOrbClick} />
      </div>

      {phase === 'online' && caption && (
        <div className={`amy-caption ${orbCorner ? 'is-low' : ''}`} dir="auto" key={caption}>
          {caption}
        </div>
      )}

      {phase === 'online' && (
        <BottomBar
          readMeter={() => mic.current.read()}
          muted={muted}
          onMute={toggleMute}
          transcript={transcript}
          statusText={statusText}
          armed={armed}
          speechSupported={speechSupported}
        />
      )}

      {phase !== 'online' && (
        <div className={`amy-boot ${phase === 'booting' ? 'is-booting' : ''}`}>
          {phase === 'boot' ? (
            <button type="button" className="amy-boot-btn" onClick={() => void boot()}>
              <span className="amy-boot-logo">AMAYA</span>
              <span className="amy-boot-cta">INITIALIZE · تشغيل</span>
              <span className="amy-boot-hint">
                يتطلب إذن الميكروفون · Microphone permission required
              </span>
            </button>
          ) : (
            <pre className="amy-boot-log">
              {bootLines.map((l, i) => (
                <div key={i} style={{ animationDelay: `${i * 30}ms` }}>
                  {l}
                </div>
              ))}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
