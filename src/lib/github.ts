// Online edit backend: the same operations as the local /api, implemented as commits
// to the site's GitHub repo. Each push triggers the deploy workflow, which also fills
// in Steam art and Bilibili metadata (browsers can't call those APIs: no CORS).
import type { Award, Fanwork, Game, Moment } from '../types'
import { slugify } from '../types'
import { HttpError, normalizeGame } from '../record'
import { toBase64, type Remote } from './editKey'

type FileChange = { path: string; content: string | Uint8Array } | { path: string; delete: true }

async function gh<T>(r: Remote, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`https://api.github.com/repos/${r.repo}${path}`, {
    method,
    cache: 'no-store',
    headers: { Authorization: `Bearer ${r.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = (data as { message?: string }).message ?? `HTTP ${res.status}`
    throw new HttpError(res.status, res.status === 401 ? 'GitHub 令牌无效或已过期，请重新生成编辑密钥' : `GitHub：${msg}`)
  }
  return data as T
}

async function readFile(r: Remote, path: string): Promise<string | null> {
  try {
    const f = await gh<{ content: string }>(r, 'GET', `/contents/${path}?ref=${r.branch}`)
    const bytes = Uint8Array.from(atob(f.content.replace(/\n/g, '')), (c) => c.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return null
    throw e
  }
}

async function readGame(r: Remote, id: string): Promise<Game> {
  const text = await readFile(r, `data/games/${id}.json`)
  if (text === null) throw new HttpError(404, `找不到游戏：${id}`)
  return JSON.parse(text) as Game
}

/**
 * One atomic commit. `build` runs again on every retry, so it always works from the
 * latest branch head (the deploy workflow also pushes, e.g. after fetching Steam art).
 */
async function commit(r: Remote, message: string, build: () => Promise<FileChange[]>): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    const ref = await gh<{ object: { sha: string } }>(r, 'GET', `/git/ref/heads/${r.branch}`)
    const head = await gh<{ tree: { sha: string } }>(r, 'GET', `/git/commits/${ref.object.sha}`)
    const changes = await build()
    const tree = await Promise.all(changes.map(async (c) => {
      if ('delete' in c) return { path: c.path, mode: '100644', type: 'blob', sha: null }
      if (typeof c.content === 'string') return { path: c.path, mode: '100644', type: 'blob', content: c.content }
      const blob = await gh<{ sha: string }>(r, 'POST', '/git/blobs', { content: toBase64(c.content), encoding: 'base64' })
      return { path: c.path, mode: '100644', type: 'blob', sha: blob.sha }
    }))
    const t = await gh<{ sha: string }>(r, 'POST', '/git/trees', { base_tree: head.tree.sha, tree })
    const c = await gh<{ sha: string }>(r, 'POST', '/git/commits', { message, tree: t.sha, parents: [ref.object.sha] })
    try {
      await gh(r, 'PATCH', `/git/refs/heads/${r.branch}`, { sha: c.sha })
      return
    } catch (e) {
      if (attempt >= 3 || !(e instanceof HttpError) || e.status !== 422) throw e
    }
  }
}

const gameFile = (g: Game): FileChange => ({ path: `data/games/${g.id}.json`, content: JSON.stringify(g, null, 2) + '\n' })

const EXT_BY_TYPE: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' }

function extFor(file: File): string {
  const fromName = file.name.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase()
  if (fromName && ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'].includes(fromName)) return fromName === 'jpeg' ? 'jpg' : fromName
  return EXT_BY_TYPE[file.type] ?? 'jpg'
}

const bytes = async (b: Blob) => new Uint8Array(await b.arrayBuffer())

/** 300×450 cover-fit thumbnail, like server/store.ts withThumb (which uses sharp). */
async function makeThumb(file: File): Promise<{ data: Uint8Array; ext: string } | null> {
  try {
    const img = await createImageBitmap(file)
    const W = 300, H = 450
    const scale = Math.max(W / img.width, H / img.height)
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    canvas.getContext('2d')!.drawImage(img, (W - img.width * scale) / 2, (H - img.height * scale) / 2, img.width * scale, img.height * scale)
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/webp', 0.78))
    if (!blob) return null
    return { data: await bytes(blob), ext: blob.type === 'image/webp' ? 'webp' : 'png' }
  } catch {
    return null
  }
}

/** Mirrors withThumb for records whose cover did not change through an upload. */
function keepThumb(g: Game): Game {
  if (!g.cover) delete g.thumb
  else if (!g.cover.startsWith('/media/')) g.thumb = g.cover
  return g
}

const parseBvid = (s: string) => s.match(/BV[0-9A-Za-z]{10}/)?.[0] ?? null
const shortId = () => crypto.randomUUID().slice(0, 8)

export function githubApi(r: Remote, onWrite: (games: Game[], removed: string[], awards?: Award[]) => void) {
  /** `change` sees the latest committed record and returns the patch plus any media files. */
  const edit = async (id: string, message: string, change: (prev: Game) => Promise<{ patch: Partial<Game>; files?: FileChange[] }>) => {
    let out!: Game
    await commit(r, message, async () => {
      const prev = await readGame(r, id)
      const { patch, files = [] } = await change(prev)
      out = keepThumb(normalizeGame({ ...prev, ...patch, id, title: patch.title ?? prev.title }, prev))
      return [...files, gameFile(out)]
    })
    onWrite([out], [])
    return out
  }

  const uploadTo = (id: string, sub: string, name: string, data: Uint8Array): FileChange & { src: string } => {
    const rel = `${id}/${sub ? sub + '/' : ''}${name}`
    return { path: `public/media/${rel}`, content: data, src: `/media/${rel}` }
  }

  return {
    async create(input: Partial<Game>): Promise<Game> {
      const title = input.title?.trim()
      if (!title) throw new HttpError(400, '缺少游戏名 title')
      let out!: Game
      await commit(r, `add: ${title}`, async () => {
        const base = slugify(input.titleEn || title)
        let id = base
        for (let i = 2; (await readFile(r, `data/games/${id}.json`)) !== null; i++) id = `${base}-${i}`
        out = keepThumb(normalizeGame({ ...input, id, title }))
        return [gameFile(out)]
      })
      onWrite([out], [])
      return out
    },

    update: (id: string, patch: Partial<Game>) => edit(id, `edit: ${id}`, async () => ({ patch })),

    async remove(id: string) {
      await commit(r, `remove: ${id}`, async () => {
        const ref = await gh<{ object: { sha: string } }>(r, 'GET', `/git/ref/heads/${r.branch}`)
        const tree = await gh<{ tree: { path: string; type: string }[] }>(r, 'GET', `/git/trees/${ref.object.sha}?recursive=1`)
        const media = tree.tree.filter((t) => t.type === 'blob' && t.path.startsWith(`public/media/${id}/`)).map((t) => ({ path: t.path, delete: true as const }))
        return [{ path: `data/games/${id}.json`, delete: true }, ...media]
      })
      onWrite([], [id])
      return { ok: true as const }
    },

    async uploadMoment(id: string, file: File, caption?: string) {
      const mid = shortId()
      const up = uploadTo(id, 'moments', `${Date.now()}-${mid}.${extFor(file)}`, await bytes(file))
      const m: Moment = { id: mid, src: up.src, caption, addedAt: new Date().toISOString() }
      return edit(id, `moment: ${id}`, async (prev) => ({ patch: { moments: [...prev.moments, m] }, files: [up] }))
    },

    async uploadArt(id: string, kind: 'cover' | 'hero', file: File) {
      const stamp = Date.now().toString(36)
      const up = uploadTo(id, '', `${kind}-${stamp}.${extFor(file)}`, await bytes(file))
      const thumb = kind === 'cover' ? await makeThumb(file) : null
      const tup = thumb && uploadTo(id, '', `thumb-${stamp}.${thumb.ext}`, thumb.data)
      const patch: Partial<Game> = { [kind]: up.src }
      if (kind === 'cover') patch.thumb = tup?.src ?? up.src
      return edit(id, `${kind}: ${id}`, async (prev) => {
        const old = kind === 'cover' && prev.thumb?.startsWith(`/media/${id}/thumb-`) ? [{ path: `public${prev.thumb}`, delete: true as const }] : []
        return { patch, files: [up, ...(tup ? [tup] : []), ...old] }
      })
    },

    async addFanwork(id: string, url: string) {
      const bvid = parseBvid(url)
      if (!bvid) throw new HttpError(400, `没有识别出 BV 号：${url}`)
      // Title, author and cover are filled in by the deploy workflow.
      const f: Fanwork = { id: shortId(), bvid, addedAt: new Date().toISOString() }
      return edit(id, `fanwork: ${id}`, async (prev) => {
        if (prev.fanworks.some((x) => x.bvid === bvid)) throw new HttpError(409, `${bvid} 已经在二创列表里`)
        return { patch: { fanworks: [...prev.fanworks, f] } }
      })
    },

    /** Clearing the art makes the deploy workflow download it from Steam again. */
    steamArt: (id: string, appid: number) =>
      edit(id, `steam art: ${id}`, async () => ({ patch: { steamAppId: Number(appid), cover: undefined, hero: undefined, thumb: undefined } })),

    steamSearch: async (): Promise<{ appid: number; name: string; logo: string }[]> => {
      throw new HttpError(501, '在线编辑无法搜索 Steam，请填 AppID 或商店链接')
    },

    async saveAwards(awards: Award[]) {
      await commit(r, 'edit: awards', async () => [{ path: 'data/awards.json', content: JSON.stringify(awards, null, 2) + '\n' }])
      onWrite([], [], awards)
      return awards
    },
  }
}
