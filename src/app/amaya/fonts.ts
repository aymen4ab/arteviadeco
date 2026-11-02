import { Cairo, JetBrains_Mono, Orbitron } from 'next/font/google'

export const amayaDisplay = Orbitron({
  subsets: ['latin'],
  weight: ['500', '700', '900'],
  variable: '--amy-font-display',
})

export const amayaMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--amy-font-mono',
  preload: false,
})

export const amayaArabic = Cairo({
  subsets: ['arabic', 'latin'],
  variable: '--amy-font-ar',
  preload: false,
})
