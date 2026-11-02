'use client'

import { useEffect, useState } from 'react'
import { sfx } from '@/lib/amaya/sfx'
import { HudPanel, useTypewriter } from './hud-panel'

export interface ResearchState {
  id: string
  topic: string
  startedAt: number
  progress: number
  blocks: number
  sources: number
  status: string
  done: boolean
}

function useElapsed(startedAt: number, running: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running) return
    const iv = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(iv)
  }, [running])
  const s = Math.max(0, Math.floor((now - startedAt) / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

const SEGMENTS = 28

/** The "RESEARCH // ACTIVE" card. Big while working, mini when parked. */
export function ResearchCard({
  research,
  mini,
  visible,
  onPresent,
}: {
  research: ResearchState | null
  mini: boolean
  visible: boolean
  onPresent: () => void
}) {
  const running = !!research && !research.done
  const elapsed = useElapsed(research?.startedAt ?? 0, running)
  const status = useTypewriter((research?.status ?? '').toUpperCase(), { cps: 90, sound: running })
  const filled = Math.round((research?.progress ?? 0) * SEGMENTS)

  if (!research) return null
  return (
    <div className={`amy-research ${mini ? 'is-mini' : ''}`}>
      <HudPanel
        open={visible}
        sound
        tag={
          <>
            {'RESEARCH // '}<b className={research.done ? 'amy-ok' : 'amy-active'}>{research.done ? 'READY' : 'ACTIVE'}</b>
          </>
        }
        right={<span className="amy-mono">{elapsed}</span>}
        footerLeft={research.done ? 'ADDED JUST NOW' : 'AGENT RUNNING'}
        footerRight={`${research.id.slice(-6).toUpperCase()} · ${Math.round(research.progress * 100)}%`}
      >
        <button
          type="button"
          className="amy-research-body"
          disabled={!research.done}
          onClick={() => {
            sfx.click()
            onPresent()
          }}
          title={research.done ? 'Present report' : undefined}
        >
          <div className="amy-research-topic" dir="auto">
            {research.topic}
          </div>
          <div className="amy-research-status" dir="auto">
            {status}
            {running && <span className="amy-caret" />}
          </div>
          <div className="amy-segbar" aria-hidden>
            {Array.from({ length: SEGMENTS }, (_, i) => (
              <i
                key={i}
                className={i < filled ? 'on' : running && i >= filled && i < filled + 3 ? 'scan' : ''}
                style={running && i >= filled ? { animationDelay: `${(i - filled) * 90}ms` } : undefined}
              />
            ))}
          </div>
          <div className="amy-research-counts">
            <span>
              <b>{research.blocks}</b> BLOCKS
            </span>
            <span>
              <b>{research.sources}</b> SOURCES
            </span>
          </div>
        </button>
      </HudPanel>
    </div>
  )
}
