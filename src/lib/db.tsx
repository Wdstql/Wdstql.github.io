import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Award, Database, Game } from '../types'
import { decryptRemote, type EditKeyFile, type Remote } from './editKey'
import { githubApi } from './github'

interface DbContext {
  db: Database | null
  error: string | null
  byId: Map<string, Game>
  editMode: boolean
  setEditMode: (v: boolean) => void
  /** Static site with an edit key: the owner can unlock online editing with a password. */
  lockable: boolean
  unlocked: boolean
  unlock: (password: string) => Promise<void>
  lock: () => void
  reload: () => Promise<void>
  api: Api
  toast: (msg: string, kind?: 'ok' | 'err') => void
  toasts: { id: number; msg: string; kind: 'ok' | 'err' }[]
}

const Ctx = createContext<DbContext | null>(null)

/** Work-in-progress markers ("?", 待确认) are for the owner while editing, not for visitors. */
export const workMarks = { visible: false }

async function request<T>(method: string, url: string, body?: BodyInit | object, headers: Record<string, string> = {}): Promise<T> {
  const isRaw = body instanceof Blob || body instanceof ArrayBuffer
  const res = await fetch(url, {
    method,
    headers: isRaw ? headers : { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : isRaw ? (body as BodyInit) : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
  return data as T
}

export const api = {
  create: (g: Partial<Game>) => request<Game>('POST', '/api/games', g),
  update: (id: string, patch: Partial<Game>) => request<Game>('PUT', `/api/games/${id}`, patch),
  remove: (id: string) => request<{ ok: true }>('DELETE', `/api/games/${id}`),
  uploadMoment: (id: string, file: File, caption?: string) =>
    request<Game>('POST', `/api/games/${id}/moments?name=${encodeURIComponent(file.name)}${caption ? `&caption=${encodeURIComponent(caption)}` : ''}`, file, { 'Content-Type': file.type || 'application/octet-stream' }),
  uploadArt: (id: string, kind: 'cover' | 'hero', file: File) =>
    request<Game>('POST', `/api/games/${id}/${kind}?name=${encodeURIComponent(file.name)}`, file, { 'Content-Type': file.type || 'application/octet-stream' }),
  addFanwork: (id: string, url: string) => request<Game>('POST', `/api/games/${id}/fanworks`, { url }),
  steamArt: (id: string, appid: number, overwrite = false) => request<Game>('POST', `/api/games/${id}/steam`, { appid, overwrite }),
  steamSearch: (q: string) => request<{ appid: number; name: string; logo: string }[]>('GET', `/api/steam/search?q=${encodeURIComponent(q)}`),
  saveAwards: (awards: Award[]) => request<Award[]>('PUT', '/api/awards', awards),
}

type Api = Omit<typeof api, 'steamArt'> & { steamArt: (id: string, appid: number, overwrite?: boolean) => Promise<Game> }

async function loadDb(): Promise<Database> {
  try {
    const res = await fetch('/api/db', { cache: 'no-store' })
    if (res.ok && res.headers.get('content-type')?.includes('json')) return await res.json()
  } catch {
    // fall through to the static snapshot
  }
  const res = await fetch(`${import.meta.env.BASE_URL}data/db.json`, { cache: 'no-store' })
  if (!res.ok) throw new Error('无法读取数据：本地接口和静态快照都不可用')
  return withOverlay(await res.json())
}

// ---------- online edits that are committed but not deployed yet ----------
// The deployed db.json lags a commit by a minute or two. Records written online are
// kept here (per tab) and shown instead, until the deployed copy catches up.

const OVERLAY_KEY = 'game-life:overlay'
const REMOTE_KEY = 'game-life:remote'

interface Overlay { raw: string; games: Record<string, Game | null>; awards?: Award[] }

const session = {
  get<T>(k: string): T | null {
    try { return JSON.parse(sessionStorage.getItem(k) ?? 'null') as T | null } catch { return null }
  },
  set(k: string, v: unknown) {
    try { if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)) } catch { /* private mode */ }
  },
}

/** New media is not on the site yet; the raw file in the repo is available right after the commit. */
function viaRaw(g: Game, raw: string): Game {
  const fix = <T extends string | undefined>(p: T): T => (p?.startsWith('/media/') ? `${raw}/public${p}` : p) as T
  return {
    ...g, cover: fix(g.cover), thumb: fix(g.thumb), hero: fix(g.hero),
    moments: g.moments.map((m) => ({ ...m, src: fix(m.src) })),
    fanworks: g.fanworks.map((f) => ({ ...f, cover: fix(f.cover) })),
  }
}

function withOverlay(db: Database): Database {
  const o = session.get<Overlay>(OVERLAY_KEY)
  if (!o) return db
  const games = new Map(db.games.map((g) => [g.id, g]))
  for (const [id, g] of Object.entries(o.games)) {
    const live = games.get(id)
    if (g === null ? !live : live && live.updatedAt >= g.updatedAt) { delete o.games[id]; continue }
    if (g === null) games.delete(id)
    else games.set(id, viaRaw(g, o.raw))
  }
  if (o.awards && JSON.stringify(o.awards) === JSON.stringify(db.awards)) delete o.awards
  session.set(OVERLAY_KEY, Object.keys(o.games).length || o.awards ? o : null)
  return { ...db, games: [...games.values()], awards: o.awards ?? db.awards }
}

function remember(remote: Remote, games: Game[], removed: string[], awards?: Award[]) {
  const o = session.get<Overlay>(OVERLAY_KEY) ?? { raw: `https://raw.githubusercontent.com/${remote.repo}/${remote.branch}`, games: {} }
  for (const g of games) o.games[g.id] = g
  for (const id of removed) o.games[id] = null
  if (awards) o.awards = awards
  session.set(OVERLAY_KEY, o)
}

const EDIT_KEY = 'game-life:edit'
const KEY_FILE = `${import.meta.env.BASE_URL}edit-key.json`

export function DbProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Database | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editMode, setEdit] = useState(() => {
    try { return localStorage.getItem(EDIT_KEY) === '1' } catch { return false }
  })
  const [toasts, setToasts] = useState<DbContext['toasts']>([])
  const [remote, setRemote] = useState<Remote | null>(() => session.get<Remote>(REMOTE_KEY))
  const [lockable, setLockable] = useState(false)

  const reload = useCallback(async () => {
    try {
      setDb(await loadDb())
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    reload()
    // Agents edit data/games/*.json directly; the dev server pings us on change.
    if (import.meta.hot) {
      const handler = () => reload()
      import.meta.hot.on('game-life:changed', handler)
      return () => import.meta.hot?.off('game-life:changed', handler)
    }
  }, [reload])

  // The static build offers online editing only when an edit key has been published.
  useEffect(() => {
    if (!db || db.editable) return
    fetch(KEY_FILE, { cache: 'no-store' }).then((r) => setLockable(r.ok && !!r.headers.get('content-type')?.includes('json')), () => {})
  }, [db])

  const unlock = useCallback(async (password: string) => {
    const res = await fetch(KEY_FILE, { cache: 'no-store' })
    if (!res.ok) throw new Error('网站还没有配置编辑密钥')
    let r: Remote
    try { r = await decryptRemote(await res.json() as EditKeyFile, password) } catch { throw new Error('密码不对') }
    session.set(REMOTE_KEY, r)
    setRemote(r)
  }, [])

  const lock = useCallback(() => {
    session.set(REMOTE_KEY, null)
    setRemote(null)
  }, [])

  const setEditMode = useCallback((v: boolean) => {
    setEdit(v)
    try { localStorage.setItem(EDIT_KEY, v ? '1' : '0') } catch { /* private mode */ }
  }, [])

  const toast = useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, msg, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200)
  }, [])

  const byId = useMemo(() => new Map((db?.games ?? []).map((g) => [g.id, g])), [db])

  const online = !!db && !db.editable && !!remote
  const activeApi = useMemo<Api>(() => (online && remote ? githubApi(remote, (...a) => remember(remote, ...a)) : api), [online, remote])
  // Components only ask "can this page write?"; online editing answers yes once unlocked.
  const view = useMemo(() => (db && online ? { ...db, editable: true } : db), [db, online])

  workMarks.visible = !!view?.editable && editMode
  const value = useMemo<DbContext>(() => ({
    db: view, error, byId, editMode: !!view?.editable && editMode, setEditMode,
    lockable: lockable && !db?.editable, unlocked: online, unlock, lock, reload, api: activeApi, toast, toasts,
  }), [view, db, error, byId, editMode, setEditMode, lockable, online, unlock, lock, reload, activeApi, toast, toasts])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useDb(): DbContext {
  const v = useContext(Ctx)
  if (!v) throw new Error('useDb outside DbProvider')
  return v
}
