import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { marked } from 'marked'
import { animate, motion, useInView } from 'motion/react'
import type { Game, Status } from '../types'
import { STATUS_META } from '../types'
import { hueOf, tierOf } from '../lib/game'
import { useDb, workMarks } from '../lib/db'

export function Cover({ game, className = '', style, sizes = 'md', eager }: {
  game: Pick<Game, 'id' | 'title' | 'titleEn' | 'cover' | 'thumb'>
  className?: string
  style?: CSSProperties
  sizes?: 'sm' | 'md' | 'lg'
  eager?: boolean
}) {
  const [broken, setBroken] = useState(false)
  // Square art (app icons) would be cropped badly in a 2:3 frame; show it whole on a blurred bed.
  const [square, setSquare] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const src = sizes === 'lg' ? game.cover : game.thumb ?? game.cover
  const showImg = src && !broken
  const fs = sizes === 'sm' ? 11 : sizes === 'lg' ? 30 : 17
  return (
    <div className={`cover ${className}`} style={{ containerType: 'inline-size', ...(loaded || !showImg ? { animation: 'none', background: '#0c0f18' } : {}), ...style }}>
      {showImg ? (
        <>
          {square && <img src={src} alt="" aria-hidden className="absolute inset-0 scale-125 blur-xl saturate-150" style={{ opacity: .7 }} />}
          <img src={src} alt={game.title} loading={eager ? 'eager' : 'lazy'} decoding="async" draggable={false} onError={() => setBroken(true)}
            onLoad={(e) => { const i = e.currentTarget; if (i.naturalWidth / i.naturalHeight > 0.85) setSquare(true); setLoaded(true) }}
            ref={(el) => { if (el?.complete && el.naturalWidth && !loaded) setLoaded(true) }}
            style={{ ...(square ? { position: 'relative', objectFit: 'contain', padding: '0 6%' } : {}), opacity: loaded ? 1 : 0, transition: 'opacity .45s ease' }} />
        </>
      ) : (
        <div className="cover-gen" style={{ ['--h' as string]: hueOf(game.id) }}>
          {sizes === 'sm' ? (
            // Tiny tiles: the same "NO ART" card as the large cover, scaled down.
            // Title sits in the upper half so score badges along the bottom edge never cover it.
            <div className="absolute inset-0 flex flex-col p-[10%]">
              <span className="s" style={{ fontSize: 'max(6px, min(9cqw, 9px))', letterSpacing: '.14em' }}>NO ART</span>
              <span className="t ttl mt-[14%] line-clamp-3" style={{ fontSize: 'max(10px, min(18cqw, 15px))', lineHeight: 1.15 }}>{game.title}</span>
            </div>
          ) : (
            <>
              <span className="s">NO ART · GAME FILE</span>
              <div>
                <div className="t" style={{ fontSize: fs }}>{game.title}</div>
                {game.titleEn && <div className="s" style={{ marginTop: 6 }}>{game.titleEn}</div>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export function StatusBadge({ status, size = 'md' }: { status: Status; size?: 'sm' | 'md' }) {
  const m = STATUS_META[status]
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap"
      style={{
        color: m.color, fontSize: size === 'sm' ? 11 : 12.5, fontWeight: 600,
        padding: size === 'sm' ? '2px 7px' : '4px 10px',
        background: `color-mix(in srgb, ${m.color} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${m.color} 40%, transparent)`,
      }}
    >
      <span style={{ width: 6, height: 6, background: m.color, transform: 'rotate(45deg)', boxShadow: `0 0 8px ${m.color}` }} />
      {m.label}
    </span>
  )
}

export function ScoreRing({ score, size = 120, stroke = 6, label = true }: { score: number | null | undefined; size?: number; stroke?: number; label?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true })
  const [shown, setShown] = useState(0)
  const tier = tierOf(score)
  const color = tier?.color ?? '#5a6180'
  const r = (size - stroke) / 2 - 6
  const c = 2 * Math.PI * r
  useEffect(() => {
    if (!inView || score == null) return
    const ctl = animate(0, score, { duration: 0.9, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => setShown(v) })
    return () => ctl.stop()
  }, [inView, score])
  return (
    <div ref={ref} className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r + 5} fill="none" stroke="rgba(140,165,255,.12)" strokeDasharray="2 4" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(140,165,255,.1)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="butt"
          strokeDasharray={c} strokeDashoffset={c * (1 - shown / 100)}
          style={{ filter: `drop-shadow(0 0 6px ${color})` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="hud font-bold leading-none" style={{ fontSize: size * 0.32, color: score == null ? 'var(--dim)' : '#fff' }}>
          {score == null ? '—' : Math.round(shown)}
        </span>
        {label && <span className="mt-1 font-semibold tracking-[.08em]" style={{ color, fontSize: Math.max(10, size * 0.085) }}>{tier ? `${tier.label} 档` : '未评分'}</span>}
      </div>
    </div>
  )
}

export function TierTag({ score, className = '', pending }: { score: number | null | undefined; className?: string; pending?: boolean }) {
  const t = tierOf(score)
  if (!t) return null
  return (
    <span className={`hud inline-flex items-center justify-center whitespace-nowrap font-bold ${className}`} title={pending ? '推断评分，待确认' : undefined}
      style={pending
        ? { color: t.color, background: 'transparent', outline: `1px dashed ${t.color}`, outlineOffset: -1, minWidth: 26, height: 18, fontSize: 11, padding: '0 5px' }
        : { color: '#05060a', background: t.color, minWidth: 26, height: 18, fontSize: 11, padding: '0 5px', clipPath: 'polygon(4px 0,100% 0,calc(100% - 4px) 100%,0 100%)' }}>
      {t.label}{pending && '?'}
    </span>
  )
}

export const isPending = (g: { inferred?: string[] }, field = 'score') => workMarks.visible && !!g.inferred?.includes(field)

/** Site-wide notice while some scores are still inferred rather than set by the owner. */
export function PendingBanner({ className = '' }: { className?: string }) {
  const { db, editMode, setEditMode } = useDb()
  if (!editMode) return null
  const onRanking = typeof location !== 'undefined' && location.pathname === '/ranking'
  const n = (db?.games ?? []).filter((g) => g.score != null && isPending(g)).length
  if (!n) return null
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[12.5px] ${className}`}
      style={{ border: '1px dashed rgba(255,197,71,.45)', background: 'rgba(255,197,71,.05)', color: '#e9d9a8' }}>
      <span className="hud font-bold" style={{ color: 'var(--amber)' }}>{n}</span>
      <span>个评分是推断的，带虚线 <span className="hud" style={{ color: 'var(--amber)' }}>?</span> 标记，等你确认。</span>
      {db?.editable && (editMode
        ? onRanking
          ? <button className="font-semibold underline underline-offset-4" style={{ color: 'var(--amber)' }} onClick={() => document.getElementById('tiers')?.scrollIntoView({ behavior: 'smooth' })}>跳到档位表，按档确认 ↓</button>
          : <a href="/ranking#tiers" className="font-semibold underline underline-offset-4" style={{ color: 'var(--amber)' }}>去天梯榜逐档确认 →</a>
        : <button className="font-semibold underline underline-offset-4" style={{ color: 'var(--amber)' }} onClick={() => setEditMode(true)}>打开编辑模式确认</button>)}
    </div>
  )
}

export function SectionHead({ idx, title, en, children }: { idx: string; title: string; en: string; children?: ReactNode }) {
  return (
    <div className="sec-head flex-wrap">
      <span className="idx">{idx} //</span>
      <h2>{title}</h2>
      <span className="en">{en}</span>
      <span className="rule hidden sm:block" />
      {children}
    </div>
  )
}

export function Markdown({ text }: { text: string }) {
  const html = marked.parse(text, { async: false, breaks: true }) as string
  return <div className="prose-gl" dangerouslySetInnerHTML={{ __html: html }} />
}

export function Inferred({ show }: { show: boolean }) {
  if (!show || !workMarks.visible) return null
  return (
    <span title="这一项由 Claude 推断，编辑后自动确认" className="mono ml-1.5 align-middle"
      style={{ fontSize: 9.5, letterSpacing: '.1em', color: 'var(--amber)', border: '1px dashed rgba(255,197,71,.5)', padding: '1px 5px', whiteSpace: 'nowrap', display: 'inline-block' }}>
      待确认
    </span>
  )
}

export function Toasts() {
  const { toasts } = useDb()
  return (
    <div className="fixed bottom-6 left-6 right-6 z-[100] flex flex-col items-end gap-2 pointer-events-none sm:left-auto">
      {toasts.map((t) => (
        <motion.div key={t.id} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }}
          className="panel cut cut-sm pointer-events-auto max-w-[420px] break-words px-4 py-3 text-sm"
          style={{ borderColor: t.kind === 'ok' ? 'rgba(70,227,255,.4)' : 'rgba(255,95,122,.5)', ['--cut' as string]: '8px' }}>
          <span className="mono mr-2" style={{ color: t.kind === 'ok' ? 'var(--cyan)' : '#ff5f7a' }}>{t.kind === 'ok' ? 'OK' : 'ERR'}</span>
          {t.msg}
        </motion.div>
      ))}
    </div>
  )
}

/** Counts up once when scrolled into view. */
export function CountUp({ value, decimals = 0, className = '' }: { value: number; decimals?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const [v, setV] = useState(0)
  useEffect(() => {
    if (!inView) return
    const ctl = animate(0, value, { duration: 1.6, ease: [0.16, 1, 0.3, 1], onUpdate: setV })
    return () => ctl.stop()
  }, [inView, value])
  return <span ref={ref} className={className}>{v.toFixed(decimals)}</span>
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="mono rounded-sm px-1.5 py-0.5 text-[10px]" style={{ border: '1px solid var(--line-2)', color: 'var(--muted)' }}>{children}</kbd>
}

/** Overlays must escape <main>, whose page-transition transform/filter would trap position: fixed. */
export function Portal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body)
}
