/**
 * Browser voice I/O for Amaya:
 *  - Recognizer: continuous speech-to-text (Web Speech API).
 *  - speak():    text-to-speech via speechSynthesis, or an audio URL
 *                supplied by the brain (played through an analyser so
 *                the orb reacts to the real waveform).
 *  - MicMeter:   live microphone level for the HUD meter + orb.
 */

import type { AmayaLang } from './types'

/* ---------------------------------------------------------------- */
/* Minimal Web Speech typings (not in every TS lib.dom version)      */
/* ---------------------------------------------------------------- */

interface SRAlternative {
  transcript: string
}
interface SRResult {
  isFinal: boolean
  0: SRAlternative
}
interface SREvent {
  resultIndex: number
  results: { length: number; [i: number]: SRResult }
}
interface SRInstance {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((e: SREvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
type SRCtor = new () => SRInstance

function getSR(): SRCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export const speechRecognitionSupported = () => getSR() !== null
export const speechSynthesisSupported = () =>
  typeof window !== 'undefined' && 'speechSynthesis' in window

export const LOCALE: Record<AmayaLang, string> = { ar: 'ar-SA', en: 'en-US' }

/* ---------------------------------------------------------------- */
/* Recognizer                                                        */
/* ---------------------------------------------------------------- */

export interface RecognizerHandlers {
  onInterim: (text: string) => void
  onFinal: (text: string) => void
  onError: (code: string) => void
}

export class Recognizer {
  private sr: SRInstance | null = null
  private wanted = false
  private running = false
  private restartTimer: number | null = null
  lang: AmayaLang

  constructor(
    lang: AmayaLang,
    private h: RecognizerHandlers
  ) {
    this.lang = lang
  }

  get supported() {
    return getSR() !== null
  }

  private build() {
    const Ctor = getSR()
    if (!Ctor) return null
    const sr = new Ctor()
    sr.lang = LOCALE[this.lang]
    sr.continuous = true
    sr.interimResults = true
    sr.maxAlternatives = 1
    sr.onstart = () => {
      this.running = true
    }
    sr.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        const text = r[0]?.transcript ?? ''
        if (r.isFinal) {
          if (text.trim()) this.h.onFinal(text.trim())
        } else {
          interim += text
        }
      }
      this.h.onInterim(interim.trim())
    }
    sr.onerror = (e) => {
      // 'no-speech' and 'aborted' are routine; surface the rest
      if (e.error !== 'no-speech' && e.error !== 'aborted') this.h.onError(e.error)
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') this.wanted = false
    }
    sr.onend = () => {
      this.running = false
      if (this.wanted) this.scheduleRestart()
    }
    return sr
  }

  private scheduleRestart() {
    if (this.restartTimer) window.clearTimeout(this.restartTimer)
    this.restartTimer = window.setTimeout(() => {
      this.restartTimer = null
      if (this.wanted && !this.running) this.tryStart()
    }, 250)
  }

  private tryStart() {
    if (!this.sr) this.sr = this.build()
    if (!this.sr) return
    try {
      this.sr.start()
    } catch {
      // already started — ignore
    }
  }

  start() {
    this.wanted = true
    if (!this.running) this.tryStart()
  }

  /** Stop listening (e.g. while Amaya speaks, or when muted). */
  stop() {
    this.wanted = false
    if (this.restartTimer) window.clearTimeout(this.restartTimer)
    try {
      this.sr?.abort()
    } catch {
      // ignore
    }
    this.running = false
  }

  setLang(lang: AmayaLang) {
    if (lang === this.lang) return
    this.lang = lang
    const was = this.wanted
    this.stop()
    this.sr = null
    if (was) this.start()
  }
}

/* ---------------------------------------------------------------- */
/* Speech output                                                     */
/* ---------------------------------------------------------------- */

const FEMALE_HINTS = [
  'female', 'woman', 'zira', 'samantha', 'victoria', 'karen', 'moira', 'tessa', 'fiona',
  'aria', 'jenny', 'sonia', 'libby', 'google us english', 'google uk english female',
  'hoda', 'salma', 'zariyah', 'laila', 'mariam', 'amina', 'fatima', 'sana', 'layla',
]

let voicesCache: SpeechSynthesisVoice[] = []
function loadVoices(): SpeechSynthesisVoice[] {
  if (!speechSynthesisSupported()) return []
  const v = window.speechSynthesis.getVoices()
  if (v.length) voicesCache = v
  return voicesCache
}
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  loadVoices()
  window.speechSynthesis.onvoiceschanged = () => loadVoices()
}

export function pickVoice(lang: AmayaLang): SpeechSynthesisVoice | null {
  const voices = loadVoices().filter((v) => v.lang.toLowerCase().startsWith(lang))
  if (!voices.length) return null
  const score = (v: SpeechSynthesisVoice) => {
    const n = v.name.toLowerCase()
    let s = 0
    if (FEMALE_HINTS.some((h) => n.includes(h))) s += 5
    if (n.includes('natural') || n.includes('neural') || n.includes('online')) s += 3
    if (n.includes('google')) s += 2
    if (v.localService) s += 1
    return s
  }
  return [...voices].sort((a, b) => score(b) - score(a))[0]
}

