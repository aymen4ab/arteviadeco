'use client'

import { useEffect, useRef } from 'react'

export type OrbMode = 'offline' | 'idle' | 'locked' | 'listening' | 'thinking' | 'speaking' | 'sleeping'

interface OrbProps {
  mode: OrbMode
  /** Live 0..1 audio level (mic while listening, voice while speaking). */
  levelRef: React.RefObject<number>
  label?: string
  /** Resolved font-family for the centre logo (canvas can't read CSS vars). */
  fontFamily?: string
  onClick?: () => void
}

/* ------------------------------------------------------------------ */
/* Ring model                                                          */
/* ------------------------------------------------------------------ */

type RingStyle = 'solid' | 'ticks' | 'arcs' | 'dots' | 'thin'

interface Ring {
  r: number // relative radius
  w: number // relative width
  style: RingStyle
  color: string
  alpha: number
  spin: number // rad/s when assembled
  /** scattered pose */
  tiltX: number
  tiltY: number
  tumble: number // rad/s of tumble while scattered
  ox: number
  oy: number
  oz: number
  arcs?: [number, number][] // for 'arcs': [start, length] in radians
  count?: number // ticks / dots
}

const PINK = '255,45,117'
const PINK_SOFT = '255,120,170'
const WHITE = '235,240,255'
const CYAN = '120,220,255'

function makeRings(): Ring[] {
  const rnd = (a: number, b: number) => a + Math.random() * (b - a)
  const sign = () => (Math.random() < 0.5 ? -1 : 1)
  const scatter = () => ({
    tiltX: rnd(0.6, 1.35) * sign(),
    tiltY: rnd(0.5, 1.4) * sign(),
    tumble: rnd(0.15, 0.45) * sign(),
    ox: rnd(-0.18, 0.18),
    oy: rnd(-0.12, 0.12),
    oz: rnd(-0.3, 0.3),
  })
  return [
    { r: 0.5, w: 0.075, style: 'solid', color: PINK, alpha: 1, spin: 0.15, ...scatter() },
    { r: 0.41, w: 0.012, style: 'ticks', count: 48, color: PINK_SOFT, alpha: 0.75, spin: -0.4, ...scatter() },
    {
      r: 0.6, w: 0.014, style: 'arcs', color: PINK, alpha: 0.9, spin: -0.22,
      arcs: [[0.2, 1.1], [1.75, 0.9], [3.1, 1.4], [4.9, 0.95]], ...scatter(),
    },
    { r: 0.69, w: 0.035, style: 'ticks', count: 72, color: PINK, alpha: 0.55, spin: 0.08, ...scatter() },
    {
      r: 0.79, w: 0.008, style: 'arcs', color: WHITE, alpha: 0.6, spin: 0.3,
      arcs: [[0, 2.2], [2.6, 1.7], [4.6, 1.2]], ...scatter(),
    },
    { r: 0.88, w: 0.012, style: 'dots', count: 36, color: WHITE, alpha: 0.7, spin: -0.12, ...scatter() },
    { r: 0.96, w: 0.006, style: 'thin', color: PINK_SOFT, alpha: 0.35, spin: 0.05, ...scatter() },
  ]
}

interface Particle {
  r: number
  theta: number
  phi: number
  speed: number
  size: number
}

/* ------------------------------------------------------------------ */
/* 3D helpers                                                          */
/* ------------------------------------------------------------------ */

type V3 = [number, number, number]

function rot(p: V3, ax: number, ay: number, az: number): V3 {
  let [x, y, z] = p
  // Z
  let c = Math.cos(az)
  let s = Math.sin(az)
  ;[x, y] = [x * c - y * s, x * s + y * c]
  // X
  c = Math.cos(ax)
  s = Math.sin(ax)
  ;[y, z] = [y * c - z * s, y * s + z * c]
  // Y
  c = Math.cos(ay)
  s = Math.sin(ay)
  ;[x, z] = [x * c + z * s, -x * s + z * c]
  return [x, y, z]
}

const easeTo = (cur: number, target: number, dt: number, speed: number) =>
  cur + (target - cur) * (1 - Math.exp(-dt * speed))

/* ------------------------------------------------------------------ */

