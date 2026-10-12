import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion, useScroll, useTransform } from 'motion/react'
import type { Anime } from '../model'
import { AIR_META, AIR_STATUSES, WATCH_META, WATCH_STATUSES } from '../model'
import { useAnimeDb } from '../db'
import { AirBadge, AnimeCover, Fact, Inferred, PosterCard, Star, WatchBadge } from '../components'
import { accentOf, airRange, fmtMonth, quarterLabel, seasonTag, seriesOf, sortAnime } from '../util'
import { Markdown } from '../../components/ui'
import { AnimeEditDrawer } from '../EditDrawer'
import { OWNER } from '../../site'

export function AnimeDetail() {
  const { id = '' } = useParams()
  const { db, byId, editMode, api, reload, toast } = useAnimeDb()
  const anime = byId.get(id)
  const [editing, setEditing] = useState(false)
  const { scrollY } = useScroll()
  const heroY = useTransform(scrollY, [0, 500], [0, 140])
  const heroOpacity = useTransform(scrollY, [0, 420], [1, 0.3])

  useEffect(() => { document.title = anime ? `${anime.title} · ${OWNER} 的番剧生涯` : `找不到作品 · ${OWNER} 的番剧生涯` }, [anime])

  const save = useCallback(async (patch: Partial<Anime>, msg = '已保存') => {
    if (!anime) return
    try {
      const inferred = anime.inferred?.filter((f) => !(f in patch))
      await api.update(anime.id, { ...patch, ...(anime.inferred ? { inferred } : {}) })
      await reload()
      toast(msg)
    } catch (e) {
      toast((e as Error).message, 'err')
    }
  }, [anime, api, reload, toast])

  if (!db) return null
  if (!anime) {
    return (
      <div className="mx-auto flex h-[60vh] max-w-xl flex-col items-center justify-center gap-4 text-center">
        <div className="display text-[72px] font-black" style={{ color: 'transparent', WebkitTextStroke: '1px var(--pink)' }}>404</div>
        <div className="jp tracking-[.3em]" style={{ color: 'var(--sakura)' }}>この作品は見つかりません</div>
        <div style={{ color: 'var(--muted)' }}>档案里没有 <span className="mono">{id}</span></div>
        <Link to="/anime" className="btn">回到总览</Link>
      </div>
    )
  }

  const accent = accentOf(anime)
  const inf = (f: string) => !!anime.inferred?.includes(f)
  const series = seriesOf(anime, db.anime)

  return (
    <div style={{ ['--accent' as string]: accent }}>
      {/* ---------- banner ---------- */}
      <div className="relative h-[440px] overflow-hidden sm:h-[520px]">
        <motion.div className="absolute inset-0" style={{ y: heroY, opacity: heroOpacity }}>
          {anime.hero ? (
            <img src={anime.hero} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="relative h-full w-full overflow-hidden" style={{ background: `radial-gradient(900px 420px at 78% 30%, color-mix(in srgb, ${accent} 40%, transparent), transparent 70%), #0b0920` }}>
              {anime.cover && <img src={anime.cover} alt="" referrerPolicy="no-referrer" className="absolute right-0 top-0 h-full w-[45%] object-cover opacity-50" style={{ filter: 'blur(2px)', maskImage: 'linear-gradient(90deg, transparent, #000 60%)', WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 60%)' }} />}
            </div>
          )}
        </motion.div>
        <div className="tone absolute inset-0 opacity-[.18]" style={{ ['--tone-color' as string]: '#000', ['--tone-size' as string]: '4px' }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(7,6,26,.5) 0%, rgba(7,6,26,.25) 35%, rgba(7,6,26,.9) 78%, var(--bg) 100%), linear-gradient(90deg, rgba(7,6,26,.9), rgba(7,6,26,.35) 55%, transparent 80%)' }} />
        {/[\u3040-\u30ff\u4e00-\u9fff]/.test(anime.titleJa ?? anime.title) && <div className="ghost-jp tategaki pointer-events-none absolute right-6 top-20 hidden whitespace-nowrap text-[64px] lg:block" aria-hidden>{[...(anime.titleJa ?? anime.title).replace(/[\s（(【〜~!?！？：:・\-]/g, '')].slice(0, 5).join('')}</div>}
        <div className="relative mx-auto flex h-full max-w-[1480px] items-start justify-between px-4 pt-6 sm:px-8">
          <BackLink />
          {editMode && <button className="btn btn-sakura" onClick={() => setEditing(true)}>✎ 编辑记录</button>}
        </div>
      </div>

      {/* ---------- header ---------- */}
      <div className="relative mx-auto -mt-[310px] max-w-[1480px] px-4 sm:-mt-[340px] sm:px-8">
        <div className="grid grid-cols-[minmax(0,1fr)] items-end gap-8 lg:grid-cols-[250px_minmax(0,1fr)]">
          <motion.div initial={{ opacity: 0, y: 30, rotate: -3 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ duration: .8, ease: [0.16, 1, 0.3, 1] }} className="relative w-[170px] sm:w-[250px]">
            <div className="absolute -inset-3 rounded-[28px] blur-2xl" style={{ background: accent, opacity: .2 }} />
            <div className="relative p-[3px]" style={{ background: '#fff', clipPath: 'polygon(0 0, calc(100% - 22px) 0, 100% 22px, 100% 100%, 22px 100%, 0 calc(100% - 22px))', filter: 'drop-shadow(0 30px 40px rgba(0,0,0,.6))' }}>
              <AnimeCover anime={anime} large eager className="aspect-[2/3] w-full" style={{ clipPath: 'polygon(0 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 20px 100%, 0 calc(100% - 20px))' }} />
            </div>
            {seasonTag(anime) && <span className="sticker absolute -right-4 -top-3 text-[12px]" style={{ ['--sticker' as string]: accent, transform: 'rotate(6deg)' }}>{seasonTag(anime)}</span>}
            {editMode && <ArtUploader anime={anime} />}
          </motion.div>

          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: .1, duration: .7 }} className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <WatchBadge status={anime.status} /><Inferred show={inf('status')} />
              <AirBadge air={anime.air} />
              {anime.airStart && <span className="rounded px-2 py-0.5 text-[12px] font-semibold" style={{ background: 'rgba(255,255,255,.08)', color: '#e6e0f7' }}>{quarterLabel(anime.airStart)}</span>}
              {anime.genres.length > 0 && <span className="text-[13px]" style={{ color: '#bcb5d8' }}>{anime.genres.join(' · ')}</span>}
            </div>
            <h1 className="mt-4 font-black leading-[1.05] tracking-tight" style={{ fontSize: 'clamp(32px, 5vw, 66px)', textShadow: '0 4px 30px rgba(0,0,0,.6)' }}>{anime.title}</h1>
            {(anime.titleJa || anime.titleRomaji) && (
              <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                {anime.titleJa && <span className="jp text-[15px] font-bold" style={{ color: `color-mix(in srgb, ${accent} 60%, #fff)` }}>{anime.titleJa}</span>}
                {anime.titleRomaji && anime.titleRomaji !== anime.titleJa && <span className="display text-[11.5px] tracking-[.12em]" style={{ color: 'var(--muted)' }}>{anime.titleRomaji}</span>}
              </div>
            )}
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-[13px]" style={{ color: 'var(--muted)' }}>
              <span>放送 <span className="text-white">{airRange(anime)}</span></span>
              {anime.episodes ? <span>{anime.format === '剧场版' ? '形式' : '集数'} <span className="text-white">{anime.format === '剧场版' ? '剧场版' : `${anime.episodes} 话`}</span></span> : null}
              {anime.studio && <span>制作 <span className="text-white">{anime.studio}</span></span>}
              {anime.source && <span>原作 <span className="text-white">{anime.source}</span></span>}
            </div>
          </motion.div>
        </div>

        {editMode && <QuickBar anime={anime} save={save} />}

        {/* ---------- body ---------- */}
        <div className="mt-16 grid grid-cols-[minmax(0,1fr)] items-start gap-12 lg:grid-cols-[minmax(0,1fr)_340px] xl:gap-16">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-16">
            {anime.oneLiner && <Bubble text={anime.oneLiner} />}
            {(anime.review || editMode) && (
              <Block num="01" title="我的感想" kana="かんそう">
                {anime.review ? <div className="panel cut p-6 sm:p-8"><Markdown text={anime.review} /></div>
                  : <Placeholder>还没有写感想。点右上角「编辑记录」写下你的感受（支持 Markdown）。</Placeholder>}
              </Block>
            )}
            {anime.summary && (
              <Block num={anime.review || editMode ? '02' : '01'} title="剧情简介" kana="あらすじ">
                <Synopsis text={anime.summary} />
              </Block>
            )}
            {series.length > 1 && (
              <Block num={String([anime.review || editMode, anime.summary].filter(Boolean).length + 1).padStart(2, '0')} title="系列作品" kana="シリーズ" count={series.length}>
                <SeriesTrack series={series} current={anime.id} />
              </Block>
            )}
            <Related anime={anime} />
          </div>

          <div className="order-first grid gap-4 self-start lg:sticky lg:top-24 lg:order-none">
            <RecordCard anime={anime} />
            <InfoCard anime={anime} />
          </div>
        </div>

        <Neighbors anime={anime} />
      </div>

      <AnimeEditDrawer anime={anime} open={editing} onClose={() => setEditing(false)} />
    </div>
  )
}

function BackLink() {
  const nav = useNavigate()
  return (
    <button onClick={() => (window.history.state?.idx > 0 ? nav(-1) : nav('/anime'))} className="flex items-center gap-2 px-3.5 py-1.5 text-[12.5px] transition-colors hover:text-white"
      style={{ background: 'rgba(0,0,0,.5)', border: '1px solid var(--line-2)', color: 'var(--muted)' }}>
      ← 返回
    </button>
  )
}

/** The one-line verdict as a manga speech bubble, typed out like dialogue. */
function Bubble({ text }: { text: string }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (document.visibilityState === 'hidden' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setN(text.length); return }
    setN(0)
    const id = setInterval(() => setN((v) => (v >= text.length ? (clearInterval(id), v) : v + 1)), 45)
    return () => clearInterval(id)
  }, [text])
  return (
    <motion.div initial={{ opacity: 0, y: 14, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: .35 }} className="relative mt-2 pb-8">
      <div className="bubble ttl max-w-[760px] text-[clamp(19px,2vw,25px)] leading-relaxed">
        {text.slice(0, n)}<span className="opacity-0">{text.slice(n)}</span>
      </div>
      <div className="absolute bottom-0 left-[86px] flex items-center gap-2">
        <span className="jp text-[13px] font-bold" style={{ color: 'var(--sakura)' }}>{OWNER}</span>
        <span className="mono text-[10px] tracking-[.2em]" style={{ color: 'var(--dim)' }}>ONE LINE</span>
      </div>
    </motion.div>
  )
}

