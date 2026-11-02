'use client'

import { useEffect, useRef } from 'react'
import type { AmayaLang } from '@/lib/amaya/types'
import { sfx } from '@/lib/amaya/sfx'

function HudButton({
  active,
  onClick,
  children,
  title,
}: {
  active?: boolean
  onClick: () => void
  children: React.ReactNode
  title?: string
}) {
  return (
    <button
      type="button"
      title={title}
      className={`amy-btn ${active ? 'is-active' : ''}`}
      onMouseEnter={() => sfx.hover()}
      onClick={() => {
        sfx.click()
        onClick()
      }}
    >
      {children}
    </button>
  )
}

export function TopBar(props: {
  brainMode: 'local' | 'remote' | 'offline' | 'checking'
  lang: AmayaLang
  sfxOn: boolean
  windows: { history: boolean; text: boolean; camera: boolean; sources: boolean }
  hasReport: boolean
  cameras: MediaDeviceInfo[]
  cameraId: string
  onToggle: (w: 'history' | 'text' | 'camera' | 'sources') => void
  onClear: () => void
  onLang: () => void
  onSfx: () => void
  onCamera: (id: string) => void
}) {
  const brainLabel =
    props.brainMode === 'remote'
      ? 'AMAYA PLATFORM'
      : props.brainMode === 'local'
        ? 'LOCAL · DEMO'
        : props.brainMode === 'checking'
          ? 'LINKING…'
          : 'OFFLINE'
  return (
    <div className="amy-topbar">
      <div className="amy-brand">
        <span className="amy-brand-dot" />
        AMAYA <span className="amy-dim">{'// HUD v0.1'}</span>
        <span className={`amy-brain amy-brain-${props.brainMode}`}>BRAIN: {brainLabel}</span>
      </div>
      <nav className="amy-topnav">
        <HudButton active={props.windows.history} onClick={() => props.onToggle('history')} title="H">
          HISTORY
        </HudButton>
        <HudButton active={props.windows.text} onClick={() => props.onToggle('text')} title="T">
          TEXT
        </HudButton>
        {props.hasReport && (
          <HudButton active={props.windows.sources} onClick={() => props.onToggle('sources')}>
            SOURCES
          </HudButton>
        )}
        <HudButton onClick={props.onClear} title="C">
          CLEAR VIEW
        </HudButton>
        <HudButton active={props.windows.camera} onClick={() => props.onToggle('camera')}>
          CAMERA
        </HudButton>
        <label className="amy-select">
          <span>CAMERA SOURCE</span>
          <select
            value={props.cameraId}
            onChange={(e) => {
              sfx.click()
              props.onCamera(e.target.value)
            }}
          >
            <option value="">DEFAULT CAMERA</option>
            {props.cameras.map((c, i) => (
              <option key={c.deviceId || i} value={c.deviceId}>
                {(c.label || `CAMERA ${i + 1}`).toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <HudButton onClick={props.onLang} title="Language">
          {props.lang === 'ar' ? 'AR · عربي' : 'EN'}
        </HudButton>
        <HudButton active={props.sfxOn} onClick={props.onSfx} title="Sound effects">
          SFX {props.sfxOn ? 'ON' : 'OFF'}
        </HudButton>
      </nav>
    </div>
  )
}

export function BottomBar(props: {
  readMeter: () => { db: number; peakDb: number; level: number }
  muted: boolean
  onMute: () => void
  transcript: { text: string; final: boolean }
  statusText: string
  armed: boolean
  speechSupported: boolean
}) {
  const fillRef = useRef<HTMLDivElement>(null)
  const peakRef = useRef<HTMLDivElement>(null)
  const lvlRef = useRef<HTMLSpanElement>(null)
  const pkRef = useRef<HTMLSpanElement>(null)
  const readRef = useRef(props.readMeter)
  useEffect(() => {
    readRef.current = props.readMeter
  }, [props.readMeter])

  useEffect(() => {
    let raf = 0
    let frame = 0
    const loop = () => {
      const m = readRef.current()
      const pct = Math.max(0, Math.min(100, ((m.db + 60) / 60) * 100))
      const ppct = Math.max(0, Math.min(100, ((m.peakDb + 60) / 60) * 100))
      if (fillRef.current) fillRef.current.style.width = `${pct}%`
      if (peakRef.current) peakRef.current.style.left = `${ppct}%`
      if (frame++ % 6 === 0) {
        if (lvlRef.current) lvlRef.current.textContent = m.db.toFixed(1).padStart(5, ' ')
        if (pkRef.current) pkRef.current.textContent = m.peakDb.toFixed(1).padStart(5, ' ')
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="amy-bottombar">
      <div className="amy-meter-group">
        <span className="amy-mic">MIC</span>
        <div className={`amy-meter ${props.muted ? 'is-muted' : ''}`}>
          <div ref={fillRef} className="amy-meter-fill" />
          <div ref={peakRef} className="amy-meter-peak" />
        </div>
        <span className="amy-mono amy-dim">
          LVL <span ref={lvlRef}>-90.0</span> dB
        </span>
        <span className="amy-mono amy-dim">
          PK <span ref={pkRef}>-90.0</span> dB
        </span>
        <button
          type="button"
          className={`amy-btn ${props.muted ? 'is-danger' : ''}`}
          onClick={() => {
            props.onMute()
          }}
          title="M"
        >
          {props.muted ? 'UNMUTE' : 'MUTE'}
        </button>
      </div>
      <div className={`amy-transcript ${props.transcript.final ? 'is-final' : ''} ${props.armed ? 'is-armed' : ''}`} dir="auto">
        {props.transcript.text ||
          (props.speechSupported ? '' : 'SPEECH INPUT NOT SUPPORTED IN THIS BROWSER — USE TEXT (T)')}
      </div>
      <div className="amy-status" dir="auto">
        {props.statusText}
      </div>
    </div>
  )
}
