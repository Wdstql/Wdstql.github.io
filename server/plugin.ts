// Vite plugin: serves a small JSON API under /api during `vite dev` / `vite preview`,
// and writes a read-only snapshot (data/db.json) into the static build.
import { watch } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect, Plugin, ViteDevServer } from 'vite'
import type { Award, Game } from '../src/types.ts'
import {
  addFanwork, addMoment, createGame, deleteGame, GAMES_DIR, getGame, HttpError, listGames,
  readAwards, setCoverFromBytes, updateGame, writeAwards, AWARDS_FILE, MEDIA_DIR,
} from './store.ts'
import { biliInfo, fetchSteamArt, searchSteam, steamInfo } from './remote.ts'
import { ANIME_DIR, animeRoute, listAnime } from './anime.ts'

const MAX_UPLOAD = 40 * 1024 * 1024

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_UPLOAD) throw new HttpError(413, '文件超过 40MB')
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks)
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const buf = await readBody(req)
  try {
    return JSON.parse(buf.toString('utf8') || '{}') as T
  } catch {
    throw new HttpError(400, '请求体不是合法 JSON')
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

export async function snapshot(editable: boolean) {
  const [games, awards] = await Promise.all([listGames(), readAwards()])
  return { games, awards, editable }
}

/** Creates a game, optionally pre-filled from Steam (info + cover art). */
export async function createWithSteam(input: Partial<Game> & { title?: string }): Promise<Game> {
  let base: Partial<Game> = {}
  if (input.steamAppId) base = await steamInfo(Number(input.steamAppId))
  const merged = { ...base, ...stripEmpty(input) } as Partial<Game> & { title: string }
  merged.title ||= base.title ?? ''
  const g = await createGame(merged)
  if (g.steamAppId) {
    const art = await fetchSteamArt(g.id, g.steamAppId)
    return updateGame(g.id, { cover: g.cover ?? art.cover, hero: g.hero ?? art.hero })
  }
  return g
}

function stripEmpty<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0))) as Partial<T>
}

const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' }

