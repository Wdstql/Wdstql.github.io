import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import type { Game } from '../types'
import { STATUS_META } from '../types'
import { hash01, TIERS, timeOf, type TimeBasis } from '../lib/game'
import { Cover, isPending, StatusBadge, TierTag } from '../components/ui'

const H = 640
const PAD = { top: 56, bottom: 116, left: 72, right: 48 }
const AXIS_W = 62
const UNRATED_BAND = 92

interface Node { g: Game; x: number; y: number; r: number; tx: number; ty: number; lo: number; hi: number; yr: number | null }

/** Right edge of the latest year that has a meaningful cluster of rated games. */
function focusOf(nodes: Node[]): { x: number; start: number } {
  const rated = nodes.filter((n) => n.g.score != null && n.yr != null)
  const per = new Map<number, Node[]>()
  rated.forEach((n) => per.set(n.yr!, [...(per.get(n.yr!) ?? []), n]))
  const years = [...per.keys()].sort((a, b) => b - a)
  const year = years.find((y) => per.get(y)!.length >= 4) ?? years[0]
  if (year == null) return { x: 0, start: 0 }
  const list = per.get(year)!
  return { x: Math.max(...list.map((n) => n.x + n.r)), start: list[0].lo }
}

export function Constellation({ games, basis }: { games: Game[]; basis: TimeBasis }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [vw, setVw] = useState(1200)
  const [hover, setHover] = useState<string | null>(null)
  const [hoverGenre, setHoverGenre] = useState<string | null>(null)
  const nav = useNavigate()
  const [edge, setEdge] = useState({ left: false, right: false })
  const updateEdge = () => {
    const el = wrapRef.current
    if (el) setEdge({ left: el.scrollLeft > 8, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 8 })
  }

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setVw(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { nodes, years, width, unknownX, lines, SCORE_MIN, focusX } = useMemo(() => {
    // The axis starts just below the lowest score so the plot isn't half empty.
    const scores = games.flatMap((g) => (g.score != null ? [g.score] : []))
    const SCORE_MIN = Math.min(80, Math.max(30, (scores.length ? Math.min(...scores) : 50) - 2))
    const timed = games.filter((g) => timeOf(g, basis))
    // Only years that actually contain games get a column; busier years get wider columns.
    const perYear = new Map<number, number>()
    timed.forEach((g) => { const y = Number(timeOf(g, basis)!.slice(0, 4)); perYear.set(y, (perYear.get(y) ?? 0) + 1) })
    const yearList = [...perYear.keys()].sort((a, b) => a - b)
    const hasUnknown = timed.length < games.length
    const avail = vw - PAD.left - PAD.right - (hasUnknown ? 150 : 0)
    const weight = (y: number) => 0.6 + Math.sqrt(perYear.get(y)!) * 1.3
    const totalW = yearList.reduce((s, y) => s + weight(y), 0) || 1
    const unit = Math.max(avail / totalW, 46)
    const cols = new Map<number, { x: number; w: number }>()
    let cursor = PAD.left
    const compact = vw < 640
    for (const y of yearList) { const w = Math.max(compact ? 46 : 64, weight(y) * unit); cols.set(y, { x: cursor, w }); cursor += w }
    const width = Math.max(vw, cursor + PAD.right + (hasUnknown ? 150 : 0))
    const unknownX = cursor + 75
    const plotH = H - PAD.top - PAD.bottom
    const scoreY = (s: number) => PAD.top + (1 - (Math.max(s, SCORE_MIN) - SCORE_MIN) / (100 - SCORE_MIN)) * plotH

    const nodes: Node[] = games.map((g) => {
      const t = timeOf(g, basis)
      let x: number
      let lo = unknownX - 70, hi = unknownX + 70, yr: number | null = null
      if (t) {
        const [yy, mm] = t.split('-').map(Number)
        const c = cols.get(yy)!
        x = c.x + 14 + (((mm || 6) - 0.5) / 12) * (c.w - 28)
        lo = c.x; hi = c.x + c.w; yr = yy
      } else x = unknownX + (hash01(g.id, 3) - 0.5) * 110
      const y = g.score != null ? scoreY(g.score) : H - PAD.bottom + 26 + hash01(g.id, 5) * (UNRATED_BAND - 30)
      const r = (g.score != null ? 15 + Math.max(0, g.score - 60) * 0.42 : 12) * (compact ? 0.72 : 1)
      return { g, x, y, r, tx: x, ty: y, lo, hi, yr }
    })

    // Simple relaxation so covers don't sit on top of each other.
    for (let it = 0; it < 90; it++) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j]
          const dx = b.x - a.x, dy = b.y - a.y
          const d = Math.hypot(dx, dy) || 0.01
          const min = a.r + b.r + 4
          if (d < min) {
            const push = (min - d) / 2
            const ux = dx / d, uy = dy / d
            a.x -= ux * push; a.y -= uy * push * 0.7
            b.x += ux * push; b.y += uy * push * 0.7
          }
        }
      }
      for (const n of nodes) {
        n.x += (n.tx - n.x) * 0.06
        n.y += (n.ty - n.y) * 0.1
        n.y = Math.min(H - 18 - n.r, Math.max(PAD.top - 30 + n.r, n.y))
        // Stay inside the node's own year column so column edges read cleanly when scrolled.
        n.x = Math.min(Math.max(n.lo + n.r + 2, n.x), Math.max(n.lo + n.r + 2, n.hi - n.r - 2))
        n.x = Math.max(AXIS_W + 8 + n.r, n.x)
      }
    }

    // Constellation lines: chain games sharing a primary genre, left to right.
    const byGenre = new Map<string, Node[]>()
    nodes.forEach((n) => { const k = n.g.genres[0]; if (k && n.g.score != null) byGenre.set(k, [...(byGenre.get(k) ?? []), n]) })
    const lines: { genre: string; a: Node; b: Node }[] = []
    byGenre.forEach((list, genre) => {
      list.sort((p, q) => p.x - q.x)
      for (let i = 1; i < list.length; i++) lines.push({ genre, a: list[i - 1], b: list[i] })
    })

    return { nodes, years: yearList.map((y) => ({ year: y, ...cols.get(y)! })), width, unknownX: hasUnknown ? unknownX : null, lines, SCORE_MIN, focusX: focusOf(nodes) }
  }, [games, basis, vw])

  const stars = useMemo(() => Array.from({ length: 140 }, (_, i) => ({ x: hash01('s' + i, 1) * 100, y: hash01('s' + i, 2) * 100, o: 0.15 + hash01('s' + i, 4) * 0.5, s: hash01('s' + i, 9) > 0.92 ? 2 : 1 })), [])
  const hovered = nodes.find((n) => n.g.id === hover)
  const activeGenre = hoverGenre ?? hovered?.g.genres[0] ?? null
  const plotH = H - PAD.top - PAD.bottom

  // Keep the newest years in view on first render.
  useEffect(() => {
    const el = wrapRef.current
    // Open on the newest rated games, snapped so the first visible year column starts right after the axis.
    if (el && width > vw) {
      // Show the focus year from its first column; then snap left to a column boundary for a clean edge.
      const target = Math.min(focusX.x + 60 - vw, focusX.start - AXIS_W - 6)
      const starts = years.map((y) => y.x - AXIS_W - 6).filter((x) => x <= target)
      el.scrollLeft = Math.max(0, Math.min(width - vw, starts.length ? Math.max(...starts) : target))
    }
    updateEdge()
  }, [width, vw, focusX])

  const genreLegend = useMemo(() => {
    const m = new Map<string, number>()
    games.forEach((g) => g.genres[0] && g.score != null && m.set(g.genres[0], (m.get(g.genres[0]) ?? 0) + 1))
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
  }, [games])

  return (
    <div className="panel cut relative overflow-hidden" style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(70,227,255,.06), transparent 60%), rgba(6,8,14,.85)' }}>
      <div className="pointer-events-none absolute inset-0">
        {stars.map((s, i) => <span key={i} className="absolute rounded-full bg-white" style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s, opacity: s.o }} />)}
      </div>

      <div className="relative flex flex-wrap items-center gap-2 px-5 pt-4">
        <span className="text-[12px]" style={{ color: 'var(--muted)' }}>横轴：{basis === 'played' ? '游玩时间' : '发售时间'} · 纵轴：评分 · 连线：同一主类型 · 越大越高分</span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <button className="chip h-6 px-2.5 text-[11px]" disabled={!edge.left} style={{ opacity: edge.left ? 1 : .35 }} onClick={() => wrapRef.current?.scrollBy({ left: -vw * 0.7, behavior: 'smooth' })} aria-label="更早">← 更早</button>
          <button className="chip h-6 px-2.5 text-[11px]" disabled={!edge.right} style={{ opacity: edge.right ? 1 : .35 }} onClick={() => wrapRef.current?.scrollBy({ left: vw * 0.7, behavior: 'smooth' })} aria-label="更晚">更晚 →</button>
          <span className="mx-1 h-4 w-px" style={{ background: 'var(--line-2)' }} />
          {genreLegend.map(([g]) => (
            <button key={g} className="chip h-6 px-2.5 text-[11px]" data-on={activeGenre === g} style={{ ['--chip-color' as string]: 'var(--pink)' }}
              onMouseEnter={() => setHoverGenre(g)} onMouseLeave={() => setHoverGenre(null)}>{g}</button>
          ))}
        </div>
      </div>

      <div className="relative">
      {/* Fixed tier axis: lives outside the scroller so labels never scroll away or sit under nodes. */}
      <div className="pointer-events-none absolute left-0 top-0 z-40" style={{ height: H, width: AXIS_W, background: 'linear-gradient(90deg, #070910 62%, transparent)' }}>
        {TIERS.map((t, i) => {
          const hi = i === 0 ? 100 : TIERS[i - 1].min
          if (hi <= SCORE_MIN) return null
          return (
            <span key={t.key} className="hud absolute left-3 text-[11px] font-bold" style={{ top: PAD.top + (1 - (hi - SCORE_MIN) / (100 - SCORE_MIN)) * plotH + 4, color: t.color }}>
              {t.label}<span className="mono ml-1 font-normal opacity-60">{Math.max(t.min, SCORE_MIN)}+</span>
            </span>
          )
        })}
      </div>
      {edge.left && <EdgeFade side="left" />}
      {edge.right && <EdgeFade side="right" />}
      <div ref={wrapRef} className="no-scrollbar relative overflow-x-auto" onScroll={updateEdge}
        onWheel={(e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && e.shiftKey) e.currentTarget.scrollLeft += e.deltaY }}>
        <div className="relative" style={{ width, height: H }}>
          {/* tier bands — labels stick to the left edge while scrolling */}
          {TIERS.map((t, i) => {
            const hi = i === 0 ? 100 : TIERS[i - 1].min
            const lo = Math.max(t.min, SCORE_MIN)
            if (hi <= SCORE_MIN) return null
            const y = (v: number) => PAD.top + (1 - (v - SCORE_MIN) / (100 - SCORE_MIN)) * plotH
            return (
              <div key={t.key} className="absolute left-0 right-0" style={{ top: y(hi), height: y(lo) - y(hi), borderTop: `1px dashed color-mix(in srgb, ${t.color} 25%, transparent)`, background: i % 2 ? 'rgba(140,165,255,.012)' : 'transparent' }}>
              </div>
            )
          })}
          <div className="absolute left-0 right-0" style={{ top: H - PAD.bottom + 14, height: 1, background: 'linear-gradient(90deg, transparent, var(--line-2), transparent)' }} />
          <span className="label absolute left-3" style={{ top: H - PAD.bottom + 22 }}>未评分</span>

          {/* year columns */}
          {years.map((y) => (
            <div key={y.year} className="absolute" style={{ left: y.x, width: y.w, top: PAD.top - 34, bottom: PAD.bottom - 10, borderLeft: '1px solid rgba(140,165,255,.06)' }}>
              <span className="hud absolute -top-1 left-2 text-[13px] font-semibold" style={{ color: 'var(--dim)' }}>{y.year}</span>
            </div>
          ))}
          {unknownX && <span className="label absolute" style={{ left: unknownX - 40, top: PAD.top - 34 }}>时间未记录</span>}

          {/* lines */}
          <svg className="pointer-events-none absolute inset-0" width={width} height={H}>
            {lines.map((l, i) => {
              const on = activeGenre === l.genre
              return <line key={i} x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y} stroke={on ? 'var(--pink)' : activeGenre ? 'transparent' : 'rgba(140,175,255,.07)'} strokeWidth={on ? 1.4 : 1} strokeDasharray={on ? '0' : '3 4'} style={{ transition: 'stroke .25s' }} />
            })}
          </svg>

          {/* nodes */}
          {nodes.map((n, i) => {
            const dim = activeGenre && !n.g.genres.includes(activeGenre)
            const color = STATUS_META[n.g.status].color
            return (
              <motion.button key={n.g.id}
                initial={{ opacity: 0, scale: 0.3 }} animate={{ opacity: dim ? 0.22 : 1, scale: 1 }}
                transition={{ delay: Math.min(1.2, (n.x / width) * 0.9 + (i % 7) * 0.01), type: 'spring', stiffness: 200, damping: 18 }}
                whileHover={{ scale: 1.25, zIndex: 30 }}
                onMouseEnter={() => setHover(n.g.id)} onMouseLeave={() => setHover(null)} onClick={() => nav(`/game/${n.g.id}`)}
                className="absolute rounded-full"
                style={{ left: n.x - n.r, top: n.y - n.r, width: n.r * 2, height: n.r * 2, zIndex: hover === n.g.id ? 30 : 2 }}
                aria-label={n.g.title}>
                <span className="absolute inset-[-3px] rounded-full" style={{ border: `1.5px ${isPending(n.g) ? 'dashed' : 'solid'} ${color}`, boxShadow: `0 0 ${n.g.score && n.g.score >= 90 ? 16 : 8}px ${color}` }} />
                <Cover game={n.g} sizes="sm" className="h-full w-full rounded-full" />
                {n.g.score != null && n.g.score >= 95 && <span className="absolute inset-[-8px] rounded-full" style={{ border: '1px solid var(--pink)', animation: 'pulse-ring 2.4s ease-out infinite' }} />}
              </motion.button>
            )
          })}

          {/* tooltip */}
          <AnimatePresence>
            {hovered && (
              <motion.div key={hovered.g.id} className="panel cut cut-sm pointer-events-none absolute z-40 flex w-[290px] gap-3 p-3"
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: .18 }}
                style={{
                  // Sit beside the node (not on top of its neighbours), flipping left near the right edge.
                  left: hovered.x + hovered.r + 304 < width ? hovered.x + hovered.r + 14 : Math.max(AXIS_W, hovered.x - hovered.r - 304),
                  top: Math.min(H - 150, Math.max(8, hovered.y - 64)),
                  background: 'rgba(8,10,17,.95)', borderColor: 'rgba(70,227,255,.35)', ['--cut' as string]: '8px',
                }}>
                <Cover game={hovered.g} sizes="sm" className="h-[118px] w-[79px] shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><TierTag score={hovered.g.score} pending={isPending(hovered.g)} /><span className="hud text-[22px] font-bold leading-none">{hovered.g.score ?? '—'}</span></div>
                  <div className="ttl mt-1.5 line-clamp-2 text-[17px] leading-snug">{hovered.g.title}</div>
                  <div className="truncate text-[12px]" style={{ color: '#9aa3bb' }}>{hovered.g.titleEn}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5"><StatusBadge status={hovered.g.status} size="sm" /><span className="mono text-[10.5px]" style={{ color: 'var(--muted)' }}>{timeOf(hovered.g, basis)?.replace('-', '.') ?? ''}</span></div>
                  {hovered.g.oneLiner && <div className="mt-1.5 line-clamp-2 text-[11.5px]" style={{ color: 'var(--muted)' }}>“{hovered.g.oneLiner}”</div>}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      </div>
    </div>
  )
}

function EdgeFade({ side }: { side: 'left' | 'right' }) {
  return <div className="pointer-events-none absolute bottom-0 top-0 z-30 w-12" style={{ [side]: side === 'left' ? AXIS_W : 0, background: `linear-gradient(${side === 'left' ? 90 : 270}deg, rgba(6,8,14,.9), transparent)` }} />
}
