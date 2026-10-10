import { useEffect, useState } from 'react'
import type { Game, Status } from '../types'

export interface Tier {
  key: string
  label: string
  name: string
  min: number
  color: string
}

export const TIERS: Tier[] = [
  { key: 'SS', label: 'SS', name: '神作 · 刻进DNA', min: 95, color: '#ff4f9a' },
  { key: 'S', label: 'S', name: '杰作 · 强烈推荐', min: 90, color: '#ff9a3d' },
  { key: 'A', label: 'A', name: '佳作 · 值得一玩', min: 84, color: '#ffd34a' },
  { key: 'B', label: 'B', name: '良作 · 有亮点', min: 75, color: '#5df0a8' },
  { key: 'C', label: 'C', name: '尚可 · 看口味', min: 60, color: '#46c8ff' },
  { key: 'D', label: 'D', name: '不合胃口', min: 0, color: '#8b8fb8' },
]

export function tierOf(score: number | null | undefined): Tier | null {
  if (score == null) return null
  return TIERS.find((t) => score >= t.min) ?? TIERS[TIERS.length - 1]
}

export type TimeBasis = 'played' | 'release'

export function timeOf(g: Game, basis: TimeBasis): string | undefined {
  return basis === 'played' ? g.playedFrom ?? g.playedTo : g.release
}

export function yearOf(g: Game, basis: TimeBasis): number | null {
  const t = timeOf(g, basis)
  return t ? Number(t.slice(0, 4)) : null
}

export function fmtMonth(m?: string): string {
  return m ? m.replace('-', '.') : ''
}

export function playedRange(g: Game): string {
  if (!g.playedFrom && !g.playedTo) return ''
  if (g.playedFrom && g.playedTo && g.playedFrom !== g.playedTo) return `${fmtMonth(g.playedFrom)} — ${fmtMonth(g.playedTo)}`
  return fmtMonth(g.playedFrom ?? g.playedTo)
}

export interface Filters {
  q: string
  statuses: Status[]
  genres: string[]
  platforms: string[]
  score: [number, number]
  includeUnscored: boolean
  years: [number, number] | null
  basis: TimeBasis
}

export const DEFAULT_FILTERS: Filters = {
  q: '', statuses: [], genres: [], platforms: [], score: [0, 100], includeUnscored: true, years: null, basis: 'release',
}

export function matchQuery(g: Game, q: string): boolean {
  if (!q) return true
  const s = q.trim().toLowerCase()
  return [g.title, g.titleEn, g.titleJa, g.developer, ...g.tags, ...g.genres].some((v) => v?.toLowerCase().includes(s))
}

export function applyFilters(games: Game[], f: Filters): Game[] {
  return games.filter((g) => {
    if (!matchQuery(g, f.q)) return false
    if (f.statuses.length && !f.statuses.includes(g.status)) return false
    if (f.genres.length && !f.genres.some((x) => g.genres.includes(x))) return false
    if (f.platforms.length && !f.platforms.some((x) => g.platforms.includes(x))) return false
    if (g.score == null) { if (!f.includeUnscored) return false }
    else if (g.score < f.score[0] || g.score > f.score[1]) return false
    if (f.years) {
      const y = yearOf(g, f.basis)
      if (y == null || y < f.years[0] || y > f.years[1]) return false
    }
    return true
  })
}

export function filtersActive(f: Filters): number {
  return (f.q ? 1 : 0) + f.statuses.length + f.genres.length + f.platforms.length
    + (f.score[0] > 0 || f.score[1] < 100 ? 1 : 0) + (f.includeUnscored ? 0 : 1) + (f.years ? 1 : 0)
}

/** Stable pseudo-random in [0,1) from a string — used for deterministic layouts. */
export function hash01(s: string, salt = 0): number {
  let h = 2166136261 ^ salt
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return ((h >>> 0) % 100000) / 100000
}

export function hueOf(s: string): number {
  return Math.floor(hash01(s, 7) * 360)
}

// ---------- accent colour from cover art ----------

const accentCache = new Map<string, string>()

function computeAccent(src: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = 24; c.height = 36
        const ctx = c.getContext('2d', { willReadFrequently: true })!
        ctx.drawImage(img, 0, 0, 24, 36)
        const d = ctx.getImageData(0, 0, 24, 36).data
        // Pick the most saturated mid-luminance bucket rather than the muddy average.
        let best = { score: -1, r: 120, g: 130, b: 160 }
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], b = d[i + 2]
          const max = Math.max(r, g, b), min = Math.min(r, g, b)
          const l = (max + min) / 510
          const sat = max === 0 ? 0 : (max - min) / max
          const score = sat * (1 - Math.abs(l - 0.5) * 1.6)
          if (score > best.score) best = { score, r, g, b }
        }
        resolve(`rgb(${best.r} ${best.g} ${best.b})`)
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = src
  })
}

export function useAccent(src: string | undefined, fallbackSeed: string): string {
  const fallback = `hsl(${hueOf(fallbackSeed)} 70% 60%)`
  const [color, setColor] = useState(() => (src && accentCache.get(src)) || fallback)
  useEffect(() => {
    if (!src || !src.startsWith('/')) return
    const hit = accentCache.get(src)
    if (hit) { setColor(hit); return }
    let alive = true
    computeAccent(src).then((c) => {
      if (c) accentCache.set(src, c)
      if (alive && c) setColor(c)
    })
    return () => { alive = false }
  }, [src])
  return color
}

export function sortGames(games: Game[], by: 'score' | 'release' | 'played' | 'title' | 'updated'): Game[] {
  const arr = [...games]
  switch (by) {
    case 'score': return arr.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.title.localeCompare(b.title, 'zh'))
    case 'release': return arr.sort((a, b) => (b.release ?? '').localeCompare(a.release ?? ''))
    case 'played': return arr.sort((a, b) => (b.playedFrom ?? '').localeCompare(a.playedFrom ?? ''))
    case 'updated': return arr.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    default: return arr.sort((a, b) => a.title.localeCompare(b.title, 'zh'))
  }
}

/** Title without subtitle, for tight spots such as shelf spines. */
export function shortTitle(title: string, max = 9): string {
  const main = title.split(/[：:]| - |—|～|〜/)[0].replace(/[（(].*?[）)]/g, '').trim() || title
  return main.length > max ? main.slice(0, max - 1) + '…' : main
}
