import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'motion/react'
import type { Anime, WatchStatus } from '../model'
import { AIR_META, AIR_STATUSES, FORMATS, WATCH_META, WATCH_STATUSES } from '../model'
import { useAnimeDb } from '../db'
import { AHead, AirBadge, AnimeCover, PosterCard, Star, WatchBadge } from '../components'
import {
  accentOf, applyFilters, DEFAULT_FILTERS, quarterLabel, quarterOf, QUARTERS, seasonTag, SORTS, sortAnime,
  type AnimeFilters, type SortKey,
} from '../util'
import { CountUp } from '../../components/ui'
import { OWNER } from '../../site'

type View = 'wall' | 'season' | 'series'
const VIEWS: { key: View; label: string; desc: string }[] = [
  { key: 'wall', label: '海报墙', desc: '一季一张海报' },
  { key: 'season', label: '季度表', desc: '按放送季度排列，像新番表一样' },
  { key: 'series', label: '系列', desc: '同一系列的各季连成一条线' },
]
const VIEW_KEY = 'anime-life:view'
const FILTER_KEY = 'anime-life:filters'
const SORT_KEY = 'anime-life:sort'

function store<T>(kind: 'local' | 'session', key: string, fallback: T): T {
  try {
    const raw = (kind === 'local' ? localStorage : sessionStorage).getItem(key)
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback
  } catch { return fallback }
}
function save(kind: 'local' | 'session', key: string, v: unknown) {
  try { (kind === 'local' ? localStorage : sessionStorage).setItem(key, JSON.stringify(v)) } catch { /* private mode */ }
}

export function AnimeHome() {
  const { db } = useAnimeDb()
  const list = useMemo(() => db?.anime ?? [], [db])
  const [view, setViewState] = useState<View>(() => store('local', VIEW_KEY, { v: 'wall' as View }).v)
  const [filters, setFiltersState] = useState<AnimeFilters>(() => store('session', FILTER_KEY, DEFAULT_FILTERS))
  const [sort, setSortState] = useState<SortKey>(() => store('local', SORT_KEY, { v: 'air-desc' as SortKey }).v)
  const archiveRef = useRef<HTMLElement>(null)
  const setView = (v: View) => { setViewState(v); save('local', VIEW_KEY, { v }) }
  const setFilters = (f: AnimeFilters) => { setFiltersState(f); save('session', FILTER_KEY, f) }
  const setSort = (v: SortKey) => { setSortState(v); save('local', SORT_KEY, { v }) }

  useEffect(() => { document.title = `${OWNER} 的番剧生涯 · ANIME LIFE` }, [])

  const filtered = useMemo(() => sortAnime(applyFilters(list, filters), sort), [list, filters, sort])
  const jump = (patch: Partial<AnimeFilters>, v?: View) => {
    setFilters({ ...DEFAULT_FILTERS, ...patch })
    if (v) setView(v)
    requestAnimationFrame(() => archiveRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  if (!db) return <Loading />

  return (
    <div>
      <Hero list={list} onBrowse={(v) => jump({}, v)} />
      <Marquee list={list} />
      <div className="mx-auto max-w-[1480px] px-4 sm:px-8">
        <OnAir list={list} />
        <Backlog list={list} onMore={() => jump({ status: 'planned' })} />
        <Insights list={list} onPick={jump} />
        <section ref={archiveRef} className="scroll-mt-20 pt-24" id="archive">
          <AHead num="04" title="档案库" kana="アーカイブ">
            <div className="flex gap-1 p-1" role="tablist" aria-label="视图" style={{ border: '1px solid var(--line-2)', background: 'rgba(0,0,0,.3)' }}>
              {VIEWS.map((v) => (
                <button key={v.key} role="tab" aria-selected={view === v.key} onClick={() => setView(v.key)} className="relative px-3.5 py-1.5 sm:px-4" title={v.desc}>
                  {view === v.key && <motion.span layoutId="anime-view-tab" className="absolute inset-0" style={{ background: 'linear-gradient(100deg, rgba(255,126,182,.3), rgba(155,123,255,.25))', border: '1px solid rgba(255,126,182,.55)' }} />}
                  <span className="relative text-[13.5px] font-bold" style={{ color: view === v.key ? '#fff' : 'var(--muted)' }}>{v.label}</span>
                </button>
              ))}
            </div>
          </AHead>
          <FilterBar list={list} filters={filters} setFilters={setFilters} sort={sort} setSort={setSort} count={filtered.length} view={view} />
          <div className="mt-8">
            <AnimatePresence mode="wait">
              <motion.div key={view} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: .3 }}>
                {filtered.length === 0 ? <Empty onReset={() => setFilters(DEFAULT_FILTERS)} /> :
                  view === 'wall' ? <Wall list={filtered} /> : view === 'season' ? <SeasonChart list={filtered} /> : <SeriesView list={filtered} all={list} />}
              </motion.div>
            </AnimatePresence>
          </div>
        </section>
      </div>
    </div>
  )
}

function Loading() {
  return (
    <div className="mx-auto grid max-w-[1480px] gap-12 px-4 pt-20 sm:px-8 lg:grid-cols-[1.2fr_1fr]" aria-busy="true">
      <div className="grid content-start gap-5">
        <div className="cover h-4 w-56 rounded" /><div className="cover h-28 w-80 rounded" /><div className="cover h-28 w-72 rounded" />
        <div className="cover h-5 w-[520px] max-w-full rounded" /><div className="cover mt-8 h-24 w-full rounded" />
      </div>
      <div className="cover mx-auto aspect-[2/3] w-[70%] max-w-[320px] cut cut-sm" />
    </div>
  )
}

