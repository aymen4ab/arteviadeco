/**
 * Amaya SFX engine — every sound is synthesised live with the Web Audio
 * API (no audio files, no licensing). Oscillators + filtered noise run
 * through a shared reverb and a compressor so the whole HUD sounds like
 * one instrument.
 *
 * Browsers only allow audio after a user gesture: call `unlock()` from
 * a click/keypress handler (the HUD's boot screen does this).
 */

type Wave = OscillatorType

interface ToneOpts {
  freq: number
  freqEnd?: number
  type?: Wave
  delay?: number
  dur: number
  vol?: number
  attack?: number
  release?: number
  rev?: number
  pan?: number
}

interface NoiseOpts {
  dur: number
  filter?: BiquadFilterType
  freq: number
  freqEnd?: number
  q?: number
  delay?: number
  vol?: number
  attack?: number
  release?: number
  rev?: number
}

class AmayaSfx {
  ctx: AudioContext | null = null
  private master: GainNode | null = null
  private reverbIn: GainNode | null = null
  private noiseBuf: AudioBuffer | null = null
  private scan: { stop: () => void } | null = null
  private lastType = 0
  enabled = true
  volume = 0.7

  /** Must be called from a user gesture. Safe to call repeatedly. */
  unlock(): AudioContext | null {
    if (typeof window === 'undefined') return null
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      const ctx = new Ctor()
      const comp = ctx.createDynamicsCompressor()
      comp.threshold.value = -18
      comp.ratio.value = 4
      comp.attack.value = 0.003
      comp.release.value = 0.25
      comp.connect(ctx.destination)

      const master = ctx.createGain()
      master.gain.value = this.volume
      master.connect(comp)

      const conv = ctx.createConvolver()
      conv.buffer = this.makeImpulse(ctx, 2.4, 2.8)
      const wet = ctx.createGain()
      wet.gain.value = 0.35
      const reverbIn = ctx.createGain()
      reverbIn.connect(conv)
      conv.connect(wet)
      wet.connect(master)

      const len = ctx.sampleRate * 2
      const nb = ctx.createBuffer(1, len, ctx.sampleRate)
      const d = nb.getChannelData(0)
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1

      this.ctx = ctx
      this.master = master
      this.reverbIn = reverbIn
      this.noiseBuf = nb
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  setEnabled(on: boolean) {
    this.enabled = on
    if (!on) this.scanStop()
  }

  setVolume(v: number) {
    this.volume = v
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05)
  }

  /* ---------------------------------------------------------- */
  /* primitives                                                  */
  /* ---------------------------------------------------------- */