function Block({ num, title, kana, count, children }: { num: string; title: string; kana: string; count?: number; children: ReactNode }) {
  return (
    <motion.section initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: .6 }}>
      <div className="a-head">
        <span className="num">{num}</span>
        <h2>{title}</h2>
        <span className="kana">{kana}</span>
        {count !== undefined && <span className="hud pb-1 text-[15px]" style={{ color: 'var(--dim)' }}>[{String(count).padStart(2, '0')}]</span>}
        <span className="rule hidden sm:block" />
      </div>
      {children}
    </motion.section>
  )
}

function Placeholder({ children }: { children: ReactNode }) {
  return <div className="w-full cut px-6 py-8 text-[14px]" style={{ border: '1px dashed var(--line-2)', color: 'var(--dim)' }}>{children}</div>
}

function Synopsis({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  // Offer "展开" only when the six-line clamp actually hides something.
  const [long, setLong] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => { if (!open) setLong(el.scrollHeight > el.clientHeight + 2) }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [text, open])
  return (
    <div className="panel relative overflow-hidden cut p-6 sm:p-8">
      <div className="tone pointer-events-none absolute -right-6 -top-6 h-40 w-40 rounded-full opacity-25" />
      <div ref={ref} className={`relative whitespace-pre-line text-[15px] leading-[2] ${open ? '' : 'line-clamp-6'}`} style={{ color: '#d3cdea' }}>{text}</div>
      {(long || open) && <button className="relative mt-3 text-[13px] underline-offset-4 hover:underline" style={{ color: 'var(--pink)' }} onClick={() => setOpen(!open)}>{open ? '收起 ▴' : '展开全部 ▾'}</button>}
      <div className="relative mt-4 text-[11.5px]" style={{ color: 'var(--dim)' }}>简介来自 Bangumi 番组计划</div>
    </div>
  )
}

