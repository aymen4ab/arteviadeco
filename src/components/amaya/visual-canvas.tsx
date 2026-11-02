'use client'

import { useEffect, useRef } from 'react'
import type { VisualKind } from '@/lib/amaya/types'

/**
 * Procedural, animated "footage" for report panels. Stands in for video
 * when the brain sends `kind: 'visual'` (the demo brain always does).
 */
export function VisualCanvas({ visual, seed = 1 }: { visual: VisualKind; seed?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let W = 0
    let H = 0
    let dpr = 1
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      const r = canvas.getBoundingClientRect()
      W = r.width
      H = r.height
      canvas.width = Math.max(1, Math.round(W * dpr))
      canvas.height = Math.max(1, Math.round(H * dpr))
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    let s = seed * 9301 + 49297
    const rand = () => {
      s = (s * 9301 + 49297) % 233280
      return s / 233280
    }

    // pre-generated data per visual
    const nodes = Array.from({ length: 34 }, () => ({
      x: rand(), y: rand(), vx: (rand() - 0.5) * 0.04, vy: (rand() - 0.5) * 0.04,
    }))
    const blips = Array.from({ length: 9 }, () => ({ a: rand() * Math.PI * 2, r: 0.2 + rand() * 0.75 }))
    const cities = Array.from({ length: 26 }, () => ({ lat: (rand() - 0.5) * 2.4, lon: rand() * Math.PI * 2 }))

    let raf = 0
    const start = performance.now()
    const draw = (now: number) => {
      const t = (now - start) / 1000
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = 'rgba(4,10,20,1)'
      ctx.fillRect(0, 0, W, H)

      if (visual === 'globe') {
        const R = Math.min(W, H) * 0.4
        const cx = W / 2
        const cy = H / 2
        const rotY = t * 0.35
        ctx.lineWidth = 1
        // latitude lines
        for (let lat = -75; lat <= 75; lat += 15) {
          const la = (lat * Math.PI) / 180
          ctx.beginPath()
          for (let k = 0; k <= 64; k++) {
            const lo = (k / 64) * Math.PI * 2
            const px = cx + Math.cos(la) * Math.sin(lo + rotY) * R
            const py = cy - Math.sin(la) * R
            if (k === 0) ctx.moveTo(px, py)
            else ctx.lineTo(px, py)
          }
          ctx.strokeStyle = 'rgba(120,220,255,0.18)'
          ctx.stroke()
        }
        // meridians
        for (let m = 0; m < 12; m++) {
          const lo = (m / 12) * Math.PI * 2 + rotY
          ctx.beginPath()
          let started = false
          for (let k = 0; k <= 48; k++) {
            const la = -Math.PI / 2 + (k / 48) * Math.PI
            const x = Math.cos(la) * Math.sin(lo)
            const z = Math.cos(la) * Math.cos(lo)
            const y = Math.sin(la)
            if (z < 0) {
              started = false
              continue
            }
            const px = cx + x * R
            const py = cy - y * R
            if (!started) {
              ctx.moveTo(px, py)
              started = true
            } else ctx.lineTo(px, py)
          }
          ctx.strokeStyle = 'rgba(120,220,255,0.32)'
          ctx.stroke()
        }
        // cities + arcs
        const pts: [number, number, number][] = cities.map((c) => {
          const x = Math.cos(c.lat) * Math.sin(c.lon + rotY)
          const z = Math.cos(c.lat) * Math.cos(c.lon + rotY)
          const y = Math.sin(c.lat)
          return [cx + x * R, cy - y * R, z]
        })
        pts.forEach(([x, y, z], i) => {
          if (z < 0) return
          const pulse = 0.5 + 0.5 * Math.sin(t * 3 + i)
          ctx.fillStyle = `rgba(255,45,117,${0.5 + pulse * 0.5})`
          ctx.beginPath()
          ctx.arc(x, y, 1.6 + pulse * 1.6, 0, Math.PI * 2)
          ctx.fill()
          if (i % 3 === 0) {
            const [x2, y2, z2] = pts[(i + 5) % pts.length]
            if (z2 > 0) {
              ctx.strokeStyle = 'rgba(255,45,117,0.35)'
              ctx.beginPath()
              ctx.moveTo(x, y)
              ctx.quadraticCurveTo((x + x2) / 2, Math.min(y, y2) - R * 0.35, x2, y2)
              ctx.stroke()
            }
          }
        })
        const g = ctx.createRadialGradient(cx, cy, R * 0.8, cx, cy, R * 1.25)
        g.addColorStop(0, 'rgba(120,220,255,0.12)')
        g.addColorStop(1, 'rgba(120,220,255,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(cx, cy, R * 1.25, 0, Math.PI * 2)
        ctx.fill()
      } else if (visual === 'terrain') {
        // synthwave terrain flying towards camera
        const horizon = H * 0.38
        const sun = ctx.createLinearGradient(0, horizon - H * 0.3, 0, horizon)
        sun.addColorStop(0, 'rgba(255,45,117,0.9)')
        sun.addColorStop(1, 'rgba(255,170,60,0.8)')
        ctx.fillStyle = sun
        ctx.beginPath()
        ctx.arc(W / 2, horizon, H * 0.22, Math.PI, 0)
        ctx.fill()
        ctx.fillStyle = 'rgba(4,10,20,1)'
        for (let k = 0; k < 6; k++) ctx.fillRect(0, horizon - H * 0.03 * (k + 1) - k * 2, W, 2 + k * 0.6)
        ctx.fillRect(0, horizon, W, H)
        const rows = 22
        const speed = (t * 0.6) % 1
        const heightAt = (x: number, z: number) => {
          const edge = Math.abs(x - 0.5) * 2
          return (Math.sin(x * 9 + z * 3.1) * 0.5 + Math.sin(x * 23 - z * 5) * 0.25 + 0.75) * edge * edge * 0.6
        }
        for (let r = rows; r >= 0; r--) {
          const zz = (r - speed) / rows
          if (zz <= 0) continue
          const persp = 1 / (zz * 3 + 0.25)
          const y = horizon + (H - horizon) * (persp / 4)
          ctx.beginPath()
          for (let k = 0; k <= 40; k++) {
            const xn = k / 40
            const px = W / 2 + (xn - 0.5) * W * persp * 0.9
            const py = y - heightAt(xn, zz * 4 + t * 0.6) * H * 0.25 * persp
            if (k === 0) ctx.moveTo(px, py)
            else ctx.lineTo(px, py)
          }
          ctx.strokeStyle = `rgba(255,45,117,${Math.min(0.9, 0.15 + persp * 0.25)})`
          ctx.lineWidth = 1
          ctx.stroke()
        }
        for (let k = 0; k <= 16; k++) {
          const xn = k / 16
          ctx.beginPath()
          ctx.moveTo(W / 2 + (xn - 0.5) * W * 0.25, horizon)
          ctx.lineTo(W / 2 + (xn - 0.5) * W * 3.2, H)
          ctx.strokeStyle = 'rgba(120,220,255,0.18)'
          ctx.stroke()
        }
      } else if (visual === 'radar') {
        const cx = W / 2
        const cy = H / 2
        const R = Math.min(W, H) * 0.42
        ctx.strokeStyle = 'rgba(120,220,255,0.3)'
        ctx.lineWidth = 1
        for (let k = 1; k <= 4; k++) {
          ctx.beginPath()
          ctx.arc(cx, cy, (R * k) / 4, 0, Math.PI * 2)
          ctx.stroke()
        }
        ctx.beginPath()
        ctx.moveTo(cx - R, cy)
        ctx.lineTo(cx + R, cy)
        ctx.moveTo(cx, cy - R)
        ctx.lineTo(cx, cy + R)
        ctx.stroke()
        const sweep = (t * 1.4) % (Math.PI * 2)
        for (let k = 0; k < 40; k++) {
          const a = sweep - k * 0.02
          ctx.strokeStyle = `rgba(120,220,255,${0.5 * (1 - k / 40)})`
          ctx.beginPath()
          ctx.moveTo(cx, cy)
          ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R)
          ctx.stroke()
        }
        for (const b of blips) {
          let d = sweep - b.a
          while (d < 0) d += Math.PI * 2
          const fade = Math.max(0, 1 - d / 3)
          ctx.fillStyle = `rgba(255,45,117,${0.2 + fade * 0.8})`
          ctx.beginPath()
          ctx.arc(cx + Math.cos(b.a) * b.r * R, cy + Math.sin(b.a) * b.r * R, 2.5 + fade * 2.5, 0, Math.PI * 2)
          ctx.fill()
        }
      } else {
        // network
        for (const n of nodes) {
          n.x += n.vx * 0.016
          n.y += n.vy * 0.016
          if (n.x < 0 || n.x > 1) n.vx *= -1
          if (n.y < 0 || n.y > 1) n.vy *= -1
        }
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const dx = (nodes[i].x - nodes[j].x) * W
            const dy = (nodes[i].y - nodes[j].y) * H
            const d = Math.hypot(dx, dy)
            if (d < 90) {
              ctx.strokeStyle = `rgba(120,220,255,${0.35 * (1 - d / 90)})`
              ctx.beginPath()
              ctx.moveTo(nodes[i].x * W, nodes[i].y * H)
              ctx.lineTo(nodes[j].x * W, nodes[j].y * H)
              ctx.stroke()
            }
          }
        }
        nodes.forEach((n, i) => {
          ctx.fillStyle = i % 5 === 0 ? 'rgba(255,45,117,0.95)' : 'rgba(235,240,255,0.8)'
          ctx.beginPath()
          ctx.arc(n.x * W, n.y * H, i % 5 === 0 ? 3 : 1.8, 0, Math.PI * 2)
          ctx.fill()
        })
      }

      // scanline + vignette for "footage" feel
      const sy = ((t * 0.25) % 1) * H
      const sg = ctx.createLinearGradient(0, sy - 30, 0, sy)
      sg.addColorStop(0, 'rgba(120,220,255,0)')
      sg.addColorStop(1, 'rgba(120,220,255,0.08)')
      ctx.fillStyle = sg
      ctx.fillRect(0, sy - 30, W, 30)

      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [visual, seed])

  return <canvas ref={ref} className="amy-visual-canvas" />
}
