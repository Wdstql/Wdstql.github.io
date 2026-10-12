// File-based storage and local API for the anime sub-site. Mirrors store.ts:
// every record lives in data/anime/<id>.json, media in public/media/anime/<id>/.
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { IncomingMessage } from 'node:http'
import type { Anime } from '../src/anime/model.ts'
import { animeSlug, normalizeAnime } from '../src/anime/model.ts'
import { lookupAnime, searchBangumi } from '../src/anime/sources.ts'
import { download, extFor, HttpError, MEDIA_DIR, ROOT } from './store.ts'

export const ANIME_DIR = path.join(ROOT, 'data', 'anime')
export const ANIME_MEDIA = path.join(MEDIA_DIR, 'anime')
const TRASH_DIR = path.join(ROOT, 'data', '.trash', 'anime')
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

function assertId(id: string) {
  if (!ID_RE.test(id)) throw new HttpError(400, `非法 id：${id}（只允许小写字母、数字和连字符）`)
}

const file = (id: string) => path.join(ANIME_DIR, `${id}.json`)

export async function listAnime(): Promise<Anime[]> {
  await fs.mkdir(ANIME_DIR, { recursive: true })
  const names = (await fs.readdir(ANIME_DIR)).filter((f) => f.endsWith('.json'))
  const all = await Promise.all(names.map(async (f) => {
    try {
      return JSON.parse(await fs.readFile(path.join(ANIME_DIR, f), 'utf8')) as Anime
    } catch (e) {
      console.warn(`[anime] 跳过损坏的文件 ${f}: ${(e as Error).message}`)
      return null
    }
  }))
  return all.filter((a): a is Anime => !!a).map((a) => ({ ...a, genres: a.genres ?? [], tags: a.tags ?? [] }))
}

export async function getAnime(id: string): Promise<Anime> {
  assertId(id)
  try {
    return JSON.parse(await fs.readFile(file(id), 'utf8'))
  } catch {
    throw new HttpError(404, `找不到番剧：${id}`)
  }
}

export async function writeAnime(a: Anime): Promise<Anime> {
  assertId(a.id)
  await fs.mkdir(ANIME_DIR, { recursive: true })
  const tmp = `${file(a.id)}.tmp`
  await fs.writeFile(tmp, JSON.stringify(a, null, 2) + '\n')
  await fs.rename(tmp, file(a.id))
  return a
}

const exists = (id: string) => fs.access(file(id)).then(() => true, () => false)

export async function uniqueAnimeId(seed: string): Promise<string> {
  let id = seed
  for (let i = 2; await exists(id); i++) id = `${seed}-${i}`
  return id
}

/** Downloads remote cover / banner URLs into public/media/anime/<id>/ and refreshes the thumbnail. */
export async function localizeArt(a: Anime, prev?: Anime): Promise<Anime> {
  for (const kind of ['cover', 'hero'] as const) {
    const src = a[kind]
    if (!src || !/^https?:/.test(src)) continue
    const img = await download(src)
    if (!img) { console.warn(`[anime] ${a.id}: 下载${kind === 'cover' ? '封面' : '横幅'}失败，保留远程地址`); continue }
    a[kind] = await saveAnimeMedia(a.id, `${kind}-${Date.now().toString(36)}.${extFor(src, img.type)}`, img.data)
  }
  return withThumb(a, prev)
}

async function saveAnimeMedia(id: string, name: string, data: Uint8Array): Promise<string> {
  assertId(id)
  const dir = path.join(ANIME_MEDIA, id)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, name), data)
  return `/media/anime/${id}/${name}`
}

/** 300×450 WebP copy of the cover for grids (Bangumi covers are ~1000px tall). */
async function withThumb(a: Anime, prev?: Anime): Promise<Anime> {
  if (!a.cover) { delete a.thumb; return a }
  if (!a.cover.startsWith('/media/')) { a.thumb = a.cover; return a }
  if (a.thumb && prev?.cover === a.cover && a.thumb !== a.cover) return a
  try {
    const sharp = (await import('sharp')).default
    const name = `thumb-${Date.now().toString(36)}.webp`
    await sharp(path.join(ROOT, 'public', a.cover)).resize({ width: 300, height: 450, fit: 'cover', withoutEnlargement: true }).webp({ quality: 80 }).toFile(path.join(ANIME_MEDIA, a.id, name))
    if (prev?.thumb?.startsWith(`/media/anime/${a.id}/thumb-`) && prev.thumb !== a.thumb) await fs.rm(path.join(ROOT, 'public', prev.thumb), { force: true })
    a.thumb = `/media/anime/${a.id}/${name}`
  } catch {
    a.thumb = a.cover
  }
  return a
}

