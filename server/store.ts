// File-based storage. Every game lives in data/games/<id>.json so humans and
// agents can edit records with any text editor; media lives in public/media/<id>/.
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Award, Fanwork, Game, Moment } from '../src/types.ts'
import { slugify } from '../src/types.ts'
import { HttpError, normalizeGame } from '../src/record.ts'

export { HttpError, normalizeGame }

export const ROOT = path.resolve(import.meta.dirname, '..')
export const GAMES_DIR = path.join(ROOT, 'data', 'games')
export const AWARDS_FILE = path.join(ROOT, 'data', 'awards.json')
export const MEDIA_DIR = path.join(ROOT, 'public', 'media')
const TRASH_DIR = path.join(ROOT, 'data', '.trash')

function now(): string {
  return new Date().toISOString()
}

const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

export function assertId(id: string): void {
  if (!ID_RE.test(id)) throw new HttpError(400, `非法 id：${id}（只允许小写字母、数字和连字符）`)
}

export async function listGames(): Promise<Game[]> {
  await fs.mkdir(GAMES_DIR, { recursive: true })
  const files = (await fs.readdir(GAMES_DIR)).filter((f) => f.endsWith('.json'))
  const games = await Promise.all(files.map(async (f) => {
    try {
      return JSON.parse(await fs.readFile(path.join(GAMES_DIR, f), 'utf8')) as Partial<Game> as Game
    } catch (e) {
      console.warn(`[game-life] 跳过损坏的文件 ${f}: ${(e as Error).message}`)
      return null
    }
  }))
  return games.filter((g): g is Game => !!g).map((g) => ({
    ...g, moments: g.moments ?? [], fanworks: g.fanworks ?? [], tags: g.tags ?? [], genres: g.genres ?? [], platforms: g.platforms ?? [],
  }))
}

export async function getGame(id: string): Promise<Game> {
  assertId(id)
  try {
    return JSON.parse(await fs.readFile(path.join(GAMES_DIR, `${id}.json`), 'utf8'))
  } catch {
    throw new HttpError(404, `找不到游戏：${id}`)
  }
}

export async function writeGame(g: Game): Promise<Game> {
  assertId(g.id)
  await fs.mkdir(GAMES_DIR, { recursive: true })
  const file = path.join(GAMES_DIR, `${g.id}.json`)
  const tmp = `${file}.tmp`
  await fs.writeFile(tmp, JSON.stringify(g, null, 2) + '\n')
  await fs.rename(tmp, file)
  return g
}

export async function exists(id: string): Promise<boolean> {
  return fs.access(path.join(GAMES_DIR, `${id}.json`)).then(() => true, () => false)
}

export async function uniqueId(seed: string): Promise<string> {
  const base = slugify(seed)
  let id = base
  for (let i = 2; await exists(id); i++) id = `${base}-${i}`
  return id
}

export async function createGame(input: Partial<Game> & { title: string }): Promise<Game> {
  if (!input.title?.trim()) throw new HttpError(400, '缺少游戏名 title')
  const id = input.id ? input.id : await uniqueId(input.titleEn || input.title)
  assertId(id)
  if (await exists(id)) throw new HttpError(409, `id 已存在：${id}`)
  return writeGame(await withThumb(normalizeGame({ ...input, id, title: input.title.trim() })))
}

export async function updateGame(id: string, patch: Partial<Game>): Promise<Game> {
  const prev = await getGame(id)
  return writeGame(await withThumb(normalizeGame({ ...prev, ...patch, id, title: patch.title ?? prev.title }, prev), prev))
}

