import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion, useScroll, useTransform } from 'motion/react'
import type { Fanwork, Game, Moment } from '../types'
import { STATUSES, STATUS_META } from '../types'
import { useDb } from '../lib/db'
import { fmtMonth, playedRange, sortGames, tierOf, useAccent } from '../lib/game'
import { Cover, Inferred, isPending, Markdown, Portal, ScoreRing, StatusBadge, TierTag } from '../components/ui'
import { EditDrawer } from '../components/EditDrawer'

export function GameDetail() {
  const { id = '' } = useParams()
  const { db, byId, editMode, api, reload, toast } = useDb()
  const game = byId.get(id)
  const [editing, setEditing] = useState(false)
  const accent = useAccent(game?.thumb ?? game?.cover, id)
  const heroRef = useRef<HTMLDivElement>(null)
  const { scrollY } = useScroll()
  const heroY = useTransform(scrollY, [0, 500], [0, 140])
  const heroOpacity = useTransform(scrollY, [0, 420], [1, 0.25])

  const ranked = useMemo(() => sortGames((db?.games ?? []).filter((g) => g.score != null), 'score'), [db])
  const rank = ranked.findIndex((g) => g.id === id)
  const awards = (db?.awards ?? []).filter((a) => a.gameId === id)

  const save = useCallback(async (patch: Partial<Game>, msg = '已保存') => {
    if (!game) return
    try {
      // Editing a field confirms it, so drop it from the inferred list.
      const inferred = game.inferred?.filter((f) => !(f in patch))
      await api.update(game.id, { ...patch, ...(game.inferred ? { inferred } : {}) })
      await reload()
      toast(msg)
    } catch (e) {
      toast((e as Error).message, 'err')
    }
  }, [game, api, reload, toast])

  if (!db) return null
  if (!game) {
    return (
      <div className="mx-auto flex h-[60vh] max-w-xl flex-col items-center justify-center gap-4 text-center">
        <div className="display text-[64px] font-black" style={{ color: 'transparent', WebkitTextStroke: '1px var(--pink)' }}>404</div>
        <div style={{ color: 'var(--muted)' }}>档案里没有 <span className="mono">{id}</span></div>
        <Link to="/" className="btn">回到总览</Link>
      </div>
    )
  }

  const inf = (f: string) => !!game.inferred?.includes(f)
  const tier = tierOf(game.score)

  return (
    <div style={{ ['--accent' as string]: accent }}>
      {/* ---------- banner ---------- */}
      <div ref={heroRef} className="relative h-[420px] overflow-hidden sm:h-[500px]">
        <motion.div className="absolute inset-0" style={{ y: heroY, opacity: heroOpacity }}>
          {game.hero ? (
            <img src={game.hero} alt="" className="h-full w-full object-cover" style={{ filter: 'saturate(1.1)' }} />
          ) : (
            // No wide art: build a banner from the cover's accent colour instead of smearing the cover.
            <div className="relative h-full w-full overflow-hidden" style={{ background: `radial-gradient(900px 420px at 78% 30%, color-mix(in srgb, ${accent} 38%, transparent), transparent 70%), radial-gradient(700px 400px at 10% 90%, color-mix(in srgb, ${accent} 18%, transparent), transparent 70%), #07080d` }}>
              <div className="absolute inset-0 opacity-40" style={{ backgroundImage: `radial-gradient(color-mix(in srgb, ${accent} 70%, white) 1px, transparent 1.4px)`, backgroundSize: '9px 9px', maskImage: 'linear-gradient(110deg, transparent 35%, #000 75%)' }} />
              <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
              {game.cover && <img src={game.cover} alt="" className="absolute right-0 top-0 h-full w-[40%] object-cover opacity-45" style={{ filter: 'blur(1.5px) saturate(1.15)', maskImage: 'linear-gradient(90deg, transparent, #000 55%)', WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 55%)' }} />}
            </div>
          )}
        </motion.div>
        <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, rgba(5,6,10,.45) 0%, rgba(5,6,10,.3) 35%, rgba(5,6,10,.9) 78%, var(--bg) 100%), linear-gradient(90deg, rgba(5,6,10,.92), rgba(5,6,10,.4) 55%, transparent 80%)` }} />
        <div className="relative mx-auto flex h-full max-w-[1480px] items-start justify-between px-4 pt-6 sm:px-8">
          <BackLink />
          <div className="flex items-center gap-2">
            {rank >= 0 && <span className="px-2.5 py-1 text-[12px]" style={{ background: 'rgba(0,0,0,.55)', border: '1px solid var(--line-2)', color: 'var(--muted)' }}>第 <b className="hud text-[15px] text-white">{rank + 1}</b> / {ranked.length} 名</span>}
            {editMode && <button className="btn btn-pink" onClick={() => setEditing(true)}>✎ 编辑记录</button>}
          </div>
        </div>
      </div>

      {/* ---------- header ---------- */}
      <div className="relative mx-auto -mt-[300px] max-w-[1480px] px-4 sm:-mt-[330px] sm:px-8">
        <div className="grid items-end gap-8 lg:grid-cols-[260px_1fr]">
          <motion.div initial={{ opacity: 0, y: 30, rotate: -2 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ duration: .8, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-[180px] sm:w-[260px]">
            <div className="absolute -inset-2 blur-2xl" style={{ background: accent, opacity: .16 }} />
            <Cover game={game} sizes="lg" eager className="relative aspect-[2/3] w-full" style={{ clipPath: 'polygon(0 0, calc(100% - 22px) 0, 100% 22px, 100% 100%, 22px 100%, 0 calc(100% - 22px))', boxShadow: '0 30px 60px -20px #000' }} />
            {editMode && <ArtUploader game={game} onDone={reload} />}
          </motion.div>

          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: .1, duration: .7 }} className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={game.status} /><Inferred show={inf('status')} />
              {game.genres.length > 0 && <span className="text-[13px]" style={{ color: '#aeb6cc' }}>{game.genres.join(' · ')}</span>}
            </div>
            <h1 className="mt-4 font-black leading-[1.05] tracking-tight" style={{ fontSize: 'clamp(34px, 5vw, 68px)', textShadow: '0 4px 30px rgba(0,0,0,.6)' }}>{game.title}</h1>
            {(game.titleEn || game.titleJa) && (
              <div className="display mt-2 text-[13px] font-semibold tracking-[.12em]" style={{ color: 'color-mix(in srgb, var(--accent) 55%, #fff)' }}>
                {game.titleEn}{game.titleJa && game.titleJa.toLowerCase() !== game.titleEn?.toLowerCase() && <span className="ml-3 font-normal" style={{ color: 'var(--muted)' }}>{game.titleJa}</span>}
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[13px]" style={{ color: 'var(--muted)' }}>
              {game.developer && <span>开发 <span className="text-white">{game.developer}</span></span>}
              {game.release && <span>发售 <span className="text-white">{fmtMonth(game.release)}</span></span>}
              {game.platforms.length > 0 && <span>游玩平台 <span className="text-white">{game.platforms.join(' / ')}</span><Inferred show={inf('platforms')} /></span>}
              {game.steamAppId && <a href={`https://store.steampowered.com/app/${game.steamAppId}`} target="_blank" rel="noreferrer" className="hover:text-white" style={{ color: 'var(--cyan)' }}>Steam 商店 ↗</a>}
            </div>
            {awards.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {awards.map((a) => (
                  <Link to="/hall" key={a.id} className="flex items-center gap-1.5 px-3 py-1 text-[12.5px] font-semibold transition-colors hover:text-white" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid var(--line-2)', color: '#dfe4f2' }}>
                    <span style={{ color: 'var(--amber)' }}><Trophy /></span> {a.title}
                  </Link>
                ))}
              </div>
            )}
          </motion.div>

        </div>

        {editMode && <QuickBar game={game} save={save} />}


        {/* ---------- body ---------- */}
        <div className="mt-16 grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_340px] xl:gap-16">
          <div className="grid min-w-0 gap-16">
            {game.oneLiner && <DialogueBox text={game.oneLiner} speaker="我" sub={game.status === 'dropped' ? '弃坑时' : '当时'} />}
            {(game.review || editMode || rank >= 0 || awards.length > 0) && (
            <Block idx="01" title={game.review || editMode ? '整体感受' : '档案摘要'} en={game.review || editMode ? 'Review' : 'Summary'}>
              {game.review ? <div className="panel cut p-6 sm:p-8"><Markdown text={game.review} /></div> : (
                <AutoSummary game={game} rank={rank} total={ranked.length} awards={awards.map((a) => a.title)} editMode={editMode} />
              )}
            </Block>
            )}

            {/* Visitors only see sections that have content; the owner sees every section to fill it. */}
            {(editMode || game.moments.length > 0) && (
              <Block idx="02" title="精彩瞬间" en="Moments" count={game.moments.length}>
                <Moments game={game} save={save} />
              </Block>
            )}

            {(editMode || game.fanworks.length > 0) && (
              <Block idx="03" title="二创整理" en="Fan Works" count={game.fanworks.length}>
                <Fanworks game={game} save={save} />
              </Block>
            )}

            <Related game={game} />
          </div>

          {/* Score + file card form one sticky column, so there is no gap between them. */}
          <div className="order-first grid gap-4 self-start lg:sticky lg:top-24 lg:order-none">
            <motion.div initial={{ opacity: 0, scale: .9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: .25 }} className="panel cut flex items-center gap-5 p-5" style={{ background: 'rgba(8,10,17,.9)' }}>
              <ScoreRing score={game.score} size={128} />
              <div className="grid gap-3 text-[12.5px]">
                <Field k="档位" v={tier ? <span style={{ color: tier.color }} className="font-bold">{tier.label} · {tier.name}</span> : '未评分'} inferred={inf('score')} />
                <Field k="游玩" v={playedRange(game) || <span style={{ color: '#aeb6cc' }}>未记录</span>} inferred={inf('playedFrom')} />
                {game.hours != null && <Field k="时长" v={<span className="hud text-[15px] font-bold">{game.hours}h</span>} />}
              </div>
            </motion.div>
            <FileCard game={game} />
          </div>
        </div>

        <Neighbors game={game} ranked={ranked} />
      </div>

      <EditDrawer game={game} open={editing} onClose={() => setEditing(false)} />
    </div>
  )
}