  private makeImpulse(ctx: AudioContext, seconds: number, decay: number) {
    const rate = ctx.sampleRate
    const len = Math.floor(rate * seconds)
    const buf = ctx.createBuffer(2, len, rate)
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch)
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay)
      }
    }
    return buf
  }

  private ready(): AudioContext | null {
    if (!this.enabled || !this.ctx || !this.master) return null
    return this.ctx
  }

  private route(node: AudioNode, rev = 0.15, pan = 0) {
    const ctx = this.ctx!
    let out: AudioNode = node
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner()
      p.pan.value = pan
      node.connect(p)
      out = p
    }
    out.connect(this.master!)
    if (rev > 0) {
      const send = ctx.createGain()
      send.gain.value = rev
      out.connect(send)
      send.connect(this.reverbIn!)
    }
  }

  tone(o: ToneOpts) {
    const ctx = this.ready()
    if (!ctx) return
    const t0 = ctx.currentTime + (o.delay ?? 0)
    const attack = o.attack ?? 0.005
    const release = o.release ?? o.dur * 0.8
    const vol = o.vol ?? 0.15
    const osc = ctx.createOscillator()
    osc.type = o.type ?? 'sine'
    osc.frequency.setValueAtTime(o.freq, t0)
    if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(o.freqEnd, t0 + o.dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack)
    g.gain.setValueAtTime(vol, t0 + Math.max(attack, o.dur - release))
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur + release * 0.5)
    osc.connect(g)
    this.route(g, o.rev, o.pan)
    osc.start(t0)
    osc.stop(t0 + o.dur + release + 0.05)
  }

  noise(o: NoiseOpts) {
    const ctx = this.ready()
    if (!ctx || !this.noiseBuf) return
    const t0 = ctx.currentTime + (o.delay ?? 0)
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = o.filter ?? 'bandpass'
    f.Q.value = o.q ?? 1.2
    f.frequency.setValueAtTime(o.freq, t0)
    if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, t0 + o.dur)
    const g = ctx.createGain()
    const vol = o.vol ?? 0.1
    const attack = o.attack ?? o.dur * 0.3
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur + (o.release ?? 0.05))
    src.connect(f)
    f.connect(g)
    this.route(g, o.rev ?? 0.2)
    src.start(t0, Math.random() * 1.5)
    src.stop(t0 + o.dur + (o.release ?? 0.05) + 0.05)
  }

  /* ---------------------------------------------------------- */
  /* HUD sounds                                                  */
  /* ---------------------------------------------------------- */

  /** System power-up: sub swell, data chatter, chime. ~2.6s */
  boot() {
    this.tone({ freq: 38, freqEnd: 90, type: 'sine', dur: 1.8, vol: 0.32, attack: 1.2, release: 0.6 })
    this.tone({ freq: 76, freqEnd: 180, type: 'triangle', dur: 1.8, vol: 0.05, attack: 1.2, release: 0.6 })
    this.noise({ dur: 1.6, freq: 180, freqEnd: 4200, q: 2, vol: 0.12, attack: 1.3, rev: 0.4 })
    for (let i = 0; i < 20; i++) {
      this.tone({
        freq: 700 + Math.random() * 2200,
        type: 'square',
        delay: 0.35 + i * 0.065,
        dur: 0.025,
        vol: 0.035,
        release: 0.01,
        rev: 0.1,
        pan: Math.random() * 1.4 - 0.7,
      })
    }
    ;[523.25, 783.99, 1046.5, 1567.98].forEach((f, i) =>
      this.tone({ freq: f, type: 'sine', delay: 1.85 + i * 0.07, dur: 1.4, vol: 0.09, release: 1.2, rev: 0.6 })
    )
    this.noise({ dur: 0.5, filter: 'highpass', freq: 5000, freqEnd: 9000, delay: 1.85, vol: 0.05, rev: 0.6 })
  }

  /** Wake word heard — rings snap together. */
  wake() {
    ;[660, 880, 1320].forEach((f, i) =>
      this.tone({ freq: f, type: 'triangle', delay: i * 0.065, dur: 0.18, vol: 0.09, release: 0.15, rev: 0.35 })
    )
    this.noise({ dur: 0.35, filter: 'highpass', freq: 3000, freqEnd: 9000, vol: 0.06, rev: 0.4 })
  }

  listenStart() {
    this.tone({ freq: 900, freqEnd: 1400, dur: 0.07, vol: 0.09, release: 0.04, rev: 0.2 })
    this.tone({ freq: 1400, freqEnd: 1900, delay: 0.08, dur: 0.07, vol: 0.09, release: 0.05, rev: 0.3 })
  }

  listenEnd() {
    this.tone({ freq: 1500, freqEnd: 1000, dur: 0.07, vol: 0.08, release: 0.04, rev: 0.2 })
    this.tone({ freq: 1000, freqEnd: 650, delay: 0.08, dur: 0.08, vol: 0.08, release: 0.05, rev: 0.3 })
  }

  click() {
    this.tone({ freq: 2200, freqEnd: 1300, dur: 0.035, vol: 0.1, release: 0.02, rev: 0.12 })
    this.noise({ dur: 0.02, filter: 'highpass', freq: 6000, vol: 0.05, attack: 0.002, rev: 0 })
  }

  hover() {
    this.tone({ freq: 3400, dur: 0.012, vol: 0.025, release: 0.008, rev: 0.05 })
  }

  /** HUD window opening: rising whoosh + chirp + confirm blip. */
  windowOpen() {
    this.noise({ dur: 0.35, freq: 400, freqEnd: 4200, q: 1.6, vol: 0.14, attack: 0.2, rev: 0.3 })
    this.tone({ freq: 480, freqEnd: 1150, type: 'triangle', dur: 0.18, vol: 0.07, release: 0.1, rev: 0.25 })
    this.tone({ freq: 1760, type: 'square', delay: 0.2, dur: 0.035, vol: 0.035, release: 0.02, rev: 0.3 })
    this.tone({ freq: 2349, type: 'square', delay: 0.25, dur: 0.03, vol: 0.025, release: 0.02, rev: 0.3 })
  }

  /** HUD window closing: falling whoosh. */
  windowClose() {
    this.noise({ dur: 0.3, freq: 3600, freqEnd: 300, q: 1.6, vol: 0.12, attack: 0.05, rev: 0.25 })
    this.tone({ freq: 1050, freqEnd: 380, type: 'triangle', dur: 0.2, vol: 0.06, release: 0.1, rev: 0.2 })
  }

  /** A report block materialising. Pitch climbs with index. */
  blockIn(index = 0) {
    const base = 740 * Math.pow(2, ((index % 8) * 2) / 12)
    this.tone({ freq: base, type: 'square', dur: 0.035, vol: 0.04, release: 0.02, rev: 0.25, pan: (index % 4) / 2 - 0.75 })
    this.tone({ freq: base * 1.5, type: 'square', delay: 0.05, dur: 0.035, vol: 0.03, release: 0.02, rev: 0.3 })
    this.noise({ dur: 0.16, filter: 'highpass', freq: 1800, freqEnd: 7000, vol: 0.05, attack: 0.08, rev: 0.3 })
  }

  blockOut(index = 0) {
    this.noise({ dur: 0.12, filter: 'bandpass', freq: 3000 - (index % 6) * 300, freqEnd: 500, vol: 0.05, attack: 0.02, rev: 0.15 })
  }

  /** Throttled keyboard-ish tick for typewriter text. */
  typeTick() {
    const now = performance.now()
    if (now - this.lastType < 28) return
    this.lastType = now
    this.tone({ freq: 1800 + Math.random() * 900, type: 'square', dur: 0.008, vol: 0.018, release: 0.005, rev: 0.05 })
  }

  progressTick() {
    this.tone({ freq: 1250, dur: 0.02, vol: 0.05, release: 0.015, rev: 0.2 })
  }

  sourceTick() {
    this.tone({ freq: 2600 + Math.random() * 600, dur: 0.008, vol: 0.015, release: 0.005, rev: 0.1 })
  }

  /** Research complete: bright major-9 chord. */
  complete() {
    ;[523.25, 659.25, 783.99, 987.77, 1174.66].forEach((f, i) => {
      this.tone({ freq: f, type: 'sine', delay: i * 0.05, dur: 1.1, vol: 0.07, release: 1, rev: 0.55 })
      this.tone({ freq: f * 2, type: 'triangle', delay: i * 0.05, dur: 0.4, vol: 0.015, release: 0.35, rev: 0.6 })
    })
  }

  error() {
    this.tone({ freq: 220, freqEnd: 180, type: 'square', dur: 0.15, vol: 0.06, release: 0.06, rev: 0.1 })
    this.tone({ freq: 180, freqEnd: 120, type: 'square', delay: 0.17, dur: 0.22, vol: 0.06, release: 0.1, rev: 0.15 })
  }

  /** Screen wake: sub boom + rising sweep + arrival ping. */
  screenWake() {
    this.tone({ freq: 130, freqEnd: 38, type: 'sine', dur: 0.7, vol: 0.45, attack: 0.01, release: 0.5 })
    this.noise({ dur: 0.45, filter: 'lowpass', freq: 900, freqEnd: 120, vol: 0.18, attack: 0.01, rev: 0.3 })
    this.noise({ dur: 0.9, freq: 250, freqEnd: 5200, q: 3, vol: 0.08, attack: 0.7, delay: 0.1, rev: 0.4 })
    this.tone({ freq: 1318.5, type: 'sine', delay: 0.85, dur: 0.6, vol: 0.07, release: 0.55, rev: 0.6 })
    this.tone({ freq: 1975.5, type: 'sine', delay: 0.92, dur: 0.5, vol: 0.04, release: 0.45, rev: 0.6 })
  }

  screenSleep() {
    this.noise({ dur: 0.8, freq: 3200, freqEnd: 140, q: 2, vol: 0.09, attack: 0.05, rev: 0.4 })
    this.tone({ freq: 220, freqEnd: 40, type: 'sine', dur: 0.9, vol: 0.25, release: 0.6 })
  }

  /** Report going up — sparkling sweep before the blocks cascade. */
  present() {
    this.noise({ dur: 0.7, filter: 'highpass', freq: 900, freqEnd: 8500, vol: 0.1, attack: 0.5, rev: 0.5 })
    ;[880, 1108.73, 1318.51, 1760].forEach((f, i) =>
      this.tone({ freq: f, type: 'triangle', delay: 0.15 + i * 0.06, dur: 0.12, vol: 0.05, release: 0.1, rev: 0.5 })
    )
  }

  /** Orb flying to a corner (shrink) or back to centre (grow). */
  orbMove(toCorner: boolean) {
    if (toCorner) {
      this.noise({ dur: 0.5, freq: 2400, freqEnd: 400, q: 1.4, vol: 0.09, attack: 0.1, rev: 0.3 })
      this.tone({ freq: 700, freqEnd: 260, type: 'sine', dur: 0.45, vol: 0.06, release: 0.2, rev: 0.3 })
    } else {
      this.noise({ dur: 0.5, freq: 400, freqEnd: 2400, q: 1.4, vol: 0.09, attack: 0.35, rev: 0.3 })
      this.tone({ freq: 260, freqEnd: 700, type: 'sine', dur: 0.45, vol: 0.06, release: 0.2, rev: 0.3 })
    }
  }

  mute(on: boolean) {
    this.tone({ freq: on ? 620 : 310, freqEnd: on ? 310 : 620, type: 'triangle', dur: 0.12, vol: 0.08, release: 0.06, rev: 0.2 })
  }

  camera() {
    this.noise({ dur: 0.03, freq: 3200, q: 0.8, vol: 0.12, attack: 0.002, rev: 0.1 })
    this.noise({ dur: 0.04, freq: 2200, q: 0.8, vol: 0.1, attack: 0.002, delay: 0.09, rev: 0.15 })
    this.tone({ freq: 1600, freqEnd: 2400, delay: 0.15, dur: 0.12, vol: 0.05, release: 0.08, rev: 0.3 })
  }

  /** Comm-channel blip before Amaya starts speaking. */
  speakStart() {
    this.tone({ freq: 1480, dur: 0.03, vol: 0.05, release: 0.02, rev: 0.2 })
    this.tone({ freq: 1976, delay: 0.045, dur: 0.035, vol: 0.05, release: 0.03, rev: 0.25 })
  }

  /** Research/thinking ambience: modulated noise + periodic soft pings. */
  scanStart() {
    const ctx = this.ready()
    if (!ctx || this.scan || !this.noiseBuf) return
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.Q.value = 6
    f.frequency.value = 1300
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.45
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 700
    lfo.connect(lfoGain)
    lfoGain.connect(f.frequency)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.035, ctx.currentTime + 0.6)
    src.connect(f)
    f.connect(g)
    this.route(g, 0.4)
    src.start()
    lfo.start()
    let n = 0
    const timer = window.setInterval(() => {
      n++
      this.tone({ freq: n % 4 === 0 ? 1975 : 1568, dur: 0.03, vol: 0.025, release: 0.03, rev: 0.5 })
    }, 850)
    this.scan = {
      stop: () => {
        window.clearInterval(timer)
        const t = ctx.currentTime
        g.gain.cancelScheduledValues(t)
        g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), t)
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4)
        src.stop(t + 0.45)
        lfo.stop(t + 0.45)
      },
    }
  }

  scanStop() {
    this.scan?.stop()
    this.scan = null
  }
}

/** Singleton shared by every HUD component. */
export const sfx = new AmayaSfx()
