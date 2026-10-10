import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import type { Game } from '../types'
import { GENRES, STATUSES, STATUS_META } from '../types'
import { useDb } from '../lib/db'
import { Inferred, Markdown, Portal, TierTag } from './ui'

type Draft = Omit<Game, 'score' | 'hours' | 'steamAppId' | 'tags'> & { score: string; hours: string; steamAppId: string; tags: string }

function toDraft(g: Game): Draft {
  return { ...g, score: g.score == null ? '' : String(g.score), hours: g.hours == null ? '' : String(g.hours), steamAppId: g.steamAppId ? String(g.steamAppId) : '', tags: g.tags.join('，') }
}

const splitTags = (s: string) => [...new Set(s.split(/[,，、]/).map((t) => t.trim()).filter(Boolean))]

export function EditDrawer({ game, open, onClose }: { game: Game; open: boolean; onClose: () => void }) {
  const { api, reload, toast, unlocked } = useDb()
  const nav = useNavigate()
  const [d, setD] = useState<Draft>(() => toDraft(game))
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(false)
  const [genreInput, setGenreInput] = useState('')
  useEffect(() => { if (open) setD(toDraft(game)) }, [open, game])

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }))

  async function save() {
    setBusy(true)
    try {
      const patch: Partial<Game> = {
        title: d.title, titleEn: d.titleEn || undefined, titleJa: d.titleJa || undefined, developer: d.developer || undefined,
        release: d.release || undefined, platforms: d.platforms, genres: d.genres, tags: splitTags(d.tags),
        status: d.status, playedFrom: d.playedFrom || undefined, playedTo: d.playedTo || undefined,
        score: d.score === '' ? null : Number(d.score), hours: d.hours === '' ? null : Number(d.hours),
        oneLiner: d.oneLiner || undefined, review: d.review || undefined,
        steamAppId: d.steamAppId ? Number(d.steamAppId) : null,
        // Saving from the form means the user has looked at every field.
        inferred: [],
      }
      await api.update(game.id, patch)
      if (patch.steamAppId && patch.steamAppId !== game.steamAppId) await api.steamArt(game.id, patch.steamAppId)
      await reload()
      toast('记录已保存')
      onClose()
    } catch (e) {
      toast((e as Error).message, 'err')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm(`确定删除《${game.title}》？${unlocked ? '记录会从 GitHub 仓库删除，可以从 Git 历史恢复。' : '文件会移到 data/.trash，可以手动恢复。'}`)) return
    await api.remove(game.id)
    await reload()
    toast(`已删除《${game.title}》`)
    nav('/')
  }

  async function refetchSteam() {
    if (!d.steamAppId) return
    setBusy(true)
    try { await api.steamArt(game.id, Number(d.steamAppId)); await reload(); toast(unlocked ? '已提交，部署时会重新抓取 Steam 封面' : '已重新抓取 Steam 封面') } catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }

  const toggleIn = (k: 'genres' | 'platforms', v: string) => set(k, d[k].includes(v) ? d[k].filter((x) => x !== v) : [...d[k], v])

  return (
    <Portal>
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-[70]" style={{ background: 'rgba(2,3,6,.6)', backdropFilter: 'blur(3px)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside className="fixed bottom-0 right-0 top-0 z-[71] flex w-full max-w-[620px] flex-col" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 260, damping: 30 }} style={{ background: 'rgba(8,10,17,.98)', borderLeft: '1px solid rgba(255,92,168,.35)' }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--line)' }}>
              <div>
                <div className="label" style={{ color: 'var(--pink)' }}>EDIT RECORD · {game.id}</div>
                <div className="mt-1 text-[18px] font-extrabold">编辑《{game.title}》</div>
              </div>
              <button className="btn btn-ghost h-9 px-3" onClick={onClose}>✕</button>
            </div>

            <div className="flex-1 space-y-7 overflow-y-auto px-6 py-6">
              <Group title="个人记录" en="PERSONAL">
                {!!game.inferred?.length && (
                  <div className="px-3 py-2 text-[12px]" style={{ border: '1px dashed rgba(255,197,71,.45)', color: '#e9d9a8' }}>
                    标「待确认」的字段是推断的，还没经过你确认。核对后点保存，就会全部变成已确认。
                  </div>
                )}
                <F label={<>游玩状态<Inferred show={!!game.inferred?.includes('status')} /></>}>
                  <div className="flex flex-wrap gap-2">
                    {STATUSES.map((s) => (
                      <button key={s} className="chip" data-on={d.status === s} style={{ ['--chip-color' as string]: STATUS_META[s].color }} onClick={() => set('status', s)}>
                        <span className="dot" />{STATUS_META[s].label}
                      </button>
                    ))}
                  </div>
                </F>
                <div className="grid grid-cols-[1fr_1fr_1fr] gap-3">
                  <F label={<>评分 0-100<Inferred show={!!game.inferred?.includes('score')} /></>}>
                    <div className="flex items-center gap-2">
                      <input className="input hud text-[17px]" type="number" min={0} max={100} value={d.score} onChange={(e) => set('score', e.target.value)} placeholder="—" />
                      <TierTag score={d.score === '' ? null : Number(d.score)} />
                    </div>
                  </F>
                  <F label="开始（年-月）"><input className="input" type="month" value={d.playedFrom ?? ''} onChange={(e) => set('playedFrom', e.target.value)} /></F>
                  <F label="结束（年-月）"><input className="input" type="month" value={d.playedTo ?? ''} onChange={(e) => set('playedTo', e.target.value)} /></F>
                </div>
                <input type="range" min={0} max={100} value={d.score === '' ? 0 : Number(d.score)} onChange={(e) => set('score', e.target.value)} className="w-full accent-[#ff5ca8]" />
                <div className="grid grid-cols-[120px_1fr] gap-3">
                  <F label="游玩时长（小时）"><input className="input" type="number" min={0} value={d.hours} onChange={(e) => set('hours', e.target.value)} /></F>
                  <F label="一句话短评"><input className="input" value={d.oneLiner ?? ''} onChange={(e) => set('oneLiner', e.target.value)} placeholder="会显示在卡片和详情页顶部" /></F>
                </div>
                <F label={<span className="flex items-center gap-3">整体感受（Markdown）<button className="mono text-[10.5px] underline" style={{ color: 'var(--cyan)' }} onClick={() => setPreview(!preview)}>{preview ? '编辑' : '预览'}</button></span>}>
                  {preview ? <div className="panel max-h-[340px] overflow-y-auto p-4">{d.review ? <Markdown text={d.review} /> : <span style={{ color: 'var(--dim)' }}>空</span>}</div>
                    : <textarea className="input min-h-[220px]" value={d.review ?? ''} onChange={(e) => set('review', e.target.value)} placeholder={'## 最难忘的一刻\n写下你的感受……'} />}
                </F>
                <F label="自定义标签（逗号分隔）"><input className="input" value={d.tags} onChange={(e) => set('tags', e.target.value)} placeholder="神作，受苦，二周目" /></F>
              </Group>

              <Group title="基本信息" en="BASIC">
                <F label="中文名"><input className="input" value={d.title} onChange={(e) => set('title', e.target.value)} /></F>
                <div className="grid grid-cols-2 gap-3">
                  <F label="英文名"><input className="input" value={d.titleEn ?? ''} onChange={(e) => set('titleEn', e.target.value)} /></F>
                  <F label="日文名"><input className="input" value={d.titleJa ?? ''} onChange={(e) => set('titleJa', e.target.value)} /></F>
                  <F label="开发商"><input className="input" value={d.developer ?? ''} onChange={(e) => set('developer', e.target.value)} /></F>
                  <F label="发售（年-月）"><input className="input" type="month" value={d.release ?? ''} onChange={(e) => set('release', e.target.value)} /></F>
                </div>
                <F label="类型">
                  <div className="flex flex-wrap gap-1.5">
                    {[...new Set([...GENRES, ...d.genres])].map((g) => (
                      <button key={g} className="chip h-7 text-[12px]" data-on={d.genres.includes(g)} style={{ ['--chip-color' as string]: 'var(--pink)' }} onClick={() => toggleIn('genres', g)}>{g}</button>
                    ))}
                    <input className="input h-7 w-24 text-[12px]" value={genreInput} onChange={(e) => setGenreInput(e.target.value)} placeholder="+ 新类型"
                      onKeyDown={(e) => { if (e.key === 'Enter' && genreInput.trim()) { set('genres', [...d.genres, genreInput.trim()]); setGenreInput('') } }} />
                  </div>
                </F>
                <F label={<>游玩平台（你当时在哪玩的）<Inferred show={!!game.inferred?.includes('platforms')} /></>}>
                  <div className="flex flex-wrap gap-1.5">
                    {[...new Set(['PC', 'PS5', 'PS4', 'Switch', 'Xbox', 'Mobile', ...d.platforms])].map((p) => (
                      <button key={p} className="chip h-7 text-[12px]" data-on={d.platforms.includes(p)} style={{ ['--chip-color' as string]: 'var(--violet)' }} onClick={() => toggleIn('platforms', p)}>{p}</button>
                    ))}
                  </div>
                </F>
                <F label="Steam AppID（填写后保存会自动抓取封面）">
                  <div className="flex gap-2">
                    <input className="input mono" value={d.steamAppId} onChange={(e) => set('steamAppId', e.target.value.replace(/\D/g, ''))} placeholder="例如 814380" />
                    <button className="btn shrink-0" disabled={!d.steamAppId || busy} onClick={refetchSteam}>重新抓取封面</button>
                  </div>
                </F>
              </Group>
            </div>

            <div className="flex items-center justify-between gap-3 px-6 py-4" style={{ borderTop: '1px solid var(--line)' }}>
              <button className="btn btn-danger btn-ghost" onClick={remove}>删除游戏</button>
              <div className="flex gap-3">
                <button className="btn" onClick={onClose}>取消</button>
                <button className="btn btn-primary min-w-[120px]" disabled={busy || !d.title.trim()} onClick={save}>{busy ? '保存中…' : '保存'}</button>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
    </Portal>
  )
}

function Group({ title, en, children }: { title: string; en: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex items-baseline gap-3">
        <span className="text-[15px] font-extrabold">{title}</span>
        <span className="label">{en}</span>
        <span className="h-px flex-1" style={{ background: 'var(--line)' }} />
      </div>
      {children}
    </section>
  )
}

function F({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[12px]" style={{ color: 'var(--muted)' }}>{label}</div>
      {children}
    </div>
  )
}