/** Visual-novel style text box with a typewriter reveal. */
function DialogueBox({ text, speaker, sub }: { text: string; speaker: string; sub: string }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (document.visibilityState === 'hidden') { setN(text.length); return }
    setN(0)
    const id = setInterval(() => setN((v) => (v >= text.length ? (clearInterval(id), v) : v + 1)), 45)
    return () => clearInterval(id)
  }, [text])
  const done = n >= text.length
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .35 }} className="relative mt-4">
      <div className="absolute -top-4 left-6 z-10 flex items-center gap-2 px-4 py-1.5" style={{ background: 'linear-gradient(100deg, var(--pink), #ff86c0)', clipPath: 'polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)' }}>
        <span className="ttl text-[16px] text-white">{speaker}</span>
        <span className="mono text-[9.5px] tracking-[.2em] text-white/80">{sub}</span>
      </div>
      <div className="ttl relative px-7 pb-6 pt-8 text-[clamp(19px,2vw,24px)] leading-relaxed"
        style={{ background: 'linear-gradient(180deg, rgba(14,16,28,.92), rgba(8,9,16,.95))', border: '1px solid rgba(255,92,168,.35)', boxShadow: 'inset 0 0 0 4px rgba(5,6,10,.9), inset 0 0 0 5px rgba(140,165,255,.12), 0 20px 60px -20px rgba(255,92,168,.25)', color: '#eef1fa' }}>
        {text.slice(0, n)}<span className="opacity-0">{text.slice(n)}</span>
        <span className="absolute bottom-3 right-5 text-[13px]" style={{ color: 'var(--pink)', animation: done ? 'floaty 1s ease-in-out infinite' : undefined, opacity: done ? 1 : 0 }}>▼</span>
      </div>
    </motion.div>
  )
}