function SeriesTrack({ series, current }: { series: Anime[]; current: string }) {
  return (
    <div className="no-scrollbar relative flex gap-5 overflow-x-auto pb-2">
      <div className="pointer-events-none absolute left-0 right-0 top-[9px] h-[2px]" style={{ background: 'linear-gradient(90deg, var(--accent), rgba(255,255,255,.1))' }} />
      {series.map((a) => {
        const on = a.id === current
        return (
          <Link key={a.id} to={`/anime/${a.id}`} aria-current={on ? 'page' : undefined} className="group relative w-[132px] shrink-0 pt-7">
            <span className="absolute left-3 top-0 h-5 w-5 rotate-45 rounded-[4px]" style={{ background: on ? 'var(--accent)' : WATCH_META[a.status].color, boxShadow: `0 0 0 3px var(--bg), 0 0 ${on ? 18 : 8}px ${on ? 'var(--accent)' : WATCH_META[a.status].color}` }} />
            <span className="mono absolute left-9 top-0 rounded-full px-1.5 text-[10.5px] leading-[20px]" style={{ color: on ? '#fff' : 'var(--muted)', background: 'var(--bg)' }}>{fmtMonth(a.airStart)}</span>
            <AnimeCover anime={a} className="aspect-[2/3] w-full cut cut-sm transition-transform duration-500 group-hover:-translate-y-1"
              style={{ boxShadow: on ? '0 0 0 2.5px var(--accent), 0 16px 40px -16px var(--accent)' : '0 0 0 1px var(--line)' }} />
            <div className="mt-2 line-clamp-2 text-[12.5px] font-semibold leading-snug" style={{ color: on ? '#fff' : '#d3cdea' }}>{seasonTag(a) || a.title}</div>
            <div className="text-[10.5px] font-bold" style={{ color: WATCH_META[a.status].color }}>{on ? '▶ 当前' : WATCH_META[a.status].label}</div>
          </Link>
        )
      })}
    </div>
  )
}

