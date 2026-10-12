import { lazy, StrictMode, Suspense, useEffect, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes, type Location } from 'react-router-dom'
import { MotionConfig, MotionGlobalConfig } from 'motion/react'
import './styles.css'
import { DbProvider } from './lib/db'
import { Layout } from './components/Layout'
import { Overview } from './pages/Overview'
import { GameDetail } from './pages/GameDetail'
import { Ranking } from './pages/Ranking'
import { Hall } from './pages/Hall'

// The anime sub-site shares the shell and router but nothing else; it loads as its own chunk.
const AnimeApp = lazy(() => import('./anime/AnimeApp'))

// Background tabs never fire requestAnimationFrame, which would freeze entrance
// animations half-way (e.g. when opened via ctrl+click or captured headlessly).
// Jump straight to the end state while hidden; animate normally once visible.
function Motion({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(() => document.visibilityState === 'hidden')
  useEffect(() => {
    const on = () => setHidden(document.visibilityState === 'hidden')
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])
  MotionGlobalConfig.skipAnimations = hidden
  // whileInView waits for IntersectionObserver, which also sleeps in hidden tabs.
  document.documentElement.classList.toggle('gl-static', hidden)
  return <MotionConfig reducedMotion="user" skipAnimations={hidden}>{children}</MotionConfig>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Motion>
      <BrowserRouter>
        <Routes>
          <Route path="/anime/*" element={<Suspense fallback={<div style={{ minHeight: '100vh', background: '#07061a' }} />}><AnimeApp /></Suspense>} />
          <Route path="*" element={
            <DbProvider>
              <Layout>
                {(location: Location) => (
                <Routes location={location}>
                  <Route path="/" element={<Overview />} />
                  <Route path="/game/:id" element={<GameDetail />} />
                  <Route path="/ranking" element={<Ranking />} />
                  <Route path="/hall" element={<Hall />} />
                  <Route path="*" element={<Overview />} />
                </Routes>
                )}
              </Layout>
            </DbProvider>
          } />
        </Routes>
      </BrowserRouter>
    </Motion>
  </StrictMode>,
)
