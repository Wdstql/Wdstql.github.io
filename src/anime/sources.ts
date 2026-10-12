// Metadata for the anime sub-site. Bangumi (bgm.tv) gives Chinese titles, synopsis, tags,
// studio and covers; AniList gives the wide banner, cover colour and airing status.
// Both APIs allow CORS, so the browser (online edit mode) and Node (CLI, local API)
// share this module. Covers come back as remote URLs; the caller decides whether to
// download them (Node) or leave them for `npm run hydrate` (browser).
import { HttpError } from '../record.ts'
import type { AirStatus, Anime } from './model.ts'
import { ANIME_GENRES } from './model.ts'

const BGM = 'https://api.bgm.tv'
// Bangumi asks API clients to identify themselves. Browsers send their own User-Agent,
// and adding the header there would trigger a CORS preflight that Bangumi rejects.
const HEADERS: Record<string, string> = typeof window === 'undefined' ? { 'User-Agent': 'wdstql/anime-life (https://wdstql.github.io/anime)' } : {}

export interface BgmHit {
  id: number
  name: string
  nameCn: string
  date: string | null
  platform: string
  eps: number
  image?: string
  score?: number
}

async function json<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...init, headers: { ...HEADERS, ...(init.headers as Record<string, string> | undefined) }, signal: AbortSignal.timeout(20000) })
  if (!res.ok) throw new HttpError(502, `${new URL(url).host} 返回 HTTP ${res.status}`)
  return (await res.json()) as T
}

interface BgmSearchItem { id: number; name: string; name_cn: string; date: string | null; platform: string; eps: number; images?: { common?: string; small?: string }; rating?: { score?: number }; score?: number }

export async function searchBangumi(keyword: string): Promise<BgmHit[]> {
  const q = keyword.trim()
  if (!q) return []
  const body = await json<{ data?: BgmSearchItem[] }>(`${BGM}/v0/search/subjects?limit=12`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keyword: q, filter: { type: [2] } }),
  })
  return (body.data ?? []).map((s) => ({
    id: s.id, name: s.name, nameCn: s.name_cn, date: s.date, platform: s.platform, eps: s.eps,
    image: s.images?.common || s.images?.small || undefined, score: s.rating?.score ?? s.score,
  }))
}

interface BgmSubject {
  id: number
  name: string
  name_cn: string
  date: string | null
  platform: string
  eps: number
  total_episodes?: number
  summary: string
  images?: { large?: string }
  rating?: { score?: number }
  tags?: { name: string; count: number }[]
  meta_tags?: string[]
  infobox?: { key: string; value: string | { v: string }[] }[]
}

const FORMAT: Record<string, string> = { TV: 'TV', 剧场版: '剧场版', OVA: 'OVA', OAD: 'OVA', WEB: 'WEB' }

const SOURCE_TAG: Record<string, string> = {
  原创: '原创', 漫画改: '漫画改', 漫改: '漫画改', 轻小说改: '轻小说改', 轻改: '轻小说改', 小说改: '小说改', 游戏改: '游戏改', 游戏: '游戏改',
}

const GENRE_ALIAS: Record<string, string> = { 喜剧: '搞笑', 搞笑: '搞笑', 运动: '运动', 体育: '运动', 爱情: '恋爱', 科幻: '科幻', 魔幻: '奇幻', 机甲: '机战', 穿越: '异世界', 时间循环: '时间旅行' }

function info(s: BgmSubject, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = s.infobox?.find((i) => i.key === k)?.value
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (Array.isArray(v) && v.length) return v.map((x) => x.v).join(' / ')
  }
  return undefined
}

/** "2024年3月22日" / "2024-03-22" → "2024-03" */
function month(v: string | null | undefined): string | undefined {
  const m = v?.match(/(\d{4})\D+(\d{1,2})/)
  return m ? `${m[1]}-${m[2].padStart(2, '0')}` : undefined
}