function RecordCard({ anime }: { anime: Anime }) {
  const m = WATCH_META[anime.status]
  const watched = anime.watchedEps ?? (anime.status === 'watched' && !anime.progress ? anime.episodes : null)
  const pct = watched != null && anime.episodes ? Math.min(100, (watched / anime.episodes) * 100) : null
  const range = anime.watchedFrom || anime.watchedTo ? [fmtMonth(anime.watchedFrom), fmtMonth(anime.watchedTo)].filter(Boolean).join(' — ') : ''
  return (
    <motion.aside initial={{ opacity: 0, scale: .95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: .2 }} className="relative overflow-hidden cut p-5"
      style={{ background: `linear-gradient(150deg, color-mix(in srgb, ${m.color} 16%, rgba(16,12,38,.95)), rgba(12,10,30,.95) 60%)`, border: `1px solid color-mix(in srgb, ${m.color} 40%, transparent)` }}>
      <div className="ghost-jp pointer-events-none absolute right-2 top-2 whitespace-nowrap text-[32px] sm:text-[40px]" aria-hidden style={{ WebkitTextStroke: `1px color-mix(in srgb, ${m.color} 22%, transparent)` }}>{m.jp}</div>
      <div className="relative">
        <div className="label" style={{ color: m.color }}>MY RECORD</div>
        <div className="ttl mt-2 text-[30px] leading-none" style={{ color: m.color }}>{m.label}<Inferred show={!!anime.inferred?.includes('status')} /></div>
        {anime.progress && <div className="mt-3 text-[13.5px]" style={{ color: '#e6e0f7' }}>▶ {anime.progress}</div>}
        {pct != null && (
          <div className="mt-4">
            <div className="flex justify-between text-[11.5px]" style={{ color: 'var(--muted)' }}><span>进度</span><span className="hud text-white">{watched} / {anime.episodes} 话</span></div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.1)' }}>
              <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 1, delay: .3, ease: [0.16, 1, 0.3, 1] }} className="h-full rounded-full" style={{ background: `linear-gradient(90deg, ${m.color}, var(--accent))` }} />
            </div>
          </div>
        )}
        <div className="mt-5 grid grid-cols-2 gap-4">
          <Fact k="我的评分" v={anime.score != null ? <span className="hud text-[26px] leading-none">{anime.score}<span className="text-[12px]" style={{ color: 'var(--dim)' }}> / 100</span></span> : <span style={{ color: 'var(--dim)' }}>未评分</span>} />
          <Fact k="观看时间" v={range || <span style={{ color: 'var(--dim)' }}>未记录</span>} />
        </div>
        {anime.tags.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{anime.tags.map((t) => <span key={t} className="rounded-full px-2.5 py-0.5 text-[11.5px]" style={{ background: 'rgba(255,126,182,.12)', color: 'var(--sakura)' }}>#{t}</span>)}</div>}
      </div>
    </motion.aside>
  )
}

function InfoCard({ anime }: { anime: Anime }) {
  const rows: [string, ReactNode][] = [
    ['放送状态', <AirBadge air={anime.air} size="sm" />],
    ['放送时间', airRange(anime)],
    ['放送季度', quarterLabel(anime.airStart) || '—'],
    ['形式', anime.format],
    ['集数', anime.episodes ? `${anime.episodes} 话` : '—'],
    ['制作', anime.studio ?? '—'],
    ['原作', anime.source ?? '—'],
  ]
  return (
    <aside className="panel cut">
      <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid var(--line)' }}>
        <span className="cap">作品资料</span>
        <span className="jp text-[10px] tracking-[.25em]" style={{ color: 'var(--dim)' }}>さくひんデータ</span>
      </div>
      <dl className="px-5 py-2">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[64px_1fr] items-center gap-3 py-2.5 text-[13px]" style={{ borderBottom: '1px dashed rgba(190,160,255,.1)' }}>
            <dt style={{ color: 'var(--dim)' }}>{k}</dt><dd className="min-w-0 break-words" style={{ color: '#e6e0f7' }}>{v}</dd>
          </div>
        ))}
      </dl>
      {anime.bgmScore ? (
        <div className="px-5 pb-1 pt-3">
          <div className="flex items-baseline justify-between"><span className="text-[12px]" style={{ color: 'var(--dim)' }}>Bangumi 评分</span><span className="hud text-[22px] font-bold">{anime.bgmScore.toFixed(1)}</span></div>
          <div className="mt-1.5 flex gap-[3px]" aria-hidden>
            {Array.from({ length: 10 }, (_, i) => (
              <span key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i < Math.floor(anime.bgmScore!) ? 'var(--accent)' : i < anime.bgmScore! ? `linear-gradient(90deg, var(--accent) ${(anime.bgmScore! % 1) * 100}%, rgba(255,255,255,.1) 0)` : 'rgba(255,255,255,.1)' }} />
            ))}
          </div>
          <div className="mt-1 text-[10.5px]" style={{ color: 'var(--dim)' }}>社区评分，不是我的评分</div>
        </div>
      ) : null}
      <div className="grid gap-2 px-5 pb-5 pt-4">
        {anime.bangumiId && <a className="btn h-9 w-full text-[12.5px]" href={`https://bgm.tv/subject/${anime.bangumiId}`} target="_blank" rel="noreferrer">Bangumi 条目 ↗</a>}
        <div className="grid grid-cols-2 gap-2">
          {anime.anilistId && <a className="btn h-9 text-[12.5px]" href={`https://anilist.co/anime/${anime.anilistId}`} target="_blank" rel="noreferrer">AniList ↗</a>}
          <a className={`btn h-9 text-[12.5px] ${anime.anilistId ? '' : 'col-span-2'}`} href={`https://search.bilibili.com/all?keyword=${encodeURIComponent(anime.title)}`} target="_blank" rel="noreferrer">B 站搜索 ↗</a>
        </div>
      </div>
    </aside>
  )
}

