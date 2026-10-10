import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'motion/react'
import type { Game } from '../types'
import { STATUSES, STATUS_META } from '../types'
import { useDb } from '../lib/db'
import { OWNER } from '../site'
import { applyFilters, DEFAULT_FILTERS, sortGames, timeOf, type Filters } from '../lib/game'
import { CountUp, Cover, isPending, PendingBanner, SectionHead, StatusBadge, TierTag } from '../components/ui'
import { FilterConsole } from '../components/FilterConsole'
import { Constellation } from '../views/Constellation'
import { Timeline } from '../views/Timeline'
import { Shelf } from '../views/Shelf'

type View = 'constellation' | 'timeline' | 'shelf'
const VIEWS: { key: View; label: string; en: string; desc: string }[] = [
  { key: 'constellation', label: '星图', en: 'STAR MAP', desc: '时间 × 评分的星座' },
  { key: 'timeline', label: '时间线', en: 'TIMELINE', desc: '按年份回看' },
  { key: 'shelf', label: '卡带架', en: 'SHELF', desc: '按状态上架' },
]
const VIEW_KEY = 'game-life:view'
const FILTER_KEY = 'game-life:filters'

export function Overview() {
  const { db } = useDb()
  const games = db?.games ?? []
  const [view, setViewState] = useState<View>(() => {
    // Phones start on the timeline; the star map needs width to breathe.
    const fallback: View = window.innerWidth < 640 ? 'timeline' : 'constellation'
    try { return (localStorage.getItem(VIEW_KEY) as View) || fallback } catch { return fallback }
  })
  const [filters, setFiltersState] = useState<Filters>(() => {
    try { return { ...DEFAULT_FILTERS, ...JSON.parse(sessionStorage.getItem(FILTER_KEY) ?? '{}') } } catch { return DEFAULT_FILTERS }
  })
  const archiveRef = useRef<HTMLDivElement>(null)
  const setView = (v: View) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v) } catch { /* ignore */ } }
  const setFilters = (f: Filters) => { setFiltersState(f); try { sessionStorage.setItem(FILTER_KEY, JSON.stringify(f)) } catch { /* ignore */ } }

  // Default the time axis to "played" once enough games carry a played date.
  useEffect(() => {
    if (!games.length || sessionStorage.getItem(FILTER_KEY)) return
    const played = games.filter((g) => g.playedFrom).length
    if (played / games.length >= 0.4) setFiltersState((f) => ({ ...f, basis: 'played' }))
  }, [games])

  const filtered = useMemo(() => applyFilters(games, filters), [games, filters])
  const jumpWith = (patch: Partial<Filters>) => {
    setFilters({ ...DEFAULT_FILTERS, basis: filters.basis, ...patch })
    archiveRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (!db) return <Loading />

  return (
    <div>
      <Hero games={games} onBrowse={() => archiveRef.current?.scrollIntoView({ behavior: 'smooth' })} />
      <Marquee games={games} />

      <div className="mx-auto max-w-[1480px] px-4 sm:px-8">
        <NowPlaying games={games} />
        <Insights games={games} onPick={jumpWith} />

        <section ref={archiveRef} className="scroll-mt-24 pt-24">
          <SectionHead idx="03" title="档案库" en="Archive">
            <div className="flex gap-1 p-1" style={{ border: '1px solid var(--line-2)', background: 'rgba(0,0,0,.3)' }}>
              {VIEWS.map((v) => (
                <button key={v.key} onClick={() => setView(v.key)} className="relative px-3 py-1.5 text-left sm:px-4" title={v.desc}>
                  {view === v.key && <motion.span layoutId="view-tab" className="absolute inset-0" style={{ background: 'linear-gradient(100deg, rgba(70,227,255,.18), rgba(255,92,168,.14))', border: '1px solid rgba(70,227,255,.45)' }} />}
                  <span className="relative block text-[13.5px] font-bold" style={{ color: view === v.key ? '#fff' : 'var(--muted)' }}>{v.label}</span>
                </button>
              ))}
            </div>
          </SectionHead>
          <FilterConsole games={games} filters={filters} setFilters={setFilters} resultCount={filtered.length} />
          <div className="mt-8">
            <AnimatePresence mode="wait">
              <motion.div key={view} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: .35 }}>
                {filtered.length === 0 ? <Empty /> :
                  view === 'constellation' ? <Constellation games={filtered} basis={filters.basis} /> :
                  view === 'timeline' ? <Timeline games={filtered} basis={filters.basis} /> :
                  <Shelf games={filtered} />}
              </motion.div>
            </AnimatePresence>
          </div>
        </section>
      </div>
    </div>
  )
}

