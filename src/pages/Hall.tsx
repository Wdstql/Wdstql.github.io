import { useMemo, useState, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import type { Award, Game } from '../types'
import { useDb } from '../lib/db'
import { sortGames, useAccent } from '../lib/game'
import { Cover, isPending, TierTag } from '../components/ui'

// Cards that get a larger tile in the bento grid.
const BIG = new Set(['最爱的'])
const WIDE = new Set(['最影响我的', '最惊艳的', '最喜欢的剧情'])

export function Hall() {
  const { db, byId, editMode, api, reload, toast } = useDb()
  const [newTitle, setNewTitle] = useState('')
  const games = useMemo(() => sortGames(db?.games ?? [], 'title'), [db])
  if (!db) return null
  const awards = db.awards

  async function saveAwards(next: Award[], msg: string) {
    try { await api.saveAwards(next); await reload(); toast(msg) } catch (e) { toast((e as Error).message, 'err') }
  }

  const counts = new Map<string, number>()
  awards.forEach((a) => a.gameId && counts.set(a.gameId, (counts.get(a.gameId) ?? 0) + 1))
  const mostAwarded = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)

  return (
    <div className="mx-auto max-w-[1480px] px-4 pt-12 sm:px-8">
      <div className="grid items-end gap-8 lg:grid-cols-[1fr_auto]">
        <div>
          <div className="label" style={{ color: 'var(--amber)' }}>HALL OF FAME · 殿堂入り</div>
          <h1 className="mt-3 font-black leading-none" style={{ fontSize: 'clamp(44px, 6vw, 88px)' }}>
            游戏生涯<span style={{ background: 'linear-gradient(95deg, var(--amber), var(--pink))', WebkitBackgroundClip: 'text', color: 'transparent' }}>喜好表</span>
          </h1>
          <p className="mt-4 max-w-xl text-[14px] leading-7" style={{ color: 'var(--muted)' }}>
            {awards.length} 个只属于我的奖项。没有媒体评分，没有销量，只有“最爱”“最受苦”“又菜又爱玩”。
          </p>
        </div>
        {mostAwarded.length > 0 && (
          <div className="panel cut p-4">
            <div className="cap mb-3">获奖最多</div>
            <div className="flex gap-4">
              {mostAwarded.map(([id, n]) => {
                const g = byId.get(id)
                return g ? (
                  <Link key={id} to={`/game/${id}`} className="group text-center">
                    <Cover game={g} sizes="sm" className="mx-auto h-[72px] w-12 transition-transform group-hover:-translate-y-1" />
                    <div className="hud mt-1 text-[13px] font-bold" style={{ color: 'var(--amber)' }}>×{n}</div>
                  </Link>
                ) : null
              })}
            </div>
          </div>
        )}
      </div>

      <div className="mt-12 grid grid-flow-dense auto-rows-[220px] grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 lg:auto-rows-[250px]">
        {awards.map((a, i) => (
          <AwardCard key={a.id} award={a} index={i} game={a.gameId ? byId.get(a.gameId) : undefined} editMode={editMode} games={games}
            onChange={(gameId) => saveAwards(awards.map((x) => (x.id === a.id ? { ...x, gameId } : x)), `「${a.title}」已更新`)}
            onRemove={() => saveAwards(awards.filter((x) => x.id !== a.id), `已删除「${a.title}」`)} />
        ))}
        {editMode && (
          <div className="flex flex-col justify-center gap-3 p-5" style={{ border: '1.5px dashed var(--line-2)' }}>
            <div className="label">NEW AWARD</div>
            <input className="input" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="例如：最想忘记重玩的" />
            <button className="btn btn-primary" disabled={!newTitle.trim()} onClick={() => { saveAwards([...awards, { id: `a${Date.now().toString(36)}`, title: newTitle.trim(), gameId: null }], `已新增「${newTitle.trim()}」`); setNewTitle('') }}>新增奖项</button>
          </div>
        )}
      </div>
    </div>
  )
}