function Related({ anime }: { anime: Anime }) {
  const { db } = useAnimeDb()
  const related = useMemo(() => {
    const series = anime.series ?? anime.title
    const score = (a: Anime) => a.genres.filter((g) => anime.genres.includes(g)).length + (a.studio && a.studio === anime.studio ? 1 : 0)
    return (db?.anime ?? []).filter((a) => a.id !== anime.id && (a.series ?? a.title) !== series && score(a) >= 2)
      .sort((a, b) => score(b) - score(a) || (b.airStart ?? '').localeCompare(a.airStart ?? '')).slice(0, 6)
  }, [db, anime])
  if (!related.length) return null
  return (
    <Block num="✦" title="口味相近" kana="おすすめ">
      <div className="grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-6">
        {related.map((a, i) => <PosterCard key={a.id} anime={a} index={i} />)}
      </div>
    </Block>
  )
}

/** Previous / next by broadcast date across the whole archive. */
function Neighbors({ anime }: { anime: Anime }) {
  const { db } = useAnimeDb()
  const list = useMemo(() => sortAnime(db?.anime ?? [], 'air-asc'), [db])
  const i = list.findIndex((a) => a.id === anime.id)
  if (i < 0) return null
  const pair = [list[i - 1], list[i + 1]]
  return (
    <div className="mt-24 grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
      {pair.map((a, k) => a ? (
        <Link key={a.id} to={`/anime/${a.id}`} className={`group flex min-w-0 items-center gap-4 cut p-4 transition-colors hover:bg-white/[.04] ${k ? 'sm:flex-row-reverse sm:text-right' : ''}`} style={{ border: '1px solid var(--line)', background: 'rgba(12,10,30,.8)' }}>
          <span className="display text-[20px]" style={{ color: 'var(--pink)' }}>{k ? '→' : '←'}</span>
          <AnimeCover anime={a} className="h-[72px] w-12 shrink-0 cut cut-sm" />
          <div className="min-w-0">
            <div className="cap-hint">{k ? '放送时间 · 下一部' : '放送时间 · 上一部'}</div>
            <div className="mt-1 truncate text-[16px] font-bold group-hover:text-white">{a.title}</div>
            <div className="text-[12px]" style={{ color: 'var(--muted)' }}>{quarterLabel(a.airStart) || '未定'}</div>
          </div>
        </Link>
      ) : (
        <div key={k} className={`hidden items-center gap-3 cut p-5 sm:flex ${k ? 'justify-end' : ''}`} style={{ border: '1px dashed var(--line)' }}>
          <Star size={12} color="var(--dim)" />
          <span className="text-[13px]" style={{ color: 'var(--dim)' }}>{k ? '已是档案里最新放送的一部' : '已是档案里最早放送的一部'}</span>
        </div>
      ))}
    </div>
  )
}