function Loading() {
  // Skeleton mirrors the hero layout so the page doesn't jump when data arrives.
  return (
    <div className="mx-auto grid max-w-[1480px] gap-12 px-4 pt-20 sm:px-8 lg:grid-cols-[1.25fr_1fr]" aria-busy="true">
      <div className="grid content-start gap-5">
        <div className="cover h-4 w-56" /><div className="cover h-28 w-80" /><div className="cover h-28 w-72" />
        <div className="cover h-5 w-[520px] max-w-full" /><div className="cover h-5 w-[420px] max-w-full" />
        <div className="cover mt-8 h-24 w-full" />
      </div>
      <div className="cover mx-auto aspect-[2/3] w-[78%] max-w-[340px]" />
    </div>
  )
}

function Empty() {
  return (
    <div className="panel cut flex flex-col items-center justify-center gap-2 py-24 text-center">
      <div className="display text-[40px] font-black" style={{ color: 'transparent', WebkitTextStroke: '1px var(--dim)' }}>NO SIGNAL</div>
      <div className="text-sm" style={{ color: 'var(--muted)' }}>没有符合条件的游戏，试试放宽筛选。</div>
    </div>
  )
}

// ---------------------------------------------------------------- hero

function Hero({ games, onBrowse }: { games: Game[]; onBrowse: () => void }) {
  const { db, byId } = useDb()
  const awardGame = (t: string) => { const a = db?.awards.find((x) => x.title === t); return a?.gameId ? byId.get(a.gameId) : undefined }
  const fav = awardGame('最爱的') ?? sortGames(games, 'score')[0]
  const first = awardGame('玩的第一款')
  const stats = useMemo(() => {
    const scored = games.filter((g) => g.score != null)
    const count = (s: string) => games.filter((g) => g.status === s).length
    return {
      total: games.length, finished: count('finished'), playing: count('playing') + count('paused'), backlog: count('unplayed'),
      avg: scored.length ? scored.reduce((s, g) => s + g.score!, 0) / scored.length : 0,
      top: scored.filter((g) => g.score! >= 90).length,
      genres: new Set(games.flatMap((g) => g.genres)).size,
    }
  }, [games])

  return (
    <section className="relative overflow-hidden">
      {/* giant outline word */}

      <div className="relative mx-auto grid max-w-[1480px] items-center gap-12 px-4 pb-16 pt-14 sm:px-8 lg:grid-cols-[1.25fr_1fr] lg:pt-20">
        <div>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: .1 }} className="flex flex-wrap items-center gap-3">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full rounded-full" style={{ background: 'var(--lime, #9dff72)', animation: 'pulse-ring 1.8s ease-out infinite' }} /><span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: '#9dff72' }} /></span>
            <span className="label" style={{ color: '#9dff72' }}>PLAYER FILE · ONLINE</span>
            <span className="label" style={{ color: '#fff' }}>PLAYER · <span className="normal-case">{OWNER}</span></span>
            <span className="label">NO.0001 · {new Date().getFullYear()}.{String(new Date().getMonth() + 1).padStart(2, '0')}</span>
          </motion.div>

          <h1 className="mt-6 font-black leading-[.95] tracking-tight" style={{ fontSize: 'clamp(56px, 8.4vw, 132px)' }}>
            {['游戏', '生涯'].map((w, i) => (
              <motion.span key={w} className="block" initial={{ opacity: 0, y: 40, clipPath: 'inset(0 0 100% 0)' }} animate={{ opacity: 1, y: 0, clipPath: 'inset(0 0 0% 0)' }}
                transition={{ delay: .15 + i * .12, duration: .9, ease: [0.16, 1, 0.3, 1] }}
                style={i === 0 ? { color: '#c9d0e3' } : { background: 'linear-gradient(95deg, #fff 20%, #9eeeff 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
                {w}{i === 1 && <span style={{ color: 'var(--pink)', WebkitTextFillColor: 'var(--pink)' }}>.</span>}
              </motion.span>
            ))}
          </h1>

          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .5 }} className="mt-7 max-w-[560px] text-[16px] leading-[1.9]" style={{ color: '#b9c1d8' }}>
            {first ? <>从《<Link to={`/game/${first.id}`} className="font-bold text-white underline decoration-[var(--cyan)] decoration-2 underline-offset-4">{first.title}</Link>》出发，</> : null}
            这里存放着 <b className="text-white">{OWNER}</b> 的 <b className="hud text-white">{stats.total}</b> 款游戏记忆：<b className="hud text-white">{stats.finished}</b> 次通关，
            <b className="hud text-white">{stats.top}</b> 部打出了 90 分以上。
            {fav && <>最爱，始终是《<Link to={`/game/${fav.id}`} className="font-bold" style={{ color: 'var(--pink)' }}>{fav.title}</Link>》。</>}
          </motion.p>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: .65 }} className="mt-9 flex flex-wrap gap-3">
            <button className="btn btn-primary h-11 px-6" onClick={onBrowse}>浏览档案 <span>↓</span></button>
            <Link to="/ranking" className="btn h-11 px-6">天梯榜 <span style={{ color: 'var(--cyan)' }}>→</span></Link>
            <Link to="/hall" className="btn btn-ghost h-11 px-4" style={{ color: 'var(--muted)' }}>我的喜好表</Link>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .75 }}
            className="mt-12 grid grid-cols-3 gap-px sm:grid-cols-6" style={{ background: 'var(--line)', border: '1px solid var(--line)' }}>
            {[
              { k: 'TOTAL', v: stats.total, c: '收录' },
              { k: 'CLEARED', v: stats.finished, c: '通关' },
              { k: 'ACTIVE', v: stats.playing, c: '进行中' },
              { k: 'BACKLOG', v: stats.backlog, c: '心愿单' },
              { k: 'AVG', v: stats.avg, c: '平均分', d: 1 },
              { k: 'GENRES', v: stats.genres, c: '类型' },
            ].map((s) => (
              <div key={s.k} className="px-4 py-3.5" style={{ background: 'rgba(7,9,15,.85)' }}>
                <div className="text-[11.5px]" style={{ color: 'var(--muted)' }}>{s.c}</div>
                <CountUp value={s.v} decimals={s.d ?? 0} className="hud mt-1.5 block text-[28px] font-bold leading-none" />
              </div>
            ))}
          </motion.div>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: .9 }}><PendingBanner className="mt-3" /></motion.div>
        </div>

        {fav && <FeatureCard game={fav} />}
      </div>
    </section>
  )
}