/** Serves public/media directly so files added at runtime are visible without a restart. */
async function serveMedia(pathname: string, res: ServerResponse): Promise<boolean> {
  const rel = decodeURIComponent(pathname.slice('/media/'.length))
  const file = path.join(MEDIA_DIR, rel)
  if (!file.startsWith(MEDIA_DIR + path.sep)) return false
  try {
    const data = await readFile(file)
    res.setHeader('Content-Type', MIME[path.extname(file).slice(1).toLowerCase()] ?? 'application/octet-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.end(data)
    return true
  } catch {
    return false
  }
}

function middleware(): Connect.NextHandleFunction {
  return async (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://local')
    if (url.pathname.startsWith('/media/')) {
      if (await serveMedia(url.pathname, res)) return
      res.statusCode = 404
      return res.end()
    }
    if (!url.pathname.startsWith('/api/')) return next()
    const parts = url.pathname.split('/').filter(Boolean).slice(1) // drop "api"
    const method = req.method ?? 'GET'
    try {
      // GET /api/db
      if (parts[0] === 'db' && method === 'GET') return send(res, 200, await snapshot(true))

      if (parts[0] === 'anime') {
        const done = await animeRoute(parts, method, url, req, () => readBody(req), <T,>() => readJson<T>(req), (status, body) => send(res, status, body))
        if (done) return
      }

      if (parts[0] === 'steam') {
        if (parts[1] === 'search') return send(res, 200, await searchSteam(url.searchParams.get('q') ?? ''))
        if (parts[1] === 'app' && parts[2]) return send(res, 200, await steamInfo(Number(parts[2])))
      }

      if (parts[0] === 'awards' && method === 'PUT') return send(res, 200, await writeAwards(await readJson<Award[]>(req)))

      if (parts[0] === 'games') {
        const id = parts[1]
        if (!id && method === 'POST') return send(res, 201, await createWithSteam(await readJson<Partial<Game>>(req)))
        if (id && parts.length === 2) {
          if (method === 'GET') return send(res, 200, await getGame(id))
          if (method === 'PUT' || method === 'PATCH') return send(res, 200, await updateGame(id, await readJson<Partial<Game>>(req)))
          if (method === 'DELETE') { await deleteGame(id); return send(res, 200, { ok: true }) }
        }
        if (id && method === 'POST') {
          const name = url.searchParams.get('name') ?? undefined
          const type = req.headers['content-type']
          switch (parts[2]) {
            case 'moments':
              return send(res, 200, await addMoment(id, await readBody(req), name, type, url.searchParams.get('caption') ?? undefined))
            case 'cover':
            case 'hero':
              return send(res, 200, await setCoverFromBytes(id, parts[2], await readBody(req), name, type))
            case 'fanworks': {
              const { url: link } = await readJson<{ url: string }>(req)
              return send(res, 200, await addFanwork(id, await biliInfo(id, link)))
            }
            case 'steam': {
              const { appid, overwrite } = await readJson<{ appid: number; overwrite?: boolean }>(req)
              const info = await steamInfo(Number(appid))
              const prev = await getGame(id)
              const art = await fetchSteamArt(id, Number(appid))
              const patch: Partial<Game> = overwrite ? { ...info, title: prev.title } : stripEmpty({
                titleEn: prev.titleEn || info.titleEn, release: prev.release || info.release,
                developer: prev.developer || info.developer, steamAppId: Number(appid),
                platforms: prev.platforms.length ? prev.platforms : info.platforms,
              })
              return send(res, 200, await updateGame(id, { ...patch, cover: art.cover ?? prev.cover, hero: art.hero ?? prev.hero }))
            }
          }
        }
      }
      send(res, 404, { error: `未知接口 ${method} ${url.pathname}` })
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500
      if (status === 500) console.error('[game-life]', e)
      send(res, status, { error: (e as Error).message })
    }
  }
}

function watchData(server: ViteDevServer) {
  const timers: Record<string, ReturnType<typeof setTimeout>> = {}
  const ping = (event: string) => () => {
    clearTimeout(timers[event])
    timers[event] = setTimeout(() => server.ws.send({ type: 'custom', event }), 150)
  }
  for (const [target, event] of [[GAMES_DIR, 'game-life:changed'], [AWARDS_FILE, 'game-life:changed'], [ANIME_DIR, 'anime-life:changed']]) {
    try {
      watch(target, ping(event))
    } catch {
      // Directory may not exist yet on first run.
    }
  }
}

export function gameLifeApi(): Plugin {
  return {
    name: 'game-life-api',
    configureServer(server) {
      server.middlewares.use(middleware())
      watchData(server)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware())
    },
    async generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'data/db.json', source: JSON.stringify(await snapshot(false)) })
      this.emitFile({ type: 'asset', fileName: 'data/anime.json', source: JSON.stringify({ anime: await listAnime(), editable: false }) })
    },
    // /anime/ gets its own copy of the shell so it answers 200 with the sub-site's title and colours
    // (GitHub Pages would otherwise serve 404.html for it).
    async writeBundle(options) {
      const dir = options.dir ?? 'dist'
      const html = await readFile(path.join(dir, 'index.html'), 'utf8').catch(() => null)
      if (!html) return
      const anime = html
        .replace(/<title>[^<]*<\/title>/, '<title>wdstql 的番剧生涯 · ANIME LIFE</title>')
        .replace(/(<meta name="description" content=")[^"]*/, '$1wdstql 的番剧档案：看过、在看、想看的每一部番剧，按季度记录。')
        .replace(/(<meta name="theme-color" content=")[^"]*/, '$1#07061a')
        .replace(/(html,body\{[^}]*background:)#05060a/, '$1#07061a')
      await mkdir(path.join(dir, 'anime'), { recursive: true })
      await writeFile(path.join(dir, 'anime', 'index.html'), anime)
    },
  }
}
