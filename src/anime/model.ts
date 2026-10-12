// Data model of the anime sub-site (/anime). Shared by the React app, the local API
// and the CLI, so imports carry explicit .ts extensions (Node runs this file directly).
// One anime = one JSON file at data/anime/<id>.json. Every season is its own record.
import { HttpError } from '../record.ts'

/** The owner's own progress. */
export type WatchStatus = 'watched' | 'watching' | 'planned' | 'dropped'
export const WATCH_STATUSES: WatchStatus[] = ['watched', 'watching', 'planned', 'dropped']

export const WATCH_META: Record<WatchStatus, { label: string; en: string; jp: string; color: string }> = {
  watched: { label: '已看过', en: 'WATCHED', jp: '視聴済み', color: '#ff7eb6' },
  watching: { label: '正在看', en: 'WATCHING', jp: '視聴中', color: '#7cf0c8' },
  planned: { label: '待观看', en: 'PLAN TO WATCH', jp: '見たい', color: '#ffd166' },
  dropped: { label: '已弃坑', en: 'DROPPED', jp: '視聴中止', color: '#8f99c2' },
}

/** Whether the show itself has finished broadcasting. Required on every record. */
export type AirStatus = 'finished' | 'airing' | 'upcoming'
export const AIR_STATUSES: AirStatus[] = ['finished', 'airing', 'upcoming']

export const AIR_META: Record<AirStatus, { label: string; en: string; color: string }> = {
  finished: { label: '已完结', en: 'COMPLETE', color: '#9aa7ff' },
  airing: { label: '连载中', en: 'ON AIR', color: '#ff5f7a' },
  upcoming: { label: '未开播', en: 'COMING SOON', color: '#5fd4ff' },
}

export const FORMATS = ['TV', '剧场版', 'OVA', 'WEB', '特别篇'] as const

/** Genre tags kept from Bangumi; everything else (staff, characters, years) is noise on a card. */
export const ANIME_GENRES = [
  '恋爱', '校园', '日常', '搞笑', '青春', '治愈', '奇幻', '科幻', '战斗', '热血', '冒险', '悬疑', '推理',
  '音乐', '乐队', '偶像', '运动', '异世界', '后宫', '百合', '致郁', '催泪', '剧情', '群像', '机战', '时间旅行', '黑暗',
]

/** Where the story comes from. */
export const SOURCES = ['原创', '漫画改', '轻小说改', '小说改', '游戏改'] as const

export interface Anime {
  id: string
  /** Chinese title (required). */
  title: string
  titleJa?: string
  titleRomaji?: string
  bangumiId?: number | null
  anilistId?: number | null
  /** Franchise name shared by every season, e.g. "间谍过家家". Groups seasons on the detail page. */
  series?: string
  /** Short season label within the series, e.g. "第二季", "剧场版". */
  season?: string
  format: string
  /** 是否完结 */
  air: AirStatus
  /** First broadcast, YYYY-MM */
  airStart?: string
  /** Last broadcast, YYYY-MM */
  airEnd?: string
  episodes?: number | null
  studio?: string
  source?: string
  genres: string[]
  /** Official synopsis (from Bangumi). */
  summary?: string
  /** Bangumi community score, 0-10. */
  bgmScore?: number | null
  cover?: string
  /** Small WebP copy of the cover, generated automatically. */
  thumb?: string
  /** Wide key art (AniList banner). */
  hero?: string
  /** Key colour of the cover art, from AniList. */
  color?: string

  // ---- personal record ----
  status: WatchStatus
  /** Free text for partial watches, e.g. "看到多弗朗明哥之前". */
  progress?: string
  watchedEps?: number | null
  /** YYYY-MM */
  watchedFrom?: string
  /** YYYY-MM */
  watchedTo?: string
  /** 0-100, null = not rated */
  score?: number | null
  oneLiner?: string
  /** Markdown */
  review?: string
  tags: string[]
  /** Fields filled by an agent from indirect evidence; shown as 待确认 until edited. */
  inferred?: string[]
  createdAt: string
  updatedAt: string
}

export interface AnimeDatabase {
  anime: Anime[]
  editable: boolean
}

export function blankAnime(id: string, title: string): Anime {
  const now = new Date().toISOString()
  return { id, title, format: 'TV', air: 'finished', genres: [], status: 'planned', score: null, tags: [], createdAt: now, updatedAt: now }
}

