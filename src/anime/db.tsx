import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Anime, AnimeDatabase } from './model'
import { githubAnimeApi, localApi, type AnimeApi } from './api'
import { decryptRemote, type EditKeyFile, type Remote } from '../lib/editKey'

interface Ctx {
  db: AnimeDatabase | null
  error: string | null
  byId: Map<string, Anime>
  editMode: boolean
  setEditMode: (v: boolean) => void
  lockable: boolean
  unlocked: boolean
  unlock: (password: string) => Promise<void>
  reload: () => Promise<void>
  api: AnimeApi
  toast: (msg: string, kind?: 'ok' | 'err') => void
  toasts: { id: number; msg: string; kind: 'ok' | 'err' }[]
}

const AnimeCtx = createContext<Ctx | null>(null)

// Same storage keys as the game site: unlocking either site unlocks both (same origin, same token).
const REMOTE_KEY = 'game-life:remote'
const OVERLAY_KEY = 'anime-life:overlay'
const EDIT_KEY = 'anime-life:edit'
const KEY_FILE = `${import.meta.env.BASE_URL}edit-key.json`

const session = {
  get<T>(k: string): T | null {
    try { return JSON.parse(sessionStorage.getItem(k) ?? 'null') as T | null } catch { return null }
  },
  set(k: string, v: unknown) {
    try { if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)) } catch { /* private mode */ }
  },
}

// ---------- online edits that are committed but not deployed yet ----------
interface Overlay { raw: string; anime: Record<string, Anime | null> }

function viaRaw(a: Anime, raw: string): Anime {
  const fix = (p?: string) => (p?.startsWith('/media/') ? `${raw}/public${p}` : p)
  return { ...a, cover: fix(a.cover), thumb: fix(a.thumb), hero: fix(a.hero) }
}

function withOverlay(db: AnimeDatabase): AnimeDatabase {
  const o = session.get<Overlay>(OVERLAY_KEY)
  if (!o) return db
  const all = new Map(db.anime.map((a) => [a.id, a]))
  for (const [id, a] of Object.entries(o.anime)) {
    const live = all.get(id)
    if (a === null ? !live : live && live.updatedAt >= a.updatedAt) { delete o.anime[id]; continue }
    if (a === null) all.delete(id)
    else all.set(id, viaRaw(a, o.raw))
  }
  session.set(OVERLAY_KEY, Object.keys(o.anime).length ? o : null)
  return { ...db, anime: [...all.values()] }
}

function remember(remote: Remote, changed: Anime[], removed: string[]) {
  const o = session.get<Overlay>(OVERLAY_KEY) ?? { raw: `https://raw.githubusercontent.com/${remote.repo}/${remote.branch}`, anime: {} }
  for (const a of changed) o.anime[a.id] = a
  for (const id of removed) o.anime[id] = null
  session.set(OVERLAY_KEY, o)
}

async function loadDb(): Promise<AnimeDatabase> {
  // GitHub Pages never has the local API; skip the probe there instead of logging a 404 every visit.
  if (!location.hostname.endsWith('github.io')) try {
    const res = await fetch('/api/anime/db', { cache: 'no-store' })
    if (res.ok && res.headers.get('content-type')?.includes('json')) return await res.json()
  } catch {
    // fall through to the static snapshot
  }
  const res = await fetch(`${import.meta.env.BASE_URL}data/anime.json`, { cache: 'no-store' })
  if (!res.ok) throw new Error('无法读取番剧数据')
  return withOverlay(await res.json())
}

export function AnimeDbProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<AnimeDatabase | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editMode, setEdit] = useState(() => { try { return localStorage.getItem(EDIT_KEY) === '1' } catch { return false } })
  const [remote, setRemote] = useState<Remote | null>(() => session.get<Remote>(REMOTE_KEY))
  const [lockable, setLockable] = useState(false)
  const [toasts, setToasts] = useState<Ctx['toasts']>([])

  const reload = useCallback(async () => {
    try { setDb(await loadDb()); setError(null) } catch (e) { setError((e as Error).message) }
  }, [])

  useEffect(() => {
    reload()
    if (import.meta.hot) {
      const handler = () => reload()
      import.meta.hot.on('anime-life:changed', handler)
      return () => import.meta.hot?.off('anime-life:changed', handler)
    }
  }, [reload])

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

  const setEditMode = useCallback((v: boolean) => {
    setEdit(v)
    try { localStorage.setItem(EDIT_KEY, v ? '1' : '0') } catch { /* private mode */ }
  }, [])

  const toast = useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, msg, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3400)
  }, [])

  const online = !!db && !db.editable && !!remote
  const api = useMemo<AnimeApi>(() => (online && remote ? githubAnimeApi(remote, (c, r) => remember(remote, c, r)) : localApi), [online, remote])
  const view = useMemo(() => (db && online ? { ...db, editable: true } : db), [db, online])
  const byId = useMemo(() => new Map((db?.anime ?? []).map((a) => [a.id, a])), [db])

  const value = useMemo<Ctx>(() => ({
    db: view, error, byId, editMode: !!view?.editable && editMode, setEditMode,
    lockable: lockable && !db?.editable, unlocked: online, unlock, reload, api, toast, toasts,
  }), [view, db, error, byId, editMode, setEditMode, lockable, online, unlock, reload, api, toast, toasts])

  return <AnimeCtx.Provider value={value}>{children}</AnimeCtx.Provider>
}

export function useAnimeDb(): Ctx {
  const v = useContext(AnimeCtx)
  if (!v) throw new Error('useAnimeDb outside AnimeDbProvider')
  return v
}