function Empty({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 cut py-24 text-center" style={{ border: '1px dashed var(--line-2)' }}>
      <div className="jp text-[44px] font-black" style={{ color: 'transparent', WebkitTextStroke: '1px var(--sakura)' }}>なにもない…</div>
      <div className="text-sm" style={{ color: 'var(--muted)' }}>没有符合条件的番剧，试试放宽筛选。</div>
      <button className="btn h-9" onClick={onReset}>清空筛选</button>
    </div>
  )
}

// ---------------------------------------------------------------- hero

function Hero({ list, onBrowse }: { list: Anime[]; onBrowse: (v?: View) => void }) {
  const pool = useMemo(() => list.filter((a) => a.hero && a.cover && (a.status === 'watched' || a.status === 'watching')), [list])
  const [seed, setSeed] = useState(Math.random)
  const pick = pool.length ? pool[Math.floor(seed * pool.length)] : undefined
  const shuffle = () => setSeed((s) => {
    let n = Math.random()
    while (pool.length > 1 && Math.floor(n * pool.length) === Math.floor(s * pool.length)) n = Math.random()
    return n
  })
  const stats = useMemo(() => {
    const n = (s: WatchStatus) => list.filter((a) => a.status === s).length
    // Episodes of finished watches only: partial long runners (progress set) have no exact count.
    const eps = list.filter((a) => a.status === 'watched' && !a.progress && a.format !== '剧场版').reduce((s, a) => s + (a.episodes ?? 0), 0)
    return { total: list.length, watched: n('watched'), watching: n('watching'), planned: n('planned'), eps, series: new Set(list.map((a) => a.series ?? a.title)).size }
  }, [list])
  const now = new Date()
  const q = QUARTERS[Math.floor(now.getMonth() / 3)]

  return (
    <section className="relative overflow-hidden">
      <AnimatePresence>
        {pick?.hero && (
          <motion.img key={pick.id} src={pick.hero} alt="" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            initial={{ opacity: 0, scale: 1.05 }} animate={{ opacity: .55, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }} />
        )}
      </AnimatePresence>
      <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(7,6,26,.55), rgba(7,6,26,.4) 40%, rgba(7,6,26,.92) 82%, var(--bg)), linear-gradient(90deg, rgba(7,6,26,.96), rgba(7,6,26,.82) 42%, rgba(7,6,26,.3) 78%, rgba(7,6,26,.5))' }} />
      <div className="tone pointer-events-none absolute -right-20 top-0 h-[520px] w-[520px] opacity-20" style={{ maskImage: 'radial-gradient(circle, #000, transparent 70%)', WebkitMaskImage: 'radial-gradient(circle, #000, transparent 70%)' }} />
      <div className="ghost-jp tategaki pointer-events-none absolute right-4 top-10 hidden whitespace-nowrap text-[128px] xl:block" aria-hidden>アニメ</div>

      <div className="relative mx-auto grid max-w-[1480px] items-center gap-14 px-4 pb-20 pt-14 sm:px-8 lg:grid-cols-[1.2fr_1fr] lg:pt-20">
        <div className="min-w-0">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: .1 }} className="flex flex-wrap items-center gap-3">
            <span className="onair" style={{ color: '#ff5f7a', border: '1px solid rgba(255,95,122,.45)', background: 'rgba(255,95,122,.1)' }}><i />REC</span>
            <span className="label" style={{ color: '#fff' }}>ANIME FILE · <span className="normal-case">{OWNER}</span></span>
            <span className="label">{now.getFullYear()}.{String(now.getMonth() + 1).padStart(2, '0')} · <span className="jp normal-case tracking-[.2em]" style={{ color: q.color }}>{q.jp}</span></span>
          </motion.div>

          <h1 className="mt-6 font-black leading-[.95] tracking-tight" style={{ fontSize: 'clamp(60px, 8.6vw, 136px)' }}>
            {['番剧', '生涯'].map((w, i) => (
              <motion.span key={w} className="block" initial={{ opacity: 0, y: 40, clipPath: 'inset(0 0 100% 0)' }} animate={{ opacity: 1, y: 0, clipPath: 'inset(0 0 0% 0)' }}
                transition={{ delay: .15 + i * .12, duration: .9, ease: [0.16, 1, 0.3, 1] }}
                style={i === 0 ? { color: '#d9d2f2' } : { background: 'linear-gradient(95deg, #fff 10%, #ffc2dc 55%, #b9a4ff 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
                {w}{i === 1 && <span style={{ color: 'var(--pink)', WebkitTextFillColor: 'var(--pink)' }}>。</span>}
              </motion.span>
            ))}
          </h1>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: .45 }} className="jp mt-3 text-[13px] tracking-[.5em]" style={{ color: 'var(--sakura)' }}>
            ── 見てきた物語の、すべての記録
          </motion.div>

          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .5 }} className="mt-7 max-w-[580px] text-[16px] leading-[1.95]" style={{ color: '#c4bddf' }}>
            这里收录了 <b className="text-white">{OWNER}</b> 的 <b className="hud text-white">{stats.total}</b> 部番剧，每一季单独记一条：
            已看过 <b className="hud" style={{ color: WATCH_META.watched.color }}>{stats.watched}</b> 部，
            正在看 <b className="hud" style={{ color: WATCH_META.watching.color }}>{stats.watching}</b> 部，
            待观看 <b className="hud" style={{ color: WATCH_META.planned.color }}>{stats.planned}</b> 部。
          </motion.p>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: .62 }} className="mt-9 flex flex-wrap gap-3">
            <button className="btn btn-sakura h-11 px-6" onClick={() => onBrowse()}>浏览档案 <span>↓</span></button>
            <button className="btn h-11 px-6" onClick={() => onBrowse('season')}>看季度表 <span style={{ color: 'var(--pink)' }}>→</span></button>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .75 }}
            className="mt-12 grid grid-cols-3 gap-px overflow-hidden cut cut-sm sm:grid-cols-6" style={{ background: 'var(--line)', border: '1px solid var(--line)' }}>
            {[
              { k: '收录', v: stats.total }, { k: '已看过', v: stats.watched }, { k: '正在看', v: stats.watching },
              { k: '待观看', v: stats.planned }, { k: '看完的话数', v: stats.eps, hint: '已看完作品的集数之和，不含剧场版和只看了一部分的长篇' }, { k: '系列', v: stats.series },
            ].map((s) => (
              <div key={s.k} className="px-4 py-3.5" style={{ background: 'rgba(10,8,28,.88)' }} title={s.hint}>
                <div className="text-[11.5px]" style={{ color: 'var(--muted)' }}>{s.k}</div>
                <CountUp value={s.v} className="hud mt-1.5 block text-[28px] font-bold leading-none" />
              </div>
            ))}
          </motion.div>
        </div>

        {pick && <FeatureCel key={pick.id} anime={pick} onShuffle={shuffle} />}
      </div>
    </section>
  )
}

