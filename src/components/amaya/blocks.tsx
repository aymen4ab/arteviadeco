'use client'

import { useEffect, useState } from 'react'
import type { AmayaBlock, ChartBlock, StatBlock } from '@/lib/amaya/types'
import { HudPanel, useTypewriter } from './hud-panel'
import { VisualCanvas } from './visual-canvas'

function hex(i: number) {
  return `0x${(0x84a0 + i * 37).toString(16).toUpperCase()}`
}

/* ---------------- text ---------------- */

function TextBody({ title, body }: { title: string; body: string }) {
  const typed = useTypewriter(body, { cps: 160, delay: 250 })
  return (
    <div className="amy-b-text" dir="auto">
      <h3 dir="auto">{title}</h3>
      <p dir="auto">
        {typed}
        {typed.length < body.length && <span className="amy-caret" />}
      </p>
    </div>
  )
}

/* ---------------- stat ---------------- */

function StatBody({ block }: { block: StatBlock }) {
  const m = /^(\D*)(\d+(?:\.\d+)?)(.*)$/.exec(block.value)
  const target = m ? parseFloat(m[2]) : 0
  const [v, setV] = useState(0)
  useEffect(() => {
    if (!m) return
    const start = performance.now()
    let raf = 0
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / 1100)
      setV(target * (1 - Math.pow(1 - p, 3)))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.value])
  const decimals = m && m[2].includes('.') ? m[2].split('.')[1].length : 0
  return (
    <div className="amy-b-stat" dir="auto">
      <div className="amy-b-stat-value">
        {m ? `${m[1]}${v.toFixed(decimals)}${m[3]}` : block.value}
      </div>
      <div className="amy-b-stat-label" dir="auto">{block.label}</div>
      {block.caption && <div className="amy-b-caption">{block.caption}</div>}
    </div>
  )
}

/* ---------------- chart ---------------- */

function ChartBody({ block }: { block: ChartBlock }) {
  const [grown, setGrown] = useState(false)
  useEffect(() => {
    const id = window.setTimeout(() => setGrown(true), 120)
    return () => window.clearTimeout(id)
  }, [])
  const max = Math.max(1, ...block.series.map((s) => s.value))
  const W = 300
  const H = 120
  const n = block.series.length
  return (
    <div className="amy-b-chart">
      <h3 dir="auto">{block.title}</h3>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="amy-chart-svg">
        {[0.25, 0.5, 0.75, 1].map((g) => (
          <line key={g} x1="0" x2={W} y1={H - H * g} y2={H - H * g} className="amy-chart-grid" />
        ))}
        {block.chart === 'bar' ? (
          block.series.map((s, i) => {
            const bw = (W / n) * 0.56
            const x = (W / n) * i + (W / n - bw) / 2
            const h = grown ? (s.value / max) * (H - 6) : 0
            return (
              <g key={s.label}>
                <rect
                  x={x}
                  y={H - h}
                  width={bw}
                  height={h}
                  className="amy-chart-bar"
                  style={{ transitionDelay: `${i * 90}ms` }}
                />
              </g>
            )
          })
        ) : (
          <>
            <polyline
              className={`amy-chart-line ${grown ? 'is-drawn' : ''}`}
              points={block.series
                .map((s, i) => `${(W / (n - 1)) * i},${H - (s.value / max) * (H - 8)}`)
                .join(' ')}
            />
            {block.series.map((s, i) => (
              <g key={s.label}>
                <circle
                  cx={(W / (n - 1)) * i}
                  cy={H - (s.value / max) * (H - 8)}
                  r="3"
                  className="amy-chart-dot"
                  vectorEffect="non-scaling-stroke"
                  style={{ animationDelay: `${300 + i * 120}ms` }}
                />
              </g>
            ))}
          </>
        )}
      </svg>
      <div className={`amy-chart-labels ${block.chart === 'line' ? 'is-line' : ''}`}>
        {block.series.map((s) => (
          <span key={s.label} dir="auto">
            {s.label}
          </span>
        ))}
      </div>
      {block.caption && <div className="amy-b-caption">{block.caption}</div>}
    </div>
  )
}

/* ---------------- block switch ---------------- */

export function BlockBody({ block, index }: { block: AmayaBlock; index: number }) {
  switch (block.kind) {
    case 'text':
      return <TextBody title={block.title} body={block.body} />
    case 'stat':
      return <StatBody block={block} />
    case 'chart':
      return <ChartBody block={block} />
    case 'list':
      return (
        <div className="amy-b-text" dir="auto">
          <h3 dir="auto">{block.title}</h3>
          <ul className="amy-b-list">
            {block.items.map((it, i) => (
              <li key={i} dir="auto" style={{ animationDelay: `${250 + i * 110}ms` }}>
                {it}
              </li>
            ))}
          </ul>
        </div>
      )
    case 'image':
      return (
        <figure className="amy-b-media">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={block.src} alt={block.title ?? ''} />
          {(block.title || block.caption) && (
            <figcaption dir="auto">{block.title ?? block.caption}</figcaption>
          )}
        </figure>
      )
    case 'video':
      return (
        <figure className="amy-b-media">
          <video src={block.src} poster={block.poster} autoPlay muted loop playsInline />
          {(block.title || block.caption) && (
            <figcaption dir="auto">{block.title ?? block.caption}</figcaption>
          )}
        </figure>
      )
    case 'visual':
      return (
        <figure className="amy-b-media">
          <VisualCanvas visual={block.visual} seed={index + 1} />
          {(block.title || block.caption) && (
            <figcaption dir="auto">
              {block.title}
              {block.caption && <span className="amy-b-caption"> · {block.caption}</span>}
            </figcaption>
          )}
        </figure>
      )
  }
}

export function BlockPanel({
  block,
  index,
  open,
}: {
  block: AmayaBlock
  index: number
  open: boolean
}) {
  const cols = block.span?.cols ?? 1
  const rows = block.span?.rows ?? 1
  const media = block.kind === 'visual' || block.kind === 'video' || block.kind === 'image'
  return (
    <HudPanel
      open={open}
      className={`amy-block amy-block-${block.kind} ${media ? 'is-media' : ''}`}
      style={{ gridColumn: `span ${cols}`, gridRow: `span ${rows}` }}
      tag={block.tag ?? block.kind.toUpperCase()}
      right={<span className="amy-dim">{String(index + 1).padStart(2, '0')}</span>}
      footerLeft="ADDED JUST NOW"
      footerRight={`${hex(index)} · ${String(index + 1).padStart(2, '0')}.${(index * 7) % 10}`}
    >
      <BlockBody block={block} index={index} />
    </HudPanel>
  )
}