export function normalizeWatch(input: string): WatchStatus | null {
  const s = input.trim()
  for (const k of WATCH_STATUSES) if (k === s.toLowerCase() || WATCH_META[k].label === s) return k
  const alias: Record<string, WatchStatus> = {
    看过: 'watched', 已看: 'watched', 看完: 'watched', 在看: 'watching', 追番: 'watching', 想看: 'planned', 待看: 'planned', 弃坑: 'dropped', 弃: 'dropped',
  }
  return alias[s] ?? null
}

export function normalizeAir(input: string): AirStatus | null {
  const s = input.trim()
  for (const k of AIR_STATUSES) if (k === s.toLowerCase() || AIR_META[k].label === s) return k
  const alias: Record<string, AirStatus> = { 完结: 'finished', 连载: 'airing', 放送中: 'airing', 播出中: 'airing', 未播: 'upcoming', 未开播: 'upcoming' }
  return alias[s] ?? null
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

/** Coerces loosely written records (agents, hand edits, the online editor) into a valid Anime. */
export function normalizeAnime(raw: Partial<Anime> & { id: string; title: string }, prev?: Anime): Anime {
  const base = prev ?? blankAnime(raw.id, raw.title)
  const a: Anime = { ...base, ...raw } as Anime
  const status = normalizeWatch(String(a.status ?? 'planned'))
  if (!status) throw new HttpError(400, `未知观看状态：${a.status}`)
  a.status = status
  const air = normalizeAir(String(a.air ?? 'finished'))
  if (!air) throw new HttpError(400, `未知放送状态：${a.air}`)
  a.air = air
  a.title = String(a.title).trim()
  if (!a.title) throw new HttpError(400, '缺少番剧名 title')
  a.format = String(a.format || 'TV')
  for (const key of ['score', 'bgmScore', 'episodes', 'watchedEps', 'bangumiId', 'anilistId'] as const) {
    const v = a[key] as unknown
    if (v === undefined || v === null || v === '') { a[key] = null; continue }
    const n = Number(v)
    if (!Number.isFinite(n)) throw new HttpError(400, `${key} 必须是数字：${v}`)
    if (key === 'score' && (n < 0 || n > 100)) throw new HttpError(400, `评分需要在 0 到 100 之间：${v}`)
    a[key] = key === 'score' ? Math.max(0, Math.min(100, Math.round(n))) : key === 'bgmScore' ? Math.round(n * 10) / 10 : Math.max(0, Math.round(n))
  }
  for (const key of ['airStart', 'airEnd', 'watchedFrom', 'watchedTo'] as const) {
    const v = a[key]
    if (v === undefined || v === null || v === '') { delete a[key]; continue }
    const m = String(v).match(/^(\d{4})[-/.年]?(\d{1,2})?/)
    if (!m) throw new HttpError(400, `${key} 需要 YYYY-MM 格式：${v}`)
    a[key] = `${m[1]}-${(m[2] ?? '1').padStart(2, '0')}`
    if (!MONTH_RE.test(a[key]!)) throw new HttpError(400, `${key} 月份无效：${v}`)
  }
  for (const key of ['titleJa', 'titleRomaji', 'series', 'season', 'studio', 'source', 'summary', 'progress', 'oneLiner', 'review', 'cover', 'thumb', 'hero', 'color'] as const) {
    if (a[key] === null || a[key] === '') delete a[key]
  }
  a.genres = arr(a.genres)
  a.tags = arr(a.tags)
  if (!a.inferred?.length) delete a.inferred
  a.createdAt = base.createdAt || new Date().toISOString()
  a.updatedAt = new Date().toISOString()
  return a
}

function arr(v: unknown): string[] {
  if (Array.isArray(v)) return [...new Set(v.map(String).map((s) => s.trim()).filter(Boolean))]
  if (typeof v === 'string') return [...new Set(v.split(/[,，、]/).map((s) => s.trim()).filter(Boolean))]
  return []
}

/** Kebab-case id; Chinese-only titles fall back to the Bangumi id or a short hash. */
export function animeSlug(romaji: string | undefined, title: string, bangumiId?: number | null): string {
  const ascii = (romaji ?? '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  if (ascii.length >= 2) return ascii.slice(0, 48).replace(/-+$/, '')
  if (bangumiId) return `bgm-${bangumiId}`
  let h = 0
  for (const ch of title) h = (h * 31 + ch.codePointAt(0)!) >>> 0
  return 'a-' + h.toString(36)
}