/** Creates a record. With a bangumiId, Bangumi + AniList fill every field the input leaves empty. */
export async function createAnime(input: Partial<Anime> & { title?: string }): Promise<Anime> {
  const { anilistReached: _, ...looked } = input.bangumiId ? await lookupAnime(Number(input.bangumiId)) : {}
  const merged = { ...looked, ...stripEmpty(input) } as Partial<Anime> & { title: string }
  merged.title = (merged.title ?? '').trim()
  if (!merged.title) throw new HttpError(400, '缺少番剧名 title')
  const id = input.id ?? await uniqueAnimeId(animeSlug(merged.titleRomaji, merged.title, merged.bangumiId))
  assertId(id)
  if (await exists(id)) throw new HttpError(409, `id 已存在：${id}`)
  return writeAnime(await localizeArt(normalizeAnime({ ...merged, id })))
}

export async function updateAnime(id: string, patch: Partial<Anime>): Promise<Anime> {
  const prev = await getAnime(id)
  return writeAnime(await localizeArt(normalizeAnime({ ...prev, ...patch, id, title: patch.title ?? prev.title }, prev), prev))
}

/** Soft delete into data/.trash/anime, media included. */
export async function deleteAnime(id: string): Promise<void> {
  await getAnime(id)
  await fs.mkdir(TRASH_DIR, { recursive: true })
  const stamp = Date.now()
  await fs.rename(file(id), path.join(TRASH_DIR, `${id}.${stamp}.json`))
  await fs.rename(path.join(ANIME_MEDIA, id), path.join(TRASH_DIR, `${id}.${stamp}.media`)).catch(() => {})
}

export async function setAnimeArt(id: string, kind: 'cover' | 'hero', data: Uint8Array, filename?: string, type?: string): Promise<Anime> {
  await getAnime(id)
  const src = await saveAnimeMedia(id, `${kind}-${Date.now().toString(36)}.${extFor(filename, type)}`, data)
  return updateAnime(id, { [kind]: src })
}

/**
 * Re-reads Bangumi / AniList. Only the broadcast state and the community score follow the source;
 * every other field is filled only when empty, so hand corrections (merged cours, titles) survive.
 */
export async function refreshAnime(id: string): Promise<Anime> {
  const prev = await getAnime(id)
  if (!prev.bangumiId) throw new HttpError(400, '这条记录没有 Bangumi ID')
  const l = await lookupAnime(prev.bangumiId)
  // Without AniList the status is a guess from Bangumi dates, which go stale on long runners.
  const air = l.anilistReached && l.anilistId ? l.air! : prev.air
  const patch: Partial<Anime> = stripEmpty({
    air, bgmScore: l.bgmScore, airStart: prev.airStart ?? l.airStart,
    episodes: prev.air !== 'finished' ? l.episodes ?? prev.episodes : prev.episodes ?? l.episodes,
    airEnd: air === 'finished' ? prev.airEnd ?? l.airEnd : undefined,
    anilistId: prev.anilistId ?? l.anilistId, titleRomaji: prev.titleRomaji ?? l.titleRomaji, studio: prev.studio ?? l.studio,
    summary: prev.summary ?? l.summary, cover: prev.cover ?? l.cover, hero: prev.hero ?? l.hero, color: prev.color ?? l.color,
  })
  if (air !== 'finished') patch.airEnd = undefined
  // Skip the write when nothing moved, so scheduled runs don't commit a new timestamp every week.
  const remoteArt = /^https?:/.test(prev.cover ?? '') || /^https?:/.test(prev.hero ?? '')
  const same = (Object.keys(patch) as (keyof Anime)[]).every((k) => (patch[k] ?? null) === (prev[k] ?? null)) && (prev.airEnd === undefined || air === 'finished')
  if (same && !remoteArt) return prev
  return updateAnime(id, patch)
}

function stripEmpty<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0))) as Partial<T>
}

// ---------- local API: /api/anime/... ----------

type Send = (status: number, body: unknown) => void

export async function animeRoute(parts: string[], method: string, url: URL, req: IncomingMessage, readBody: () => Promise<Buffer>, readJson: <T>() => Promise<T>, send: Send): Promise<boolean> {
  // parts[0] === 'anime'
  const id = parts[1]
  if (id === 'db' && method === 'GET') { send(200, { anime: await listAnime(), editable: true }); return true }
  if (id === 'search' && method === 'GET') { send(200, await searchBangumi(url.searchParams.get('q') ?? '')); return true }
  if (!id && method === 'POST') { send(201, await createAnime(await readJson<Partial<Anime>>())); return true }
  if (!id) return false
  if (parts.length === 2) {
    if (method === 'GET') { send(200, await getAnime(id)); return true }
    if (method === 'PUT' || method === 'PATCH') { send(200, await updateAnime(id, await readJson<Partial<Anime>>())); return true }
    if (method === 'DELETE') { await deleteAnime(id); send(200, { ok: true }); return true }
  }
  if (method === 'POST' && (parts[2] === 'cover' || parts[2] === 'hero')) {
    send(200, await setAnimeArt(id, parts[2], await readBody(), url.searchParams.get('name') ?? undefined, req.headers['content-type']))
    return true
  }
  if (method === 'POST' && parts[2] === 'refresh') { send(200, await refreshAnime(id)); return true }
  return false
}
