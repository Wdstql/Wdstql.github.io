// Shared data model. Used by the React app, the Vite API plugin and the CLI.
// One game = one JSON file at data/games/<id>.json (see AGENTS.md).

export type Status = 'finished' | 'playing' | 'paused' | 'dropped' | 'unplayed' | 'watched'

export const STATUSES: Status[] = ['finished', 'playing', 'paused', 'dropped', 'unplayed', 'watched']

export const STATUS_META: Record<Status, { label: string; en: string; color: string }> = {
  finished: { label: '已完结', en: 'CLEARED', color: '#46e3ff' },
  playing: { label: '游玩中', en: 'PLAYING', color: '#9dff72' },
  paused: { label: '暂停中', en: 'PAUSED', color: '#ffc547' },
  dropped: { label: '已弃坑', en: 'DROPPED', color: '#ff5f7a' },
  unplayed: { label: '未游玩', en: 'BACKLOG', color: '#8f99c2' },
  watched: { label: '已云过', en: 'WATCHED', color: '#b98cff' },
}

/** Accepts Chinese labels as well as the English keys, so agents can write either. */
export function normalizeStatus(input: string): Status | null {
  const s = input.trim().toLowerCase()
  for (const k of STATUSES) {
    if (k === s || STATUS_META[k].label === input.trim() || STATUS_META[k].en.toLowerCase() === s) return k
  }
  const alias: Record<string, Status> = { 完结: 'finished', 通关: 'finished', 在玩: 'playing', 暂停: 'paused', 弃坑: 'dropped', 未玩: 'unplayed', 心愿单: 'unplayed', 云: 'watched', 云过: 'watched' }
  return alias[input.trim()] ?? null
}

export const GENRES = [
  '魂系', '动作', '类银河恶魔城', '平台跳跃', '推理', '悬疑', '文字冒险', '解谜', 'Roguelike', '卡牌',
  '策略', '角色扮演', '音游', '派对', '合作', '射击', '恐怖', '叙事', '开放世界', '恋爱',
]

export interface Moment {
  id: string
  /** Path under /media/... or an absolute URL. */
  src: string
  caption?: string
  addedAt: string
}

export interface Fanwork {
  id: string
  /** Bilibili BV id, e.g. BV1GJ411x7h7 */
  bvid: string
  title?: string
  author?: string
  cover?: string
  duration?: number
  /** Personal note: why this video is worth keeping. */
  note?: string
  addedAt: string
}

export interface Game {
  id: string
  title: string
  titleEn?: string
  titleJa?: string
  steamAppId?: number | null
  /** Platforms the owner actually played on (not every platform the game supports). */
  platforms: string[]
  /** First release, YYYY-MM */
  release?: string
  developer?: string
  genres: string[]
  /** Portrait cover (2:3). Path under /media or URL. */
  cover?: string
  /** Small WebP copy of the cover, generated automatically. */
  thumb?: string
  /** Wide key art for the detail page banner. */
  hero?: string

  // ---- personal record ----
  status: Status
  /** YYYY-MM */
  playedFrom?: string
  /** YYYY-MM */
  playedTo?: string
  /** 0-100, null = not rated */
  score?: number | null
  hours?: number | null
  /** One-sentence verdict shown on cards. */
  oneLiner?: string
  /** Markdown. 整体感受 */
  review?: string
  moments: Moment[]
  fanworks: Fanwork[]
  /** Free-form personal tags, e.g. "神作", "受苦". */
  tags: string[]
  /** Fields filled by an agent from indirect evidence; shown with a "待确认" mark until edited. */
  inferred?: string[]
  createdAt: string
  updatedAt: string
}

export interface Award {
  id: string
  /** e.g. 最爱的 */
  title: string
  gameId: string | null
}

export interface Database {
  games: Game[]
  awards: Award[]
  /** True when served by the local API (dev / preview); false for a static build. */
  editable: boolean
}

export function blankGame(id: string, title: string): Game {
  const now = new Date().toISOString()
  return {
    id, title, platforms: [], genres: [], status: 'unplayed', score: null,
    moments: [], fanworks: [], tags: [], createdAt: now, updatedAt: now,
  }
}

/** Kebab-case id from an English or Chinese title. Chinese falls back to a short hash. */
export function slugify(input: string): string {
  const ascii = input.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  if (ascii.length >= 2) return ascii.slice(0, 48)
  let h = 0
  for (const ch of input) h = (h * 31 + ch.codePointAt(0)!) >>> 0
  return 'g-' + h.toString(36)
}
