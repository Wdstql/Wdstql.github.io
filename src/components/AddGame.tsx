import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { useDb } from '../lib/db'
import { STATUSES, STATUS_META, type Status } from '../types'

interface Hit { appid: number; name: string; logo: string }

export function AddGameModal({ open, onClose, initialTitle = '' }: { open: boolean; onClose: () => void; initialTitle?: string }) {
  const { api, reload, toast, byId, unlocked } = useDb()
  const nav = useNavigate()
  const [title, setTitle] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [searching, setSearching] = useState(false)
  const [picked, setPicked] = useState<Hit | null>(null)
  const [status, setStatus] = useState<Status>('finished')
  const [score, setScore] = useState('')
  const [from, setFrom] = useState('')
  const [busy, setBusy] = useState(false)
  // Online edit mode can't reach the Steam search API (no CORS); the owner pastes an AppID or store link instead.
  const [appLink, setAppLink] = useState('')
  const linkedAppId = Number(appLink.match(/\/app\/(\d+)/)?.[1] ?? (/^\s*\d+\s*$/.test(appLink) ? appLink.trim() : 0)) || null

  useEffect(() => {
    if (open) { setTitle(initialTitle); setHits([]); setPicked(null); setStatus('finished'); setScore(''); setFrom(''); setAppLink('') }
  }, [open, initialTitle])

  useEffect(() => {
    if (!open || unlocked || title.trim().length < 2 || picked) { setHits([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      try { setHits(await api.steamSearch(title.trim())) } catch { setHits([]) } finally { setSearching(false) }
    }, 380)
    return () => clearTimeout(t)
  }, [title, open, picked, api, unlocked])

  const appid = unlocked ? linkedAppId : picked?.appid ?? null
  const dup = [...byId.values()].find((g) => g.title === title.trim() || (appid && g.steamAppId === appid))

  async function submit() {
    if (!title.trim()) return
    setBusy(true)
    try {
      const g = await api.create({
        title: title.trim(), steamAppId: appid, status,
        score: score === '' ? null : Number(score), playedFrom: from || undefined,
      })
      await reload()
      toast(`已添加《${g.title}》${!appid ? '' : unlocked ? '，封面会在部署时从 Steam 下载' : '，封面已从 Steam 下载'}`)
      onClose()
      nav(`/game/${g.id}`)
    } catch (e) {
      toast((e as Error).message, 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto px-4 py-[5vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ background: 'rgba(3,4,8,.72)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
          <motion.div className="panel cut brackets w-full max-w-[640px] p-6 sm:p-8" onClick={(e) => e.stopPropagation()}
            initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} transition={{ ease: [0.16, 1, 0.3, 1], duration: .5 }}
            style={{ background: 'rgba(10,12,20,.97)', borderColor: 'rgba(70,227,255,.25)' }}>
            <div className="label" style={{ color: 'var(--cyan)' }}>NEW RECORD // 新增档案</div>
            <h3 className="mt-2 text-2xl font-extrabold">添加一款游戏</h3>
            <p className="mt-1 text-[13px]" style={{ color: 'var(--muted)' }}>{unlocked
              ? '输入名字。填上 Steam 商店链接或 AppID，部署时会自动下载封面、发售时间和开发商。'
              : '输入名字，从 Steam 结果里选一个，就会自动填好封面、发售时间和开发商。找不到也能直接手动创建。'}</p>

            <div className="mt-6">
              <div className="label mb-2">游戏名</div>
              <input autoFocus className="input h-12 text-[16px]" value={title} placeholder="例如：只狼 / Hollow Knight"
                onChange={(e) => { setTitle(e.target.value); setPicked(null) }}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit() }} />
              {dup && <div className="mt-2 text-[12px]" style={{ color: 'var(--amber)' }}>档案里已经有《{dup.title}》了，确定要再加一次吗？</div>}
            </div>

            <div className="mt-4 min-h-[60px]">
              {unlocked ? (
                <div>
                  <div className="label mb-2">Steam 商店链接或 AppID（可选）</div>
                  <input className="input" value={appLink} onChange={(e) => setAppLink(e.target.value)} placeholder="https://store.steampowered.com/app/814380/ 或 814380" />
                  {appLink.trim() && !linkedAppId && <div className="mt-2 text-[12px]" style={{ color: 'var(--amber)' }}>没有识别出 AppID</div>}
                </div>
              ) : picked ? (
                <div className="flex items-center gap-3 p-3" style={{ border: '1px solid rgba(70,227,255,.4)', background: 'rgba(70,227,255,.06)' }}>
                  <img src={picked.logo} className="h-[45px] w-[120px] object-cover" alt="" />
                  <div className="min-w-0 flex-1">
                    <div className="label" style={{ color: 'var(--cyan)' }}>STEAM · {picked.appid}</div>
                    <div className="truncate text-[14px] font-semibold">{picked.name}</div>
                  </div>
                  <button className="btn btn-ghost h-8 px-3 text-[12px]" onClick={() => setPicked(null)}>取消关联</button>
                </div>
              ) : (
                <div className="grid gap-1.5">
                  {searching && <div className="mono text-[12px] caret" style={{ color: 'var(--dim)' }}>SEARCHING STEAM</div>}
                  {hits.slice(0, 6).map((h) => (
                    <button key={h.appid} onClick={() => setPicked(h)} className="flex items-center gap-3 p-1.5 text-left transition-colors hover:bg-white/5"
                      style={{ border: '1px solid var(--line)' }}>
                      <img src={h.logo} className="h-[34px] w-[90px] shrink-0 object-cover" alt="" referrerPolicy="no-referrer" />
                      <span className="flex-1 truncate text-[13.5px]">{h.name}</span>
                      {[...byId.values()].some((g) => g.steamAppId === h.appid) && <span className="px-1.5 text-[10.5px] font-bold" style={{ color: 'var(--amber)', border: '1px solid rgba(255,197,71,.5)' }}>已收录</span>}
                      <span className="mono pr-2 text-[10px]" style={{ color: 'var(--dim)' }}>{h.appid}</span>
                    </button>
                  ))}
                  {!searching && hits.length > 0 && /[\u4e00-\u9fff]/.test(title) && (
                    <div className="mono text-[11px]" style={{ color: 'var(--dim)' }}>Steam 多数游戏只有英文名。没看到想要的，换英文名再搜一次。</div>
                  )}
                  {!searching && title.trim().length >= 2 && !hits.length && (
                    <div className="text-[12.5px]" style={{ color: 'var(--dim)' }}>Steam 上没搜到。主机 / 手游可以直接手动创建，稍后在详情页上传封面。</div>
                  )}
                </div>
              )}
            </div>

            <div className="mt-6">
              <div className="label mb-2">游玩状态</div>
              <div className="flex flex-wrap gap-2">
                {STATUSES.map((s) => (
                  <button key={s} className="chip" data-on={status === s} style={{ ['--chip-color' as string]: STATUS_META[s].color }} onClick={() => setStatus(s)}>
                    <span className="dot" />{STATUS_META[s].label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-4">
              <div>
                <div className="label mb-2">评分（0-100，可留空）</div>
                <input className="input hud text-[16px]" type="number" min={0} max={100} value={score} onChange={(e) => setScore(e.target.value)} placeholder="—" />
              </div>
              <div>
                <div className="label mb-2">开始游玩</div>
                <input className="input" type="month" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
            </div>

            {/* Sticky so the actions stay reachable on short windows. */}
            <div className="sticky bottom-0 -mx-6 -mb-6 mt-6 flex items-center justify-between gap-3 px-6 py-4 sm:-mx-8 sm:-mb-8 sm:px-8" style={{ background: 'rgba(10,12,20,.97)', borderTop: '1px solid var(--line)' }}>
              <span className="mono hidden text-[11px] sm:block" style={{ color: 'var(--dim)' }}>⌘ + ENTER 快速提交</span>
              <div className="flex gap-3">
                <button className="btn" onClick={onClose}>取消</button>
                <button className="btn btn-primary min-w-[140px]" disabled={!title.trim() || busy} onClick={submit}>
                  {busy ? (picked ? '下载封面中…' : '创建中…') : picked ? '创建并抓取封面' : unlocked ? '创建' : '手动创建'}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