/** Bangumi editors sometimes append the Japanese original after a "[简介原文]" marker; keep the Chinese part. */
export function cleanSummary(text: string | undefined): string | undefined {
  const t = text?.replace(/\r\n/g, '\n').split(/\n*\s*[[【]?(简介原文|原文简介|官方简介原文)[\]】]?/)[0].replace(/\n{3,}/g, '\n\n').trim()
  return t || undefined
}

const SEASON_RE = /\s*(第[一二三四五六七八九十\d]+季|第[一二三四五六七八九十\d]+期|Season\s*\d+|第\s*\d+\s*部分|第[一二三四五六七八九十\d]+部分|[0-9]+(?:nd|rd|th) Season)\s*$/i

/** Splits "间谍过家家 第二季" into the franchise name and the season label. */
export function splitSeason(nameCn: string): { series: string; season?: string } {
  const m = nameCn.match(SEASON_RE)
  if (!m) return { series: nameCn.trim() }
  return { series: nameCn.slice(0, m.index).trim(), season: m[1].replace(/\s+/g, ' ') }
}

/** Everything Bangumi knows about one subject, as a partial record. Cover is a remote URL. */
export async function bangumiSubject(id: number): Promise<Partial<Anime>> {
  const s = await json<BgmSubject>(`${BGM}/v0/subjects/${id}`)
  const tags = [...(s.meta_tags ?? []), ...(s.tags ?? []).slice(0, 30).map((t) => t.name)]
  const genres: string[] = []
  let source: string | undefined
  for (const t of tags) {
    if (!source && SOURCE_TAG[t]) source = SOURCE_TAG[t]
    const g = GENRE_ALIAS[t] ?? t
    if (ANIME_GENRES.includes(g) && !genres.includes(g)) genres.push(g)
  }
  const nameCn = s.name_cn || s.name
  const { series, season } = splitSeason(nameCn)
  const format = FORMAT[s.platform] ?? (s.platform === 'TV' ? 'TV' : '特别篇')
  const studio = info(s, '动画制作', 'アニメーション制作')?.replace(/[（(].*?[）)]/g, '').split(/[、,，/]/)[0]?.trim()
  return {
    title: nameCn,
    titleJa: s.name !== nameCn ? s.name : undefined,
    bangumiId: s.id,
    series,
    season: season ?? (format === '剧场版' ? '剧场版' : undefined),
    format,
    airStart: month(s.date),
    airEnd: month(info(s, '播放结束', '放送结束')) ?? (format === '剧场版' ? month(s.date) : undefined),
    // `eps` counts main episodes; `total_episodes` also counts specials and recaps.
    episodes: s.eps || s.total_episodes || null,
    studio: studio || undefined,
    source,
    genres: genres.slice(0, 5),
    summary: cleanSummary(s.summary),
    bgmScore: s.rating?.score || null,
    cover: s.images?.large?.replace(/^http:/, 'https:'),
  }
}

interface AniMedia {
  id: number
  title: { romaji?: string; native?: string; english?: string }
  format?: string
  status?: string
  startDate?: { year?: number; month?: number }
  episodes?: number
  bannerImage?: string | null
  coverImage?: { color?: string | null }
  studios?: { nodes?: { name: string }[] }
}

const ANILIST_QUERY = `query ($s: String) { Page(perPage: 12) { media(search: $s, type: ANIME) {
  id title { romaji native english } format status startDate { year month } episodes bannerImage coverImage { color } studios(isMain: true) { nodes { name } } } } }`

/** AniList allows ~30 requests a minute; on 429 wait as told and retry. Throws when AniList stays unreachable. */
async function anilistSearch(s: string): Promise<AniMedia[]> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: ANILIST_QUERY, variables: { s } }), signal: AbortSignal.timeout(20000),
    })
    if (res.status === 429 && attempt < 3) {
      const wait = Math.min(65, Number(res.headers.get('retry-after')) || 30)
      await new Promise((r) => setTimeout(r, wait * 1000))
      continue
    }
    if (!res.ok) throw new HttpError(502, `AniList 返回 HTTP ${res.status}`)
    const body = (await res.json()) as { data?: { Page?: { media?: AniMedia[] } } }
    return body.data?.Page?.media ?? []
  }
}

