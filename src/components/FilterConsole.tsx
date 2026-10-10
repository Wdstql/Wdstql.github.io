import { useMemo, useState } from 'react'
import type { Game } from '../types'
import { STATUSES, STATUS_META } from '../types'
import { DEFAULT_FILTERS, filtersActive, yearOf, type Filters } from '../lib/game'

export function FilterConsole({ games, filters, setFilters, resultCount }: {
  games: Game[]
  filters: Filters
  setFilters: (f: Filters) => void
  resultCount: number
}) {
  const [showAllGenres, setShowAllGenres] = useState(false)
  // Phones collapse everything but search behind one toggle.
  const [open, setOpen] = useState(() => window.innerWidth >= 640)
  const set = (patch: Partial<Filters>) => setFilters({ ...filters, ...patch })
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  const statusCount = useMemo(() => Object.fromEntries(STATUSES.map((s) => [s, games.filter((g) => g.status === s).length])), [games])
  const genreCount = useMemo(() => {
    const m = new Map<string, number>()
    games.forEach((g) => g.genres.forEach((x) => m.set(x, (m.get(x) ?? 0) + 1)))
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [games])
  const platformCount = useMemo(() => {
    const m = new Map<string, number>()
    games.forEach((g) => g.platforms.forEach((x) => m.set(x, (m.get(x) ?? 0) + 1)))
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [games])
  const yearBounds = useMemo(() => {
    const ys = games.map((g) => yearOf(g, filters.basis)).filter((y): y is number => y != null)
    return ys.length ? [Math.min(...ys), Math.max(...ys)] as [number, number] : null
  }, [games, filters.basis])
  const years = filters.years ?? yearBounds
  const active = filtersActive(filters)
  const genres = showAllGenres ? genreCount : genreCount.slice(0, 12)

  return (
    <div className="panel cut brackets p-5 sm:p-6" style={{ ['--bracket' as string]: 'var(--pink)' }}>
      <div className="grid gap-x-10 gap-y-5 lg:grid-cols-[1.25fr_1fr]">
        {/* left column */}
        <div className="grid gap-5">
          <Row label="SEARCH" cn="检索">
 <div className="flex w-full gap-2">
            <div className="relative w-full">
              <input className="input pl-9" value={filters.q} onChange={(e) => set({ q: e.target.value })} placeholder="名字、英文名、开发商、标签…" />
              <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--dim)" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            </div>
            <button className="btn h-[38px] shrink-0 px-3 text-[12.5px] sm:hidden" onClick={() => setOpen(!open)} aria-expanded={open}>
              筛选{filtersActive(filters) > 0 && <span style={{ color: 'var(--pink)' }}>·{filtersActive(filters)}</span>} {open ? '▴' : '▾'}
            </button>
            </div>
          </Row>
          <Row label="STATUS" cn="状态" hidden={!open}>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((s) => (
                <button key={s} className="chip" data-on={filters.statuses.includes(s)} style={{ ['--chip-color' as string]: STATUS_META[s].color }}
                  onClick={() => set({ statuses: toggle(filters.statuses, s) })}>
                  <span className="dot" />{STATUS_META[s].label}<span className="mono text-[10px] opacity-60">{statusCount[s]}</span>
                </button>
              ))}
            </div>
          </Row>
          <Row label="GENRE" cn="类型" hidden={!open}>
            <div className="flex flex-wrap gap-2">
              {genres.map(([g, n]) => (
                <button key={g} className="chip" data-on={filters.genres.includes(g)} style={{ ['--chip-color' as string]: 'var(--pink)' }}
                  onClick={() => set({ genres: toggle(filters.genres, g) })}>
                  {g}<span className="mono text-[10px] opacity-60">{n}</span>
                </button>
              ))}
              {genreCount.length > 12 && (
                <button className="chip" onClick={() => setShowAllGenres(!showAllGenres)}>{showAllGenres ? '收起' : `+${genreCount.length - 12}`}</button>
              )}
            </div>
          </Row>
        </div>

        {/* right column */}
        <div className={`grid content-start gap-5 ${open ? '' : 'hidden'}`}>
          <Row label="SCORE" cn="评分">
            <div className="w-full">
              <DualRange min={0} max={100} value={filters.score} onChange={(v) => set({ score: v })} />
              <div className="mt-1 flex items-center justify-between">
                <span className="hud text-[15px] font-semibold" style={{ color: 'var(--cyan)' }}>{filters.score[0]} – {filters.score[1]}</span>
                <label className="flex cursor-pointer items-center gap-2 text-[12px]" style={{ color: 'var(--muted)' }}>
                  <input type="checkbox" checked={filters.includeUnscored} onChange={(e) => set({ includeUnscored: e.target.checked })} className="accent-[#46e3ff]" />
                  包含未评分
                </label>
              </div>
            </div>
          </Row>
          <Row label="TIME" cn="时间">
            <div className="w-full">
              <div className="mb-2 flex gap-2">
                {(['played', 'release'] as const).map((b) => (
                  <button key={b} className="chip h-6 text-[11.5px]" data-on={filters.basis === b} onClick={() => set({ basis: b, years: null })}>
                    {b === 'played' ? '按游玩时间' : '按发售时间'}
                  </button>
                ))}
              </div>
              {yearBounds && years ? (
                <>
                  <DualRange min={yearBounds[0]} max={yearBounds[1]} value={years} onChange={(v) => set({ years: v[0] === yearBounds[0] && v[1] === yearBounds[1] ? null : v })} />
                  <div className="hud mt-1 text-[15px] font-semibold" style={{ color: 'var(--cyan)' }}>{years[0]} – {years[1]}</div>
                </>
              ) : (
                <div className="text-[12px]" style={{ color: 'var(--dim)' }}>还没有记录{filters.basis === 'played' ? '游玩' : '发售'}时间的游戏</div>
              )}
            </div>
          </Row>
          {platformCount.length > 1 && (
            <Row label="PLATFORM" cn="游玩平台">
              <div className="flex flex-wrap gap-2">
                {platformCount.map(([p, n]) => (
                  <button key={p} className="chip h-6 text-[11.5px]" data-on={filters.platforms.includes(p)} style={{ ['--chip-color' as string]: 'var(--violet)' }}
                    onClick={() => set({ platforms: toggle(filters.platforms, p) })}>{p}<span className="mono text-[10px] opacity-60">{n}</span></button>
                ))}
              </div>
            </Row>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 pt-4" style={{ borderTop: '1px dashed var(--line-2)' }}>
        <div className="mono text-[12px]" style={{ color: 'var(--muted)' }}>
          匹配 <span className="hud text-[18px] font-bold" style={{ color: '#fff' }}>{resultCount}</span>
          <span style={{ color: 'var(--dim)' }}> / {games.length}</span>
          {active > 0 && <span className="ml-3" style={{ color: 'var(--pink)' }}>· {active} 个条件生效</span>}
        </div>
        {active > 0 && <button className="btn btn-ghost h-8 px-3 text-[12px]" onClick={() => setFilters({ ...DEFAULT_FILTERS, basis: filters.basis })}>清空筛选</button>}
      </div>
    </div>
  )
}

function Row({ label, cn, children, hidden }: { label: string; cn: string; children: React.ReactNode; hidden?: boolean }) {
  return (
    <div className={`flex-col gap-2 sm:flex-row sm:items-start sm:gap-4 ${hidden ? 'hidden' : 'flex'}`}>
      <div className="w-[56px] shrink-0 pt-1.5 text-[13px] font-semibold" style={{ color: '#c7cee2' }} title={label}>{cn}</div>
      <div className="flex min-w-0 flex-1">{children}</div>
    </div>
  )
}

function DualRange({ min, max, value, onChange }: { min: number; max: number; value: [number, number]; onChange: (v: [number, number]) => void }) {
  const pct = (v: number) => (max === min ? 0 : ((v - min) / (max - min)) * 100)
  return (
    <div className="range-dual">
      <div className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2" style={{ background: 'rgba(140,165,255,.15)' }} />
      <div className="absolute top-1/2 h-[2px] -translate-y-1/2" style={{ left: `${pct(value[0])}%`, right: `${100 - pct(value[1])}%`, background: 'var(--cyan)', boxShadow: '0 0 10px var(--cyan)' }} />
      <input type="range" min={min} max={max} value={value[0]} onChange={(e) => onChange([Math.min(Number(e.target.value), value[1]), value[1]])} />
      <input type="range" min={min} max={max} value={value[1]} onChange={(e) => onChange([value[0], Math.max(Number(e.target.value), value[0])])} />
    </div>
  )
}
