import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import type { Game } from '../types'
import { useDb } from '../lib/db'
import { sortGames, tierOf, TIERS, type Tier } from '../lib/game'
import { Cover, isPending, PendingBanner, SectionHead, StatusBadge, TierTag } from '../components/ui'

export function Ranking() {
  const { db, editMode, api, reload, toast } = useDb()
  const [genre, setGenre] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overTier, setOverTier] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  const scored = useMemo(() => sortGames((db?.games ?? []).filter((g) => g.score != null), 'score'), [db])
  const list = genre ? scored.filter((g) => g.genres.includes(genre)) : scored
  const genres = useMemo(() => {
    const m = new Map<string, number>()
    scored.forEach((g) => g.genres.forEach((x) => m.set(x, (m.get(x) ?? 0) + 1)))
    return [...m.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1])
  }, [scored])

  async function dropInto(tier: Tier) {
    const g = scored.find((x) => x.id === dragId)
    setDragId(null); setOverTier(null)
    if (!g || g.score == null || tierOf(g.score)?.key === tier.key) return
    const idx = TIERS.findIndex((t) => t.key === tier.key)
    const upper = idx === 0 ? 100 : TIERS[idx - 1].min - 1
    const score = g.score > upper ? upper : tier.min
    try {
      await api.update(g.id, { score, inferred: g.inferred?.filter((f) => f !== 'score') })
      await reload()
      toast(`《${g.title}》→ ${tier.label} 档（${score} 分）`)
    } catch (e) { toast((e as Error).message, 'err') }
  }

  async function confirm(games: Game[]) {
    if (games.length > 1 && !window.confirm(`把这 ${games.length} 个推断评分都标记为已确认？之后可以随时在详情页修改分数。`)) return
    try {
      for (const g of games) await api.update(g.id, { inferred: g.inferred?.filter((f) => f !== 'score') })
      await reload()
      toast(games.length === 1 ? `已确认《${games[0].title}》${games[0].score} 分` : `已确认 ${games.length} 个评分`)
    } catch (e) { toast((e as Error).message, 'err') }
  }

  if (!db) return null
  const top3 = list.slice(0, 3)
  const range: [number, number] = list.length ? [list[list.length - 1].score!, list[0].score!] : [0, 100]

  return (
    <div className="mx-auto max-w-[1480px] px-4 pt-12 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="label" style={{ color: 'var(--cyan)' }}>LEADERBOARD · ランキング</div>
          <h1 className="mt-3 font-black leading-none" style={{ fontSize: 'clamp(44px, 6vw, 88px)' }}>
            天梯<span style={{ color: 'transparent', WebkitTextStroke: '1.5px var(--pink)' }}>榜</span>
          </h1>
          <p className="mt-4 max-w-xl text-[14px]" style={{ color: 'var(--muted)' }}>
            按百分制评分自动分档。{editMode ? '编辑模式下可以把游戏拖到别的档位，评分会随之调整。' : '打开编辑模式后可以拖动调整档位。'}
          </p>
          <PendingBanner className="mt-4 max-w-xl" />
        </div>
        <TierSpread games={list} />
        <div className="no-scrollbar -mx-4 flex max-w-[100vw] basis-full gap-2 overflow-x-auto px-4 sm:mx-0 sm:max-w-full sm:flex-wrap sm:px-0">
          <button className="chip" data-on={!genre} onClick={() => setGenre(null)}>全部 <span className="mono text-[10px] opacity-60">{scored.length}</span></button>
          {genres.map(([g, n]) => (
            <button key={g} className="chip" data-on={genre === g} style={{ ['--chip-color' as string]: 'var(--pink)' }} onClick={() => setGenre(g)}>{g}天梯 <span className="mono text-[10px] opacity-60">{n}</span></button>
          ))}
        </div>
      </div>

      {top3.length >= 3 && <Podium key={genre ?? 'all'} games={top3} />}

      <section id="tiers" className="scroll-mt-20 pt-20">
        <SectionHead idx="01" title="档位表" en="Tier List" />
        <div className="grid gap-[3px]">
          {TIERS.map((t, ti) => {
            const items = list.filter((g) => tierOf(g.score)?.key === t.key)
            const pending = items.filter((g) => isPending(g))
            return (
              <motion.div key={t.key} initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: ti * .05 }}
                onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverTier(t.key) } }} onDragLeave={() => setOverTier(null)} onDrop={() => dropInto(t)}
                className="grid grid-cols-[52px_1fr] sm:grid-cols-[132px_1fr]"
                style={{ background: overTier === t.key ? `color-mix(in srgb, ${t.color} 12%, rgba(10,12,20,.9))` : 'rgba(10,12,20,.75)', border: `1px solid ${overTier === t.key ? t.color : 'var(--line)'}`, transition: 'background .2s, border-color .2s' }}>
                <div className="relative flex flex-col items-center justify-center overflow-hidden py-4" style={{ background: `linear-gradient(135deg, ${t.color}, color-mix(in srgb, ${t.color} 55%, #000))` }}>
                  <span className="display text-[24px] font-black leading-none text-[#05060a] sm:text-[44px]">{t.label}</span>
                  <span className="mono mt-1 text-[9.5px] font-bold text-black/70">{t.min}{t.min > 0 ? '+' : ''} · {items.length}</span>
                  <span className="mt-1.5 hidden px-2 text-center text-[11px] font-bold leading-tight text-black/75 sm:block">{t.name}</span>
                  <span className="absolute -bottom-3 -right-2 display text-[60px] font-black leading-none text-black/10">{t.label}</span>
                  {editMode && pending.length > 0 && (
                    <button onClick={() => confirm(pending)} className="relative mt-2 px-2 py-0.5 text-[10.5px] font-bold" style={{ background: 'rgba(0,0,0,.75)', color: t.color }}>确认本档 {pending.length}</button>
                  )}
                </div>
                <div className="flex min-h-[132px] flex-wrap content-center items-center gap-2 p-3">
                  {items.map((g) => (
                    <Link key={g.id} to={`/game/${g.id}`} draggable={editMode} onDragStart={() => setDragId(g.id)} onDragEnd={() => { setDragId(null); setOverTier(null) }}
                      className="group relative block h-[84px] w-[56px] overflow-hidden sm:h-[108px] sm:w-[72px] transition-transform duration-300 hover:z-10 hover:-translate-y-1 hover:scale-110"
                      style={{ outline: isPending(g) ? `1px dashed ${t.color}` : undefined, outlineOffset: -1, boxShadow: isPending(g) ? undefined : `0 0 0 1px color-mix(in srgb, ${t.color} 35%, transparent)`, opacity: dragId === g.id ? .4 : 1, cursor: editMode ? 'grab' : 'pointer' }}
                      title={`${g.title} · ${g.score}${isPending(g) ? '（推断，待确认）' : ''}`}>
                      <Cover game={g} sizes="sm" className="h-full w-full" />
                      <span className="hud absolute bottom-0 left-0 px-1.5 py-0.5 text-[12px] font-bold leading-none" style={{ background: 'rgba(5,6,10,.88)' }}>
                        {g.score}{isPending(g) && <span style={{ color: 'var(--amber)' }}>?</span>}
                      </span>
                      <span className="absolute inset-0 flex items-center justify-center p-1 text-center text-[11px] font-bold opacity-0 transition-opacity group-hover:opacity-100" style={{ background: 'rgba(5,6,10,.78)' }}>{g.title}</span>
                    </Link>
                  ))}
                  {!items.length && <span className="mono text-[11px]" style={{ color: 'var(--dim)' }}>— EMPTY —</span>}
                </div>
              </motion.div>
            )
          })}
        </div>
      </section>

      <section className="pt-20">
        <SectionHead idx="02" title="完整排名" en="Full Ranking" />
        <div className="grid gap-1.5">
          {(showAll ? list : list.slice(0, 20)).map((g, i) => <Row key={g.id} g={g} i={i} range={range} onConfirm={editMode && isPending(g) ? () => confirm([g]) : undefined} />)}
          {list.length > 20 && (
            <button onClick={() => setShowAll(!showAll)} className="mono mt-2 h-11 text-[12px] tracking-[.14em] transition-colors hover:text-white" style={{ border: '1px dashed var(--line-2)', color: 'var(--cyan)' }}>
              {showAll ? '收起，只看前 20 ▲' : `展开第 21–${list.length} 名 ▼`}
            </button>
          )}
        </div>
      </section>
    </div>
  )
}

