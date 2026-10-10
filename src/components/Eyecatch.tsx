import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { useDb } from '../lib/db'

const PAGES: Record<string, { title: string; jp: string }> = {
  '/': { title: '总览', jp: 'アーカイブ' },
  '/ranking': { title: '天梯榜', jp: 'ランキング' },
  '/hall': { title: '喜好表', jp: 'でんどういり' },
}

/** Anime-style "eyecatch" wipe between pages: two slanted slabs sweep across with the destination name. */
export function Eyecatch() {
  const loc = useLocation()
  const navType = useNavigationType()
  const { byId } = useDb()
  const first = useRef(true)
  const prevPath = useRef(loc.pathname)
  const [shot, setShot] = useState<{ key: number; title: string; jp: string } | null>(null)

  useEffect(() => {
    if (first.current) { first.current = false; return }
    // Back/forward should feel instant; only play on deliberate navigation.
    const from = prevPath.current
    prevPath.current = loc.pathname
    if (navType === 'POP') return
    // Hopping between game files should feel like turning pages, not a scene change.
    if (from.startsWith('/game/') && loc.pathname.startsWith('/game/')) return
    const id = loc.pathname.match(/^\/game\/([^/]+)/)?.[1]
    const g = id ? byId.get(id) : undefined
    const page = g ? { title: g.title, jp: g.titleEn ?? 'GAME FILE' } : PAGES[loc.pathname] ?? PAGES['/']
    setShot({ key: Date.now(), ...page })
    const t = setTimeout(() => setShot(null), 720)
    return () => clearTimeout(t)
    // byId changes on every data reload; only route changes should trigger the wipe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.pathname])

  const ease = [0.7, 0, 0.2, 1] as const
  return (
    <AnimatePresence>
      {shot && (
        <div key={shot.key} className="pointer-events-none fixed inset-0 z-[120] overflow-hidden">
          <motion.div className="absolute inset-y-[-10%] left-[-20%] w-[140%]" style={{ background: 'var(--cyan)', skewX: -18 }}
            initial={{ x: '-40%' }} animate={{ x: ['-40%', '0%', '0%', '105%'] }} transition={{ duration: .6, times: [0, .14, .72, 1], ease }} />
          <motion.div className="absolute inset-y-[-10%] left-[-20%] flex w-[140%] items-center justify-center" style={{ background: '#0a0b12', skewX: -18 }}
            initial={{ x: '-70%' }} animate={{ x: ['-70%', '0%', '0%', '105%'] }} transition={{ duration: .6, times: [0, .2, .76, 1], ease }}>
            <div style={{ transform: 'skewX(18deg)' }} className="text-center">
              <div className="mono text-[11px] tracking-[.5em]" style={{ color: 'var(--pink)' }}>{shot.jp}</div>
              <div className="ttl mt-2 text-[clamp(34px,6vw,80px)] text-white">{shot.title}</div>
              <div className="mx-auto mt-3 h-[3px] w-24" style={{ background: 'linear-gradient(90deg, var(--cyan), var(--pink))' }} />
            </div>
          </motion.div>
          <motion.div className="absolute inset-y-[-10%] left-[-20%] w-[46%]" style={{ background: 'var(--pink)', skewX: -18, mixBlendMode: 'screen', opacity: .6 }}
            initial={{ x: '-105%' }} animate={{ x: ['-110%', '120%', '330%'] }} transition={{ duration: .6, times: [0, .5, 1], ease, delay: .1 }} />
        </div>
      )}
    </AnimatePresence>
  )
}