function FeatureCard({ game }: { game: Game }) {
  const mx = useMotionValue(0.5)
  const my = useMotionValue(0.5)
  const rx = useSpring(useTransform(my, [0, 1], [10, -10]), { stiffness: 150, damping: 18 })
  const ry = useSpring(useTransform(mx, [0, 1], [-12, 12]), { stiffness: 150, damping: 18 })
  const glareX = useTransform(mx, [0, 1], ['0%', '100%'])
  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    mx.set((e.clientX - r.left) / r.width)
    my.set((e.clientY - r.top) / r.height)
  }
  return (
    <motion.div initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: .3, duration: .9, ease: [0.16, 1, 0.3, 1] }}
      className="relative mx-auto w-full max-w-[440px]" style={{ perspective: 1200 }}>
      {/* manga focus lines */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[150%] w-[150%] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[.06]"
        style={{ background: 'repeating-conic-gradient(from 0deg, #fff 0deg .6deg, transparent .6deg 6deg)', maskImage: 'radial-gradient(circle, transparent 32%, #000 46%, transparent 70%)', WebkitMaskImage: 'radial-gradient(circle, transparent 32%, #000 46%, transparent 70%)', animation: 'spin-slow 140s linear infinite' }} />
      {/* orbit rings */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[118%] w-[118%] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ border: '1px dashed rgba(70,227,255,.18)', animation: 'spin-slow 60s linear infinite' }} />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[96%] w-[96%] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ border: '1px solid rgba(255,92,168,.12)' }} />

      <Link to={`/game/${game.id}`}>
        <motion.div onMouseMove={onMove} onMouseLeave={() => { mx.set(.5); my.set(.5) }} style={{ rotateX: rx, rotateY: ry, transformStyle: 'preserve-3d' }}
          className="relative mx-auto aspect-[2/3] w-[78%]">
          <div className="absolute -inset-3 blur-2xl" style={{ background: 'linear-gradient(140deg, var(--cyan), var(--pink))', opacity: .18 }} />
          <div className="relative h-full w-full overflow-hidden" style={{ clipPath: 'polygon(0 0, calc(100% - 26px) 0, 100% 26px, 100% 100%, 26px 100%, 0 calc(100% - 26px))', boxShadow: '0 30px 80px -20px rgba(0,0,0,.9)' }}>
            <Cover game={game} sizes="lg" eager className="h-full w-full" />
            <motion.div className="pointer-events-none absolute inset-0" style={{ background: useTransform(glareX, (x) => `linear-gradient(115deg, transparent 20%, rgba(255,255,255,.22) ${x}, transparent 70%)`) }} />
          </div>
          {/* Name plate sits on its own surface so it never fights the cover's logo. */}
          <div className="absolute -bottom-8 left-5 right-5 px-5 py-3" style={{ transform: 'translateZ(50px)', background: 'rgba(8,10,17,.95)', border: '1px solid rgba(255,92,168,.45)', clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%)', boxShadow: '0 20px 40px -10px rgba(0,0,0,.8)' }}>
            <div className="text-[11.5px] font-semibold tracking-[.12em]" style={{ color: 'var(--pink)' }}>最爱的 · No.1</div>
            <div className="ttl mt-0.5 truncate text-[26px] leading-tight">{game.title}</div>
          </div>
          <div className="absolute -right-7 top-8 flex flex-col items-center" style={{ transform: 'translateZ(60px)' }}>
            <div className="hud flex h-[74px] w-[74px] flex-col items-center justify-center" style={{ background: 'rgba(5,6,10,.85)', border: '1px solid var(--pink)', clipPath: 'polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)', boxShadow: '0 0 30px rgba(255,92,168,.4)' }}>
              <span className="text-[26px] font-bold leading-none">{game.score ?? '—'}{isPending(game) && <sup className="text-[12px]" style={{ color: 'var(--amber)' }}>?</sup>}</span>
              <span className="label text-[8px]" style={{ color: 'var(--pink)' }}>SCORE</span>
            </div>
          </div>
          <div className="absolute -left-6 top-10 px-3 py-1.5" style={{ transform: 'translateZ(40px)', background: 'rgba(5,6,10,.9)', border: '1px solid rgba(70,227,255,.5)' }}>
            <StatusBadge status={game.status} size="sm" />
          </div>
        </motion.div>
      </Link>
    </motion.div>
  )
}