function AutoSummary({ game, rank, total, awards, editMode }: { game: Game; rank: number; total: number; awards: string[]; editMode: boolean }) {
  const tier = tierOf(game.score)
  const facts: ReactNode[] = []
  if (rank >= 0) facts.push(<>在 {total} 款评过分的游戏里排第 <b className="hud text-white">#{rank + 1}</b>{tier && <>，属于 <b style={{ color: tier.color }}>{tier.label} 档 · {tier.name}</b></>}。</>)
  if (awards.length) facts.push(<>拿下了喜好表里的 {awards.map((a, i) => <span key={a}>{i > 0 && '、'}<b style={{ color: 'var(--amber)' }}>「{a}」</b></span>)}。</>)
  return (
    <div className="panel cut relative overflow-hidden p-6 sm:p-7">
      {editMode && (
        <div className="cap mb-4 flex items-center gap-2" style={{ color: 'var(--cyan)' }}>
          <span className="h-1.5 w-1.5 rotate-45" style={{ background: 'var(--cyan)' }} />档案摘要 · 根据已有数据自动生成
        </div>
      )}
      <ul className="grid gap-2.5 text-[14.5px] leading-7" style={{ color: '#c7cee2' }}>
        {facts.map((f, i) => <li key={i} className="flex gap-3"><span className="mono pt-[3px] text-[10px]" style={{ color: 'var(--dim)' }}>{String(i + 1).padStart(2, '0')}</span><span>{f}</span></li>)}
      </ul>
      {editMode && (
        <div className="mt-5 pt-4 text-[13px]" style={{ borderTop: '1px dashed var(--line-2)', color: 'var(--dim)' }}>
          点击上方「编辑记录」写下你自己的感受（支持 Markdown），写完后这里会替换成你的文字。
        </div>
      )}
    </div>
  )
}

function FileCard({ game }: { game: Game }) {
  const rows: [string, ReactNode][] = [
    ['状态', <StatusBadge status={game.status} size="sm" />],
    ['发售', fmtMonth(game.release) || '—'],
    ['开发', game.developer ?? '—'],
    ['游玩', game.platforms.length ? <>{game.platforms.join(' / ')}<Inferred show={!!game.inferred?.includes('platforms')} /></> : '—'],
    ['类型', game.genres.join(' · ') || '—'],
  ]
  return (
    <aside className="panel cut brackets" style={{ ['--bracket' as string]: 'var(--accent)' }}>
      <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid var(--line)' }}>
        <span className="cap">档案卡</span>
        <span className="mono text-[10px]" style={{ color: 'var(--dim)' }}>{game.updatedAt.slice(0, 10)}</span>
      </div>
      <dl className="grid gap-0 px-5 py-2">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[52px_1fr] items-center gap-3 py-2.5 text-[13px]" style={{ borderBottom: '1px dashed rgba(140,165,255,.08)' }}>
            <dt style={{ color: 'var(--dim)' }}>{k}</dt><dd className="min-w-0 break-words" style={{ color: '#dfe4f2' }}>{v}</dd>
          </div>
        ))}
      </dl>
      {game.tags.length > 0 && <div className="flex flex-wrap gap-1.5 px-5 pb-3">{game.tags.map((t) => <span key={t} className="px-2 py-0.5 text-[11.5px]" style={{ background: 'rgba(255,92,168,.1)', color: 'var(--pink)' }}>#{t}</span>)}</div>}
      <div className="grid gap-2 px-5 pb-5 pt-2">
        {game.steamAppId && <a className="btn h-9 w-full text-[12.5px]" href={`https://store.steampowered.com/app/${game.steamAppId}`} target="_blank" rel="noreferrer">Steam 商店页 ↗</a>}
        <a className="btn h-9 w-full text-[12.5px]" href={`https://search.bilibili.com/all?keyword=${encodeURIComponent(game.title)}`} target="_blank" rel="noreferrer">在 B 站找二创 ↗</a>
      </div>
    </aside>
  )
}

function Related({ game }: { game: Game }) {
  const { db } = useDb()
  const related = useMemo(() => {
    const score = (g: Game) => g.genres.filter((x) => game.genres.includes(x)).length
    return (db?.games ?? []).filter((g) => g.id !== game.id && score(g) > 0)
      .sort((a, b) => score(b) - score(a) || (b.score ?? 0) - (a.score ?? 0)).slice(0, 6)
  }, [db, game])
  if (!related.length) return null
  return (
    <Block idx="04" title="相关档案" en="Related">
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {related.map((g) => (
          <Link key={g.id} to={`/game/${g.id}`} className="group">
            <Cover game={g} className="aspect-[2/3] w-full transition-transform duration-500 group-hover:-translate-y-1" style={{ clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%)' }} />
            <div className="mt-2 truncate text-[12.5px] font-semibold group-hover:text-white" style={{ color: '#c7cee2' }}>{g.title}</div>
            <div className="flex items-center gap-1.5"><TierTag score={g.score} pending={isPending(g)} /><span className="hud text-[13px]" style={{ color: 'var(--muted)' }}>{g.score ?? '—'}</span></div>
          </Link>
        ))}
      </div>
    </Block>
  )
}

function BackLink() {
  const nav = useNavigate()
  return (
    <button onClick={() => (window.history.length > 1 ? nav(-1) : nav('/'))} className="flex items-center gap-2 px-3 py-1.5 text-[12.5px] transition-colors hover:text-white"
      style={{ background: 'rgba(0,0,0,.5)', border: '1px solid var(--line-2)', color: 'var(--muted)' }}>
      ← 返回
    </button>
  )
}

function Field({ k, v, inferred }: { k: string; v: ReactNode; inferred?: boolean }) {
  return (
    <div>
      <div className="text-[11.5px]" style={{ color: '#9aa3bb' }}>{k}</div>
      <div className="mt-0.5">{v}<Inferred show={!!inferred} /></div>
    </div>
  )
}

function Trophy() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M7 3h10v3h3v3a5 5 0 0 1-5 5h-.3A5 5 0 0 1 13 15.9V19h3v2H8v-2h3v-3.1A5 5 0 0 1 9.3 14H9a5 5 0 0 1-5-5V6h3V3Zm0 5H6v1a3 3 0 0 0 1.4 2.5A6.9 6.9 0 0 1 7 9V8Zm10 0v1c0 .9-.1 1.7-.4 2.5A3 3 0 0 0 18 9V8h-1Z" /></svg>
}

function Block({ idx, title, en, count, children }: { idx: string; title: string; en: string; count?: number; children: ReactNode }) {
  return (
    <motion.section initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: .6 }}>
      <div className="sec-head">
        <span className="idx">{idx} //</span>
        <h2>{title}</h2>
        <span className="en">{en}</span>
        {count !== undefined && <span className="hud pb-1.5 text-[15px]" style={{ color: 'var(--dim)' }}>[{String(count).padStart(2, '0')}]</span>}
        <span className="rule hidden sm:block" />
      </div>
      {children}
    </motion.section>
  )
}

