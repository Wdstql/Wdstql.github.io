import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useNavigationType, type Location } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { useAnimeDb } from './db'
import { AirBadge, AnimeCover, AnimeToasts, Petals, Star, WatchBadge } from './components'
import { AddAnimeModal } from './AddAnime'
import { matchQuery, seasonTag } from './util'
import { Kbd, Portal } from '../components/ui'
import { OWNER } from '../site'

export function AnimeLayout({ children }: { children: (location: Location) => ReactNode }) {
  const { db, editMode, setEditMode, lockable, unlocked } = useAnimeDb()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [unlockOpen, setUnlockOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addTitle, setAddTitle] = useState('')
  const loc = useLocation()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen((v) => !v) }
      if (e.key === 'Escape') setPaletteOpen(false)
    }
    const onAdd = (e: Event) => { setAddTitle((e as CustomEvent<{ title?: string }>).detail?.title ?? ''); setAddOpen(true) }
    window.addEventListener('keydown', onKey)
    window.addEventListener('anime-life:add', onAdd)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('anime-life:add', onAdd) }
  }, [])

  useEffect(() => { window.scrollTo({ top: 0 }) }, [loc.pathname])

  // The two sites share one HTML shell; give this one its own tab title and colour. The previous title is
  // read during the first render, before any page effect below has replaced it.
  const [prevTitle] = useState(() => document.title)
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]')
    const prev = { title: prevTitle, color: meta?.getAttribute('content') }
    meta?.setAttribute('content', '#07061a')
    document.body.style.background = '#07061a'
    return () => { document.title = prev.title; if (prev.color) meta?.setAttribute('content', prev.color); document.body.style.background = '' }
  }, [prevTitle])

  const onAir = (db?.anime ?? []).filter((a) => a.air === 'airing')

  return (
    <div className="anime-root">
      <div className="anime-sky" />
      <Petals />
      <header className="sticky top-0 z-50" style={{ background: 'linear-gradient(180deg, rgba(7,6,26,.94), rgba(7,6,26,.7))', backdropFilter: 'blur(16px)', borderBottom: '1px solid var(--line)' }}>
        <div className="mx-auto flex h-16 max-w-[1480px] items-center gap-2 px-3 sm:gap-5 sm:px-8">
          <Link to="/anime" className="group flex shrink-0 items-center gap-3" aria-label="番剧生涯首页">
            <Logo />
            <div className="hidden leading-none min-[420px]:block">
              <div className="display text-[14px] font-extrabold tracking-[.14em]">ANIME<span style={{ color: 'var(--pink)' }}>/</span>LIFE</div>
              <div className="jp mt-1 text-[10px] tracking-[.3em]" style={{ color: 'var(--sakura)' }}>アニメ・ライフ</div>
            </div>
          </Link>

          {onAir.length > 0 && (
            <Link to={`/anime/${onAir[0].id}`} className="hidden min-w-0 items-center gap-2 px-3 py-1.5 text-[12.5px] transition-colors hover:bg-white/5 md:flex"
              style={{ border: '1px solid rgba(255,95,122,.35)' }} title="放送中">
              <AirBadge air="airing" size="sm" />
              <span className="truncate" style={{ color: '#e6e0f7', maxWidth: 260 }}>{onAir.map((a) => a.title).join(' · ')}</span>
            </Link>
          )}

          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-3">
            <button onClick={() => setPaletteOpen(true)} className="hidden h-9 items-center gap-3 whitespace-nowrap px-4 text-[13px] transition-colors hover:text-white lg:flex"
              style={{ border: '1px solid var(--line-2)', color: 'var(--dim)', background: 'rgba(255,255,255,.03)' }}>
              <SearchIcon /> 搜索番剧… <Kbd>⌘K</Kbd>
            </button>
            <button onClick={() => setPaletteOpen(true)} className="flex h-9 w-9 items-center justify-center lg:hidden" aria-label="搜索"
              style={{ border: '1px solid var(--line-2)', color: 'var(--muted)' }}><SearchIcon /></button>
            {lockable && !unlocked && (
              <button onClick={() => setUnlockOpen(true)} className="flex h-9 items-center gap-2 px-3 text-[12.5px] font-semibold transition-colors hover:text-white"
                title="输入密码后可以在线编辑" aria-label="编辑" style={{ border: '1px solid var(--line-2)', color: 'var(--muted)' }}>
                <LockIcon /><span className="hidden lg:inline">编辑</span>
              </button>
            )}
            {db?.editable && (
              <>
                <button onClick={() => setEditMode(!editMode)} className="flex h-9 items-center gap-2 px-2.5 text-[12.5px] font-semibold lg:px-3"
                  title="编辑模式：可以直接修改页面上的记录" aria-pressed={editMode}
                  style={{ border: `1px solid ${editMode ? 'var(--pink)' : 'var(--line-2)'}`, color: editMode ? 'var(--pink)' : 'var(--muted)', background: editMode ? 'rgba(255,126,182,.1)' : 'transparent' }}>
                  <span className="relative inline-block h-3.5 w-6 rounded-full" style={{ background: editMode ? 'var(--pink)' : 'rgba(255,255,255,.14)' }}>
                    <span className="absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-all" style={{ left: editMode ? 12 : 2 }} />
                  </span>
                  <span className="hidden lg:inline">编辑</span>
                </button>
                <button className="btn btn-sakura h-9 px-3 lg:px-4" aria-label="添加番剧" onClick={() => { setAddTitle(''); setAddOpen(true) }}>
                  <span className="text-base leading-none">＋</span><span className="hidden lg:inline">添加番剧</span>
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <AnimatePresence mode="wait">
        <motion.main key={loc.pathname} className="relative z-[1]"
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] }, transitionEnd: { transform: 'none' } }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}>
          {children(loc)}
        </motion.main>
      </AnimatePresence>

      <footer className="relative z-[1] mx-auto mt-28 max-w-[1480px] px-4 pb-10 pt-8 sm:px-8" style={{ borderTop: '1px solid var(--line)' }}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-[13px]" style={{ color: 'var(--muted)' }}>© {new Date().getFullYear()} <b className="text-white">{OWNER}</b> 的番剧记录</span>
            {db && <span className="label">ANIME/LIFE · {db.anime.length} TITLES · {unlocked ? 'ONLINE EDIT · COMMITS TO GITHUB' : db.editable ? 'LOCAL EDIT SERVER ONLINE' : 'READ-ONLY SNAPSHOT'}</span>}
          </div>
          <div className="text-[11.5px]" style={{ color: 'var(--dim)' }}>
            作品资料来自 <a className="underline-offset-4 hover:underline" style={{ color: 'var(--sakura)' }} href="https://bgm.tv" target="_blank" rel="noreferrer">Bangumi 番组计划</a> 与 <a className="underline-offset-4 hover:underline" style={{ color: 'var(--sakura)' }} href="https://anilist.co" target="_blank" rel="noreferrer">AniList</a>
          </div>
        </div>
        {unlocked && <div className="mono mt-3 text-[11px]" style={{ color: 'var(--dim)' }}>在线改动会提交到 GitHub，约 1–2 分钟后对所有访客可见</div>}
        {db?.editable && !unlocked && <div className="mono mt-3 text-[11px]" style={{ color: 'var(--dim)' }}>数据位于 data/anime/*.json · 命令行新增：<span style={{ color: 'var(--pink)' }}>npm run anime -- add &lt;Bangumi ID&gt;</span></div>}
      </footer>

      <AnimeEyecatch />
      <Palette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <AddAnimeModal open={addOpen} initialTitle={addTitle} onClose={() => setAddOpen(false)} />
      <UnlockModal open={unlockOpen} onClose={() => setUnlockOpen(false)} />
      <AnimeToasts />
    </div>
  )
}

/** Closes an open dialog on Escape. */
export function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
}