/** Keeps a small WebP copy of the cover for grids and the star map (originals are ~1200px tall). */
export async function withThumb(g: Game, prev?: Game): Promise<Game> {
  if (!g.cover) { delete g.thumb; return g }
  if (!g.cover.startsWith('/media/')) { g.thumb = g.cover; return g }
  if (g.thumb && prev?.cover === g.cover && g.thumb !== g.cover) return g
  try {
    const sharp = (await import('sharp')).default
    const src = path.join(ROOT, 'public', g.cover)
    const name = `thumb-${Date.now().toString(36)}.webp`
    const out = path.join(MEDIA_DIR, g.id, name)
    await sharp(src).resize({ width: 300, height: 450, fit: 'cover', withoutEnlargement: true }).webp({ quality: 78 }).toFile(out)
    if (prev?.thumb?.startsWith(`/media/${g.id}/thumb-`)) await fs.rm(path.join(ROOT, 'public', prev.thumb), { force: true })
    g.thumb = `/media/${g.id}/${name}`
  } catch {
    g.thumb = g.cover
  }
  return g
}

/** Soft delete: moves the JSON into data/.trash so nothing is lost by accident. */
export async function deleteGame(id: string): Promise<void> {
  assertId(id)
  await fs.mkdir(TRASH_DIR, { recursive: true })
  const stamp = Date.now()
  await fs.rename(path.join(GAMES_DIR, `${id}.json`), path.join(TRASH_DIR, `${id}.${stamp}.json`))
  // Keep media alongside the record so a restore is a simple move back.
  await fs.rename(path.join(MEDIA_DIR, id), path.join(TRASH_DIR, `${id}.${stamp}.media`)).catch(() => {})
}

export async function readAwards(): Promise<Award[]> {
  try {
    return JSON.parse(await fs.readFile(AWARDS_FILE, 'utf8'))
  } catch {
    return []
  }
}

export async function writeAwards(awards: Award[]): Promise<Award[]> {
  await fs.writeFile(AWARDS_FILE, JSON.stringify(awards, null, 2) + '\n')
  return awards
}

// ---------- media ----------

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif',
}

export function extFor(filename: string | undefined, contentType: string | undefined): string {
  const fromName = filename?.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase()
  if (fromName && ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'].includes(fromName)) return fromName === 'jpeg' ? 'jpg' : fromName
  return EXT_BY_TYPE[contentType?.split(';')[0] ?? ''] ?? 'jpg'
}

/** Saves bytes to public/media/<id>/<sub>/<name> and returns the public URL path. */
export async function saveMedia(id: string, sub: string, name: string, data: Uint8Array): Promise<string> {
  assertId(id)
  const dir = path.join(MEDIA_DIR, id, sub)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, name), data)
  return `/media/${id}/${sub ? sub + '/' : ''}${name}`.replace(/\/+/g, '/')
}

export async function download(url: string, headers: Record<string, string> = {}): Promise<{ data: Uint8Array; type: string } | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 game-life', ...headers }, redirect: 'follow', signal: AbortSignal.timeout(20000) })
    if (!res.ok) return null
    const type = res.headers.get('content-type') ?? ''
    if (!type.startsWith('image/')) return null
    return { data: new Uint8Array(await res.arrayBuffer()), type }
  } catch {
    return null
  }
}

export async function addMoment(id: string, data: Uint8Array, filename?: string, contentType?: string, caption?: string): Promise<Game> {
  const g = await getGame(id)
  const mid = randomUUID().slice(0, 8)
  const src = await saveMedia(id, 'moments', `${Date.now()}-${mid}.${extFor(filename, contentType)}`, data)
  const m: Moment = { id: mid, src, caption, addedAt: now() }
  return updateGame(id, { moments: [...g.moments, m] })
}

export async function setCoverFromBytes(id: string, kind: 'cover' | 'hero', data: Uint8Array, filename?: string, contentType?: string): Promise<Game> {
  const src = await saveMedia(id, '', `${kind}-${Date.now().toString(36)}.${extFor(filename, contentType)}`, data)
  return updateGame(id, { [kind]: src })
}

export async function addFanwork(id: string, fw: Omit<Fanwork, 'id' | 'addedAt'>): Promise<Game> {
  const g = await getGame(id)
  if (g.fanworks.some((f) => f.bvid === fw.bvid)) throw new HttpError(409, `${fw.bvid} 已经在二创列表里`)
  const f: Fanwork = { ...fw, id: randomUUID().slice(0, 8), addedAt: now() }
  return updateGame(id, { fanworks: [...g.fanworks, f] })
}
