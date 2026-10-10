// Metadata from Steam and Bilibili. Both endpoints are public and need no key.
import type { Fanwork, Game } from '../src/types.ts'
import { download, HttpError, saveMedia } from './store.ts'

const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh) game-life' }

export interface SteamHit {
  appid: number
  name: string
  logo: string
}

/** Works with Chinese and English terms (the storesearch API only matches English). */
export async function searchSteam(term: string): Promise<SteamHit[]> {
  const url = `https://store.steampowered.com/search/results/?term=${encodeURIComponent(term)}&l=schinese&cc=CN&json=1&category1=998`
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new HttpError(502, `Steam 搜索失败：HTTP ${res.status}`)
  const body = (await res.json()) as { items?: { name: string; logo: string }[] }
  const hits = (body.items ?? []).flatMap((it) => {
    const m = it.logo.match(/\/apps\/(\d+)\//)
    return m ? [{ appid: Number(m[1]), name: it.name, logo: it.logo }] : []
  })
  // Steam ranks by popularity; prefer names that actually match what was typed
  // (e.g. "空洞骑士" should beat "空洞骑士：丝之歌").
  const norm = (x: string) => x.toLowerCase().replace(/[\s™®:：\-—]/g, '')
  const q = norm(term)
  const rank = (n: string) => (norm(n) === q ? 0 : norm(n).startsWith(q) ? 1 + norm(n).length / 1000 : norm(n).includes(q) ? 2 : 3)
  return hits.map((h, i) => ({ h, i })).sort((a, b) => rank(a.h.name) - rank(b.h.name) || a.i - b.i).map((x) => x.h).slice(0, 10)
}

const GENRE_MAP: Record<string, string> = {
  动作: '动作', 'Action': '动作', 角色扮演: '角色扮演', 'RPG': '角色扮演', 策略: '策略', 'Strategy': '策略',
}

interface SteamData {
  name: string
  release_date?: { date?: string }
  developers?: string[]
  genres?: { description: string }[]
  platforms?: Record<string, boolean>
  header_image?: string
}

async function appdetails(appid: number, lang: string): Promise<SteamData | null> {
  const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=${lang}&cc=CN`, { headers: UA, signal: AbortSignal.timeout(15000) })
  if (!res.ok) return null
  const body = (await res.json()) as Record<string, { success: boolean; data?: SteamData }>
  return body[appid]?.success ? body[appid].data ?? null : null
}

function parseRelease(en?: string): string | undefined {
  if (!en) return undefined
  const d = new Date(en.replace(/(\d+)(st|nd|rd|th)/, '$1'))
  if (!Number.isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  const m = en.match(/(\d{4})\D+(\d{1,2})/)
  return m ? `${m[1]}-${m[2].padStart(2, '0')}` : undefined
}

/** Basic info for a Steam app, in the shape of a partial Game. */
export async function steamInfo(appid: number): Promise<Partial<Game>> {
  const [zh, en] = await Promise.all([appdetails(appid, 'schinese'), appdetails(appid, 'english')])
  if (!zh && !en) throw new HttpError(404, `Steam 上找不到 appid ${appid}`)
  const d = (zh ?? en)!
  const clean = (s: string) => s.replace(/[™®]/g, '').replace(/\s*-\s*(GOTY|Game of the Year).*$/i, '').trim()
  return {
    title: clean(d.name),
    titleEn: en ? clean(en.name) : undefined,
    steamAppId: appid,
    release: parseRelease(en?.release_date?.date ?? d.release_date?.date),
    developer: d.developers?.[0],
    genres: [...new Set((d.genres ?? []).map((g) => GENRE_MAP[g.description]).filter(Boolean))],
  }
}

interface SteamAssets { asset_url_format: string; library_capsule?: string; library_capsule_2x?: string; library_hero?: string; header?: string }

/** Asset paths (hashed, localised) from the Store Browse API — the only reliable source for newer apps. */
async function steamAssets(appid: number): Promise<SteamAssets | null> {
  const input = { ids: [{ appid }], context: { language: 'schinese', country_code: 'CN' }, data_request: { include_assets: true } }
  try {
    const res = await fetch(`https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`, { headers: UA, signal: AbortSignal.timeout(15000) })
    const body = (await res.json()) as { response?: { store_items?: { assets?: SteamAssets }[] } }
    return body.response?.store_items?.[0]?.assets ?? null
  } catch {
    return null
  }
}

/** Downloads portrait cover + wide hero art from the Steam CDN into public/media/<id>/. */
export async function fetchSteamArt(id: string, appid: number): Promise<{ cover?: string; hero?: string }> {
  const base = 'https://shared.steamstatic.com/store_item_assets/'
  const assets = await steamAssets(appid)
  const fromAssets = (f?: string) => (assets && f ? [base + assets.asset_url_format.replace('${FILENAME}', f)] : [])
  const legacy = (f: string) => [`${base}steam/apps/${appid}/${f}`, `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/${f}`]
  const candidates = {
    cover: [...fromAssets(assets?.library_capsule_2x), ...fromAssets(assets?.library_capsule), ...legacy('library_600x900_2x.jpg'), ...legacy('library_600x900.jpg')],
    hero: [...fromAssets(assets?.library_hero), ...legacy('library_hero.jpg'), ...fromAssets(assets?.header), ...legacy('header.jpg')],
  }
  const out: { cover?: string; hero?: string } = {}
  for (const kind of ['cover', 'hero'] as const) {
    for (const url of candidates[kind]) {
      const img = await download(url)
      if (img && img.data.byteLength > 2000) {
        out[kind] = await saveMedia(id, '', `${kind}.jpg`, img.data)
        break
      }
    }
  }
  return out
}

// ---------- Bilibili ----------

export function parseBvid(input: string): string | null {
  return input.match(/BV[0-9A-Za-z]{10}/)?.[0] ?? null
}

let cookie: Promise<string> | undefined

/** Anonymous visitor ids (buvid3/buvid4), the same ones a browser gets on its first visit. */
function biliCookie(): Promise<string> {
  cookie ??= fetch('https://api.bilibili.com/x/frontend/finger/spi', { headers: UA, signal: AbortSignal.timeout(10000) })
    .then((r) => r.json() as Promise<{ data?: { b_3?: string; b_4?: string } }>)
    .then(({ data }) => (data?.b_3 ? `buvid3=${data.b_3}; buvid4=${encodeURIComponent(data.b_4 ?? '')}` : ''))
    .catch(() => '')
  return cookie
}

export async function biliInfo(gameId: string, input: string): Promise<Omit<Fanwork, 'id' | 'addedAt'>> {
  const bvid = parseBvid(input)
  if (!bvid) throw new HttpError(400, `没有识别出 BV 号：${input}`)
  const out: Omit<Fanwork, 'id' | 'addedAt'> = { bvid }
  try {
    // Requests without a visitor cookie are often rejected from datacenter IPs (e.g. CI runners).
    const headers = { ...UA, Referer: 'https://www.bilibili.com/', Cookie: await biliCookie() }
    const res = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, { headers, signal: AbortSignal.timeout(15000) })
    const body = (await res.json().catch(() => ({ code: res.status, message: `HTTP ${res.status}` }))) as { code: number; message?: string; data?: { title: string; pic: string; duration: number; owner?: { name: string } } }
    if (body.code === 0 && body.data) {
      out.title = body.data.title
      out.author = body.data.owner?.name
      out.duration = body.data.duration
      // hdslb blocks hotlinking with a foreign Referer, so keep a local copy of the cover.
      const img = await download(body.data.pic.replace(/^http:/, 'https:') + '@640w_400h_1c.jpg', { Referer: 'https://www.bilibili.com/' })
        ?? await download(body.data.pic.replace(/^http:/, 'https:'), { Referer: 'https://www.bilibili.com/' })
      if (img) out.cover = await saveMedia(gameId, 'fanworks', `${bvid}.jpg`, img.data)
    } else {
      console.warn(`[bili] ${bvid}: code ${body.code} ${body.message ?? ''}`)
    }
  } catch (e) {
    // Offline or rate-limited: keep the BV id; the card still embeds the player.
    console.warn(`[bili] ${bvid}: ${(e as Error).message}`)
  }
  return out
}
