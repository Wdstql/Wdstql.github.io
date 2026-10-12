// Write paths for the anime sub-site: the local /api/anime (dev / preview) and online edit
// mode (commits to GitHub, same edit key as the game site). Both expose the same shape.
import type { Anime } from './model.ts'
import { animeSlug, normalizeAnime } from './model.ts'
import { lookupAnime } from './sources.ts'
import { HttpError } from '../record.ts'
import { commit, extFor, gh, makeThumb, readFile, type FileChange } from '../lib/github.ts'
import type { Remote } from '../lib/editKey.ts'

export interface AnimeApi {
  create: (input: Partial<Anime>) => Promise<Anime>
  update: (id: string, patch: Partial<Anime>) => Promise<Anime>
  remove: (id: string) => Promise<{ ok: true }>
  uploadArt: (id: string, kind: 'cover' | 'hero', file: File) => Promise<Anime>
  refresh: (id: string) => Promise<Anime>
}

async function request<T>(method: string, url: string, body?: Blob | object, headers: Record<string, string> = {}): Promise<T> {
  const raw = body instanceof Blob
  const res = await fetch(url, {
    method,
    headers: raw ? headers : { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
  return data as T
}

export const localApi: AnimeApi = {
  create: (input) => request('POST', '/api/anime', input),
  update: (id, patch) => request('PUT', `/api/anime/${id}`, patch),
  remove: (id) => request('DELETE', `/api/anime/${id}`),
  uploadArt: (id, kind, file) => request('POST', `/api/anime/${id}/${kind}?name=${encodeURIComponent(file.name)}`, file, { 'Content-Type': file.type || 'application/octet-stream' }),
  refresh: (id) => request('POST', `/api/anime/${id}/refresh`),
}

const animeFile = (a: Anime): FileChange => ({ path: `data/anime/${a.id}.json`, content: JSON.stringify(a, null, 2) + '\n' })

/** Remote art (Bangumi / AniList URLs) is downloaded by `npm run hydrate` in the deploy workflow. */
function keepThumb(a: Anime): Anime {
  if (!a.cover) delete a.thumb
  else if (!a.cover.startsWith('/media/')) a.thumb = a.cover
  return a
}

async function readAnime(r: Remote, id: string): Promise<Anime> {
  const text = await readFile(r, `data/anime/${id}.json`)
  if (text === null) throw new HttpError(404, `找不到番剧：${id}`)
  return JSON.parse(text) as Anime
}

export function githubAnimeApi(r: Remote, onWrite: (changed: Anime[], removed: string[]) => void): AnimeApi {
  const edit = async (id: string, message: string, change: (prev: Anime) => Promise<{ patch: Partial<Anime>; files?: FileChange[] }>) => {
    let out!: Anime
    await commit(r, message, async () => {
      const prev = await readAnime(r, id)
      const { patch, files = [] } = await change(prev)
      out = keepThumb(normalizeAnime({ ...prev, ...patch, id, title: patch.title ?? prev.title }, prev))
      return [...files, animeFile(out)]
    })
    onWrite([out], [])
    return out
  }

  return {
    async create(input) {
      // Bangumi and AniList both allow CORS, so the browser fills the record itself.
      const { anilistReached: _, ...looked } = input.bangumiId ? await lookupAnime(Number(input.bangumiId)) : {}
      const merged = { ...looked, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined && v !== '')) } as Partial<Anime>
      const title = merged.title?.trim()
      if (!title) throw new HttpError(400, '缺少番剧名 title')
      let out!: Anime
      await commit(r, `anime add: ${title}`, async () => {
        const base = animeSlug(merged.titleRomaji, title, merged.bangumiId)
        let id = base
        for (let i = 2; (await readFile(r, `data/anime/${id}.json`)) !== null; i++) id = `${base}-${i}`
        out = keepThumb(normalizeAnime({ ...merged, id, title }))
        return [animeFile(out)]
      })
      onWrite([out], [])
      return out
    },

    update: (id, patch) => edit(id, `anime edit: ${id}`, async () => ({ patch })),

    async remove(id) {
      await commit(r, `anime remove: ${id}`, async () => {
        // The media folder is flat, so one directory listing finds every file (a recursive tree of the
        // whole repo could come back truncated).
        const dir = await gh<{ path: string; type: string }[]>(r, 'GET', `/contents/public/media/anime/${id}?ref=${r.branch}`).catch(() => [])
        const media = dir.filter((t) => t.type === 'file').map((t) => ({ path: t.path, delete: true as const }))
        return [{ path: `data/anime/${id}.json`, delete: true as const }, ...media]
      })
      onWrite([], [id])
      return { ok: true as const }
    },

    async uploadArt(id, kind, file) {
      const stamp = Date.now().toString(36)
      const rel = (name: string) => `anime/${id}/${name}`
      const up = { path: `public/media/${rel(`${kind}-${stamp}.${extFor(file)}`)}`, content: new Uint8Array(await file.arrayBuffer()) }
      const thumb = kind === 'cover' ? await makeThumb(file) : null
      const tup = thumb && { path: `public/media/${rel(`thumb-${stamp}.${thumb.ext}`)}`, content: thumb.data }
      const patch: Partial<Anime> = { [kind]: up.path.slice('public'.length) }
      if (kind === 'cover') patch.thumb = tup ? tup.path.slice('public'.length) : patch.cover
      return edit(id, `anime ${kind}: ${id}`, async (prev) => {
        const old = kind === 'cover' && prev.thumb?.startsWith(`/media/anime/${id}/thumb-`) ? [{ path: `public${prev.thumb}`, delete: true as const }] : []
        return { patch, files: [up, ...(tup ? [tup] : []), ...old] }
      })
    },

    /** Same rules as server/anime.ts refreshAnime; commits only when a field actually changed. */
    async refresh(id) {
      const prev = await readAnime(r, id)
      if (!prev.bangumiId) throw new HttpError(400, '这条记录没有 Bangumi ID')
      const l = await lookupAnime(prev.bangumiId)
      const air = l.anilistReached && l.anilistId ? l.air! : prev.air
      const patch: Partial<Anime> = {
        air, bgmScore: l.bgmScore ?? prev.bgmScore,
        episodes: prev.air !== 'finished' ? l.episodes ?? prev.episodes : prev.episodes ?? l.episodes,
        airEnd: air === 'finished' ? prev.airEnd ?? l.airEnd : undefined,
        anilistId: prev.anilistId ?? l.anilistId, titleRomaji: prev.titleRomaji ?? l.titleRomaji, studio: prev.studio ?? l.studio,
        summary: prev.summary ?? l.summary, cover: prev.cover ?? l.cover, hero: prev.hero ?? l.hero, color: prev.color ?? l.color,
      }
      const same = (Object.keys(patch) as (keyof Anime)[]).every((k) => (patch[k] ?? null) === (prev[k] ?? null))
      if (same) return prev
      return edit(id, `anime refresh: ${id}`, async () => ({ patch }))
    },
  }
}
