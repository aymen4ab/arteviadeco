'use client'

import { useEffect, useRef, useState } from 'react'
import { sfx } from '@/lib/amaya/sfx'

/**
 * Keeps a child mounted while its exit animation plays.
 * Returns [mounted, closing].
 */
export function usePresence(open: boolean, exitMs = 320): [boolean, boolean] {
  const [mounted, setMounted] = useState(open)
  const [prevOpen, setPrevOpen] = useState(open)
  // Adjust state during render when `open` flips (no effect round-trip).
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setMounted(true)
  }
  const closing = mounted && !open
  useEffect(() => {
    if (!closing) return
    const id = window.setTimeout(() => setMounted(false), exitMs)
    return () => window.clearTimeout(id)
  }, [closing, exitMs])
  return [mounted, closing]
}

/** Typewriter reveal with optional keyboard ticks. */
export function useTypewriter(text: string, { cps = 70, sound = false, delay = 0 } = {}) {
  const [state, setState] = useState({ text, n: 0 })
  if (state.text !== text) setState({ text, n: 0 })
  useEffect(() => {
    if (!text) return
    let i = 0
    let iv = 0
    const start = window.setTimeout(() => {
      iv = window.setInterval(() => {
        i = Math.min(text.length, i + Math.max(1, Math.round(cps / 60)))
        setState({ text, n: i })
        if (sound && text[i - 1] && text[i - 1] !== ' ') sfx.typeTick()
        if (i >= text.length) window.clearInterval(iv)
      }, 1000 / 60)
    }, delay)
    return () => {
      window.clearTimeout(start)
      window.clearInterval(iv)
    }
  }, [text, cps, sound, delay])
  return state.text === text ? text.slice(0, state.n) : ''
}

interface HudPanelProps {
  open?: boolean
  tag?: React.ReactNode
  right?: React.ReactNode
  footerLeft?: React.ReactNode
  footerRight?: React.ReactNode
  className?: string
  style?: React.CSSProperties
  /** Play window open/close sounds. */
  sound?: boolean
  onClose?: () => void
  children?: React.ReactNode
  delayMs?: number
}

/** A HUD window: bracketed frame, header strip, clip-reveal entrance. */
export function HudPanel({
  open = true,
  tag,
  right,
  footerLeft,
  footerRight,
  className = '',
  style,
  sound = false,
  onClose,
  children,
  delayMs = 0,
}: HudPanelProps) {
  const [mounted, closing] = usePresence(open)
  const wasOpen = useRef(false)

  useEffect(() => {
    if (!sound) return
    if (open && !wasOpen.current) {
      const id = window.setTimeout(() => sfx.windowOpen(), delayMs)
      wasOpen.current = true
      return () => window.clearTimeout(id)
    }
    if (!open && wasOpen.current) {
      sfx.windowClose()
      wasOpen.current = false
    }
  }, [open, sound, delayMs])

  if (!mounted) return null
  return (
    <section
      className={`amy-panel ${closing ? 'is-closing' : ''} ${className}`}
      style={{ ...style, animationDelay: `${delayMs}ms` }}
    >
      <i className="amy-corner tl" />
      <i className="amy-corner tr" />
      <i className="amy-corner bl" />
      <i className="amy-corner br" />
      {(tag || right || onClose) && (
        <header className="amy-panel-head">
          <span className="amy-panel-tag">{tag}</span>
          <span className="amy-panel-right">
            {right}
            {onClose && (
              <button
                type="button"
                className="amy-x"
                aria-label="Close"
                onClick={() => {
                  sfx.click()
                  onClose()
                }}
              >
                ✕
              </button>
            )}
          </span>
        </header>
      )}
      <div className="amy-panel-body">{children}</div>
      {(footerLeft || footerRight) && (
        <footer className="amy-panel-foot">
          <span>{footerLeft}</span>
          <span>{footerRight}</span>
        </footer>
      )}
    </section>
  )
}
