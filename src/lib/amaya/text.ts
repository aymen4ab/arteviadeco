import type { AmayaLang } from './types'

const ARABIC_CHARS = /[؀-ۿ]/

export function detectLang(text: string, fallback: AmayaLang): AmayaLang {
  if (ARABIC_CHARS.test(text)) return 'ar'
  if (/[a-z]/i.test(text)) return 'en'
  return fallback
}

/**
 * Normalises Arabic + Latin text for intent matching: lowercases,
 * strips tashkeel/tatweel, unifies alef/ya/ta-marbuta variants and
 * collapses punctuation + whitespace.
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ً-ْٰـ]/g, '') // tashkeel + tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[.,!?؟،؛;:"'«»()\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Wake-word variants, already normalised. Speech engines spell the
 * name in many ways ("amaia", "a maya", "امايه"…), so we match loosely.
 */
const WAKE_SINGLE = new Set([
  'amaya',
  'amaia',
  'amaiya',
  'amaya’s',
  "amaya's",
  'amayah',
  'امايا',
  'امايه',
  'اميا',
  'يامايا',
  'لامايا',
])
const WAKE_PAIRS = new Set(['a maya', 'ah maya', 'uh maya', 'ا مايا', 'ا مايه'])

/**
 * Looks for the wake word. Returns `null` if absent, otherwise the
 * remainder of the original utterance after it (possibly empty), with
 * the user's own spelling preserved.
 */
export function extractWake(text: string): string | null {
  const tokens = text.trim().split(/\s+/)
  const norm = tokens.map((t) => normalize(t))
  for (let i = 0; i < tokens.length; i++) {
    let end = -1
    if (WAKE_SINGLE.has(norm[i])) end = i
    else if (i + 1 < tokens.length && WAKE_PAIRS.has(`${norm[i]} ${norm[i + 1]}`)) end = i + 1
    if (end >= 0) {
      return tokens
        .slice(end + 1)
        .join(' ')
        .replace(/^[\s,،.!?؟:;-]+/, '')
        .trim()
    }
  }
  return null
}