export interface SpeakHooks {
  onStart?: () => void
  /** 0..1 pseudo level while speaking (word boundaries or real analyser). */
  onLevel?: (level: number) => void
}

let currentAudio: HTMLAudioElement | null = null

export function cancelSpeech() {
  if (speechSynthesisSupported()) window.speechSynthesis.cancel()
  if (currentAudio) {
    currentAudio.pause()
    currentAudio = null
  }
}

/** Speaks via speechSynthesis. Resolves when finished (with a safety timeout). */
export function speakText(text: string, lang: AmayaLang, hooks: SpeakHooks = {}): Promise<void> {
  return new Promise((resolve) => {
    if (!speechSynthesisSupported()) {
      // No TTS: still give the HUD a "speaking" beat proportional to length.
      hooks.onStart?.()
      const ms = Math.min(9000, 600 + text.length * 55)
      const iv = window.setInterval(() => hooks.onLevel?.(0.3 + Math.random() * 0.5), 90)
      window.setTimeout(() => {
        window.clearInterval(iv)
        hooks.onLevel?.(0)
        resolve()
      }, ms)
      return
    }
    const synth = window.speechSynthesis
    synth.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = LOCALE[lang]
    const voice = pickVoice(lang)
    if (voice) u.voice = voice
    u.rate = lang === 'ar' ? 1 : 1.05
    u.pitch = 1.08

    let done = false
    let iv: number | null = null
    const finish = () => {
      if (done) return
      done = true
      if (iv) window.clearInterval(iv)
      window.clearTimeout(safety)
      hooks.onLevel?.(0)
      resolve()
    }
    // Chrome sometimes never fires onend — guard with an estimate.
    const safety = window.setTimeout(finish, 2500 + text.length * 110)

    let pulse = 0
    u.onstart = () => {
      hooks.onStart?.()
      iv = window.setInterval(() => {
        pulse *= 0.82
        hooks.onLevel?.(Math.min(1, 0.18 + pulse + Math.random() * 0.25))
      }, 50)
    }
    u.onboundary = () => {
      pulse = 0.6
    }
    u.onend = finish
    u.onerror = finish
    synth.speak(u)
  })
}

/** Plays brain-supplied audio through an analyser for real orb levels. */
export function speakAudioUrl(
  url: string,
  ctx: AudioContext | null,
  hooks: SpeakHooks = {}
): Promise<void> {
  return new Promise((resolve) => {
    cancelSpeech()
    const audio = new Audio()
    audio.crossOrigin = 'anonymous'
    audio.src = url
    currentAudio = audio
    let raf = 0
    let analyser: AnalyserNode | null = null
    if (ctx) {
      try {
        const node = ctx.createMediaElementSource(audio)
        analyser = ctx.createAnalyser()
        analyser.fftSize = 512
        node.connect(analyser)
        analyser.connect(ctx.destination)
      } catch {
        analyser = null
      }
    }
    const buf = new Uint8Array(256)
    const tick = () => {
      if (analyser) {
        analyser.getByteTimeDomainData(buf)
        let sum = 0
        for (const v of buf) sum += ((v - 128) / 128) ** 2
        hooks.onLevel?.(Math.min(1, Math.sqrt(sum / buf.length) * 4))
      } else {
        hooks.onLevel?.(0.3 + Math.random() * 0.4)
      }
      raf = requestAnimationFrame(tick)
    }
    const finish = () => {
      cancelAnimationFrame(raf)
      hooks.onLevel?.(0)
      if (currentAudio === audio) currentAudio = null
      resolve()
    }
    audio.onplay = () => {
      hooks.onStart?.()
      tick()
    }
    audio.onended = finish
    audio.onerror = finish
    audio.play().catch(finish)
  })
}

/* ---------------------------------------------------------------- */
/* Microphone meter                                                  */
/* ---------------------------------------------------------------- */

export class MicMeter {
  private stream: MediaStream | null = null
  private analyser: AnalyserNode | null = null
  private buf: Float32Array<ArrayBuffer> | null = null
  private peak = -90
  private peakAt = 0

  async start(ctx: AudioContext): Promise<boolean> {
    if (this.stream) return true
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      })
    } catch {
      return false
    }
    const src = ctx.createMediaStreamSource(this.stream)
    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = 1024
    src.connect(this.analyser)
    this.buf = new Float32Array(this.analyser.fftSize)
    return true
  }

  /** Returns { db, peakDb, level 0..1 }. */
  read(): { db: number; peakDb: number; level: number } {
    if (!this.analyser || !this.buf) return { db: -90, peakDb: -90, level: 0 }
    this.analyser.getFloatTimeDomainData(this.buf)
    let sum = 0
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i]
    const rms = Math.sqrt(sum / this.buf.length)
    const db = Math.max(-90, 20 * Math.log10(rms || 1e-9))
    const now = performance.now()
    if (db > this.peak || now - this.peakAt > 1500) {
      this.peak = db
      this.peakAt = now
    }
    const level = Math.min(1, Math.max(0, (db + 60) / 50))
    return { db, peakDb: this.peak, level }
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.analyser = null
  }
}