function Placeholder({ children }: { children: ReactNode }) {
  return <div className="w-full px-6 py-8 text-[14px]" style={{ border: '1px dashed var(--line-2)', color: 'var(--dim)' }}>{children}</div>
}

// ---------------------------------------------------------------- quick edit bar

function QuickBar({ game, save }: { game: Game; save: (p: Partial<Game>, msg?: string) => Promise<void> }) {
  const [score, setScore] = useState(game.score ?? 80)
  const [touched, setTouched] = useState(false)
  useEffect(() => { setScore(game.score ?? 80); setTouched(false) }, [game.score])
  const unrated = game.score == null && !touched
  return (
    <div className="panel mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4" style={{ borderColor: 'rgba(255,92,168,.35)', background: 'rgba(255,92,168,.04)' }}>
      <span className="cap" style={{ color: 'var(--pink)' }}>快速编辑</span>
      <div className="flex flex-wrap gap-1.5">
        {STATUSES.map((s) => (
          <button key={s} className="chip h-7 text-[12px]" data-on={game.status === s} style={{ ['--chip-color' as string]: STATUS_META[s].color }}
            onClick={() => game.status !== s && save({ status: s }, `状态改为「${STATUS_META[s].label}」`)}>
            <span className="dot" />{STATUS_META[s].label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <span className="whitespace-nowrap text-[12px]" style={{ color: 'var(--muted)' }}>评分</span>
        <input type="range" min={0} max={100} value={score} onChange={(e) => { setScore(Number(e.target.value)); setTouched(true) }}
          onPointerUp={() => touched && score !== game.score && save({ score }, `评分改为 ${score}`)} onKeyUp={() => touched && score !== game.score && save({ score }, `评分改为 ${score}`)}
          className="w-40 accent-[#ff5ca8]" style={{ opacity: unrated ? .4 : 1 }} />
        <span className="hud w-8 text-[18px] font-bold" style={{ color: unrated ? 'var(--dim)' : undefined }}>{unrated ? '—' : score}</span>
        {unrated ? <span className="text-[11.5px]" style={{ color: 'var(--dim)' }}>未评分，拖动即可打分</span> : <TierTag score={score} />}
        {game.score != null && <button className="text-[11px] underline" style={{ color: 'var(--dim)' }} onClick={() => save({ score: null }, '已清除评分')}>清除</button>}
      </div>
    </div>
  )
}

function ArtUploader({ game, onDone }: { game: Game; onDone: () => Promise<void> }) {
  const { api, toast } = useDb()
  const pick = (kind: 'cover' | 'hero') => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async () => {
      const f = input.files?.[0]
      if (!f) return
      try { await api.uploadArt(game.id, kind, f); await onDone(); toast(kind === 'cover' ? '封面已更新' : '横幅已更新') } catch (e) { toast((e as Error).message, 'err') }
    }
    input.click()
  }
  return (
    <div className="relative mt-3 flex gap-2">
      <button className="btn h-8 flex-1 px-2 text-[11.5px]" onClick={() => pick('cover')}>换封面</button>
      <button className="btn h-8 flex-1 px-2 text-[11.5px]" onClick={() => pick('hero')}>换横幅</button>
    </div>
  )
}

function InlineInput({ initial, placeholder, onDone }: { initial: string; placeholder: string; onDone: (v: string) => void }) {
  const [v, setV] = useState(initial)
  return (
    <input autoFocus className="input h-9 text-[12.5px]" value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') onDone(v.trim()); if (e.key === 'Escape') onDone(initial) }} onBlur={() => onDone(v.trim())} />
  )
}

// ---------------------------------------------------------------- moments

function Moments({ game, save }: { game: Game; save: (p: Partial<Game>, msg?: string) => Promise<void> }) {
  const { db, editMode, api, reload, toast } = useDb()
  const [open, setOpen] = useState<number | null>(null)
  const [drag, setDrag] = useState(false)
  const [uploading, setUploading] = useState(0)

  const upload = useCallback(async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith('image/'))
    if (!imgs.length) return
    setUploading(imgs.length)
    try {
      for (const f of imgs) { await api.uploadMoment(game.id, f); setUploading((n) => n - 1) }
      await reload()
      toast(`已上传 ${imgs.length} 张截图`)
    } catch (e) {
      toast((e as Error).message, 'err')
    } finally {
      setUploading(0)
    }
  }, [api, game.id, reload, toast])

  // Paste a screenshot straight from the clipboard while in edit mode.
  useEffect(() => {
    if (!editMode) return
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('input, textarea')) return
      const files = [...(e.clipboardData?.files ?? [])]
      if (files.length) { e.preventDefault(); upload(files) }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [editMode, upload])

  const [captioning, setCaptioning] = useState<string | null>(null)
  const remove = (m: Moment) => save({ moments: game.moments.filter((x) => x.id !== m.id) }, '已移除截图')
  const setCaption = (m: Moment, c: string) => {
    setCaptioning(null)
    if (c !== (m.caption ?? '')) save({ moments: game.moments.map((x) => (x.id === m.id ? { ...x, caption: c || undefined } : x)) }, '说明已保存')
  }

  return (
    <div>
      {editMode && (
        <label onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); upload([...e.dataTransfer.files]) }}
          className="mb-5 flex cursor-pointer flex-col items-center justify-center gap-1 py-8 text-center transition-colors"
          style={{ border: `1.5px dashed ${drag ? 'var(--cyan)' : 'var(--line-2)'}`, background: drag ? 'rgba(70,227,255,.06)' : 'rgba(255,255,255,.01)' }}>
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => upload([...(e.target.files ?? [])])} />
          <span className="text-[14px] font-semibold">{uploading ? `上传中… 剩 ${uploading} 张` : '拖入截图、点击选择，或直接 ⌘V 粘贴'}</span>
          <span className="mono text-[11px]" style={{ color: 'var(--dim)' }}>JPG / PNG / WEBP / GIF · 保存在 public/media/{game.id}/moments</span>
        </label>
      )}
      {game.moments.length ? (
        <div className={`grid grid-cols-1 gap-3 ${game.moments.length === 1 ? '' : game.moments.length === 2 || game.moments.length === 4 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-3'}`}>
          {game.moments.map((m, i) => (
            <motion.figure key={m.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: (i % 6) * .05 }}
              className={`group relative overflow-hidden ${i === 0 && (game.moments.length === 3 || game.moments.length >= 5) ? 'sm:col-span-2 xl:row-span-2' : ''}`} style={{ border: '1px solid var(--line)', background: '#07090f' }}>
              <button className={`block w-full overflow-hidden ${i === 0 && (game.moments.length === 3 || game.moments.length >= 5) ? 'aspect-video xl:aspect-auto xl:h-full' : 'aspect-video'}`} onClick={() => setOpen(i)}>
                <img src={m.src} alt={m.caption ?? ''} loading="lazy" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
              </button>
              <span className="mono pointer-events-none absolute left-2 top-2 px-1.5 text-[10px]" style={{ background: 'rgba(0,0,0,.6)', color: 'var(--cyan)' }}>#{String(i + 1).padStart(2, '0')}</span>
              {captioning === m.id ? (
                <div className="absolute inset-x-2 bottom-2"><InlineInput initial={m.caption ?? ''} placeholder="给这张截图写一句说明，回车保存" onDone={(c) => setCaption(m, c)} /></div>
              ) : m.caption && <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 px-3 pb-2.5 pt-8 text-[12.5px]" style={{ color: '#dfe4f2', background: 'linear-gradient(180deg, transparent, rgba(5,6,10,.88))' }}>{m.caption}</figcaption>}
              {editMode && (
                <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button className="btn h-7 px-2 text-[11px]" onClick={() => setCaptioning(m.id)}>说明</button>
                  <button className="btn btn-danger h-7 px-2 text-[11px]" onClick={() => remove(m)}>删除</button>
                </div>
              )}
            </motion.figure>
          ))}
        </div>
      ) : !editMode && <Placeholder>{db?.editable ? '还没有截图。打开右上角「编辑」后，可以拖入或粘贴截图。' : '还没有截图。'}</Placeholder>}
      <Lightbox items={game.moments} index={open} setIndex={setOpen} />
    </div>
  )
}