function QuickBar({ anime, save }: { anime: Anime; save: (p: Partial<Anime>, msg?: string) => Promise<void> }) {
  return (
    <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 cut px-5 py-4" style={{ border: '1px solid rgba(255,126,182,.35)', background: 'rgba(255,126,182,.05)' }}>
      <span className="cap" style={{ color: 'var(--pink)' }}>快速编辑</span>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[12px]" style={{ color: 'var(--muted)' }}>观看</span>
        {WATCH_STATUSES.map((s) => (
          <button key={s} className="chip h-7 text-[12px]" data-on={anime.status === s} style={{ ['--chip-color' as string]: WATCH_META[s].color }}
            onClick={() => anime.status !== s && save({ status: s }, `观看状态改为「${WATCH_META[s].label}」`)}>
            <span className="dot" />{WATCH_META[s].label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[12px]" style={{ color: 'var(--muted)' }}>放送</span>
        {AIR_STATUSES.map((s) => (
          <button key={s} className="chip h-7 text-[12px]" data-on={anime.air === s} style={{ ['--chip-color' as string]: AIR_META[s].color }}
            onClick={() => anime.air !== s && save({ air: s }, `放送状态改为「${AIR_META[s].label}」`)}>
            <span className="dot" />{AIR_META[s].label}
          </button>
        ))}
      </div>
    </div>
  )
}

function ArtUploader({ anime }: { anime: Anime }) {
  const { api, reload, toast } = useAnimeDb()
  const pick = (kind: 'cover' | 'hero') => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async () => {
      const f = input.files?.[0]
      if (!f) return
      try { await api.uploadArt(anime.id, kind, f); await reload(); toast(kind === 'cover' ? '封面已更新' : '横幅已更新') } catch (e) { toast((e as Error).message, 'err') }
    }
    input.click()
  }
  return (
    <div className="relative mt-4 flex gap-2">
      <button className="btn h-8 flex-1 px-2 text-[11.5px]" onClick={() => pick('cover')}>换封面</button>
      <button className="btn h-8 flex-1 px-2 text-[11.5px]" onClick={() => pick('hero')}>换横幅</button>
    </div>
  )
}
