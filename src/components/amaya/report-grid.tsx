'use client'

import { useEffect, useState } from 'react'
import type { AmayaReport } from '@/lib/amaya/types'
import { sfx } from '@/lib/amaya/sfx'
import { BlockPanel } from './blocks'

const STAGGER_MS = 170

/**
 * Lays report blocks on the HUD. On present, blocks materialise one by
 * one (each with its own sound); on clear they fold away in reverse.
 */
export function ReportGrid({ report, presenting }: { report: AmayaReport | null; presenting: boolean }) {
  const total = report?.blocks.length ?? 0
  const [shown, setShown] = useState(0)

  useEffect(() => {
    if (!report) {
      setShown(0)
      return
    }
    let i = shown
    const target = presenting ? total : 0
    if (i === target) return
    const dir = target > i ? 1 : -1
    const iv = window.setInterval(
      () => {
        i += dir
        if (dir > 0) sfx.blockIn(i - 1)
        else sfx.blockOut(i)
        setShown(i)
        if (i === target) window.clearInterval(iv)
      },
      dir > 0 ? STAGGER_MS : 55
    )
    return () => window.clearInterval(iv)
    // `shown` is intentionally read only at the start of each transition
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presenting, total, report?.id])

  if (!report) return null
  return (
    <div className={`amy-report ${presenting ? 'is-presenting' : ''}`}>
      <div className="amy-report-head">
        <span className="amy-report-kicker">REPORT // {report.demo ? 'DEMO' : 'LIVE'}</span>
        <span className="amy-report-title" dir="auto">
          {report.topic}
        </span>
        {report.demo && <span className="amy-demo-badge">DEMO · بيانات توضيحية</span>}
        <span className="amy-report-meta">
          {report.blocks.length} BLOCKS · {report.sources.length} SOURCES · {report.notes.length} NOTES
        </span>
      </div>
      <div className="amy-report-grid">
        {report.blocks.map((b, i) => (
          <BlockPanel key={`${report.id}-${b.id}`} block={b} index={i} open={i < shown} />
        ))}
      </div>
    </div>
  )
}
