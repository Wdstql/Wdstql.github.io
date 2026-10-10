#!/usr/bin/env node
// Fills in what online edit mode can't fetch from the browser (Steam and Bilibili have
// no CORS). Runs in the deploy workflow before the build; safe to run locally too.
//   - games with a steamAppId but no cover: Steam art + empty info fields
//   - fanworks without a title: Bilibili title, author, duration, cover
import { listGames, updateGame } from '../server/store.ts'
import { biliInfo, fetchSteamArt, steamInfo } from '../server/remote.ts'
import type { Game } from '../src/types.ts'

let changed = 0

for (const g of await listGames()) {
  const patch: Partial<Game> = {}

  if (g.steamAppId && !g.cover) {
    try {
      const info = await steamInfo(g.steamAppId)
      if (!g.titleEn && info.titleEn) patch.titleEn = info.titleEn
      if (!g.release && info.release) patch.release = info.release
      if (!g.developer && info.developer) patch.developer = info.developer
      if (!g.genres.length && info.genres?.length) patch.genres = info.genres
    } catch (e) {
      console.warn(`[hydrate] ${g.id}: Steam 信息失败：${(e as Error).message}`)
    }
    const art = await fetchSteamArt(g.id, g.steamAppId)
    if (art.cover) patch.cover = art.cover
    if (art.hero && !g.hero) patch.hero = art.hero
  }

  if (g.fanworks.some((f) => !f.title)) {
    patch.fanworks = await Promise.all(g.fanworks.map(async (f) => (f.title ? f : { ...f, ...(await biliInfo(g.id, f.bvid)), id: f.id, addedAt: f.addedAt, note: f.note })))
    if (patch.fanworks.every((f, i) => f.title === g.fanworks[i].title)) delete patch.fanworks
  }

  if (Object.keys(patch).length) {
    await updateGame(g.id, patch)
    changed++
    console.log(`[hydrate] ${g.id}: ${Object.keys(patch).join(', ')}`)
  }
}

console.log(`[hydrate] ${changed} 条记录已补全`)