/** Random pick shown as a tilted animation cel on a film strip. */
function FeatureCel({ anime, onShuffle }: { anime: Anime; onShuffle: () => void }) {
  const mx = useMotionValue(.5)
  const my = useMotionValue(.5)
  const rx = useSpring(useTransform(my, [0, 1], [9, -9]), { stiffness: 150, damping: 18 })
  const ry = useSpring(useTransform(mx, [0, 1], [-11, 11]), { stiffness: 150, damping: 18 })
  const glare = useTransform(mx, [0, 1], ['0%', '100%'])
  const glareBg = useTransform(glare, (x) => `linear-gradient(115deg, transparent 20%, rgba(255,255,255,.25) ${x}, transparent 70%)`)
  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    mx.set((e.clientX - r.left) / r.width)
    my.set((e.clientY - r.top) / r.height)
  }
  const accent = accentOf(anime)
  const tag = seasonTag(anime)
  return (
    <motion.div initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: .3, duration: .9, ease: [0.16, 1, 0.3, 1] }}
      className="relative mx-auto w-full max-w-[440px]" style={{ perspective: 1200 }}>
      <div className="focus-lines pointer-events-none absolute left-1/2 top-1/2 h-[150%] w-[150%] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[.07]" style={{ animation: 'spin-slow 160s linear infinite' }} />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[112%] w-[112%] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ border: '1px dashed rgba(255,126,182,.22)', animation: 'spin-slow 70s linear infinite' }} />
      {[[8, 12, 16], [88, 20, 11], [12, 82, 12], [92, 74, 18]].map(([l, t, s], i) => (
        <Star key={i} size={s} color={i % 2 ? '#fff' : 'var(--sakura)'} className="pointer-events-none absolute" style={{ left: `${l}%`, top: `${t}%`, animation: `floaty ${2.4 + i * .5}s ease-in-out infinite`, filter: 'drop-shadow(0 0 6px var(--pink))' }} />
      ))}

      <Link to={`/anime/${anime.id}`} aria-label={`随机推荐：${anime.title}`}>
        <motion.div onMouseMove={onMove} onMouseLeave={() => { mx.set(.5); my.set(.5) }} style={{ rotateX: rx, rotateY: ry, transformStyle: 'preserve-3d' }}
          className="relative mx-auto aspect-[2/3] w-[76%]">
          <div className="absolute -inset-4 rounded-[28px] blur-2xl" style={{ background: `linear-gradient(140deg, ${accent}, var(--pink))`, opacity: .22 }} />
          <div className="relative h-full w-full overflow-hidden rounded-[18px]" style={{ boxShadow: '0 0 0 3px #fff, 0 0 0 4px rgba(0,0,0,.4), 0 30px 80px -20px rgba(0,0,0,.9)' }}>
            <AnimeCover anime={anime} large eager className="h-full w-full" />
            <motion.div className="pointer-events-none absolute inset-0" style={{ background: glareBg }} />
          </div>
          <div className="absolute -left-5 top-6 rotate-[-8deg] px-3 py-1.5 text-[12px] font-black tracking-[.1em]" style={{ transform: 'translateZ(50px) rotate(-8deg)', background: 'var(--amber)', color: '#2a1a00', boxShadow: '3px 3px 0 rgba(0,0,0,.6)' }}>
            今日の一本！
          </div>
          {tag && <span className="sticker absolute -right-4 top-16" style={{ transform: 'translateZ(40px) rotate(6deg)', ['--sticker' as string]: accent }}>{tag}</span>}
          <div className="absolute -bottom-9 left-4 right-4 cut cut-sm px-5 py-3" style={{ transform: 'translateZ(60px)', background: 'rgba(16,12,38,.96)', border: '1px solid rgba(255,126,182,.5)', boxShadow: '0 20px 40px -10px rgba(0,0,0,.8)' }}>
            <div className="flex items-center justify-between gap-2">
              <span className="whitespace-nowrap text-[11px] font-bold tracking-[.14em]" style={{ color: 'var(--pink)' }}><span className="hidden sm:inline">随机推荐 · </span>PICK UP</span>
              <WatchBadge status={anime.status} size="sm" />
            </div>
            <div className="ttl mt-1 truncate text-[24px] leading-tight">{anime.title}</div>
            {anime.titleJa && <div className="jp truncate text-[11.5px]" style={{ color: 'var(--dim)' }}>{anime.titleJa}</div>}
          </div>
        </motion.div>
      </Link>
      <div className="mt-16 flex justify-center">
        <button onClick={onShuffle} className="btn btn-ghost h-9 px-4 text-[12.5px]" style={{ color: 'var(--muted)' }}><span style={{ color: 'var(--pink)' }}>↻</span> 换一部</button>
      </div>
    </motion.div>
  )
}

