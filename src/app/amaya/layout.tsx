import type { Metadata, Viewport } from 'next'
import { amayaArabic, amayaDisplay, amayaMono } from './fonts'
import './amaya.css'

export const metadata: Metadata = {
  title: 'Amaya',
  description: 'Amaya — voice assistant HUD',
}

export const viewport: Viewport = {
  themeColor: '#03060c',
  colorScheme: 'dark',
}

export default function AmayaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${amayaDisplay.variable} ${amayaMono.variable} ${amayaArabic.variable}`}>
      {children}
    </div>
  )
}
