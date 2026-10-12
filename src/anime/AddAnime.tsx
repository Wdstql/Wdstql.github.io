import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { useAnimeDb } from './db'
import { AIR_META, AIR_STATUSES, WATCH_META, WATCH_STATUSES, type AirStatus, type WatchStatus } from './model'
import { searchBangumi, type BgmHit } from './sources'
import { Portal } from '../components/ui'
import { Star } from './components'
import { useEscape } from './Layout'

export function AddAnimeModal({ open, onClose, initialTitle = '' }: { open: boolean; onClose: () => void; initialTitle?: string }) {
  const { api, reload, toast, byId, unlocked } = useAnimeDb()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<BgmHit[]>([])
  const [searching, setSearching] = useState(false)
  const [searchErr, setSearchErr] = useState('')
  const [picked, setPicked] = useState<BgmHit | null>(null)
  const [status, setStatus] = useState<WatchStatus>('watched')
  const [air, setAir] = useState<AirStatus>('finished')
  const [progress, setProgress] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) { setQ(initialTitle); setHits([]); setPicked(null); setStatus('watched'); setAir('finished'); setProgress(''); setSearchErr('') }
  }, [open, initialTitle])

  useEffect(() => {
    if (!open || picked || q.trim().length < 1) { setHits([]); return }
    let alive = true
    const t = setTimeout(async () => {
      setSearching(true)
      setSearchErr('')
      try { const r = await searchBangumi(q); if (alive) setHits(r) } catch (e) { if (alive) { setHits([]); setSearchErr((e as Error).message) } } finally { if (alive) setSearching(false) }
    }, 350)
    return () => { alive = false; clearTimeout(t) }
  }, [q, open, picked])

  useEscape(open, onClose)

  const all = [...byId.values()]
  const recorded = (id: number) => all.find((a) => a.bangumiId === id)
  const dup = picked ? recorded(picked.id) : all.find((a) => a.title === q.trim())

  async function submit() {
    if (busy || (!picked && !q.trim())) return
    setBusy(true)
    try {
      const a = await api.create(picked
        ? { bangumiId: picked.id, status, progress: progress || undefined }
        : { title: q.trim(), status, air, progress: progress || undefined })
      await reload()
      toast(`已添加《${a.title}》${unlocked && picked ? '，封面会在部署时下载到仓库' : ''}`)
      onClose()
      nav(`/anime/${a.id}`)
    } catch (e) {
      toast((e as Error).message, 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <motion.div className="anime-root fixed inset-0 z-[100] flex min-h-0 items-start justify-center overflow-y-auto px-4 py-[5vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ background: 'rgba(5,4,16,.75)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
            <motion.div role="dialog" aria-label="添加番剧" className="relative w-full max-w-[680px] overflow-hidden cut" onClick={(e) => e.stopPropagation()}
              initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} transition={{ ease: [0.16, 1, 0.3, 1], duration: .5 }}
              style={{ background: 'rgba(16,12,38,.98)', border: '1px solid rgba(255,126,182,.3)' }}>
              <div className="tone pointer-events-none absolute -bottom-16 -right-16 h-48 w-48 rounded-full opacity-20" />
              <div className="relative p-6 sm:p-8">
                <div className="label flex items-center gap-2" style={{ color: 'var(--pink)' }}><Star size={10} color="var(--pink)" />NEW RECORD // 新しい作品</div>
                <h3 className="mt-2 text-2xl font-extrabold">添加一部番剧</h3>
                <p className="mt-1 text-[13px] leading-relaxed" style={{ color: 'var(--muted)' }}>
                  输入番名，从 Bangumi 结果里选一季。名字、集数、制作公司、封面、横幅和是否完结都会自动填好。每一季单独添加。
                </p>

                <div className="mt-6">
                  <div className="label mb-2">番名（中文或日文）</div>
                  <input autoFocus className="input h-12 cut cut-sm text-[16px]" value={q} placeholder="例如：间谍过家家 第三季 / 葬送のフリーレン"
                    onChange={(e) => { setQ(e.target.value); setPicked(null) }} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit() }} />
                  {dup && <div className="mt-2 text-[12px]" style={{ color: 'var(--amber)' }}>档案里已经有《{dup.title}》了，确定要再加一次吗？</div>}
                </div>

                <div className={q.trim() || picked ? 'mt-4 min-h-[64px]' : 'mt-2'}>
                  {picked ? (
                    <div className="flex items-center gap-3 cut cut-sm p-3" style={{ border: '1px solid rgba(255,126,182,.45)', background: 'rgba(255,126,182,.07)' }}>
                      {picked.image && <img src={picked.image} referrerPolicy="no-referrer" className="h-[72px] w-12 rounded object-cover" alt="" />}
                      <div className="min-w-0 flex-1">
                        <div className="label" style={{ color: 'var(--pink)' }}>BANGUMI · {picked.id}</div>
                        <div className="truncate text-[15px] font-semibold">{picked.nameCn || picked.name}</div>
                        <div className="truncate text-[12px]" style={{ color: 'var(--dim)' }}>{[picked.date, picked.platform, picked.eps ? `${picked.eps} 话` : ''].filter(Boolean).join(' · ')}</div>
                      </div>
                      <button className="btn btn-ghost h-8 px-3 text-[12px]" onClick={() => setPicked(null)}>重新选择</button>
                    </div>
                  ) : (
                    <div className="grid max-h-[300px] gap-1.5 overflow-y-auto pr-1">
                      {searching && <div className="mono caret text-[12px]" style={{ color: 'var(--dim)' }}>SEARCHING BANGUMI</div>}
                      {searchErr && <div className="text-[12.5px]" style={{ color: '#ff8fa1' }}>Bangumi 搜索失败：{searchErr}。仍可手动创建。</div>}
                      {hits.map((h) => {
                        const rec = recorded(h.id)
                        return (
                          <button key={h.id} onClick={() => setPicked(h)} className="flex items-center gap-3 cut cut-sm p-1.5 text-left transition-colors hover:bg-white/5" style={{ border: '1px solid var(--line)' }}>
                            {h.image ? <img src={h.image} referrerPolicy="no-referrer" loading="lazy" className="h-[54px] w-9 shrink-0 rounded object-cover" alt="" /> : <span className="h-[54px] w-9 shrink-0 rounded" style={{ background: '#1a1538' }} />}
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[13.5px] font-semibold">{h.nameCn || h.name}</div>
                              <div className="truncate text-[11.5px]" style={{ color: 'var(--dim)' }}>{h.nameCn ? h.name : ''}</div>
                            </div>
                            {rec && <span className="shrink-0 rounded px-1.5 text-[10.5px] font-bold" style={{ color: 'var(--amber)', border: '1px solid rgba(255,209,102,.5)' }}>已收录</span>}
                            <span className="mono shrink-0 pr-2 text-right text-[10.5px] leading-tight" style={{ color: 'var(--dim)' }}>{h.date?.slice(0, 7) ?? '未定'}<br />{h.platform}</span>
                          </button>
                        )
                      })}
                      {!searching && !searchErr && q.trim() && !hits.length && (
                        <div className="text-[12.5px]" style={{ color: 'var(--dim)' }}>Bangumi 上没搜到。可以换个名字，或者直接手动创建。</div>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-6">
                  <div className="label mb-2">我的观看状态</div>
                  <div className="flex flex-wrap gap-2">
                    {WATCH_STATUSES.map((s) => (
                      <button key={s} className="chip" data-on={status === s} style={{ ['--chip-color' as string]: WATCH_META[s].color }} onClick={() => setStatus(s)}>
                        <span className="dot" />{WATCH_META[s].label}
                      </button>
                    ))}
                  </div>
                </div>

                {!picked && (
                  <div className="mt-5">
                    <div className="label mb-2">是否完结（手动创建时必填）</div>
                    <div className="flex flex-wrap gap-2">
                      {AIR_STATUSES.map((s) => (
                        <button key={s} className="chip" data-on={air === s} style={{ ['--chip-color' as string]: AIR_META[s].color }} onClick={() => setAir(s)}>
                          <span className="dot" />{AIR_META[s].label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-5">
                  <div className="label mb-2">进度说明（可留空）</div>
                  <input className="input cut cut-sm" value={progress} onChange={(e) => setProgress(e.target.value)} placeholder="例如：看到第 12 话 / 看到某某篇之前" />
                </div>
              </div>

              <div className="sticky bottom-0 flex items-center justify-between gap-3 px-6 py-4 sm:px-8" style={{ background: 'rgba(16,12,38,.98)', borderTop: '1px solid var(--line)' }}>
                <span className="mono hidden text-[11px] sm:block" style={{ color: 'var(--dim)' }}>⌘ + ENTER 快速提交</span>
                <div className="ml-auto flex gap-3">
                  <button className="btn" onClick={onClose}>取消</button>
                  <button className="btn btn-sakura min-w-[150px]" disabled={busy || (!picked && !q.trim())} onClick={submit}>
                    {busy ? (picked ? '读取资料中…' : '创建中…') : picked ? '添加这一季' : '手动创建'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  )
}