// ---------------------------------------------------------------- marquee

function Marquee({ list }: { list: Anime[] }) {
  const nav = useNavigate()
  const withCover = list.filter((a) => a.cover)
  if (withCover.length < 8) return null
  const rows = [withCover.filter((_, i) => i % 2 === 0), withCover.filter((_, i) => i % 2 === 1)]
  return (
    <div className="film fade-edges-x relative rotate-[1.6deg] scale-[1.04] overflow-hidden" style={{ borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
      {rows.map((row, ri) => (
        <div key={ri} className="marquee my-2">
          <div className="marquee-track gap-2.5" style={{ ['--dur' as string]: `${row.length * 3.4}s`, animationDirection: ri ? 'reverse' : 'normal' }}>
            {[...row, ...row].map((a, i) => (
              <button key={`${a.id}-${i}`} onClick={() => nav(`/anime/${a.id}`)} className="group relative h-[138px] w-[92px] shrink-0 overflow-hidden cut cut-sm" title={a.title} tabIndex={i < row.length ? 0 : -1}>
                <AnimeCover anime={a} className="h-full w-full transition-all duration-500 group-hover:scale-105" style={{ filter: 'saturate(.8)' }} />
                <span className="absolute inset-0 transition-opacity group-hover:opacity-0" style={{ background: 'linear-gradient(180deg, transparent 40%, rgba(7,6,26,.7))' }} />
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-[1.6deg] rounded-full px-6 py-2" style={{ background: 'var(--pink)', boxShadow: '0 0 40px rgba(255,126,182,.55)' }}>
        <span className="display whitespace-nowrap text-[13px] font-extrabold tracking-[.3em] text-white">{list.length} TITLES · <span className="jp tracking-[.2em]">一期一会</span></span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- on air

function OnAir({ list }: { list: Anime[] }) {
  const items = list.filter((a) => a.status === 'watching' || a.air === 'airing')
    .sort((a, b) => (a.status === 'watching' ? 0 : 1) - (b.status === 'watching' ? 0 : 1) || (b.airStart ?? '').localeCompare(a.airStart ?? ''))
  if (!items.length) return null
  return (
    <section className="pt-24">
      <AHead num="01" title="追番中 · 放送中" kana="オンエア" />
      <div className="no-scrollbar -mx-4 flex snap-x scroll-pl-4 gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:scroll-pl-0 sm:px-0">
        {items.map((a, i) => {
          const accent = accentOf(a)
          return (
            <motion.div key={a.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * .06 }} className="shrink-0 snap-start">
              <Link to={`/anime/${a.id}`} className="group relative block h-[220px] w-[min(400px,84vw)] overflow-hidden cut" style={{ border: '1px solid var(--line-2)' }}>
                {a.hero || a.cover ? <img src={a.hero ?? a.cover} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-60 transition-all duration-700 group-hover:scale-105 group-hover:opacity-80" /> : null}
                <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(7,6,26,.96) 0%, rgba(7,6,26,.55) 62%, transparent)' }} />
                <div className="tone absolute inset-y-0 right-0 w-1/2 opacity-25" style={{ maskImage: 'linear-gradient(90deg, transparent, #000)', WebkitMaskImage: 'linear-gradient(90deg, transparent, #000)', ['--tone-color' as string]: accent }} />
                <div className="relative flex h-full flex-col justify-between p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <AirBadge air={a.air} size="sm" />
                    <WatchBadge status={a.status} size="sm" />
                  </div>
                  <div>
                    <div className="ttl text-[25px] leading-tight">{a.title}</div>
                    <div className="mt-1 text-[12px]" style={{ color: '#bcb5d8' }}>{quarterLabel(a.airStart)}{a.studio ? ` · ${a.studio}` : ''}{a.episodes ? ` · 全\u00a0${a.episodes}\u00a0话` : ''}</div>
                    {a.progress && <div className="mt-2 text-[12.5px]" style={{ color: accent }}>▶ {a.progress}</div>}
                    {a.watchedEps != null && a.episodes ? (
                      <div className="mt-3 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.12)' }}>
                          <div className="h-full rounded-full" style={{ width: `${Math.min(100, (a.watchedEps / a.episodes) * 100)}%`, background: `linear-gradient(90deg, var(--pink), ${accent})` }} />
                        </div>
                        <span className="hud text-[12px]">{a.watchedEps}/{a.episodes}</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </Link>
            </motion.div>
          )
        })}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- backlog tickets

function Backlog({ list, onMore }: { list: Anime[]; onMore: () => void }) {
  const items = sortAnime(list.filter((a) => a.status === 'planned'), 'air-desc')
  if (!items.length) return null
  return (
    <section className="pt-24">
      <AHead num="02" title="待看清单" kana="つぎに見る">
        <button onClick={onMore} className="pb-1.5 text-[13px] underline-offset-4 hover:underline" style={{ color: 'var(--pink)' }}>全部 {items.length} 部 →</button>
      </AHead>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.slice(0, 9).map((a, i) => <Ticket key={a.id} anime={a} index={i} />)}
      </div>
    </section>
  )
}

/** A cinema-ticket stub: cover on the left, perforated tear line, details on the right. */
function Ticket({ anime, index }: { anime: Anime; index: number }) {
  const accent = accentOf(anime)
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: (index % 3) * .06 }}>
      <Link to={`/anime/${anime.id}`} className="group relative flex h-[112px] overflow-hidden cut cut-sm transition-transform duration-300 hover:-translate-y-1"
        style={{ background: `linear-gradient(100deg, color-mix(in srgb, ${accent} 16%, #120f2a), #0f0c24 60%)`, border: '1px solid var(--line-2)' }}>
        <AnimeCover anime={anime} className="h-full w-[75px] shrink-0" />
        <div className="relative w-0 shrink-0" style={{ borderLeft: '2px dashed rgba(255,255,255,.18)' }}>
          <span className="absolute -left-[9px] -top-2 h-4 w-4 rounded-full" style={{ background: 'var(--bg)' }} />
          <span className="absolute -bottom-2 -left-[9px] h-4 w-4 rounded-full" style={{ background: 'var(--bg)' }} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-between px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <span className="mono text-[10px] tracking-[.2em]" style={{ color: accent }}>ADMIT ONE · {anime.airStart?.replace('-', '.') ?? 'TBA'}</span>
            <AirBadge air={anime.air} size="sm" />
          </div>
          <div className="ttl line-clamp-1 text-[18px] leading-tight group-hover:text-white">{anime.title}</div>
          <div className="truncate text-[11.5px]" style={{ color: 'var(--dim)' }}>{[quarterLabel(anime.airStart), anime.studio, anime.episodes ? `${anime.episodes} 话` : ''].filter(Boolean).join(' · ')}</div>
        </div>
      </Link>
    </motion.div>
  )
}

// ---------------------------------------------------------------- insights

function Insights({ list, onPick }: { list: Anime[]; onPick: (p: Partial<AnimeFilters>, v?: View) => void }) {
  const seen = list.filter((a) => a.status !== 'planned')
  const genres = useMemo(() => {
    const m = new Map<string, number>()
    list.forEach((a) => a.genres.forEach((g) => m.set(g, (m.get(g) ?? 0) + 1)))
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [list])
  const maxG = Math.max(1, ...genres.map((g) => g[1]))
  const years = useMemo(() => {
    const m = new Map<number, number>()
    seen.forEach((a) => { const y = Number(a.airStart?.slice(0, 4)); if (y) m.set(y, (m.get(y) ?? 0) + 1) })
    const ks = [...m.keys()]
    if (!ks.length) return []
    const lo = Math.min(...ks), hi = Math.max(...ks)
    return Array.from({ length: hi - lo + 1 }, (_, i) => ({ y: lo + i, n: m.get(lo + i) ?? 0 }))
  }, [seen])
  const maxY = Math.max(1, ...years.map((y) => y.n))
  // Label the ends and every fifth year, but never two labels closer than three years apart.
  const first = years[0]?.y ?? 0, last = years.at(-1)?.y ?? 0
  const showYear = (y: number) => y === first || y === last || (y % 5 === 0 && y - first >= 3 && last - y >= 3)
  const studios = useMemo(() => {
    const m = new Map<string, number>()
    list.forEach((a) => a.studio && m.set(a.studio, (m.get(a.studio) ?? 0) + 1))
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
  }, [list])
  const statusTotals = WATCH_STATUSES.map((s) => ({ s, n: list.filter((a) => a.status === s).length }))
  const sources = useMemo(() => {
    const m = new Map<string, number>()
    list.forEach((a) => m.set(a.source ?? '未知', (m.get(a.source ?? '未知') ?? 0) + 1))
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [list])

  return (
    <section className="pt-24">
      <AHead num="03" title="观看数据" kana="データ" />
      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <div className="panel flex flex-col cut p-6">
          <div className="flex items-baseline justify-between"><span className="cap">收录的类型</span><span className="cap-hint">全部收录 · 点击筛选</span></div>
          <div className="mt-5 grid gap-2.5">
            {genres.map(([g, n], i) => (
              <button key={g} onClick={() => onPick({ genres: [g] })} className="group grid grid-cols-[64px_1fr_28px] items-center gap-3 text-left">
                <span className="truncate text-[13px] font-semibold transition-colors group-hover:text-white" style={{ color: '#d3cdea' }}>{g}</span>
                <span className="relative h-[14px] overflow-hidden rounded-full" style={{ background: 'rgba(190,160,255,.08)' }}>
                  <motion.span initial={{ width: 0 }} whileInView={{ width: `${(n / maxG) * 100}%` }} viewport={{ once: true }} transition={{ duration: 1, delay: i * .05, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute inset-y-0 left-0 rounded-full" style={{ background: i === 0 ? 'linear-gradient(90deg, #ffb7d5, var(--pink))' : 'linear-gradient(90deg, rgba(155,123,255,.35), var(--violet))', boxShadow: i === 0 ? '0 0 16px rgba(255,126,182,.55)' : undefined }} />
                </span>
                <span className="hud text-right text-[14px] font-bold">{n}</span>
              </button>
            ))}
          </div>
          <div className="mt-auto pt-7">
            <div className="flex items-baseline justify-between"><span className="cap">原作来源</span><span className="cap-hint">点击筛选</span></div>
            <div className="mt-3 flex h-9 gap-1 overflow-hidden cut cut-sm">
              {sources.map(([src, n], i) => (
                <motion.button key={src} onClick={() => onPick({ source: src })} title={`${src} ${n} 部`}
                  initial={{ flexGrow: 0 }} whileInView={{ flexGrow: n }} viewport={{ once: true }} transition={{ duration: 1, delay: i * .05 }}
                  className="flex min-w-0 items-center justify-center overflow-hidden text-[11.5px] font-bold hover:brightness-110"
                  style={{ flexBasis: 0, background: ['var(--pink)', 'var(--violet)', 'var(--cyan)', 'var(--amber)', 'var(--mint)', '#8f88b0'][i % 6], color: '#1a1030' }}>
                  {n / list.length >= .14 && <span className="truncate px-1">{src} {n}</span>}
                </motion.button>
              ))}
            </div>
            <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
              {sources.map(([src, n], i) => (
                <span key={src} className="flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--muted)' }}>
                  <span className="h-2 w-2" style={{ background: ['var(--pink)', 'var(--violet)', 'var(--cyan)', 'var(--amber)', 'var(--mint)', '#8f88b0'][i % 6] }} />{src}<b className="hud text-white">{n}</b>
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="panel cut p-6">
            <div className="flex items-baseline justify-between"><span className="cap">作品的放送年份</span><span className="cap-hint">不含待看 · 点击看季度表</span></div>
            <div className="mt-4 flex h-[110px] items-end gap-[3px]">
              {years.map((y) => (
                <button key={y.y} onClick={() => onPick({}, 'season')} className="group relative flex h-full flex-1 flex-col justify-end" title={`${y.y} 年：${y.n} 部`} aria-label={`${y.y} 年 ${y.n} 部`}>
                  <motion.span initial={{ height: 0 }} whileInView={{ height: `${(y.n / maxY) * 100}%` }} viewport={{ once: true }} transition={{ duration: .8 }}
                    className="w-full rounded-t-sm group-hover:brightness-125" style={{ minHeight: y.n ? 3 : 1, background: y.n ? 'linear-gradient(180deg, var(--pink), rgba(255,126,182,.15))' : 'rgba(190,160,255,.1)' }} />
                  {showYear(y.y) && <span className="mono absolute -bottom-5 left-1/2 -translate-x-1/2 text-[9.5px]" style={{ color: 'var(--dim)' }}>{y.y}</span>}
                </button>
              ))}
            </div>
            <div className="h-5" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="panel cut p-6">
              <span className="cap">观看状态</span>
              <div className="mt-4 flex h-3 overflow-hidden rounded-full">
                {statusTotals.map(({ s, n }) => (
                  <motion.button key={s} onClick={() => onPick({ status: s })} title={`${WATCH_META[s].label} ${n}`} aria-label={`${WATCH_META[s].label} ${n} 部`}
                    initial={{ flexGrow: 0 }} whileInView={{ flexGrow: n }} viewport={{ once: true }} transition={{ duration: 1 }}
                    className="h-full border-r border-black/50 hover:brightness-125" style={{ background: WATCH_META[s].color, flexBasis: 0 }} />
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3">
                {statusTotals.map(({ s, n }) => (
                  <button key={s} onClick={() => onPick({ status: s })} className="text-left transition-colors hover:text-white" style={{ color: 'var(--muted)' }}>
                    <span className="flex items-center gap-1.5 text-[12px]"><Star size={8} color={WATCH_META[s].color} />{WATCH_META[s].label}</span>
                    <span className="hud mt-0.5 block text-[24px] font-bold leading-none" style={{ color: n ? '#fff' : 'var(--dim)' }}>{n}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="panel cut p-6">
              <span className="cap">常看的制作公司</span>
              <div className="mt-3 grid gap-1.5">
                {studios.map(([s, n]) => (
                  <button key={s} onClick={() => onPick({ studio: s })} className="flex items-center justify-between gap-2 text-left text-[12.5px] transition-colors hover:text-white" style={{ color: '#d3cdea' }}>
                    <span className="truncate">{s}</span><span className="hud shrink-0 font-bold" style={{ color: 'var(--pink)' }}>{n}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- filter bar

function FilterBar({ list, filters, setFilters, sort, setSort, count, view }: {
  list: Anime[]; filters: AnimeFilters; setFilters: (f: AnimeFilters) => void; sort: SortKey; setSort: (s: SortKey) => void; count: number; view: View
}) {
  const [moreGenres, setMoreGenres] = useState(false)
  const genres = useMemo(() => {
    const m = new Map<string, number>()
    list.forEach((a) => a.genres.forEach((g) => m.set(g, (m.get(g) ?? 0) + 1)))
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g)
  }, [list])
  const formats = FORMATS.filter((f) => list.some((a) => a.format === f))
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])
  const counts = (s: WatchStatus | 'all') => (s === 'all' ? list.length : list.filter((a) => a.status === s).length)
  const active = (filters.q ? 1 : 0) + (filters.source ? 1 : 0) + (filters.studio ? 1 : 0) + filters.air.length + filters.genres.length + filters.formats.length + (filters.status !== 'all' ? 1 : 0)
  const shownGenres = moreGenres ? genres : genres.slice(0, 10)

  return (
    <div className="panel cut p-4 sm:p-5">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="观看状态">
        {(['all', ...WATCH_STATUSES] as const).map((s) => {
          const on = filters.status === s
          const color = s === 'all' ? 'var(--violet)' : WATCH_META[s].color
          return (
            <button key={s} role="tab" aria-selected={on} onClick={() => setFilters({ ...filters, status: s })} className="relative rounded-full px-4 py-2 text-[13.5px] font-bold transition-colors"
              style={{ color: on ? '#1a1030' : 'var(--muted)' }}>
              {on && <motion.span layoutId="anime-status-tab" className="absolute inset-0 rounded-full" style={{ background: color, boxShadow: `0 0 18px -4px ${color}` }} />}
              <span className="relative">{s === 'all' ? '全部' : WATCH_META[s].label} <span className="hud ml-0.5 text-[12px] opacity-80">{counts(s)}</span></span>
            </button>
          )
        })}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,320px)_1fr_auto] lg:items-center">
        <div className="relative">
          <input className="input h-10 pl-10" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="搜索番名、系列、制作公司…" aria-label="搜索档案" />
          <svg className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--dim)" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[12px]" style={{ color: 'var(--dim)' }}>放送</span>
          {AIR_STATUSES.map((s) => (
            <button key={s} className="chip h-8" data-on={filters.air.includes(s)} style={{ ['--chip-color' as string]: AIR_META[s].color }} onClick={() => setFilters({ ...filters, air: toggle(filters.air, s) })}>
              <span className="dot" />{AIR_META[s].label}
            </button>
          ))}
          {formats.length > 1 && <span className="mx-1 h-4 w-px" style={{ background: 'var(--line-2)' }} />}
          {formats.length > 1 && formats.map((f) => (
            <button key={f} className="chip h-8" data-on={filters.formats.includes(f)} style={{ ['--chip-color' as string]: 'var(--cyan)' }} onClick={() => setFilters({ ...filters, formats: toggle(filters.formats, f) })}>{f}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {view !== 'season' && (
            <select className="input h-10 w-auto pr-9 text-[13px]" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="排序">
              {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[12px]" style={{ color: 'var(--dim)' }}>类型</span>
        {shownGenres.map((g) => (
          <button key={g} className="chip h-7 text-[12px]" data-on={filters.genres.includes(g)} style={{ ['--chip-color' as string]: 'var(--pink)' }} onClick={() => setFilters({ ...filters, genres: toggle(filters.genres, g) })}>{g}</button>
        ))}
        {genres.length > 10 && <button className="px-2 text-[12px] underline-offset-4 hover:underline" style={{ color: 'var(--dim)' }} onClick={() => setMoreGenres(!moreGenres)}>{moreGenres ? '收起' : `更多 ${genres.length - 10} 个`}</button>}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 pt-3 text-[12.5px]" style={{ borderTop: '1px dashed var(--line)' }}>
        <span className="flex flex-wrap items-center gap-2" style={{ color: 'var(--muted)' }}>
          {(['source', 'studio'] as const).filter((k) => filters[k]).map((k) => (
            <button key={k} className="chip h-7 text-[12px]" data-on="true" style={{ ['--chip-color' as string]: 'var(--violet)' }} onClick={() => setFilters({ ...filters, [k]: '' })} title="取消这个条件">
              {k === 'source' ? '原作' : '制作'}：{filters[k]} ✕
            </button>
          ))}
          <span>共 <b className="hud text-[15px] text-white">{count}</b> 部{active ? <span style={{ color: 'var(--dim)' }}> · {active} 个筛选条件</span> : null}</span>
        </span>
        {active > 0 && <button className="underline-offset-4 hover:underline" style={{ color: 'var(--pink)' }} onClick={() => setFilters(DEFAULT_FILTERS)}>清空筛选</button>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- views

function Wall({ list }: { list: Anime[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-7 min-[560px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {list.map((a, i) => <PosterCard key={a.id} anime={a} index={i} />)}
    </div>
  )
}

/** yuc.wiki-style season chart: one row per year, one column per broadcast quarter. */
function SeasonChart({ list }: { list: Anime[] }) {
  const { years, undated } = useMemo(() => {
    const m = new Map<number, Anime[][]>()
    const undated: Anime[] = []
    for (const a of list) {
      const q = quarterOf(a.airStart)
      if (!q) { undated.push(a); continue }
      if (!m.has(q.year)) m.set(q.year, [[], [], [], []])
      m.get(q.year)![q.q].push(a)
    }
    for (const cols of m.values()) cols.forEach((c) => c.sort((a, b) => (a.airStart ?? '').localeCompare(b.airStart ?? '') || a.title.localeCompare(b.title, 'zh')))
    return { years: [...m.entries()].sort((a, b) => b[0] - a[0]), undated }
  }, [list])
  const now = quarterOf(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`)!

  return (
    <div className="grid gap-10">
      {years.map(([year, cols]) => (
        <motion.section key={year} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: .5 }}
          className="grid gap-4 lg:grid-cols-[150px_1fr]">
          <div className="flex items-baseline gap-3 lg:block">
            <div className="display text-[36px] font-black leading-none lg:sticky lg:top-24" style={{ color: 'transparent', WebkitTextStroke: '1.2px var(--sakura)' }}>{year}</div>
            <div className="mono mt-2 text-[11px]" style={{ color: 'var(--dim)' }}>{cols.flat().length} 部</div>
          </div>
          <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {cols.map((items, q) => {
              const Q = QUARTERS[q]
              const current = year === now.year && q === now.q
              if (!items.length) {
                return <div key={q} className="hidden cut cut-sm xl:block" style={{ border: '1px dashed rgba(190,160,255,.1)' }}><QuarterHead q={q} year={year} n={0} current={current} /></div>
              }
              return (
                <div key={q} className="overflow-hidden cut cut-sm" style={{ background: current ? `linear-gradient(180deg, color-mix(in srgb, ${Q.color} 10%, rgba(16,12,38,.6)), rgba(16,12,38,.6) 40%)` : 'rgba(16,12,38,.6)', border: '1px solid var(--line)', borderTop: current ? `2px solid ${Q.color}` : '1px solid var(--line)' }}>
                  <QuarterHead q={q} year={year} n={items.length} current={current} />
                  <div className="grid gap-1 p-2">
                    {items.map((a) => (
                      <Link key={a.id} to={`/anime/${a.id}`} className="group flex items-center gap-3 cut cut-sm p-1.5 transition-colors hover:bg-white/[.05]">
                        <AnimeCover anime={a} className="h-[60px] w-10 shrink-0 cut cut-sm" />
                        <div className="min-w-0 flex-1">
                          <div className="line-clamp-2 text-[13.5px] font-semibold leading-snug group-hover:text-white" style={{ color: '#e6e0f7' }}>{a.title}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                            <span className="text-[10.5px] font-bold" style={{ color: WATCH_META[a.status].color }}>{WATCH_META[a.status].label}</span>
                            {a.air === 'airing' && <span className="text-[10.5px] font-bold" style={{ color: AIR_META.airing.color }}>● 放送中</span>}
                            {a.studio && <span className="truncate text-[10.5px]" style={{ color: 'var(--dim)' }}>{a.studio}</span>}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </motion.section>
      ))}
      {undated.length > 0 && (
        <section>
          <div className="cap mb-3">放送时间未定</div>
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">{undated.map((a, i) => <PosterCard key={a.id} anime={a} index={i} />)}</div>
        </section>
      )}
    </div>
  )
}

function QuarterHead({ q, year, n, current }: { q: number; year: number; n: number; current: boolean }) {
  const Q = QUARTERS[q]
  return (
    <div className="flex items-center justify-between px-3.5 py-2.5" style={{ background: n ? `linear-gradient(100deg, color-mix(in srgb, ${Q.color} 22%, transparent), transparent)` : undefined }}>
      <div className="flex items-baseline gap-2">
        <span className="ttl text-[20px]" style={{ color: n ? Q.color : 'var(--dim)' }}>{Q.name}</span>
        <span className="text-[12px]" style={{ color: n ? '#e6e0f7' : 'var(--dim)' }}>{year}年{Q.month}月</span>
        {current && <span className="onair ml-1" style={{ color: Q.color, fontSize: 9.5 }}><i />NOW</span>}
      </div>
      <span className="jp text-[10px] tracking-[.2em]" style={{ color: n ? 'var(--muted)' : 'var(--dim)' }}>{n ? `${n} 部` : Q.jp}</span>
    </div>
  )
}

/** Franchises as timelines: each season is a stop on the line. */
function SeriesView({ list, all }: { list: Anime[]; all: Anime[] }) {
  const groups = useMemo(() => {
    const m = new Map<string, Anime[]>()
    for (const a of list) {
      const k = a.series ?? a.title
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(a)
    }
    const total = (k: string) => all.filter((a) => (a.series ?? a.title) === k).length
    return [...m.entries()].map(([k, items]) => ({ k, items: items.sort((a, b) => (a.airStart ?? '').localeCompare(b.airStart ?? '')), total: total(k) }))
      .sort((a, b) => b.items.length - a.items.length || (b.items.at(-1)?.airStart ?? '').localeCompare(a.items.at(-1)?.airStart ?? ''))
  }, [list, all])
  const multi = groups.filter((g) => g.items.length > 1)
  const single = groups.filter((g) => g.items.length === 1)
  return (
    <div className="grid gap-5">
      <div className="grid gap-5 xl:grid-cols-2">
      {multi.map((g, gi) => {
        const accent = accentOf(g.items[0])
        return (
          <motion.section key={g.k} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ duration: .5, delay: (gi % 3) * .04 }}
            className="panel overflow-hidden cut p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <Star size={12} color={accent} />
              <h3 className="ttl text-[24px] leading-none">{g.k}</h3>
              <span className="text-[12.5px]" style={{ color: 'var(--dim)' }}>{g.items.length} 部{g.total > g.items.length ? `（筛选后，共 ${g.total} 部）` : ''} · {g.items[0].airStart?.slice(0, 4)} — {g.items.at(-1)!.airStart?.slice(0, 4)}</span>
            </div>
            <div className="no-scrollbar relative mt-5 flex gap-4 overflow-x-auto pb-1">
              <div className="pointer-events-none absolute left-0 right-0 top-[7px] h-[2px]" style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }} />
              {g.items.map((a) => (
                <Link key={a.id} to={`/anime/${a.id}`} className="group relative w-[112px] shrink-0 pt-6">
                  <span className="absolute left-3 top-0 h-4 w-4 rotate-45 rounded-[3px]" style={{ background: WATCH_META[a.status].color, boxShadow: `0 0 0 3px var(--bg), 0 0 12px ${WATCH_META[a.status].color}` }} />
                  <span className="mono absolute left-8 top-[-1px] rounded-full px-1.5 text-[10.5px] leading-[18px]" style={{ color: 'var(--muted)', background: '#100d27' }}>{a.airStart?.replace('-', '.')}</span>
                  <AnimeCover anime={a} className="aspect-[2/3] w-full cut cut-sm transition-transform duration-500 group-hover:-translate-y-1" />
                  <div className="mt-2 line-clamp-2 text-[12.5px] font-semibold leading-snug group-hover:text-white" style={{ color: '#e6e0f7' }}>{seasonTag(a) || a.title}</div>
                  <div className="text-[10.5px] font-bold" style={{ color: WATCH_META[a.status].color }}>{WATCH_META[a.status].label}</div>
                </Link>
              ))}
            </div>
          </motion.section>
        )
      })}
      </div>
      {single.length > 0 && (
        <section className="mt-6">
          <div className="mb-4 flex items-baseline gap-3"><span className="cap">单季作品</span><span className="cap-hint">{single.length} 部</span></div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-7 min-[560px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {single.map((g, i) => <PosterCard key={g.items[0].id} anime={g.items[0]} index={i} />)}
          </div>
        </section>
      )}
      <p className="text-[12px]" style={{ color: 'var(--dim)' }}>同一系列的各季按首播月份从左到右排列，菱形颜色表示观看状态。</p>
    </div>
  )
}