/** Compact tier histogram for the page header. */
function TierSpread({ games }: { games: Game[] }) {
  const counts = TIERS.map((t) => ({ t, n: games.filter((g) => tierOf(g.score)?.key === t.key).length }))
  const max = Math.max(1, ...counts.map((c) => c.n))
  const avg = games.length ? games.reduce((s, g) => s + g.score!, 0) / games.length : 0
  return (
    <div className="panel cut hidden p-5 lg:block" style={{ minWidth: 360 }}>
      <div className="flex items-baseline justify-between">
        <span className="cap">档位分布</span>
        <span className="text-[11.5px]" style={{ color: 'var(--muted)' }}>均分 <b className="hud text-[15px] text-white">{avg.toFixed(1)}</b></span>
      </div>
      <div className="mt-4 flex h-[120px] items-end gap-3">
        {counts.map(({ t, n }, i) => (
          <a key={t.key} href="#tiers" className="group flex flex-1 flex-col items-center justify-end gap-1.5" style={{ height: '100%' }}>
            <span className="hud text-[12px] font-bold" style={{ color: n ? '#dfe4f2' : 'var(--dim)' }}>{n}</span>
            <motion.span initial={{ height: 0 }} animate={{ height: `${(n / max) * 72}%` }} transition={{ delay: .3 + i * .06, duration: .8, ease: [0.16, 1, 0.3, 1] }}
              className="w-full transition-[filter] group-hover:brightness-125" style={{ minHeight: 2, background: `linear-gradient(180deg, ${t.color}, color-mix(in srgb, ${t.color} 20%, transparent))` }} />
            <span className="display text-[13px] font-black" style={{ color: t.color }}>{t.label}</span>
          </a>
        ))}
      </div>
    </div>
  )
}

