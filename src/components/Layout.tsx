import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate, type Location } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { useDb } from '../lib/db'
import { matchQuery } from '../lib/game'
import { Cover, Kbd, StatusBadge, Toasts } from './ui'
import { AddGameModal } from './AddGame'
import { Eyecatch } from './Eyecatch'
import { OWNER } from '../site'

const LINKS = [
  { to: '/', label: '总览', en: 'ARCHIVE', jp: 'アーカイブ' },
  { to: '/ranking', label: '天梯榜', en: 'RANKING', jp: 'ランキング' },
  { to: '/hall', label: '喜好表', en: 'HALL', jp: 'でんどう' },
]

/** `children` receives the location so an exiting page keeps rendering its own route during the transition. */
export function Layout({ children }: { children: (location: Location) => ReactNode }) {
  const { db, editMode, setEditMode, lockable, unlocked } = useDb()
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
    window.addEventListener('keydown', onKey)
    const onAdd = (e: Event) => { setAddTitle((e as CustomEvent<{ title?: string }>).detail?.title ?? ''); setAddOpen(true) }
    window.addEventListener('game-life:add', onAdd)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('game-life:add', onAdd) }
  }, [])

  useEffect(() => { window.scrollTo({ top: 0 }) }, [loc.pathname])

  return (
    <>
      <div className="backdrop" />
      <header className="sticky top-0 z-50" style={{ background: 'linear-gradient(180deg, rgba(5,6,10,.92), rgba(5,6,10,.62))', backdropFilter: 'blur(16px)', borderBottom: '1px solid var(--line)' }}>
        <div className="mx-auto flex h-16 max-w-[1480px] items-center gap-1 px-3 min-[380px]:gap-1.5 sm:gap-5 sm:px-8 lg:gap-8">
          <Link to="/" className="group flex shrink-0 items-center gap-3">
            <Logo />
            <div className="hidden leading-none lg:block">
              <div className="display text-[15px] font-extrabold tracking-[.14em]">GAME<span style={{ color: 'var(--pink)' }}>/</span>LIFE</div>
              <div className="label mt-1 text-[9px]"><span className="normal-case">{OWNER}</span>'S GAMING ARCHIVE</div>
            </div>
          </Link>

          <nav className="flex shrink-0 items-center gap-1">
            {LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.to === '/'} className="group relative whitespace-nowrap px-1 py-2 min-[380px]:px-1.5 sm:px-4">
                {({ isActive }) => (
                  <>
                    <span className="text-[12.5px] font-semibold transition-colors min-[380px]:text-[13px] sm:text-[14px]" style={{ color: isActive ? '#fff' : 'var(--muted)' }}>{l.label}</span>
                    {isActive && <span className="mono ml-1.5 hidden text-[9px] tracking-[.2em] lg:inline" style={{ color: 'var(--cyan)' }}>{l.en}</span>}
                    {isActive && <motion.span layoutId="nav-ind" className="absolute inset-x-3 -bottom-[13px] h-[2px]" style={{ background: 'var(--cyan)', boxShadow: '0 0 12px var(--cyan)' }} />}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Below lg every action collapses to an icon so the bar never wraps or clips. */}
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-3">
            <button onClick={() => setPaletteOpen(true)} className="hidden h-9 items-center gap-3 whitespace-nowrap px-3 text-[13px] transition-colors hover:border-[var(--cyan)]! hover:text-white! lg:flex"
              style={{ border: '1px solid var(--line-2)', color: 'var(--dim)', background: 'rgba(255,255,255,.02)' }}>
              <SearchIcon /> 搜索游戏… <Kbd>⌘K</Kbd>
            </button>
            <button onClick={() => setPaletteOpen(true)} className="flex h-9 w-8 items-center justify-center transition-colors hover:border-[var(--cyan)]! hover:text-white! min-[380px]:w-9 lg:hidden" aria-label="搜索"
              style={{ border: '1px solid var(--line-2)', color: 'var(--muted)' }}><SearchIcon /></button>
            {lockable && !unlocked && (
              <button onClick={() => setUnlockOpen(true)} className="flex h-9 shrink-0 items-center gap-2 whitespace-nowrap px-1.5 text-[12.5px] font-semibold transition-colors hover:border-[var(--cyan)]! hover:text-white! min-[380px]:px-2 lg:px-3"
                title="输入密码后可以在线编辑" aria-label="编辑" style={{ border: '1px solid var(--line-2)', color: 'var(--muted)' }}>
                <LockIcon /><span className="hidden lg:inline">编辑</span>
              </button>
            )}
            {db?.editable && (
              <>
                <button onClick={() => setEditMode(!editMode)} className="flex h-9 shrink-0 items-center gap-2 whitespace-nowrap px-1.5 text-[12.5px] font-semibold min-[380px]:px-2 lg:px-3"
                  title="编辑模式：可以直接修改页面上的记录"
                  style={{ border: `1px solid ${editMode ? 'var(--pink)' : 'var(--line-2)'}`, color: editMode ? 'var(--pink)' : 'var(--muted)', background: editMode ? 'rgba(255,92,168,.08)' : 'transparent' }}>
                  <span className="relative inline-block h-3.5 w-6 rounded-full" style={{ background: editMode ? 'var(--pink)' : 'rgba(255,255,255,.12)' }}>
                    <span className="absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-all" style={{ left: editMode ? 12 : 2 }} />
                  </span>
                  <span className="hidden lg:inline">编辑</span>
                </button>
                <button className="btn btn-primary h-9 shrink-0 px-2 min-[380px]:px-3 lg:px-4" aria-label="添加游戏" onClick={() => { setAddTitle(''); setAddOpen(true) }}>
                  <span className="text-base leading-none">＋</span><span className="hidden lg:inline">添加游戏</span>
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <AnimatePresence mode="wait">
        <motion.main key={loc.pathname}
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] }, transitionEnd: { transform: 'none' } }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}>
          {children(loc)}
        </motion.main>
      </AnimatePresence>

      <footer className="mx-auto mt-24 flex max-w-[1480px] flex-wrap items-center justify-between gap-4 px-4 pb-10 pt-8 sm:px-8" style={{ borderTop: '1px solid var(--line)' }}>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="text-[13px]" style={{ color: 'var(--muted)' }}>© {new Date().getFullYear()} <b className="text-white">{OWNER}</b> 的游戏生涯记录</span>
          {/* Nothing status-like until data has arrived, so the first frame never claims a wrong state. */}
          {db && <span className="label">GAME/LIFE · {db.games.length} RECORDS · {unlocked ? 'ONLINE EDIT · COMMITS TO GITHUB' : db.editable ? 'LOCAL EDIT SERVER ONLINE' : 'READ-ONLY SNAPSHOT'}</span>}
        </div>
        {unlocked && <div className="mono text-[11px]" style={{ color: 'var(--dim)' }}>在线改动会提交到 GitHub，约 1–2 分钟后对所有访客可见</div>}
        {db?.editable && !unlocked && <div className="mono text-[11px]" style={{ color: 'var(--dim)' }}>数据位于 data/games/*.json · 新增可用 <span style={{ color: 'var(--cyan)' }}>npm run game -- add</span></div>}
      </footer>

      <Eyecatch />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <AddGameModal open={addOpen} initialTitle={addTitle} onClose={() => setAddOpen(false)} />
      <UnlockModal open={unlockOpen} onClose={() => setUnlockOpen(false)} />
      <Toasts />
    </>
  )
}

function Logo() {
  return (
    <div className="relative h-7 w-7 min-[380px]:h-9 min-[380px]:w-9">
      <div className="absolute inset-0 rotate-45 border transition-transform duration-700 group-hover:rotate-[225deg]" style={{ borderColor: 'var(--cyan)', boxShadow: '0 0 14px rgba(70,227,255,.35), inset 0 0 10px rgba(70,227,255,.2)' }} />
      <div className="absolute inset-[7px] rotate-45 min-[380px]:inset-[9px]" style={{ background: 'var(--pink)', boxShadow: '0 0 14px var(--pink)' }} />
    </div>
  )
}

function LockIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="11" width="16" height="10" rx="1" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
}

/** Online edit mode: the password decrypts the GitHub token in public/edit-key.json. */
function UnlockModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { unlock, setEditMode, toast } = useDb()
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { if (open) { setPw(''); setErr('') } }, [open])
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
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[90] flex items-start justify-center px-4 pt-[18vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ background: 'rgba(3,4,8,.72)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
          <motion.form className="panel cut brackets w-full max-w-[420px] p-6 sm:p-8" onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => { e.preventDefault(); submit() }}
            initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 10, opacity: 0 }}
            style={{ background: 'rgba(10,12,20,.97)', borderColor: 'rgba(255,92,168,.3)' }}>
            <div className="label" style={{ color: 'var(--pink)' }}>OWNER ONLY // 编辑模式</div>
            <h3 className="mt-2 text-xl font-extrabold">输入编辑密码</h3>
            <p className="mt-1 text-[13px]" style={{ color: 'var(--muted)' }}>只有 {OWNER} 本人可以修改这份档案。</p>
            <input autoFocus type="password" autoComplete="current-password" className="input mt-5 h-11" value={pw}
              onChange={(e) => setPw(e.target.value)} placeholder="密码" />
            {err && <div className="mt-2 text-[12.5px]" style={{ color: 'var(--red, #ff5f7a)' }}>{err}</div>}
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" className="btn" onClick={onClose}>取消</button>
              <button type="submit" className="btn btn-primary min-w-[110px]" disabled={!pw || busy}>{busy ? '验证中…' : '解锁'}</button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function SearchIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
}

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db } = useDb()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const nav = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const results = useMemo(() => (db?.games ?? []).filter((g) => matchQuery(g, q)).slice(0, 8), [db, q])
  useEffect(() => { if (open) { setQ(''); setSel(0); setTimeout(() => inputRef.current?.focus(), 30) } }, [open])
  const go = (id: string) => { onClose(); nav(`/game/${id}`) }
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[90] flex items-start justify-center px-4 pt-[14vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ background: 'rgba(3,4,8,.7)', backdropFilter: 'blur(6px)' }} onClick={onClose}>
          <motion.div className="panel cut w-full max-w-[620px]" initial={{ y: -20, scale: .98 }} animate={{ y: 0, scale: 1 }} exit={{ y: -10, opacity: 0 }}
            onClick={(e) => e.stopPropagation()} style={{ borderColor: 'rgba(70,227,255,.35)', background: 'rgba(10,12,20,.96)' }}>
            <div className="flex items-center gap-3 px-5" style={{ borderBottom: '1px solid var(--line)' }}>
              <span style={{ color: 'var(--cyan)' }}><SearchIcon /></span>
              <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setSel(0) }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)) }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
                  if (e.key === 'Enter' && results[sel]) go(results[sel].id)
                  else if (e.key === 'Enter' && q.trim() && db?.editable) { onClose(); window.dispatchEvent(new CustomEvent('game-life:add', { detail: { title: q.trim() } })) }
                }}
                placeholder="输入游戏名 / 英文名 / 开发商 / 标签" className="h-14 flex-1 bg-transparent text-[15px] outline-none" />
              <Kbd>ESC</Kbd>
            </div>
            <div className="max-h-[52vh] overflow-y-auto p-2">
              {results.map((g, i) => (
                <button key={g.id} onMouseEnter={() => setSel(i)} onClick={() => go(g.id)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors"
                  style={{ background: i === sel ? 'rgba(70,227,255,.08)' : 'transparent', borderLeft: `2px solid ${i === sel ? 'var(--cyan)' : 'transparent'}` }}>
                  <Cover game={g} sizes="sm" className="h-12 w-8 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold">{g.title}</div>
                    <div className="truncate text-[12px]" style={{ color: '#9aa3bb' }}>{g.titleEn ?? g.developer ?? ''}</div>
                  </div>
                  <StatusBadge status={g.status} size="sm" />
                  <span className="hud w-8 text-right text-[15px] font-bold" style={{ color: g.score == null ? 'var(--dim)' : '#fff' }}>{g.score ?? '—'}</span>
                </button>
              ))}
              {!results.length && (
                <div className="flex flex-col items-center gap-3 px-4 py-8 text-center text-sm" style={{ color: 'var(--dim)' }}>
                  档案里还没有「{q}」
                  {db?.editable && q.trim() && (
                    <button className="btn btn-primary h-9" onClick={() => { onClose(); window.dispatchEvent(new CustomEvent('game-life:add', { detail: { title: q.trim() } })) }}>＋ 添加《{q.trim()}》</button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
