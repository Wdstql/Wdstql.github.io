// Root of the anime sub-site (/anime). Loaded lazily so the game site never pays for it.
import { Route, Routes, type Location } from 'react-router-dom'
import './anime.css'
import { AnimeDbProvider } from './db'
import { AnimeLayout } from './Layout'
import { AnimeHome } from './pages/Home'
import { AnimeDetail } from './pages/Detail'

export default function AnimeApp() {
  return (
    <AnimeDbProvider>
      <AnimeLayout>
        {(location: Location) => (
          <Routes location={location}>
            <Route index element={<AnimeHome />} />
            <Route path=":id" element={<AnimeDetail />} />
            <Route path="*" element={<AnimeHome />} />
          </Routes>
        )}
      </AnimeLayout>
    </AnimeDbProvider>
  )
}