function Podium({ games }: { games: Game[] }) {
  const order = [1, 0, 2]
  const heights = ['h-[130px]', 'h-[170px]', 'h-[100px]']
  return (
    <div className="mx-auto mt-10 grid max-w-[900px] grid-cols-3 items-end gap-3 sm:gap-6">
      {order.map((idx, col) => {
        const g = games[idx]
        const t = tierOf(g.score)!
        const first = idx === 0
        return (
          <motion.div key={g.id} initial={{ opacity: 0, y: 60 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .2 + col * .12, duration: .8, ease: [0.16, 1, 0.3, 1] }} className="flex flex-col items-center">
            <Link to={`/game/${g.id}`} className={`group relative mb-4 block w-full ${first ? 'max-w-[210px]' : 'max-w-[150px]'}`} style={{ animation: first ? 'floaty 5s ease-in-out infinite' : undefined }}>
              {first && <div className="absolute -inset-4 blur-3xl" style={{ background: 'linear-gradient(140deg, var(--pink), var(--amber))', opacity: .35 }} />}
              <Cover game={g} sizes="md" className="relative aspect-[2/3] w-full transition-transform duration-500 group-hover:scale-[1.03]"
                style={{ clipPath: 'polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 18px 100%, 0 calc(100% - 18px))', boxShadow: `0 0 0 1px ${t.color}` }} />
              {first && <span className="display absolute -top-5 left-1/2 -translate-x-1/2 text-[28px]" style={{ color: 'var(--amber)', textShadow: '0 0 20px var(--amber)' }}>♛</span>}
            </Link>
            <div className="w-full text-center">
              <div className="ttl truncate px-1 text-[15px] sm:text-[19px]">{g.title}</div>
              <div className="mt-1 flex items-center justify-center gap-2"><TierTag score={g.score} pending={isPending(g)} /><span className="hud text-[20px] font-bold sm:text-[26px]">{g.score}</span></div>
            </div>
            <div className={`relative mt-3 w-full ${heights[col]} overflow-hidden`} style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${first ? 'var(--pink)' : 'var(--cyan)'} 22%, rgba(12,14,24,.9)), rgba(8,10,16,.6))`, border: '1px solid var(--line-2)', borderBottom: 'none', clipPath: 'polygon(8% 0, 92% 0, 100% 100%, 0 100%)' }}>
              <span className="display absolute inset-x-0 top-3 text-center font-black leading-none" style={{ fontSize: first ? 76 : 56, color: 'transparent', WebkitTextStroke: `1.5px ${first ? 'var(--pink)' : 'rgba(200,210,255,.4)'}` }}>{idx + 1}</span>
              <div className="absolute inset-x-0 bottom-0 h-1/2" style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(140,165,255,.06) 0 1px, transparent 1px 8px)' }} />
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}

function Row({ g, i, range, onConfirm }: { g: Game; i: number; range: [number, number]; onConfirm?: () => void }) {
  const t = tierOf(g.score)!
  // Bars span the actual score range so 78 vs 92 reads as a real difference.
  const pct = 12 + ((g.score! - range[0]) / Math.max(1, range[1] - range[0])) * 88
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-20px' }} transition={{ duration: .4, delay: (i % 10) * .025 }}>
      <Link to={`/game/${g.id}`} className="group grid grid-cols-[44px_40px_1fr_auto] items-center gap-3 px-3 py-2 transition-colors hover:bg-white/[.03] sm:grid-cols-[60px_44px_1fr_minmax(160px,300px)_auto]"
        style={{ borderLeft: `2px solid ${i < 3 ? t.color : 'transparent'}`, background: i % 2 ? 'transparent' : 'rgba(255,255,255,.012)' }}>
        <span className="display text-center text-[18px] font-black sm:text-[22px]" style={{ color: i < 3 ? t.color : i < 10 ? '#dfe4f2' : 'var(--dim)' }}>{String(i + 1).padStart(2, '0')}</span>
        <Cover game={g} sizes="sm" className="h-[60px] w-10" />
        <div className="min-w-0">
          <div className="ttl truncate text-[17px] group-hover:text-white">{g.title}</div>
          <div className="mt-0.5 flex items-center gap-2 overflow-hidden"><StatusBadge status={g.status} size="sm" /><span className="truncate text-[12px]" style={{ color: '#9aa3bb' }}>{g.genres.join(' · ')}</span></div>
        </div>
        <div className="hidden h-2 sm:block" style={{ background: 'rgba(140,165,255,.07)' }}>
          <motion.div initial={{ width: 0 }} whileInView={{ width: `${pct}%` }} viewport={{ once: true }} transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
            className="h-full" style={{ background: `linear-gradient(90deg, color-mix(in srgb, ${t.color} 30%, transparent), ${t.color})`, boxShadow: `0 0 10px color-mix(in srgb, ${t.color} 50%, transparent)` }} />
        </div>
        <div className="flex items-center justify-end gap-2">
          {onConfirm && <button className="px-2 py-0.5 text-[11px] font-bold" style={{ border: '1px solid rgba(255,197,71,.5)', color: 'var(--amber)' }} onClick={(e) => { e.preventDefault(); onConfirm() }}>确认</button>}
          <TierTag score={g.score} pending={isPending(g)} /><span className="hud w-8 text-right text-[19px] font-bold">{g.score}</span>
        </div>
      </Link>
    </motion.div>
  )
}
