import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import type { AirStatus, Anime, WatchStatus } from './model'
import { AIR_META, WATCH_META } from './model'
import { accentOf, hash01, seasonTag } from './util'
import { useAnimeDb } from './db'

export function AnimeCover({ anime, className = '', style, large, eager }: {
  anime: Pick<Anime, 'id' | 'title' | 'titleJa' | 'cover' | 'thumb' | 'color'>
  className?: string
  style?: CSSProperties
  large?: boolean
  eager?: boolean
}) {
  const src = large ? anime.cover : anime.thumb ?? anime.cover
  const [broken, setBroken] = useState(false)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => { setBroken(false); setLoaded(false) }, [src])
  const accent = accentOf(anime)
  if (!src || broken) {
    return (
      <div className={`relative overflow-hidden ${className}`} style={{ background: `linear-gradient(160deg, color-mix(in srgb, ${accent} 30%, #120f2a), #0a0818)`, containerType: 'inline-size', ...style }}>
        <div className="tone absolute inset-0 opacity-40" style={{ ['--tone-color' as string]: `color-mix(in srgb, ${accent} 60%, transparent)` }} />
        <div className="absolute inset-0 flex flex-col justify-between p-[9%]">
          <span className="mono text-[9px] tracking-[.2em] opacity-70">NO VISUAL</span>
          <span className="ttl text-white" style={{ fontSize: 'max(11px, min(13cqw, 26px))', lineHeight: 1.15 }}>{anime.title}</span>
        </div>
      </div>
    )
  }
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ background: '#120f2a', ...style }}>
      <img src={src} alt={anime.title} loading={eager ? 'eager' : 'lazy'} decoding="async" draggable={false} referrerPolicy="no-referrer"
        onError={() => setBroken(true)} onLoad={() => setLoaded(true)} ref={(el) => { if (el?.complete && el.naturalWidth && !loaded) setLoaded(true) }}
        className="h-full w-full object-cover" style={{ opacity: loaded ? 1 : 0, transition: 'opacity .45s ease' }} />
    </div>
  )
}

export function WatchBadge({ status, size = 'md' }: { status: WatchStatus; size?: 'sm' | 'md' }) {
  const m = WATCH_META[status]
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-bold"
      style={{ color: m.color, fontSize: size === 'sm' ? 11 : 12.5, padding: size === 'sm' ? '2px 8px' : '4px 11px', background: `color-mix(in srgb, ${m.color} 13%, transparent)`, border: `1px solid color-mix(in srgb, ${m.color} 45%, transparent)` }}>
      <Star size={size === 'sm' ? 8 : 9} color={m.color} />{m.label}
    </span>
  )
}

export function AirBadge({ air, size = 'md' }: { air: AirStatus; size?: 'sm' | 'md' }) {
  const m = AIR_META[air]
  if (air === 'airing') {
    return <span className="onair" style={{ color: m.color, background: 'rgba(255,95,122,.12)', border: '1px solid rgba(255,95,122,.5)', fontSize: size === 'sm' ? 10 : 11 }}><i />{m.label}</span>
  }
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap font-semibold" style={{ color: m.color, fontSize: size === 'sm' ? 10.5 : 12, padding: size === 'sm' ? '1px 7px' : '3px 9px', border: `1px solid color-mix(in srgb, ${m.color} 40%, transparent)`, borderRadius: 4 }}>
      {air === 'finished' ? '✓' : '◇'} {m.label}
    </span>
  )
}

/** Four-point sparkle, the site's recurring mark. */
export function Star({ size = 10, color = 'currentColor', className = '', style }: { size?: number; color?: string; className?: string; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} style={style} aria-hidden>
      <path d="M12 0c.9 6.4 5.6 11.1 12 12-6.4.9-11.1 5.6-12 12-.9-6.4-5.6-11.1-12-12C6.4 11.1 11.1 6.4 12 0Z" fill={color} />
    </svg>
  )
}

export function PosterCard({ anime, index = 0, showStatus = true }: { anime: Anime; index?: number; showStatus?: boolean }) {
  const accent = accentOf(anime)
  const st = WATCH_META[anime.status]
  const tag = seasonTag(anime)
  return (
    <motion.div initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ duration: .5, delay: (index % 6) * .04 }}>
      <Link to={`/anime/${anime.id}`} className="poster group" style={{ ['--card-accent' as string]: accent }}>
        <div className="art">
          <AnimeCover anime={anime} className="h-full w-full" />
          {showStatus && <span className="status-bar" style={{ background: st.color, boxShadow: `0 0 10px ${st.color}` }} />}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3" style={{ background: 'linear-gradient(180deg, transparent, rgba(7,6,26,.85))' }} />
          <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between gap-1">
            {anime.air === 'airing' ? <AirBadge air="airing" size="sm" /> : <span />}
            {anime.score != null ? <span className="hud ml-auto mr-1 px-1.5 text-[12px] font-bold" title="我的评分" style={{ background: 'var(--pink)', color: '#1a1030' }}>★ {anime.score}</span> : null}
            {anime.episodes ? <span className="hud rounded px-1.5 text-[11px] font-bold" style={{ background: 'rgba(0,0,0,.6)', color: '#fff' }}>{anime.episodes}{anime.format === '剧场版' ? '部' : '话'}</span> : null}
          </div>
          {tag && <span className="sticker absolute right-2 top-3 max-w-[72%]" style={{ ['--sticker' as string]: accent }} title={tag}><span className="min-w-0 truncate">{tag}</span></span>}
        </div>
        <div className="mt-2.5 px-0.5">
          <div className="ttl line-clamp-2 text-[15.5px] leading-snug transition-colors group-hover:text-white" style={{ color: '#ece8fa' }}>{anime.title}</div>
          <div className="mt-1 flex items-center gap-2 text-[11.5px]" style={{ color: 'var(--dim)' }}>
            {showStatus && <span className="shrink-0 font-bold" style={{ color: st.color }}>{st.label}</span>}
            <span className="hud shrink-0">{anime.airStart?.slice(0, 4) ?? '—'}</span>
            {anime.studio && <span className="truncate">{anime.studio}</span>}
          </div>
        </div>
      </Link>
    </motion.div>
  )
}