export function AmayaOrb({ mode, levelRef, label = 'AMAYA', fontFamily = 'sans-serif', onClick }: OrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const modeRef = useRef(mode)
  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rings = makeRings()
    const particles: Particle[] = Array.from({ length: 46 }, () => ({
      r: 0.55 + Math.random() * 0.55,
      theta: Math.random() * Math.PI * 2,
      phi: Math.random() * Math.PI - Math.PI / 2,
      speed: (0.1 + Math.random() * 0.35) * (Math.random() < 0.5 ? -1 : 1),
      size: 0.6 + Math.random() * 1.4,
    }))

    let W = 0
    let H = 0
    let dpr = 1
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      const rect = canvas.getBoundingClientRect()
      W = rect.width
      H = rect.height
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    let assembly = 0 // 0 = scattered, 1 = locked
    let power = 0 // overall brightness
    let level = 0
    let think = 0
    let listen = 0
    let glitchUntil = 0
    let last = performance.now()
    let raf = 0
    const t0 = last

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const t = (now - t0) / 1000
      const m = modeRef.current

      const targetA = m === 'offline' ? 0 : m === 'idle' ? 0.06 : m === 'sleeping' ? 0 : 1
      assembly = easeTo(assembly, targetA, dt, m === 'idle' ? 1.6 : 3.2)
      power = easeTo(power, m === 'offline' ? 0 : m === 'sleeping' ? 0.35 : 1, dt, 2)
      level = easeTo(level, levelRef.current ?? 0, dt, 18)
      think = easeTo(think, m === 'thinking' ? 1 : 0, dt, 4)
      listen = easeTo(listen, m === 'listening' ? 1 : 0, dt, 6)
      if (m === 'speaking' && Math.random() < 0.03 + level * 0.06) glitchUntil = now + 60 + Math.random() * 90

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)
      const size = Math.min(W, H)
      const cx = W / 2
      const cy = H / 2
      const breathe = 1 + Math.sin(t * 1.6) * 0.008
      const R = size * 0.46 * breathe * (1 + (m === 'speaking' ? level * 0.06 : 0) + listen * level * 0.03)
      const F = 3.2 // perspective focal (relative)
      const proj = (p: V3): [number, number, number] => {
        const s = F / (F + p[2])
        return [cx + p[0] * R * s, cy + p[1] * R * s, p[2]]
      }
      const inv = 1 - assembly

      ctx.globalCompositeOperation = 'lighter'
      ctx.lineCap = 'round'

      /* --- core glow ------------------------------------------- */
      if (power > 0.01) {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.62)
        const core = (0.1 + level * 0.25 + think * 0.1) * power * (0.35 + assembly * 0.65)
        g.addColorStop(0, `rgba(${PINK},${core * 0.25})`)
        g.addColorStop(0.7, `rgba(${PINK},${core * 0.55})`)
        g.addColorStop(1, `rgba(${PINK},0)`)
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(cx, cy, R * 0.62, 0, Math.PI * 2)
        ctx.fill()
      }

      /* --- laser line (scattered idle look) --------------------- */
      if (inv > 0.05 && power > 0.05) {
        const ang = -0.55 + Math.sin(t * 0.4) * 0.12
        const len = R * 1.25
        const x1 = cx - Math.cos(ang) * len
        const y1 = cy - Math.sin(ang) * len
        const x2 = cx + Math.cos(ang) * len
        const y2 = cy + Math.sin(ang) * len
        const lg = ctx.createLinearGradient(x1, y1, x2, y2)
        lg.addColorStop(0, `rgba(${PINK},0)`)
        lg.addColorStop(0.5, `rgba(${PINK},${0.85 * inv * power})`)
        lg.addColorStop(1, `rgba(${PINK},0)`)
        ctx.strokeStyle = lg
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
      }

      /* --- rings ------------------------------------------------- */
      for (let i = 0; i < rings.length; i++) {
        const ring = rings[i]
        const spinBoost = 1 + think * 3 * (i % 2 ? -1 : 1)
        const az = t * ring.spin * spinBoost + i
        const ax = ring.tiltX * inv + Math.sin(t * ring.tumble + i) * 0.5 * inv
        const ay = ring.tiltY * inv + t * ring.tumble * inv
        const off: V3 = [ring.ox * inv, ring.oy * inv, ring.oz * inv]
        const alpha = ring.alpha * power
        if (alpha < 0.01) continue
        const lw = Math.max(0.6, ring.w * R)
        const pt = (theta: number, rr = ring.r): [number, number, number] => {
          const p = rot([Math.cos(theta) * rr, Math.sin(theta) * rr, 0], ax, ay, az)
          return proj([p[0] + off[0], p[1] + off[1], p[2] + off[2]])
        }
        const depthA = (z: number) => Math.max(0.15, Math.min(1, 0.75 - z * 0.9))

        const strokeArc = (start: number, len: number, width: number) => {
          const steps = Math.max(8, Math.ceil(len * 22))
          let prev = pt(start)
          for (let k = 1; k <= steps; k++) {
            const cur = pt(start + (len * k) / steps)
            const a = alpha * depthA((prev[2] + cur[2]) / 2)
            // halo pass + core pass
            ctx.strokeStyle = `rgba(${ring.color},${a * 0.14})`
            ctx.lineWidth = width * 3.2
            ctx.beginPath()
            ctx.moveTo(prev[0], prev[1])
            ctx.lineTo(cur[0], cur[1])
            ctx.stroke()
            ctx.strokeStyle = `rgba(${ring.color},${a})`
            ctx.lineWidth = width
            ctx.beginPath()
            ctx.moveTo(prev[0], prev[1])
            ctx.lineTo(cur[0], cur[1])
            ctx.stroke()
            prev = cur
          }
        }

        if (ring.style === 'solid' || ring.style === 'thin') {
          strokeArc(0, Math.PI * 2, lw)
        } else if (ring.style === 'arcs') {
          for (const [s, l] of ring.arcs!) strokeArc(s, l, lw)
        } else if (ring.style === 'ticks') {
          const n = ring.count!
          for (let k = 0; k < n; k++) {
            const th = (k / n) * Math.PI * 2
            const long = k % 6 === 0
            const a1 = pt(th, ring.r - (long ? ring.w * 1.4 : ring.w * 0.7))
            const a2 = pt(th, ring.r + (long ? ring.w * 0.6 : 0))
            ctx.strokeStyle = `rgba(${ring.color},${alpha * depthA(a1[2]) * (long ? 1 : 0.7)})`
            ctx.lineWidth = long ? 1.6 : 1
            ctx.beginPath()
            ctx.moveTo(a1[0], a1[1])
            ctx.lineTo(a2[0], a2[1])
            ctx.stroke()
          }
        } else if (ring.style === 'dots') {
          const n = ring.count!
          for (let k = 0; k < n; k++) {
            if (k % 9 > 6) continue
            const p = pt((k / n) * Math.PI * 2)
            ctx.fillStyle = `rgba(${ring.color},${alpha * depthA(p[2])})`
            ctx.beginPath()
            ctx.arc(p[0], p[1], Math.max(0.8, lw * 0.9), 0, Math.PI * 2)
            ctx.fill()
          }
        }
      }

      /* --- listening: radial spectrum bars ------------------------ */
      if (listen > 0.02) {
        const n = 72
        for (let k = 0; k < n; k++) {
          const th = (k / n) * Math.PI * 2 - Math.PI / 2
          const wobble =
            (Math.sin(t * 9 + k * 0.7) * 0.5 + 0.5) * 0.35 + (Math.sin(t * 5.3 + k * 1.9) * 0.5 + 0.5) * 0.25
          const amp = (0.02 + (level * 0.9 + 0.1) * wobble * 0.16) * listen
          const r1 = 1.02
          const r2 = r1 + amp
          ctx.strokeStyle = `rgba(${PINK},${0.75 * listen})`
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(cx + Math.cos(th) * r1 * R, cy + Math.sin(th) * r1 * R)
          ctx.lineTo(cx + Math.cos(th) * r2 * R, cy + Math.sin(th) * r2 * R)
          ctx.stroke()
        }
      }

      /* --- thinking: comet arcs ------------------------------------ */
      if (think > 0.02) {
        for (let j = 0; j < 2; j++) {
          const base = t * (j ? -4.2 : 3.1) + j * Math.PI
          const rr = j ? 0.69 : 0.88
          const segs = 30
          for (let k = 0; k < segs; k++) {
            const a0 = base - (k / segs) * 1.3
            const a1 = base - ((k + 1) / segs) * 1.3
            ctx.strokeStyle = `rgba(${j ? CYAN : PINK},${think * (1 - k / segs)})`
            ctx.lineWidth = 3 * (1 - k / segs) + 0.5
            ctx.beginPath()
            ctx.moveTo(cx + Math.cos(a0) * rr * R, cy + Math.sin(a0) * rr * R)
            ctx.lineTo(cx + Math.cos(a1) * rr * R, cy + Math.sin(a1) * rr * R)
            ctx.stroke()
          }
        }
      }

      /* --- corner brackets (assembled) ----------------------------- */
      if (assembly > 0.3) {
        const a = (assembly - 0.3) / 0.7
        ctx.strokeStyle = `rgba(${WHITE},${0.55 * a * power})`
        ctx.lineWidth = 1.2
        const d = R * 1.12
        for (let q = 0; q < 4; q++) {
          const ang = Math.PI / 4 + (q * Math.PI) / 2 + Math.sin(t * 0.8) * 0.02
          const x = cx + Math.cos(ang) * d
          const y = cy + Math.sin(ang) * d
          const sx = Math.sign(Math.cos(ang))
          const sy = Math.sign(Math.sin(ang))
          const l = R * 0.06
          ctx.beginPath()
          ctx.moveTo(x - sx * l, y)
          ctx.lineTo(x, y)
          ctx.lineTo(x, y - sy * l)
          ctx.stroke()
        }
      }

      /* --- particles ----------------------------------------------- */
      for (const p of particles) {
        p.theta += p.speed * dt * (1 + think * 3)
        const v = rot([Math.cos(p.theta) * p.r, Math.sin(p.theta) * p.r, 0], p.phi, t * 0.1, 0)
        const q = proj(v)
        const a = (0.15 + 0.5 * (1 - (q[2] + 1) / 2)) * power * (0.4 + inv * 0.6)
        ctx.fillStyle = `rgba(${p.size > 1.4 ? PINK : WHITE},${a})`
        ctx.beginPath()
        ctx.arc(q[0], q[1], p.size, 0, Math.PI * 2)
        ctx.fill()
      }

      /* --- logo ---------------------------------------------------- */
      const logoA = Math.max(0, (assembly - 0.25) / 0.75) * power
      if (logoA > 0.01) {
        ctx.globalCompositeOperation = 'source-over'
        const fs = R * 0.27
        ctx.font = `900 ${fs}px ${fontFamily}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const glitching = now < glitchUntil
        const draw = (dx: number, dy: number, color: string, a: number) => {
          ctx.fillStyle = color.replace('A', String(a))
          ctx.fillText(label, cx + dx, cy + dy)
        }
        ctx.save()
        ctx.shadowColor = `rgba(${PINK},${0.9 * logoA})`
        ctx.shadowBlur = 18
        draw(0, 0, `rgba(${PINK},A)`, 0.7 * logoA)
        ctx.restore()
        if (glitching) {
          draw(-3, 0, `rgba(${CYAN},A)`, 0.7 * logoA)
          draw(3, 0, `rgba(${PINK},A)`, 0.9 * logoA)
          // sliced offsets
          for (let s = 0; s < 3; s++) {
            const y = cy - fs / 2 + Math.random() * fs
            const h = 2 + Math.random() * 6
            ctx.save()
            ctx.beginPath()
            ctx.rect(cx - R, y, R * 2, h)
            ctx.clip()
            draw((Math.random() - 0.5) * 14, 0, `rgba(${WHITE},A)`, logoA)
            ctx.restore()
          }
        }
        ctx.strokeStyle = `rgba(${PINK},${0.9 * logoA})`
        ctx.lineWidth = 1.2
        ctx.strokeText(label, cx, cy)
        draw(0, 0, `rgba(${WHITE},A)`, 0.95 * logoA)
      }

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [label, levelRef, fontFamily])

  return (
    <canvas
      ref={canvasRef}
      className="amy-orb-canvas"
      onClick={onClick}
      role="button"
      aria-label="Amaya — tap to talk"
    />
  )
}