function Logo() {
  return (
    <div className="relative h-9 w-9">
      <div className="absolute inset-0 rounded-[10px] transition-transform duration-700 group-hover:rotate-[90deg]" style={{ background: 'linear-gradient(135deg, var(--pink), #9b7bff)', boxShadow: '0 0 18px rgba(255,126,182,.45)' }} />
      <div className="absolute inset-[3px] flex items-center justify-center rounded-[8px]" style={{ background: '#0d0b24' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden><path d="M7 4.5v15l12.5-7.5z" fill="var(--sakura)" /></svg>
      </div>
      <Star size={11} color="#fff" className="absolute -right-1 -top-1" style={{ filter: 'drop-shadow(0 0 4px var(--pink))' }} />
    </div>
  )
}

function SearchIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
}

function LockIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="11" width="16" height="10" rx="1" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
}

/**
 * TV-style eyecatch between pages: a pink panel slides in with a burst of focus lines,
 * shows where you are going, then slides out (like the mid-episode "アイキャッチ").
 */
function AnimeEyecatch() {
  const loc = useLocation()
  const navType = useNavigationType()
  const { byId } = useAnimeDb()
  const first = useRef(true)
  const prevPath = useRef(loc.pathname)
  const [shot, setShot] = useState<{ key: number; title: string; sub: string } | null>(null)

  useEffect(() => {
    if (first.current) { first.current = false; return }
    const from = prevPath.current
    prevPath.current = loc.pathname
    if (navType === 'POP') return
    const id = loc.pathname.match(/^\/anime\/([^/]+)/)?.[1]
    // Hopping between seasons should feel like turning a page, not a scene change.
    if (id && /^\/anime\/[^/]+/.test(from)) return
    const a = id ? byId.get(id) : undefined
    setShot({ key: Date.now(), title: a ? a.title : '番剧生涯', sub: a ? seasonTag(a) || (a.titleJa ?? '') : 'アニメ・ライフ' })
    const t = setTimeout(() => setShot(null), 760)
    return () => clearTimeout(t)
    // byId changes on every data reload; only route changes should trigger the wipe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.pathname])

  const ease = [0.7, 0, 0.2, 1] as const
  return (
    <Portal>
      <AnimatePresence>
        {shot && (
          <div key={shot.key} className="pointer-events-none fixed inset-0 z-[140] overflow-hidden">
            <motion.div className="absolute inset-0" style={{ background: 'var(--sakura)', clipPath: 'circle(0% at 50% 50%)' }}
              animate={{ clipPath: ['circle(0% at 50% 50%)', 'circle(75% at 50% 50%)', 'circle(75% at 50% 50%)', 'circle(0% at 50% 50%)'] }}
              transition={{ duration: .66, times: [0, .24, .7, 1], ease }} />
            <motion.div className="absolute inset-0 flex items-center justify-center" style={{ background: '#110b2a', clipPath: 'circle(0% at 50% 50%)' }}
              animate={{ clipPath: ['circle(0% at 50% 50%)', 'circle(72% at 50% 50%)', 'circle(72% at 50% 50%)', 'circle(0% at 50% 50%)'] }}
              transition={{ duration: .66, times: [0, .3, .74, 1], ease }}>
              <div className="focus-lines absolute left-1/2 top-1/2 h-[160vmax] w-[160vmax] -translate-x-1/2 -translate-y-1/2 opacity-[.12]" />
              <div className="relative px-6 text-center">
                <motion.div initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={{ duration: .35, delay: .12 }} className="mx-auto mb-3 w-fit">
                  <Star size={34} color="var(--pink)" style={{ filter: 'drop-shadow(0 0 14px var(--pink))' }} />
                </motion.div>
                <div className="ttl text-[clamp(30px,6vw,72px)] leading-tight text-white">{shot.title}</div>
                <div className="jp mt-2 text-[13px] tracking-[.4em]" style={{ color: 'var(--sakura)' }}>{shot.sub}</div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </Portal>
  )
}

function UnlockModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { unlock, setEditMode, toast } = useAnimeDb()
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { if (open) { setPw(''); setErr('') } }, [open])
  useEscape(open, onClose)
  async function submit() {
    if (!pw || busy) return
    setBusy(true)
    setErr('')
    try {
      await unlock(pw)
      setEditMode(true)
      onClose()
      toast('已进入编辑模式。改动约 1–2 分钟后对所有访客可见')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <motion.div className="anime-root fixed inset-0 z-[110] flex min-h-0 items-start justify-center px-4 pt-[18vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ background: 'rgba(5,4,16,.75)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
            <motion.form className="w-full max-w-[420px] cut p-6 sm:p-8" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); submit() }}
              initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 10, opacity: 0 }}
              style={{ background: 'rgba(16,12,38,.98)', border: '1px solid rgba(255,126,182,.35)' }}>
              <div className="label" style={{ color: 'var(--pink)' }}>OWNER ONLY // 编辑模式</div>
              <h3 className="mt-2 text-xl font-extrabold">输入编辑密码</h3>
              <p className="mt-1 text-[13px]" style={{ color: 'var(--muted)' }}>只有 {OWNER} 本人可以修改这份档案。与游戏生涯使用同一个密码。</p>
              <input autoFocus type="password" autoComplete="current-password" className="input mt-5 h-11 cut cut-sm" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="密码" />
              {err && <div className="mt-2 text-[12.5px]" style={{ color: '#ff5f7a' }}>{err}</div>}
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" className="btn" onClick={onClose}>取消</button>
                <button type="submit" className="btn btn-sakura min-w-[110px]" disabled={!pw || busy}>{busy ? '验证中…' : '解锁'}</button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  )
}

