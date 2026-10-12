import type { AirStatus, Anime, WatchStatus } from './model'

/** Broadcast quarter, the way anime seasons are named in China / Japan ("2023年4月番"). */
export const QUARTERS = [
  { q: 0, month: 1, name: '冬', jp: '冬アニメ', en: 'WINTER', color: '#8fd3ff' },
  { q: 1, month: 4, name: '春', jp: '春アニメ', en: 'SPRING', color: '#ff9cc8' },
  { q: 2, month: 7, name: '夏', jp: '夏アニメ', en: 'SUMMER', color: '#7cf0c8' },
  { q: 3, month: 10, name: '秋', jp: '秋アニメ', en: 'AUTUMN', color: '#ffb36b' },
] as const

export function quarterOf(month?: string): { year: number; q: number } | null {
  if (!month) return null
  const [y, m] = month.split('-').map(Number)
  return { year: y, q: Math.floor((m - 1) / 3) }
}

export function quarterLabel(month?: string): string {
  const q = quarterOf(month)
  return q ? `${q.year}年${QUARTERS[q.q].month}月番` : ''
}

export const fmtMonth = (m?: string) => (m ? m.replace('-', '.') : '')

export function airRange(a: Anime): string {
  if (!a.airStart) return '未定'
  if (a.air === 'airing') return `${fmtMonth(a.airStart)} — 放送中`
  if (!a.airEnd || a.airEnd === a.airStart) return fmtMonth(a.airStart)
  return `${fmtMonth(a.airStart)} — ${fmtMonth(a.airEnd)}`
}

/** "第二季" / "剧场版" / "" for display next to the title. */
export function seasonTag(a: Anime): string {
  if (a.season) return a.season
  return a.format !== 'TV' ? a.format : ''
}

export interface AnimeFilters {
  q: string
  status: WatchStatus | 'all'
  air: AirStatus[]
  genres: string[]
  formats: string[]
  /** Exact matches set from the statistics panel. */
  source: string
  studio: string
}

export const DEFAULT_FILTERS: AnimeFilters = { q: '', status: 'all', air: [], genres: [], formats: [], source: '', studio: '' }

export function matchQuery(a: Anime, q: string): boolean {
  const s = q.trim().toLowerCase()
  if (!s) return true
  return [a.title, a.titleJa, a.titleRomaji, a.series, a.season, a.studio, a.source, ...a.genres, ...a.tags].some((v) => v?.toLowerCase().includes(s))
}

export function applyFilters(list: Anime[], f: AnimeFilters): Anime[] {
  return list.filter((a) =>
    matchQuery(a, f.q)
    && (f.status === 'all' || a.status === f.status)
    && (!f.air.length || f.air.includes(a.air))
    && (!f.genres.length || f.genres.some((g) => a.genres.includes(g)))
    && (!f.formats.length || f.formats.includes(a.format))
    && (!f.source || (a.source ?? '未知') === f.source)
    && (!f.studio || a.studio === f.studio))
}

export type SortKey = 'air-desc' | 'air-asc' | 'title' | 'score' | 'updated'

export const SORTS: { key: SortKey; label: string }[] = [
  { key: 'air-desc', label: '放送时间 · 新→旧' },
  { key: 'air-asc', label: '放送时间 · 旧→新' },
  { key: 'score', label: '评分 · 高→低' },
  { key: 'title', label: '名称' },
  { key: 'updated', label: '最近更新' },
]

export function sortAnime(list: Anime[], by: SortKey): Anime[] {
  const arr = [...list]
  const air = (a: Anime) => a.airStart ?? '9999'
  switch (by) {
    case 'air-asc': return arr.sort((a, b) => air(a).localeCompare(air(b)) || a.title.localeCompare(b.title, 'zh'))
    case 'title': return arr.sort((a, b) => a.title.localeCompare(b.title, 'zh'))
    case 'score': return arr.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || (b.bgmScore ?? 0) - (a.bgmScore ?? 0))
    case 'updated': return arr.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    default: return arr.sort((a, b) => air(b).localeCompare(air(a)) || a.title.localeCompare(b.title, 'zh'))
  }
}

/** Every season of a's franchise, oldest first (a itself included). */
export function seriesOf(a: Anime, all: Anime[]): Anime[] {
  const key = a.series ?? a.title
  return all.filter((x) => (x.series ?? x.title) === key).sort((x, y) => (x.airStart ?? '').localeCompare(y.airStart ?? ''))
}

export function hash01(s: string, salt = 0): number {
  let h = 2166136261 ^ salt
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return ((h >>> 0) % 100000) / 100000
}

/**
 * UI-safe accent from AniList's cover colour: same hue, but lightness and saturation pulled into a
 * band that reads on the dark page (raw values range from #1a0df1 to #ffd6ae).
 */
export function accentOf(a: Pick<Anime, 'id' | 'color'>): string {
  const hex = a.color?.match(/^#?([0-9a-f]{6})$/i)?.[1]
  if (!hex) return `hsl(${Math.floor(hash01(a.id, 3) * 360)} 80% 70%)`
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0
  if (max !== min) {
    const d = max - min
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  }
  h = Math.round(h * 60 + 360) % 360
  const sat = max === min ? 0 : (max - min) / (1 - Math.abs(max + min - 1))
  return `hsl(${h} ${Math.round(Math.max(0.62, sat) * 100)}% 70%)`
}

/** Minutes per episode used for the rough "time spent" figure (TV episodes are ~24 minutes). */
export function minutesOf(a: Anime): number {
  if (a.format === '剧场版') return 110
  return (a.episodes ?? 0) * 24
}
