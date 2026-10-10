import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import type { Game } from '../types'
import { STATUS_META } from '../types'
import { timeOf, type TimeBasis } from '../lib/game'
import { Cover, isPending, StatusBadge, TierTag } from '../components/ui'

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

const FOLD = 8
const RECENT = 5

export function Timeline({ games, basis }: { games: Game[]; basis: TimeBasis }) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [showOld, setShowOld] = useState(false)
  const groups = useMemo(() => {
    const m = new Map<string, Game[]>()
    for (const g of games) {
      const t = timeOf(g, basis)
      const key = t ? t.slice(0, 4) : '????'
      m.set(key, [...(m.get(key) ?? []), g])
    }
    return [...m.entries()]
      .sort((a, b) => (a[0] === '????' ? 1 : b[0] === '????' ? -1 : b[0].localeCompare(a[0])))
      .map(([year, list]) => ({ year, list: list.sort((a, b) => (timeOf(b, basis) ?? '').localeCompare(timeOf(a, basis) ?? '') || (b.score ?? 0) - (a.score ?? 0)) }))
  }, [games, basis])

  return (
    <div className="relative">
      {(showOld ? groups : groups.slice(0, RECENT)).map(({ year, list }) => {
        const finished = list.filter((g) => g.status === 'finished').length
        const scored = list.filter((g) => g.score != null)
        const avg = scored.length ? Math.round(scored.reduce((s, g) => s + g.score!, 0) / scored.length) : null
        return (
          <section key={year} className="pb-12">
            {/* Year as a header row above its entries: no empty side column. */}
            <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: .5 }}
              className="sticky top-16 z-10 flex items-baseline gap-5 py-3" style={{ background: 'linear-gradient(180deg, var(--bg) 75%, transparent)' }}>
              <span className="hud text-[34px] font-semibold leading-none tracking-tight text-white">{year === '????' ? '时间未记录' : year}</span>
              <span className="text-[13px]" style={{ color: 'var(--muted)' }}>
                {list.length} 款{year !== '????' && <> · 通关 {finished}{avg != null && <> · 均分 <span style={{ color: 'var(--amber)' }}>{avg}</span></>}</>}
              </span>
            </motion.div>
            <div style={{ borderTop: '1px solid var(--line-2)' }}>
              {(open.has(year) ? list : list.slice(0, FOLD)).map((g, i, arr) => {
                const m = timeOf(g, basis)?.slice(5, 7)
                const firstOfMonth = i === 0 || timeOf(arr[i - 1], basis)?.slice(5, 7) !== m
                return <TimelineRow key={g.id} g={g} i={i} month={firstOfMonth ? m : undefined} />
              })}
            </div>
            {list.length > FOLD && (
              <button onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(year)) n.delete(year); else n.add(year); return n })}
                className="mt-3 flex h-10 w-full items-center justify-center gap-2 text-[12.5px] transition-colors hover:text-white"
                style={{ border: '1px dashed var(--line-2)', color: 'var(--cyan)' }}>
                {open.has(year) ? '收起 ▴' : `展开其余 ${list.length - FOLD} 款 ▾`}
              </button>
            )}
          </section>
        )
      })}
      {groups.length > RECENT && !showOld && (() => {
        const older = groups.slice(RECENT)
        const n = older.reduce((k, g) => k + g.list.length, 0)
        const span = older.filter((g) => g.year !== '????').map((g) => g.year)
        return (
          <button onClick={() => setShowOld(true)} className="relative flex w-full items-center justify-center gap-3 py-5 text-[13px] transition-colors hover:text-white"
            style={{ border: '1px dashed var(--line-2)', color: 'var(--cyan)' }}>
            <span className="ttl text-[18px]">更早 · {n} 款</span>
            <span className="text-[12px]" style={{ color: 'var(--muted)' }}>{span.length ? `${span[span.length - 1]} — ${span[0]}` : ''}{older.some((g) => g.year === '????') ? ' · 含未记录时间' : ''}</span>
            <span>▼</span>
          </button>
        )
      })()}
    </div>
  )
}

function TimelineRow({ g, i, month }: { g: Game; i: number; month?: string }) {
  const color = STATUS_META[g.status].color
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-30px' }}
      transition={{ duration: .4, delay: Math.min(i, 8) * 0.03, ease: [0.16, 1, 0.3, 1] }}>
      <Link to={`/game/${g.id}`} className="group relative grid grid-cols-[44px_40px_minmax(0,1fr)_auto] items-center gap-4 py-2.5 pr-3 transition-colors hover:bg-white/[.025] md:grid-cols-[52px_40px_minmax(0,1fr)_200px_84px_72px]"
        style={{ borderBottom: '1px solid var(--line)' }}>
        <span className="absolute inset-y-0 left-0 w-[2px] opacity-0 transition-opacity group-hover:opacity-100" style={{ background: color }} />
        <span className="hud pl-2 text-[12px] font-semibold tracking-[.12em]" style={{ color: 'var(--muted)' }}>{month ? MONTHS[Number(month) - 1] : ''}</span>
        <Cover game={g} sizes="sm" className="h-[60px] w-10" />
        <div className="min-w-0">
          <div className="ttl truncate text-[17px] leading-tight group-hover:text-white">{g.title}</div>
          <div className="mt-0.5 truncate text-[12.5px]" style={{ color: '#9aa3bb' }}>{g.titleEn ?? g.developer}</div>
        </div>
        <span className="hidden truncate text-[12.5px] md:block" style={{ color: 'var(--muted)' }}>{g.genres.slice(0, 3).join(' · ')}</span>
        <span className="hidden md:block"><StatusBadge status={g.status} size="sm" /></span>
        <span className="flex items-center justify-end gap-2">
          {g.score != null && <><TierTag score={g.score} pending={isPending(g)} /><span className="hud w-7 text-right text-[19px] font-bold">{g.score}</span></>}
        </span>
      </Link>
    </motion.div>
  )
}
