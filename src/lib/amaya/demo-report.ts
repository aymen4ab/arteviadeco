import type { AmayaBlock, AmayaLang, AmayaSource } from './types'

/**
 * Builds an ILLUSTRATIVE report for any topic. The local brain has no
 * research capability, so every figure here is placeholder data and the
 * HUD labels the report "DEMO". When the Amaya platform brain is wired
 * in, it streams real blocks in exactly this shape.
 */

function hash(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function rng(seed: number) {
  let s = seed || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) % 10000) / 10000
  }
}

export interface DemoReport {
  blocks: AmayaBlock[]
  sources: AmayaSource[]
  notes: string[]
}

export function buildDemoReport(topic: string, lang: AmayaLang): DemoReport {
  const r = rng(hash(topic.toLowerCase()))
  const int = (min: number, max: number) => Math.round(min + r() * (max - min))
  const T = TEXT[lang]
  const t = (s: string) => s.replace(/\{topic\}/g, topic)

  const blocks: AmayaBlock[] = [
    {
      id: 'b1',
      kind: 'text',
      tag: 'OVERVIEW // 01',
      title: t(T.overviewTitle),
      body: t(T.overviewBody),
    },
    {
      id: 'b2',
      kind: 'visual',
      visual: 'globe',
      tag: 'GLOBAL // 02',
      title: T.globeTitle,
      caption: T.illustrative,
      span: { cols: 2 },
    },
    {
      id: 'b3',
      kind: 'stat',
      tag: 'METRIC // 03',
      value: `≈${int(4, 60)}m`,
      label: T.statLabel,
      caption: T.illustrative,
    },
    {
      id: 'b4',
      kind: 'chart',
      chart: 'bar',
      tag: 'SEGMENTS // 04',
      title: T.segmentsTitle,
      series: T.segments.map((label) => ({ label, value: int(10, 95) })),
      unit: '%',
      caption: T.illustrative,
    },
    {
      id: 'b5',
      kind: 'text',
      tag: 'DRIVERS // 05',
      title: T.driversTitle,
      body: t(T.driversBody),
    },
    {
      id: 'b6',
      kind: 'visual',
      visual: 'terrain',
      tag: 'SIGNAL // 06',
      title: T.terrainTitle,
      caption: T.illustrative,
      span: { cols: 2 },
    },
    {
      id: 'b7',
      kind: 'chart',
      chart: 'line',
      tag: 'TREND // 07',
      title: T.trendTitle,
      series: ['2021', '2022', '2023', '2024', '2025', '2026'].map((label, i) => ({
        label,
        value: Math.round(20 + i * int(6, 14) + r() * 10),
      })),
      caption: T.illustrative,
    },
    {
      id: 'b8',
      kind: 'list',
      tag: 'WATCH // 08',
      title: T.watchTitle,
      items: T.watchItems,
    },
    {
      id: 'b9',
      kind: 'chart',
      chart: 'bar',
      tag: 'REGIONS // 09',
      title: T.regionsTitle,
      series: T.regions.map((label) => ({ label, value: int(5, 40) })),
      unit: '%',
      caption: T.illustrative,
    },
    {
      id: 'b10',
      kind: 'visual',
      visual: 'radar',
      tag: 'SCAN // 10',
      title: T.radarTitle,
      caption: T.illustrative,
    },
    {
      id: 'b11',
      kind: 'text',
      tag: 'RISKS // 11',
      title: T.risksTitle,
      body: t(T.risksBody),
    },
    {
      id: 'b12',
      kind: 'stat',
      tag: 'GROWTH // 12',
      value: `+${int(8, 64)}%`,
      label: T.growthLabel,
      caption: T.illustrative,
    },
  ]

  const sources: AmayaSource[] = Array.from({ length: 42 }, (_, i) => ({
    id: `s${i + 1}`,
    title: `${T.sourceTitle} ${String(i + 1).padStart(2, '0')}`,
  }))

  const notes = T.notes.map(t)

  return { blocks, sources, notes }
}

const TEXT = {
  ar: {
    illustrative: 'بيانات توضيحية',
    overviewTitle: 'نظرة عامة: {topic}',
    overviewBody:
      'هذا تقرير تجريبي عن «{topic}». الهيكل والعرض جاهزان بالكامل؛ عند ربط أمايا بعقل المنصة ستمتلئ هذه البطاقات بنتائج بحث حقيقية ومصادر موثّقة.',
    globeTitle: 'الانتشار العالمي',
    statLabel: 'المؤشر الرئيسي',
    segmentsTitle: 'التوزيع حسب الفئة',
    segments: ['الأفراد', 'الشركات', 'التعليم', 'الصحة'],
    driversTitle: 'المحرّكات الأساسية',
    driversBody:
      'هنا تظهر العوامل التي تدفع «{topic}» إلى الأمام: التقنية، الطلب، الاستثمار والتنظيم — مستخرجة ومُلخّصة من المصادر.',
    terrainTitle: 'إشارة السوق',
    trendTitle: 'منحنى النمو',
    watchTitle: 'ما يجب مراقبته',
    watchItems: ['إطلاقات المنتجات القادمة', 'تغيّر الأسعار', 'اللاعبون الجدد', 'القوانين والتنظيم'],
    regionsTitle: 'التوزيع الجغرافي',
    regions: ['أمريكا', 'أوروبا', 'آسيا', 'الشرق الأوسط', 'أفريقيا'],
    radarTitle: 'مسح المنافسين',
    risksTitle: 'المخاطر والأسئلة المفتوحة',
    risksBody:
      'نقاط الضعف، الفجوات في البيانات، والأسئلة التي تحتاج تحقّقاً إضافياً حول «{topic}».',
    growthLabel: 'النمو السنوي',
    sourceTitle: 'مصدر تجريبي',
    notes: [
      'ملاحظة: هذا التقرير مولَّد بالعقل المحلي التجريبي — الأرقام توضيحية.',
      'عند الربط بالمنصة: كل بطاقة ستحمل روابط مصادرها.',
      'الموضوع: {topic}',
    ],
  },
  en: {
    illustrative: 'Illustrative data',
    overviewTitle: 'Overview: {topic}',
    overviewBody:
      'This is a demo report on “{topic}”. Layout and presentation are fully wired; once Amaya is connected to the platform brain these panels fill with real research and cited sources.',
    globeTitle: 'Global footprint',
    statLabel: 'Headline metric',
    segmentsTitle: 'Split by segment',
    segments: ['Consumer', 'Enterprise', 'Education', 'Health'],
    driversTitle: 'Key drivers',
    driversBody:
      'The forces pushing “{topic}” forward — technology, demand, investment and regulation — extracted and summarised from the sources.',
    terrainTitle: 'Market signal',
    trendTitle: 'Growth curve',
    watchTitle: 'What to watch',
    watchItems: ['Upcoming launches', 'Price movement', 'New entrants', 'Regulation'],
    regionsTitle: 'Regional split',
    regions: ['Americas', 'Europe', 'Asia', 'Middle East', 'Africa'],
    radarTitle: 'Competitor scan',
    risksTitle: 'Risks & open questions',
    risksBody: 'Weak spots, data gaps and questions about “{topic}” that need further verification.',
    growthLabel: 'Annual growth',
    sourceTitle: 'Demo source',
    notes: [
      'Note: generated by the local demo brain — figures are illustrative.',
      'Once connected to the platform, every panel carries its source links.',
      'Topic: {topic}',
    ],
  },
} satisfies Record<AmayaLang, unknown>
