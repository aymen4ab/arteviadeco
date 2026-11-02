'use client'

import { useEffect, useRef, useState } from 'react'
import type { AmayaReport, AmayaTurn } from '@/lib/amaya/types'
import { sfx } from '@/lib/amaya/sfx'
import { HudPanel } from './hud-panel'

const fmtTime = (at: number) =>
  new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

/* ---------------- history ---------------- */

export function HistoryWindow({
  open,
  history,
  onClose,
}: {
  open: boolean
  history: AmayaTurn[]
  onClose: () => void
}) {
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [history.length, open])
  return (
    <HudPanel open={open} sound className="amy-win amy-win-history" tag="LOG // HISTORY" onClose={onClose}
      footerLeft={`${history.length} ENTRIES`} footerRight="SESSION">
      <div className="amy-history" ref={listRef}>
        {history.length === 0 && <div className="amy-dim">— EMPTY —</div>}
        {history.map((t, i) => (
          <div key={i} className={`amy-turn ${t.role}`}>
            <span className="amy-turn-who">{t.role === 'user' ? 'YOU' : 'AMAYA'}</span>
            <span className="amy-turn-time">{fmtTime(t.at)}</span>
            <p dir="auto">{t.text}</p>
          </div>
        ))}
      </div>
    </HudPanel>
  )
}

/* ---------------- text input ---------------- */

export function TextWindow({
  open,
  onSend,
  onClose,
  placeholder,
}: {
  open: boolean
  onSend: (text: string) => void
  onClose: () => void
  placeholder: string
}) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 250)
  }, [open])
  return (
    <HudPanel open={open} sound className="amy-win amy-win-text" tag="INPUT // TEXT" onClose={onClose}
      footerLeft="ENTER TO SEND" footerRight="ESC TO CLOSE">
      <form
        className="amy-textform"
        onSubmit={(e) => {
          e.preventDefault()
          const v = value.trim()
          if (!v) return
          sfx.click()
          onSend(v)
          setValue('')
        }}
      >
        <span className="amy-prompt">›</span>
        <input
          ref={inputRef}
          dir="auto"
          value={value}
          placeholder={placeholder}
          onChange={(e) => {
            setValue(e.target.value)
            sfx.typeTick()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose()
          }}
        />
        <button type="submit" className="amy-btn">SEND</button>
      </form>
    </HudPanel>
  )
}

/* ---------------- camera ---------------- */

export function CameraWindow({
  open,
  deviceId,
  onClose,
  onDevices,
}: {
  open: boolean
  deviceId: string
  onClose: () => void
  onDevices: (d: MediaDeviceInfo[]) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [stamp, setStamp] = useState('')

  useEffect(() => {
    if (!open) return
    let stream: MediaStream | null = null
    let cancelled = false
    sfx.camera()
    navigator.mediaDevices
      ?.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' },
        audio: false,
      })
      .then(async (s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream = s
        setError(null)
        if (videoRef.current) videoRef.current.srcObject = s
        const devices = await navigator.mediaDevices.enumerateDevices()
        onDevices(devices.filter((d) => d.kind === 'videoinput'))
      })
      .catch(() => setError('CAMERA UNAVAILABLE'))
    const iv = window.setInterval(() => setStamp(new Date().toISOString().slice(11, 22)), 100)
    return () => {
      cancelled = true
      window.clearInterval(iv)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [open, deviceId, onDevices])

  return (
    <HudPanel open={open} sound className="amy-win amy-win-camera" tag="OPTICAL // LIVE"
      right={<span className="amy-rec">● REC</span>} onClose={onClose}
      footerLeft={stamp} footerRight="FEED 01">
      <div className="amy-cam">
        <video ref={videoRef} autoPlay playsInline muted />
        <div className="amy-cam-overlay" aria-hidden>
          <i className="amy-cam-scan" />
          <i className="amy-cam-reticle" />
        </div>
        {error && <div className="amy-cam-error">{error}</div>}
      </div>
    </HudPanel>
  )
}

/* ---------------- sources + notes ---------------- */

export function SourcesWindow({
  open,
  report,
  onClose,
}: {
  open: boolean
  report: AmayaReport | null
  onClose: () => void
}) {
  return (
    <HudPanel open={open} sound className="amy-win amy-win-sources" tag="SOURCES // NOTES" onClose={onClose}
      footerLeft={`${report?.sources.length ?? 0} SOURCES`} footerRight={`${report?.notes.length ?? 0} NOTES`}>
      <div className="amy-sources">
        {report?.notes.map((n, i) => (
          <div key={`n${i}`} className="amy-note" dir="auto">
            {n}
          </div>
        ))}
        <ol>
          {report?.sources.map((s) => (
            <li key={s.id} dir="auto">
              {s.url ? (
                <a href={s.url} target="_blank" rel="noreferrer noopener">
                  {s.title}
                </a>
              ) : (
                s.title
              )}
            </li>
          ))}
        </ol>
      </div>
    </HudPanel>
  )
}
