import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import type { Game, Status } from '../types'
import { STATUS_META } from '../types'
import { shortTitle, sortGames, tierOf, useAccent } from '../lib/game'
import { isPending } from '../components/ui'

const ORDER: Status[] = ['playing', 'paused', 'finished', 'unplayed', 'dropped', 'watched']
const SPINE_W = 46
const OPEN_W = 168
const SPINE_H = 248

export function Shelf({ games }: { games: Game[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(1200)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const perRow = Math.max(4, Math.floor((w - 40 - (OPEN_W - SPINE_W)) / (SPINE_W + 4)))

  const shelves = useMemo(() => ORDER.map((s) => ({ status: s, list: sortGames(games.filter((g) => g.status === s), 'score') })).filter((x) => x.list.length), [games])

  return (
    <div ref={ref} className="flex flex-wrap gap-x-14 gap-y-12">
      {shelves.map(({ status, list }) => {
        const meta = STATUS_META[status]
        const rows: Game[][] = []
        for (let i = 0; i < list.length; i += perRow) rows.push(list.slice(i, i + perRow))
        return (
          <section key={status} className={list.length >= perRow / 2 ? 'basis-full' : ''}
            style={list.length >= perRow / 2 ? undefined : { minWidth: Math.max(260, list.length * (SPINE_W + 4) + OPEN_W + 40) }}>
            <div className="mb-3 flex items-baseline gap-3">
              <span className="h-3 w-3 rotate-45" style={{ background: meta.color, boxShadow: `0 0 12px ${meta.color}` }} />
              <h3 className="text-[20px] font-extrabold">{meta.label}</h3>
              <span className="hud text-[14px]" style={{ color: 'var(--dim)' }}>× {list.length}</span>
            </div>
            <div className="grid gap-7">
              {rows.map((row, ri) => (
                <div key={ri} className="relative">
                  <div className="flex items-end gap-1 px-4" style={{ height: SPINE_H + 6 }}>
                    {row.map((g, i) => <Spine key={g.id} g={g} i={i} />)}
                  </div>
                  {/* shelf board */}
                  <div className="h-[10px]" style={{ background: 'linear-gradient(180deg, rgba(160,180,255,.22), rgba(40,48,80,.4))', clipPath: 'polygon(0 0, 100% 0, calc(100% - 10px) 100%, 10px 100%)', boxShadow: '0 18px 30px -8px rgba(0,0,0,.8)' }} />
                  <div className="h-6" style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${meta.color} 10%, transparent), transparent)`, filter: 'blur(4px)' }} />
                </div>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function Spine({ g, i }: { g: Game; i: number }) {
  const [open, setOpen] = useState(false)
  const nav = useNavigate()
  const accent = useAccent(g.thumb ?? g.cover, g.id)
  const tier = tierOf(g.score)
  // Taller spines for higher scores, so the shelf reads like a skyline.
  const h = g.score != null ? SPINE_H - 40 + (g.score / 100) * 40 : SPINE_H - 34
  return (
    <motion.button
      initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
      transition={{ delay: i * 0.018, type: 'spring', stiffness: 260, damping: 22 }}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
      onClick={() => nav(`/game/${g.id}`)}
      className="relative shrink-0 overflow-hidden text-left"
      style={{
        width: open ? OPEN_W : SPINE_W, height: open ? SPINE_H : h,
        transition: 'width .45s cubic-bezier(.16,1,.3,1), height .45s cubic-bezier(.16,1,.3,1), transform .45s cubic-bezier(.16,1,.3,1)',
        transform: open ? 'translateY(-10px)' : 'none',
        background: `linear-gradient(90deg, color-mix(in srgb, ${accent} 55%, #000) 0%, color-mix(in srgb, ${accent} 30%, #0a0c12) 30%, #0a0c12 100%)`,
        boxShadow: open ? `0 20px 40px -10px color-mix(in srgb, ${accent} 50%, transparent), 0 0 0 1px ${accent}` : 'inset -2px 0 0 rgba(0,0,0,.4), inset 1px 0 0 rgba(255,255,255,.08)',
        zIndex: open ? 5 : 1,
      }}
      aria-label={g.title}>
      {/* cover revealed on hover */}
      {g.cover && (
        // Eager + decoded up front so the cover is ready the instant the spine opens.
        <img src={g.thumb ?? g.cover} alt="" decoding="async" className="absolute inset-0 h-full w-full object-cover"
          style={{ opacity: open ? 1 : 0, transition: 'opacity .22s' }} />
      )}
      {open && (
        <div className="absolute inset-x-0 bottom-0 p-3" style={{ background: 'linear-gradient(180deg, transparent, rgba(0,0,0,.92))', animation: 'fade-in .22s .16s both' }}>
          <div className="line-clamp-2 text-[13px] font-bold leading-tight">{g.title}</div>
          <div className="mt-1 flex items-center gap-2">
            <span className="hud text-[20px] font-bold leading-none">{g.score ?? '—'}</span>
            {tier && <span className="hud text-[11px] font-bold" style={{ color: tier.color }}>{tier.label}{isPending(g) && '?'}</span>}
          </div>
        </div>
      )}
      {/* spine face */}
      <div className="absolute inset-0 flex flex-col items-center justify-between py-2.5" style={{ opacity: open ? 0 : 1, transition: open ? 'opacity .1s' : 'opacity .25s .2s' }}>
        <span className="h-1.5 w-6" style={{ background: accent, boxShadow: `0 0 8px ${accent}` }} />
        <span className="vertical max-h-[156px] overflow-hidden whitespace-nowrap text-[13.5px] font-bold tracking-[.12em]" style={{ color: '#f1f4ff', textShadow: '0 1px 6px rgba(0,0,0,.6)' }}>{shortTitle(g.title)}</span>
        <div className="flex flex-col items-center gap-1">
          {tier && <span className="hud text-[10px] font-bold" style={{ color: tier.color }}>{tier.label}</span>}
          <span className="hud text-[14px] font-bold" style={{ color: g.score == null ? 'var(--dim)' : '#fff' }}>{g.score ?? '·'}{g.score != null && isPending(g) && <sup className="text-[9px]" style={{ color: 'var(--amber)' }}>?</sup>}</span>
        </div>
      </div>
    </motion.button>
  )
}