function AwardCard({ award, index, game, editMode, games, onChange, onRemove }: {
  award: Award; index: number; game?: Game; editMode: boolean; games: Game[]
  onChange: (id: string | null) => void; onRemove: () => void
}) {
  const accent = useAccent(game?.thumb ?? game?.cover, game?.id ?? award.id)
  const big = BIG.has(award.title)
  const wide = WIDE.has(award.title)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setTilt({ x: ((e.clientY - r.top) / r.height - .5) * -8, y: ((e.clientX - r.left) / r.width - .5) * 8 })
  }
  const body = (
    <>
      {game ? (
        <>
          <div className="absolute inset-0">
            {game.hero ? <img src={game.hero} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
              : <Cover game={game} sizes={big ? 'lg' : 'md'} className="h-full w-full transition-transform duration-700 group-hover:scale-105" />}
          </div>
          <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, rgba(5,6,10,.55) 0%, transparent 28%, transparent 42%, rgba(5,6,10,.88) 74%, rgba(5,6,10,.98) 100%)` }} />
          <div className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100" style={{ boxShadow: `inset 0 0 0 1.5px ${accent}, inset 0 0 60px -10px ${accent}` }} />
        </>
      ) : <div className="absolute inset-0" style={{ background: 'repeating-linear-gradient(-45deg, rgba(140,165,255,.04) 0 2px, transparent 2px 12px)' }} />}

      <div className="relative flex h-full flex-col justify-between p-4">
        <div className="flex items-start justify-between">
          <span className="mono text-[10px] tracking-[.2em]" style={{ color: 'rgba(255,255,255,.7)' }}>No.{String(index + 1).padStart(2, '0')}</span>
          {game && <TierTag score={game.score} pending={isPending(game)} />}
        </div>
        <div>
          <div className={`ttl leading-tight ${big ? 'text-[56px]' : 'text-[27px]'}`} style={{ textShadow: '0 2px 18px rgba(0,0,0,.7)' }}>
            {award.title}
          </div>
          {editMode ? <div className="h-10" /> : <div className="mt-1.5 flex items-center gap-2">
            <span className="h-[2px] w-5" style={{ background: accent, boxShadow: `0 0 8px ${accent}` }} />
            <span className={`truncate font-semibold ${big ? 'text-[16px]' : 'text-[12.5px]'}`} style={{ color: game ? '#e9edf8' : 'var(--dim)' }}>{game?.title ?? '空缺'}</span>
          </div>}
        </div>
      </div>
    </>
  )
  return (
    <motion.div initial={{ opacity: 0, y: 30, scale: .96 }} whileInView={{ opacity: 1, y: 0, scale: 1 }} viewport={{ once: true }} transition={{ delay: (index % 12) * .04, duration: .55, ease: [0.16, 1, 0.3, 1] }}
      className={`${big ? 'col-span-2 row-span-2' : wide ? 'col-span-2' : ''}`} style={{ perspective: 900 }}>
      <div onMouseMove={onMove} onMouseLeave={() => setTilt({ x: 0, y: 0 })} className="group relative h-full w-full overflow-hidden"
        style={{ transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`, transition: 'transform .3s cubic-bezier(.16,1,.3,1)', border: '1px solid var(--line)', clipPath: 'polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 0 100%)' }}>
        {game && !editMode ? <Link to={`/game/${game.id}`} className="block h-full w-full">{body}</Link> : body}
        {editMode && (
          <div className="absolute inset-x-2 bottom-2 z-10 flex gap-1.5">
            <select className="input h-8 flex-1 text-[12px]" value={award.gameId ?? ''} onChange={(e) => onChange(e.target.value || null)}>
              <option value="">— 空缺 —</option>
              {games.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select>
            <button className="btn btn-danger h-8 px-2 text-[11px]" onClick={onRemove}>✕</button>
          </div>
        )}
      </div>
    </motion.div>
  )
}