function Lightbox({ items, index, setIndex }: { items: Moment[]; index: number | null; setIndex: (i: number | null) => void }) {
  useEffect(() => {
    if (index === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIndex(null)
      if (e.key === 'ArrowRight') setIndex((index + 1) % items.length)
      if (e.key === 'ArrowLeft') setIndex((index - 1 + items.length) % items.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, items.length, setIndex])
  const m = index !== null ? items[index] : null
  return (
    <Portal>
    <AnimatePresence>
      {m && (
        <motion.div className="fixed inset-0 z-[95] flex flex-col items-center justify-center p-4 sm:p-10" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ background: 'rgba(2,3,6,.94)', backdropFilter: 'blur(10px)' }} onClick={() => setIndex(null)}>
          <motion.img key={m.id} src={m.src} alt="" initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }} className="max-h-[82vh] max-w-full object-contain" style={{ boxShadow: '0 0 0 1px var(--line-2), 0 40px 120px -20px #000' }} onClick={(e) => e.stopPropagation()} />
          <div className="mt-4 flex items-center gap-6" onClick={(e) => e.stopPropagation()}>
            <button className="btn h-9" onClick={() => setIndex((index! - 1 + items.length) % items.length)}>←</button>
            <div className="text-center">
              <div className="mono text-[11px]" style={{ color: 'var(--cyan)' }}>{String(index! + 1).padStart(2, '0')} / {String(items.length).padStart(2, '0')}</div>
              {m.caption && <div className="mt-1 text-[14px]">{m.caption}</div>}
            </div>
            <button className="btn h-9" onClick={() => setIndex((index! + 1) % items.length)}>→</button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
    </Portal>
  )
}

