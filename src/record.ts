// Record validation shared by the local API, the CLI and the browser (online edit mode).
import type { Game } from './types.ts'
import { blankGame, normalizeStatus } from './types.ts'

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

/** Coerces loosely written records (from agents or hand edits) into a valid Game. */
export function normalizeGame(raw: Partial<Game> & { id: string; title: string }, prev?: Game): Game {
  const base = prev ?? blankGame(raw.id, raw.title)
  const g: Game = { ...base, ...raw } as Game
  const status = normalizeStatus(String(g.status ?? 'unplayed'))
  if (!status) throw new HttpError(400, `未知状态：${g.status}`)
  g.status = status
  if (g.score === undefined || g.score === null || (g.score as unknown) === '') g.score = null
  else {
    const n = Number(g.score)
    if (!Number.isFinite(n)) throw new HttpError(400, `评分必须是 0-100 的数字：${g.score}`)
    g.score = Math.max(0, Math.min(100, Math.round(n)))
  }
  if (g.hours !== undefined && g.hours !== null) g.hours = Number(g.hours) || null
  for (const key of ['playedFrom', 'playedTo', 'release'] as const) {
    const v = g[key]
    if (v === undefined || v === null || v === '') { delete g[key]; continue }
    const m = String(v).match(/^(\d{4})[-/.年]?(\d{1,2})?/)
    if (!m) throw new HttpError(400, `${key} 需要 YYYY-MM 格式：${v}`)
    const month = m[2] ? m[2].padStart(2, '0') : '01'
    g[key] = `${m[1]}-${month}`
    if (!MONTH_RE.test(g[key]!)) throw new HttpError(400, `${key} 月份无效：${v}`)
  }
  g.platforms = arr(g.platforms)
  g.genres = arr(g.genres)
  g.tags = arr(g.tags)
  g.moments = (g.moments ?? []).map((m) => ({ ...m, id: m.id || crypto.randomUUID().slice(0, 8), addedAt: m.addedAt || now() }))
  g.fanworks = (g.fanworks ?? []).map((f) => ({ ...f, id: f.id || crypto.randomUUID().slice(0, 8), addedAt: f.addedAt || now() }))
  if (g.inferred && g.inferred.length === 0) delete g.inferred
  g.createdAt = base.createdAt || now()
  g.updatedAt = now()
  return g
}

function arr(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean)
  if (typeof v === 'string') return v.split(/[,，、]/).map((s) => s.trim()).filter(Boolean)
  return []
}

function now(): string {
  return new Date().toISOString()
}
