import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import type { Anime } from './model'
import { AIR_META, AIR_STATUSES, ANIME_GENRES, FORMATS, SOURCES, WATCH_META, WATCH_STATUSES } from './model'
import { useAnimeDb } from './db'
import { Inferred } from './components'
import { Markdown, Portal } from '../components/ui'

type NumKey = 'score' | 'episodes' | 'watchedEps' | 'bangumiId'
type Draft = Omit<Anime, NumKey | 'tags'> & Record<NumKey, string> & { tags: string }

const num = (v: number | null | undefined) => (v == null ? '' : String(v))

function toDraft(a: Anime): Draft {
  return { ...a, score: num(a.score), episodes: num(a.episodes), watchedEps: num(a.watchedEps), bangumiId: num(a.bangumiId), tags: a.tags.join('，') }
}

export function AnimeEditDrawer({ anime, open, onClose }: { anime: Anime; open: boolean; onClose: () => void }) {
  const { api, reload, toast, unlocked } = useAnimeDb()
  const nav = useNavigate()
  const [d, setD] = useState<Draft>(() => toDraft(anime))
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(false)
  const [genreInput, setGenreInput] = useState('')
  // Re-seed the form only when the drawer opens (a background data reload must not wipe typed input).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) { setD(toDraft(anime)); setPreview(false) } }, [open, anime.id])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }))
  const n = (s: string) => (s.trim() === '' ? null : Number(s))

  async function save() {
    const sc = n(d.score)
    if (sc != null && (!Number.isFinite(sc) || sc < 0 || sc > 100)) { toast('评分需要在 0 到 100 之间', 'err'); return }
    setBusy(true)
    try {
      await api.update(anime.id, {
        title: d.title, titleJa: d.titleJa ?? '', titleRomaji: d.titleRomaji ?? '', series: d.series ?? '', season: d.season ?? '',
        format: d.format, air: d.air, airStart: d.airStart ?? '', airEnd: d.airEnd ?? '', episodes: n(d.episodes), studio: d.studio ?? '',
        source: d.source ?? '', genres: d.genres, bangumiId: n(d.bangumiId),
        status: d.status, progress: d.progress ?? '', watchedEps: n(d.watchedEps), watchedFrom: d.watchedFrom ?? '', watchedTo: d.watchedTo ?? '',
        score: n(d.score), oneLiner: d.oneLiner ?? '', review: d.review ?? '',
        tags: [...new Set(d.tags.split(/[,，、]/).map((t) => t.trim()).filter(Boolean))],
        // Saving the form means the owner has looked at every field.
        inferred: [],
      })
      await reload()
      toast('记录已保存')
      onClose()
    } catch (e) {
      toast((e as Error).message, 'err')
    } finally {
      setBusy(false)
    }
  }

  async function refresh() {
    setBusy(true)
    try { await api.refresh(anime.id); await reload(); toast('已从 Bangumi / AniList 刷新放送状态、集数和评分'); onClose() } catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }

  async function remove() {
    if (!window.confirm(`确定删除《${anime.title}》？${unlocked ? '记录会从 GitHub 仓库删除，可以从 Git 历史恢复。' : '文件会移到 data/.trash/anime，可以手动恢复。'}`)) return
    try {
      await api.remove(anime.id)
      await reload()
      toast(`已删除《${anime.title}》`)
      nav('/anime')
    } catch (e) {
      toast((e as Error).message, 'err')
    }
  }

  const toggleGenre = (g: string) => set('genres', d.genres.includes(g) ? d.genres.filter((x) => x !== g) : [...d.genres, g])

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <div className="anime-root fixed inset-0 z-[100] min-h-0">
            <motion.div className="absolute inset-0" style={{ background: 'rgba(5,4,16,.6)', backdropFilter: 'blur(3px)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
            <motion.aside role="dialog" aria-label={`编辑《${anime.title}》`} className="absolute bottom-0 right-0 top-0 flex w-full max-w-[640px] flex-col" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 260, damping: 30 }} style={{ background: 'rgba(14,11,34,.99)', borderLeft: '1px solid rgba(255,126,182,.35)' }}>
              <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--line)' }}>
                <div className="min-w-0">
                  <div className="label" style={{ color: 'var(--pink)' }}>EDIT RECORD · {anime.id}</div>
                  <div className="mt-1 truncate text-[18px] font-extrabold">编辑《{anime.title}》</div>
                </div>
                <button className="btn btn-ghost h-9 px-3" onClick={onClose} aria-label="关闭">✕</button>
              </div>

              <div className="flex-1 space-y-7 overflow-y-auto px-6 py-6">
                <Group title="我的记录" en="PERSONAL">
                  {!!anime.inferred?.length && (
                    <div className="cut cut-sm px-3 py-2 text-[12px]" style={{ border: '1px dashed rgba(255,209,102,.45)', color: '#eedcae' }}>
                      标「待确认」的字段是推断的，还没经过你确认。核对后点保存，就会全部变成已确认。
                    </div>
                  )}
                  <F group label={<>观看状态<Inferred show={!!anime.inferred?.includes('status')} /></>}>
                    <div className="flex flex-wrap gap-2">
                      {WATCH_STATUSES.map((s) => (
                        <button key={s} className="chip" data-on={d.status === s} style={{ ['--chip-color' as string]: WATCH_META[s].color }} onClick={() => set('status', s)}><span className="dot" />{WATCH_META[s].label}</button>
                      ))}
                    </div>
                  </F>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <F label="评分 0-100"><input className="input hud text-[16px]" type="number" min={0} max={100} value={d.score} onChange={(e) => set('score', e.target.value)} placeholder="—" /></F>
                    <F label="看到第几话"><input className="input" type="number" min={0} value={d.watchedEps} onChange={(e) => set('watchedEps', e.target.value)} placeholder="—" /></F>
                    <F label="开始看（年-月）"><input className="input" type="month" value={d.watchedFrom ?? ''} onChange={(e) => set('watchedFrom', e.target.value)} /></F>
                    <F label="看完（年-月）"><input className="input" type="month" value={d.watchedTo ?? ''} onChange={(e) => set('watchedTo', e.target.value)} /></F>
                  </div>
                  <F label="进度说明（没看完时写）"><input className="input" value={d.progress ?? ''} onChange={(e) => set('progress', e.target.value)} placeholder="例如：看到多弗朗明哥之前" /></F>
                  <F label="一句话"><input className="input" value={d.oneLiner ?? ''} onChange={(e) => set('oneLiner', e.target.value)} placeholder="会显示成详情页的对话框" /></F>
                  <F group label={<span className="flex items-center gap-3">感想（Markdown）<button className="mono text-[10.5px] underline" style={{ color: 'var(--pink)' }} onClick={() => setPreview(!preview)}>{preview ? '编辑' : '预览'}</button></span>}>
                    {preview ? <div className="panel max-h-[340px] overflow-y-auto cut cut-sm p-4">{d.review ? <Markdown text={d.review} /> : <span style={{ color: 'var(--dim)' }}>空</span>}</div>
                      : <textarea className="input min-h-[200px]" aria-label="感想" value={d.review ?? ''} onChange={(e) => set('review', e.target.value)} placeholder={'## 最喜欢的一集\n写下你的感受……'} />}
                  </F>
                  <F label="自定义标签（逗号分隔）"><input className="input" value={d.tags} onChange={(e) => set('tags', e.target.value)} placeholder="神作，补番，二刷" /></F>
                </Group>

                <Group title="作品资料" en="BROADCAST">
                  <F group label="是否完结">
                    <div className="flex flex-wrap gap-2">
                      {AIR_STATUSES.map((s) => (
                        <button key={s} className="chip" data-on={d.air === s} style={{ ['--chip-color' as string]: AIR_META[s].color }} onClick={() => set('air', s)}><span className="dot" />{AIR_META[s].label}</button>
                      ))}
                    </div>
                  </F>
                  <F label="中文名"><input className="input" value={d.title} onChange={(e) => set('title', e.target.value)} /></F>
                  <div className="grid grid-cols-2 gap-3">
                    <F label="日文名"><input className="input" value={d.titleJa ?? ''} onChange={(e) => set('titleJa', e.target.value)} /></F>
                    <F label="罗马音"><input className="input" value={d.titleRomaji ?? ''} onChange={(e) => set('titleRomaji', e.target.value)} /></F>
                    <F label="系列名（同系列各季填一样）"><input className="input" value={d.series ?? ''} onChange={(e) => set('series', e.target.value)} /></F>
                    <F label="季度标签"><input className="input" value={d.season ?? ''} onChange={(e) => set('season', e.target.value)} placeholder="第二季 / 剧场版" /></F>
                    <F label="首播（年-月）"><input className="input" type="month" value={d.airStart ?? ''} onChange={(e) => set('airStart', e.target.value)} /></F>
                    <F label="完结（年-月）"><input className="input" type="month" value={d.airEnd ?? ''} onChange={(e) => set('airEnd', e.target.value)} /></F>
                    <F label="集数"><input className="input" type="number" min={0} value={d.episodes} onChange={(e) => set('episodes', e.target.value)} /></F>
                    <F label="制作公司"><input className="input" value={d.studio ?? ''} onChange={(e) => set('studio', e.target.value)} /></F>
                    <F label="形式">
                      <select className="input" value={d.format} onChange={(e) => set('format', e.target.value)}>
                        {[...new Set([...FORMATS, d.format])].map((f) => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </F>
                    <F label="原作">
                      <select className="input" value={d.source ?? ''} onChange={(e) => set('source', e.target.value)}>
                        <option value="">—</option>
                        {[...new Set([...SOURCES, ...(d.source ? [d.source] : [])])].map((f) => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </F>
                  </div>
                  <F group label="类型">
                    <div className="flex flex-wrap gap-1.5">
                      {[...new Set([...ANIME_GENRES, ...d.genres])].map((g) => (
                        <button key={g} className="chip h-7 text-[12px]" data-on={d.genres.includes(g)} style={{ ['--chip-color' as string]: 'var(--pink)' }} onClick={() => toggleGenre(g)}>{g}</button>
                      ))}
                      <input className="input h-7 w-24 text-[12px]" value={genreInput} onChange={(e) => setGenreInput(e.target.value)} placeholder="+ 新类型"
                        onKeyDown={(e) => { if (e.key === 'Enter' && genreInput.trim()) { set('genres', [...new Set([...d.genres, genreInput.trim()])]); setGenreInput('') } }} />
                    </div>
                  </F>
                  <F group label="Bangumi 条目 ID">
                    <div className="flex gap-2">
                      <input className="input mono" aria-label="Bangumi 条目 ID" value={d.bangumiId} onChange={(e) => set('bangumiId', e.target.value.replace(/\D/g, ''))} placeholder="例如 400602" />
                      <button className="btn shrink-0" disabled={!anime.bangumiId || busy} onClick={refresh} title="重新读取放送状态、集数和 Bangumi 评分">从 Bangumi 刷新</button>
                    </div>
                  </F>
                </Group>
              </div>

              <div className="flex items-center justify-between gap-3 px-6 py-4" style={{ borderTop: '1px solid var(--line)' }}>
                <button className="btn btn-danger btn-ghost" onClick={remove}>删除</button>
                <div className="flex gap-3">
                  <button className="btn" onClick={onClose}>取消</button>
                  <button className="btn btn-sakura min-w-[120px]" disabled={busy || !d.title.trim()} onClick={save}>{busy ? '保存中…' : '保存'}</button>
                </div>
              </div>
            </motion.aside>
          </div>
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

/**
 * A form row. Only rows holding a single input are a <label>: a label around a group of chip
 * buttons would forward clicks on its caption to the first button and change the value.
 */
function F({ label, children, group }: { label: ReactNode; children: ReactNode; group?: boolean }) {
  const Tag = group ? 'div' : 'label'
  return (
    <Tag className="block" {...(group ? { role: 'group' } : {})}>
      <div className="mb-1.5 text-[12px]" style={{ color: 'var(--muted)' }}>{label}</div>
      {children}
    </Tag>
  )
}