// ---------------------------------------------------------------- fanworks

function fmtDur(s?: number) {
  if (!s) return ''
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function Fanworks({ game, save }: { game: Game; save: (p: Partial<Game>, msg?: string) => Promise<void> }) {
  const { db, editMode, api, reload, toast } = useDb()
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [playing, setPlaying] = useState<Fanwork | null>(null)

  const add = async () => {
    if (!link.trim()) return
    setBusy(true)
    try { await api.addFanwork(game.id, link.trim()); await reload(); setLink(''); toast('已添加二创') } catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }
  const [noting, setNoting] = useState<string | null>(null)
  const setNote = (f: Fanwork, n: string) => {
    setNoting(null)
    if (n !== (f.note ?? '')) save({ fanworks: game.fanworks.map((x) => (x.id === f.id ? { ...x, note: n || undefined } : x)) }, '备注已保存')
  }

  return (
    <div>
      {editMode && (
        <div className="mb-5 flex max-w-3xl gap-2">
          <input className="input" value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="粘贴 B 站链接或 BV 号，例如 https://www.bilibili.com/video/BV1xx411c7mD" />
          <button className="btn btn-primary shrink-0" disabled={busy} onClick={add}>{busy ? '读取中…' : '添加'}</button>
        </div>
      )}
      {game.fanworks.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {game.fanworks.map((f, i) => (
            <motion.div key={f.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * .05 }}
              className="group relative overflow-hidden" style={{ border: '1px solid var(--line)', background: 'rgba(10,12,20,.8)' }}>
              <button className="relative block aspect-video w-full overflow-hidden" onClick={() => setPlaying(f)}>
                {f.cover ? <img src={f.cover} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                  : <div className="flex h-full w-full items-center justify-center" style={{ background: 'linear-gradient(135deg, #0f1220, #1a1030)' }}><span className="mono text-[12px]" style={{ color: 'var(--dim)' }}>{f.bvid}</span></div>}
                <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100" style={{ background: 'rgba(0,0,0,.35)' }}>
                  <span className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: 'rgba(251,114,153,.92)', boxShadow: '0 0 30px rgba(251,114,153,.6)' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg>
                  </span>
                </span>
                <span className="mono absolute left-2 top-2 px-1.5 py-0.5 text-[10px] font-bold" style={{ background: '#fb7299', color: '#fff' }}>bilibili</span>
                {f.duration ? <span className="mono absolute bottom-2 right-2 px-1.5 text-[10.5px]" style={{ background: 'rgba(0,0,0,.7)' }}>{fmtDur(f.duration)}</span> : null}
              </button>
              <div className="p-3.5">
                <div className="line-clamp-2 text-[14px] font-semibold leading-snug">{f.title ?? f.bvid}</div>
                <div className="mono mt-1 flex items-center gap-2 text-[11px]" style={{ color: 'var(--dim)' }}>{f.author && <span>UP · {f.author}</span>}<span>{f.bvid}</span></div>
                {noting === f.id ? <div className="mt-2"><InlineInput initial={f.note ?? ''} placeholder="为什么收藏这个视频？回车保存" onDone={(n) => setNote(f, n)} /></div>
                  : f.note && <div className="mt-2 border-l-2 pl-2 text-[12.5px]" style={{ borderColor: 'var(--pink)', color: '#c7cee2' }}>{f.note}</div>}
                {editMode && (
                  <div className="mt-3 flex gap-2">
                    <button className="btn h-7 px-2 text-[11px]" onClick={() => setNoting(f.id)}>备注</button>
                    <button className="btn btn-danger h-7 px-2 text-[11px]" onClick={() => save({ fanworks: game.fanworks.filter((x) => x.id !== f.id) }, '已移除')}>删除</button>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      ) : !editMode && <Placeholder>{db?.editable ? '还没有收藏二创视频。打开「编辑」后粘贴 B 站链接即可添加。' : '还没有收藏二创视频。'}</Placeholder>}

      <Portal>
      <AnimatePresence>
        {playing && (
          <motion.div className="fixed inset-0 z-[95] flex items-center justify-center p-4 sm:p-10" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ background: 'rgba(2,3,6,.92)', backdropFilter: 'blur(8px)' }} onClick={() => setPlaying(null)}>
            <motion.div initial={{ scale: .95 }} animate={{ scale: 1 }} className="w-full max-w-[1100px]" onClick={(e) => e.stopPropagation()}>
              <div className="mb-3 flex items-center justify-between gap-4">
                <div className="truncate text-[15px] font-semibold">{playing.title ?? playing.bvid}</div>
                <div className="flex shrink-0 gap-2">
                  <a className="btn h-8 px-3 text-[12px]" href={`https://www.bilibili.com/video/${playing.bvid}`} target="_blank" rel="noreferrer">在 B 站打开 ↗</a>
                  <button className="btn h-8 px-3 text-[12px]" onClick={() => setPlaying(null)}>关闭</button>
                </div>
              </div>
              <div className="aspect-video w-full" style={{ boxShadow: '0 0 0 1px var(--line-2)' }}>
                <iframe title={playing.bvid} className="h-full w-full" allowFullScreen allow="autoplay; fullscreen; picture-in-picture"
                  src={`https://player.bilibili.com/player.html?bvid=${playing.bvid}&autoplay=1&high_quality=1&danmaku=0`} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </Portal>
    </div>
  )
}

// ---------------------------------------------------------------- prev/next

function Neighbors({ game, ranked }: { game: Game; ranked: Game[] }) {
  const i = ranked.findIndex((g) => g.id === game.id)
  if (i < 0) return null
  const prev = ranked[i - 1]
  const next = ranked[i + 1]
  return (
    <div className="mt-24 grid gap-px sm:grid-cols-2" style={{ background: 'var(--line)', border: '1px solid var(--line)' }}>
      {[prev, next].map((g, k) => g ? (
        <Link key={g.id} to={`/game/${g.id}`} className={`group flex items-center gap-4 p-5 transition-colors hover:bg-white/[.03] ${k ? 'sm:flex-row-reverse sm:text-right' : ''}`} style={{ background: 'rgba(7,9,15,.92)' }}>
          <span className="display text-[20px]" style={{ color: 'var(--cyan)' }}>{k ? '→' : '←'}</span>
          <Cover game={g} sizes="sm" className="h-[72px] w-12 shrink-0" />
          <div className="min-w-0">
            <div className="cap-hint">{k ? '排名后一位' : '排名前一位'}</div>
            <div className="mt-1 truncate text-[16px] font-bold group-hover:text-white">{g.title}</div>
            <div className="hud text-[14px]" style={{ color: 'var(--muted)' }}>#{i + (k ? 2 : 0)} · {g.score}</div>
          </div>
        </Link>
      ) : (
        // A quiet end-cap keeps the two-column rhythm when there is no neighbour.
        <div key={k} className={`hidden items-center gap-3 p-5 sm:flex ${k ? 'sm:justify-end' : ''}`}
          style={{ background: 'repeating-linear-gradient(-45deg, rgba(140,165,255,.035) 0 2px, transparent 2px 10px), rgba(7,9,15,.92)' }}>
          <span className="hud text-[22px] font-bold" style={{ color: k ? 'var(--muted)' : 'var(--amber)' }}>{k ? '末位' : '#1'}</span>
          <span className="text-[13px]" style={{ color: '#c7cee2' }}>{k ? '已是榜尾' : '已是榜首'}</span>
          <Link to="/ranking" className="text-[12.5px] underline-offset-4 hover:underline" style={{ color: 'var(--cyan)' }}>查看天梯榜 →</Link>
        </div>
      ))}
    </div>
  )
}