/**
 * Finds the AniList entry for a Bangumi subject. Seasons share names, so a hit must start in the
 * same month (or, failing that, the same year and format); anything looser is not trusted.
 */
export async function anilistMatch(names: (string | undefined)[], airStart?: string, format?: string): Promise<AniMedia | null> {
  const [y, m] = (airStart ?? '').split('-').map(Number)
  const fmt = format === '剧场版' ? 'MOVIE' : format === 'OVA' ? 'OVA' : format === 'WEB' ? 'ONA' : 'TV'
  for (const s of names) {
    if (!s) continue
    const list = await anilistSearch(s)
    const exact = list.find((x) => x.startDate?.year === y && x.startDate?.month === m && (x.format === fmt || (fmt === 'TV' && x.format === 'TV_SHORT')))
      ?? list.find((x) => x.startDate?.year === y && x.startDate?.month === m)
    if (exact) return exact
    if (!y) continue
    const sameYear = list.filter((x) => x.startDate?.year === y && x.format === fmt)
    if (sameYear.length === 1) return sameYear[0]
  }
  return null
}

const ANILIST_STATUS: Record<string, AirStatus> = { FINISHED: 'finished', RELEASING: 'airing', HIATUS: 'airing', NOT_YET_RELEASED: 'upcoming', CANCELLED: 'finished' }

/** Fallback when AniList has no match: judge by dates alone. */
export function guessAir(a: Pick<Anime, 'airStart' | 'airEnd' | 'format'>, today = new Date()): AirStatus {
  const now = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  if (!a.airStart || a.airStart > now) return 'upcoming'
  if (a.airEnd) return a.airEnd <= now ? 'finished' : 'airing'
  if (a.format === '剧场版' || a.format === 'OVA') return 'finished'
  // A TV show without an end date that started within the last quarter is most likely still on air.
  const [y, m] = a.airStart.split('-').map(Number)
  const months = (today.getFullYear() - y) * 12 + today.getMonth() + 1 - m
  return months <= 3 ? 'airing' : 'finished'
}

/** Bangumi subject + AniList banner / colour / status. Image fields are remote URLs. */
/** `anilistReached` is false when AniList could not be asked, so `air` is only a date-based guess. */
export async function lookupAnime(bangumiId: number): Promise<Partial<Anime> & { anilistReached?: boolean }> {
  const base = await bangumiSubject(bangumiId)
  // AniList's search often misses season-suffixed native titles ("進撃の巨人 Season 2"); the bare
  // franchise name returns every season, and the start month then picks the right one.
  const bare = base.titleJa?.replace(/^劇場版\s*/, '').replace(/[\s\-－]*(Season\s*\d+.*|第\s*\d+\s*期.*|\d+(nd|rd|th) Season.*|[-－～~].*[-－～~]\s*(映画)?|\s映画)$/i, '').trim()
  let ani: AniMedia | null = null
  let reached = true
  try {
    ani = await anilistMatch([base.titleJa, bare !== base.titleJa ? bare : undefined, base.title], base.airStart, base.format)
  } catch {
    reached = false
  }
  const out: Partial<Anime> & { anilistReached?: boolean } = { ...base, anilistReached: reached }
  if (ani) {
    out.anilistId = ani.id
    out.titleRomaji = ani.title.romaji
    if (ani.bannerImage) out.hero = ani.bannerImage
    if (ani.coverImage?.color) out.color = ani.coverImage.color
    if (ani.status && ANILIST_STATUS[ani.status]) out.air = ANILIST_STATUS[ani.status]
    if (!out.episodes && ani.episodes) out.episodes = ani.episodes
    if (!out.studio && ani.studios?.nodes?.length) out.studio = ani.studios.nodes.map((n) => n.name).join(' × ')
  }
  out.air ??= guessAir(out as Anime)
  // Long runners carry a stale end date on Bangumi (e.g. a broadcast break); an airing show has none yet.
  if (out.air !== 'finished') delete out.airEnd
  return out
}