function Palette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db } = useAnimeDb()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const nav = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const results = useMemo(() => (db?.anime ?? []).filter((a) => matchQuery(a, q)).slice(0, 8), [db, q])
  useEffect(() => { if (open) { setQ(''); setSel(0); setTimeout(() => inputRef.current?.focus(), 30) } }, [open])
  const go = (id: string) => { onClose(); nav(`/anime/${id}`) }
  const add = () => { onClose(); window.dispatchEvent(new CustomEvent('anime-life:add', { detail: { title: q.trim() } })) }
  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <motion.div className="anime-root fixed inset-0 z-[110] flex min-h-0 items-start justify-center px-4 pt-[14vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ background: 'rgba(5,4,16,.72)', backdropFilter: 'blur(6px)' }} onClick={onClose}>
            <motion.div className="w-full max-w-[620px] overflow-hidden cut" initial={{ y: -20, scale: .98 }} animate={{ y: 0, scale: 1 }} exit={{ y: -10, opacity: 0 }}
              onClick={(e) => e.stopPropagation()} style={{ border: '1px solid rgba(255,126,182,.35)', background: 'rgba(16,12,38,.97)' }}>
              <div className="flex items-center gap-3 px-5" style={{ borderBottom: '1px solid var(--line)' }}>
                <span style={{ color: 'var(--pink)' }}><SearchIcon /></span>
                <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setSel(0) }} aria-label="搜索番剧"
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)) }
                    if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
                    if (e.key === 'Enter' && results[sel]) go(results[sel].id)
                    else if (e.key === 'Enter' && q.trim() && db?.editable) add()
                  }}
                  placeholder="番名 / 日文名 / 系列 / 制作公司 / 类型" className="h-14 flex-1 bg-transparent text-[15px] outline-none" />
                <Kbd>ESC</Kbd>
              </div>
              <div className="max-h-[52vh] overflow-y-auto p-2">
                {results.map((a, i) => (
                  <button key={a.id} onMouseEnter={() => setSel(i)} onClick={() => go(a.id)} className="flex w-full items-center gap-3 cut cut-sm px-3 py-2 text-left transition-colors"
                    style={{ background: i === sel ? 'rgba(255,126,182,.1)' : 'transparent' }}>
                    <AnimeCover anime={a} className="h-12 w-8 shrink-0 rounded" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-semibold">{a.title}</div>
                      <div className="truncate text-[12px]" style={{ color: 'var(--dim)' }}>{[a.airStart?.slice(0, 4), a.titleJa, a.studio].filter(Boolean).join(' · ')}</div>
                    </div>
                    <WatchBadge status={a.status} size="sm" />
                  </button>
                ))}
                {!results.length && (
                  <div className="flex flex-col items-center gap-3 px-4 py-8 text-center text-sm" style={{ color: 'var(--dim)' }}>
                    档案里还没有「{q}」
                    {db?.editable && q.trim() && <button className="btn btn-sakura h-9" onClick={add}>＋ 添加《{q.trim()}》</button>}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  )
}