export function AHead({ num, title, kana, children }: { num: string; title: string; kana: string; children?: ReactNode }) {
  return (
    <div className="a-head">
      <span className="num">{num}</span>
      <h2>{title}</h2>
      <span className="kana">{kana}</span>
      <span className="rule hidden sm:block" />
      {children}
    </div>
  )
}

/**
 * Drifting sakura petals on a canvas behind the content. Stops while the tab is hidden and
 * stays still for people who prefer reduced motion.
 */
export function Petals({ count = 14 }: { count?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let w = 0, h = 0
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const resize = () => {
      w = canvas.clientWidth; h = canvas.clientHeight
      canvas.width = w * dpr; canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)
    const n = w < 640 ? Math.round(count * .5) : count
    const petals = Array.from({ length: n }, (_, i) => ({
      x: hash01('x' + i) * w, y: hash01('y' + i) * h, s: 5 + hash01('s' + i) * 7, vy: .25 + hash01('v' + i) * .55,
      vx: .15 + hash01('w' + i) * .45, r: hash01('r' + i) * Math.PI * 2, vr: (hash01('q' + i) - .5) * .03, ph: hash01('p' + i) * 10, a: .35 + hash01('a' + i) * .45,
    }))
    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h)
      for (const p of petals) {
        if (!still) {
          p.y += p.vy; p.x += p.vx + Math.sin(t / 1400 + p.ph) * .35; p.r += p.vr
          if (p.y > h + 20) { p.y = -20; p.x = Math.random() * w }
          if (p.x > w + 20) p.x = -20
        }
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.r)
        ctx.scale(1, .55 + Math.abs(Math.sin(t / 900 + p.ph)) * .45)
        ctx.globalAlpha = p.a
        ctx.fillStyle = '#ffc2dc'
        ctx.beginPath()
        // A petal: two arcs meeting in a notch at the tip.
        ctx.moveTo(0, -p.s)
        ctx.quadraticCurveTo(p.s * .9, -p.s * .4, 0, p.s)
        ctx.quadraticCurveTo(-p.s * .9, -p.s * .4, 0, -p.s)
        ctx.fill()
        ctx.restore()
      }
    }
    // Petals belong to the hero; they thin out as the page scrolls into the archive.
    const fade = () => { canvas.style.opacity = String(Math.max(0.15, 1 - window.scrollY / 1100)) }
    fade()
    window.addEventListener('scroll', fade, { passive: true })
    let raf = 0
    const loop = (t: number) => { draw(t); raf = requestAnimationFrame(loop) }
    if (still) draw(0)
    else raf = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); window.removeEventListener('scroll', fade) }
  }, [count])
  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-0 h-full w-full" />
}

export function AnimeToasts() {
  const { toasts } = useAnimeDb()
  return (
    <div className="pointer-events-none fixed bottom-6 left-6 right-6 z-[130] flex flex-col items-start gap-2 sm:right-auto">
      {toasts.map((t) => (
        <motion.div key={t.id} initial={{ opacity: 0, x: 40, rotate: 2 }} animate={{ opacity: 1, x: 0, rotate: 0 }}
          className="pointer-events-auto flex max-w-[420px] items-start gap-2.5 break-words cut cut-sm px-4 py-3 text-sm"
          style={{ background: 'rgba(16,12,38,.96)', border: `1px solid ${t.kind === 'ok' ? 'rgba(255,126,182,.5)' : 'rgba(255,95,122,.6)'}`, boxShadow: '0 16px 40px -16px #000' }}>
          <Star size={13} color={t.kind === 'ok' ? 'var(--pink)' : '#ff5f7a'} style={{ marginTop: 3, flexShrink: 0 }} />
          <span>{t.msg}</span>
        </motion.div>
      ))}
    </div>
  )
}

/** Small "field: value" pair used on the detail page. */
export function Fact({ k, v, className = '' }: { k: string; v: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="text-[11.5px]" style={{ color: 'var(--dim)' }}>{k}</div>
      <div className="mt-1 text-[14px] font-semibold" style={{ color: '#ece8fa' }}>{v}</div>
    </div>
  )
}

export function Inferred({ show }: { show: boolean }) {
  const { editMode } = useAnimeDb()
  if (!show || !editMode) return null
  return (
    <span title="这一项由 Claude 推断，编辑后自动确认" className="mono ml-1.5 inline-block whitespace-nowrap align-middle"
      style={{ fontSize: 9.5, letterSpacing: '.1em', color: 'var(--amber)', border: '1px dashed rgba(255,209,102,.55)', padding: '1px 5px' }}>
      待确认
    </span>
  )
}