// ---------------------------------------------------------------- marquee

function Marquee({ games }: { games: Game[] }) {
  const withCover = games.filter((g) => g.cover)
  const rows = [withCover.filter((_, i) => i % 2 === 0), withCover.filter((_, i) => i % 2 === 1)]
  const nav = useNavigate()
  if (withCover.length < 8) return null
  return (
    <div className="fade-edges-x relative -rotate-[2.2deg] scale-[1.04] overflow-hidden py-6" style={{ borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)', background: 'rgba(6,8,14,.6)' }}>
      {rows.map((row, ri) => (
        <div key={ri} className="marquee my-2.5">
          <div className="marquee-track gap-3" style={{ ['--dur' as string]: `${row.length * 3.2}s`, animationDirection: ri ? 'reverse' : 'normal' }}>
            {[...row, ...row].map((g, i) => (
              <button key={`${g.id}-${i}`} onClick={() => nav(`/game/${g.id}`)} className="group relative h-[150px] w-[100px] shrink-0 overflow-hidden" title={g.title}>
                <Cover game={g} sizes="sm" className="h-full w-full grayscale-[.55] transition-all duration-500 group-hover:scale-105 group-hover:grayscale-0" />
                <span className="absolute inset-0 transition-opacity group-hover:opacity-0" style={{ background: 'linear-gradient(180deg, transparent 40%, rgba(5,6,10,.7))' }} />
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-[2.2deg] px-5 py-2" style={{ background: 'var(--pink)', boxShadow: '0 0 40px rgba(255,92,168,.5)' }}>
        <span className="display text-[13px] font-extrabold tracking-[.3em] text-white">{games.length} GAMES · ONE LIFE</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- now playing

function NowPlaying({ games }: { games: Game[] }) {
  const active = sortGames(games.filter((g) => g.status === 'playing' || g.status === 'paused'), 'updated').sort((a, b) => (a.status === 'playing' ? -1 : 1) - (b.status === 'playing' ? -1 : 1))
  if (!active.length) return null
  return (
    <section className="pt-20">
      <SectionHead idx="01" title="进行中的冒险" en="In Progress" />
      <div className="no-scrollbar flex snap-x gap-4 overflow-x-auto pb-2">
        {active.map((g, i) => (
          <motion.div key={g.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * .06 }} className="snap-start">
            <Link to={`/game/${g.id}`} className="shine group relative block h-[200px] w-[340px] overflow-hidden" style={{ clipPath: 'polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 0 100%)', border: '1px solid var(--line)' }}>
              {g.hero || g.cover ? <img src={g.hero ?? g.cover} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-55 transition-all duration-700 group-hover:scale-105 group-hover:opacity-75" /> : <Cover game={g} className="absolute inset-0" />}
              <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(5,6,10,.95) 0%, rgba(5,6,10,.5) 60%, transparent)' }} />
              <div className="relative flex h-full flex-col items-start justify-between p-5">
                <StatusBadge status={g.status} size="sm" />
                <div>
                  <div className="ttl text-[24px]">{g.title}</div>
                  <div className="mt-0.5 text-[12px]" style={{ color: '#aeb6cc' }}>{g.titleEn}</div>
                  <div className="mt-2 line-clamp-1 h-[18px] text-[12px]" style={{ color: '#c2c9dd' }}>{g.oneLiner ?? (g.status === 'playing' ? '正在推进' : '暂时搁置')}</div>
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- insights

function Insights({ games, onPick }: { games: Game[]; onPick: (f: Partial<Filters>) => void }) {
  // Two headline charts by default; the rest is one click away to keep the page focused.
  const [more, setMoreState] = useState(() => { try { return localStorage.getItem('game-life:stats-more') === '1' } catch { return false } })
  const setMore = (v: boolean) => { setMoreState(v); try { localStorage.setItem('game-life:stats-more', v ? '1' : '0') } catch { /* private mode */ } }
  const genre = useMemo(() => {
    const m = new Map<string, { n: number; sum: number; scored: number }>()
    games.forEach((g) => g.genres.forEach((x) => {
      const e = m.get(x) ?? { n: 0, sum: 0, scored: 0 }
      e.n++
      if (g.score != null) { e.sum += g.score; e.scored++ }
      m.set(x, e)
    }))
    return [...m.entries()].map(([k, v]) => ({ k, n: v.n, avg: v.scored ? v.sum / v.scored : null })).sort((a, b) => b.n - a.n).slice(0, 8)
  }, [games])
  const maxN = Math.max(1, ...genre.map((g) => g.n))

  const hist = useMemo(() => {
    const bins = Array.from({ length: 6 }, (_, i) => ({ lo: 40 + i * 10, n: 0 }))
    bins[5].lo = 90
    games.forEach((g) => { if (g.score == null) return; const i = Math.min(5, Math.max(0, Math.floor((g.score - 40) / 10))); bins[i].n++ })
    return bins
  }, [games])
  const maxH = Math.max(1, ...hist.map((b) => b.n))

  const statusTotals = STATUSES.map((s) => ({ s, n: games.filter((g) => g.status === s).length })).filter((x) => x.n)

  const years = useMemo(() => {
    const m = new Map<number, number>()
    games.forEach((g) => { const t = timeOf(g, 'release'); if (t) m.set(Number(t.slice(0, 4)), (m.get(Number(t.slice(0, 4))) ?? 0) + 1) })
    const ks = [...m.keys()]
    if (!ks.length) return []
    const lo = Math.min(...ks), hi = Math.max(...ks)
    return Array.from({ length: hi - lo + 1 }, (_, i) => ({ y: lo + i, n: m.get(lo + i) ?? 0 }))
  }, [games])
  const maxY = Math.max(1, ...years.map((y) => y.n))

  return (
    <section className="pt-14">
      <SectionHead idx="02" title="生涯数据" en="Statistics" />
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="panel cut p-6">
          <div className="flex items-baseline justify-between"><span className="cap">类型偏好</span><span className="cap-hint">数量 · 均分 · 点击筛选</span></div>
          <div className="mt-5 grid gap-2.5">
            {genre.map((g, i) => (
              <button key={g.k} onClick={() => onPick({ genres: [g.k] })} className="group grid grid-cols-[92px_1fr_30px_40px] items-center gap-3 text-left">
                <span className="truncate text-[13px] font-semibold transition-colors group-hover:text-white" style={{ color: '#c7cee2' }}>{g.k}</span>
                <span className="relative h-[14px]" style={{ background: 'rgba(140,165,255,.06)' }}>
                  <motion.span initial={{ width: 0 }} whileInView={{ width: `${(g.n / maxN) * 100}%` }} viewport={{ once: true }} transition={{ duration: 1, delay: i * .05, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute inset-y-0 left-0" style={{ background: `linear-gradient(90deg, rgba(70,227,255,.25), ${i === 0 ? 'var(--pink)' : 'var(--cyan)'})`, boxShadow: i === 0 ? '0 0 16px rgba(255,92,168,.5)' : undefined }} />
                </span>
                <span className="mono text-right text-[11px]" style={{ color: 'var(--muted)' }}>{g.n}</span>
                <span className="hud text-right text-[15px] font-bold" style={{ color: g.avg && g.avg >= 85 ? 'var(--amber)' : '#dfe4f2' }}>{g.avg ? g.avg.toFixed(0) : '—'}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4">
          <div className="panel cut p-6">
            <div className="flex items-baseline justify-between"><span className="cap">评分分布</span><span className="cap-hint">点击筛选</span></div>
            <div className="mt-4 flex h-[120px] items-end gap-2">
              {hist.map((b, i) => (
                <button key={b.lo} onClick={() => onPick({ score: [b.lo, i === 5 ? 100 : b.lo + 9], includeUnscored: false })} className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                  <span className="hud text-[12px] font-bold" style={{ color: 'var(--muted)' }}>{b.n}</span>
                  <motion.span initial={{ height: 0 }} whileInView={{ height: `${(b.n / maxH) * 78}%` }} viewport={{ once: true }} transition={{ duration: .9, delay: i * .06 }}
                    className="w-full transition-[filter] group-hover:brightness-125"
                    style={{ minHeight: 2, background: i >= 5 ? 'linear-gradient(180deg, var(--pink), rgba(255,92,168,.2))' : i >= 4 ? 'linear-gradient(180deg, var(--amber), rgba(255,197,71,.15))' : 'linear-gradient(180deg, var(--cyan), rgba(70,227,255,.1))' }} />
                  <span className="mono text-[10px]" style={{ color: 'var(--dim)' }}>{i === 0 ? '<50' : i === 5 ? '90+' : `${b.lo}`}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="panel cut p-6">
            <span className="cap">状态构成</span>
            <div className="mt-4 flex h-3 overflow-hidden">
              {statusTotals.map(({ s, n }) => (
                <motion.button key={s} onClick={() => onPick({ statuses: [s] })} title={`${STATUS_META[s].label} ${n}`}
                  initial={{ flexGrow: 0 }} whileInView={{ flexGrow: n }} viewport={{ once: true }} transition={{ duration: 1 }}
                  className="h-full border-r border-black/60 transition-[filter] hover:brightness-125" style={{ background: STATUS_META[s].color, flexBasis: 0 }} />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
              {statusTotals.map(({ s, n }) => (
                <button key={s} onClick={() => onPick({ statuses: [s] })} className="flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--muted)' }}>
                  <span className="h-2 w-2 rotate-45" style={{ background: STATUS_META[s].color }} />{STATUS_META[s].label}<span className="hud font-bold text-white">{n}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {more && years.length > 1 && (
          <div className="panel cut p-6 lg:col-span-2">
            <div className="flex items-baseline justify-between"><span className="cap">玩过的游戏来自哪一年</span><span className="cap-hint">按发售年份 · 点击筛选</span></div>
            <div className="mt-4 flex h-[90px] items-end gap-[3px]">
              {years.map((y) => (
                <button key={y.y} onClick={() => onPick({ basis: 'release', years: [y.y, y.y] })} className="group relative flex h-full flex-1 flex-col justify-end" title={`${y.y}：${y.n} 款`}>
                  <motion.span initial={{ height: 0 }} whileInView={{ height: `${(y.n / maxY) * 100}%` }} viewport={{ once: true }} transition={{ duration: .8 }}
                    className="w-full group-hover:brightness-150" style={{ minHeight: y.n ? 3 : 1, background: y.n ? 'linear-gradient(180deg, var(--violet), rgba(185,140,255,.15))' : 'rgba(140,165,255,.1)' }} />
                  {(y.y % 5 === 0 || y.y === years[years.length - 1].y) && <span className="mono absolute -bottom-5 left-1/2 -translate-x-1/2 text-[9.5px]" style={{ color: 'var(--dim)' }}>{y.y}</span>}
                </button>
              ))}
            </div>
            <div className="h-5" />
          </div>
        )}
      </div>
      {more && <TopStrip games={games} />}
      <button onClick={() => setMore(!more)} className="mt-4 flex w-full items-center justify-center gap-2 py-2.5 text-[12.5px] transition-colors hover:text-white"
        style={{ border: '1px dashed var(--line-2)', color: 'var(--muted)' }}>
        {more ? '收起 ▴' : '展开更多数据：发售年份分布 · 评分前五 ▾'}
      </button>
    </section>
  )
}

function TopStrip({ games }: { games: Game[] }) {
  const top = sortGames(games.filter((g) => g.score != null), 'score').slice(0, 5)
  if (!top.length) return null
  return (
    <div className="mt-4 grid grid-cols-2 gap-px sm:grid-cols-5" style={{ background: 'var(--line)', border: '1px solid var(--line)' }}>
      {top.map((g, i) => (
        <Link key={g.id} to={`/game/${g.id}`} className="group flex items-center gap-3 p-3 transition-colors hover:bg-white/[.03]" style={{ background: 'rgba(7,9,15,.9)' }}>
          <span className="display text-[22px] font-black" style={{ color: i === 0 ? 'var(--pink)' : 'var(--dim)' }}>{i + 1}</span>
          <Cover game={g} sizes="sm" className="h-[54px] w-9 shrink-0" />
          <div className="min-w-0">
            <div className="ttl truncate text-[15px]">{g.title}</div>
            <div className="flex items-center gap-1.5"><TierTag score={g.score} pending={isPending(g)} /><span className="hud text-[14px] font-bold">{g.score}</span></div>
          </div>
        </Link>
      ))}
    </div>
  )
}
