// One-off importer for the original whiteboard list (腾讯文档白板「CGA年度游戏评选」).
// Usage: node scripts/import-board.ts <seed.tsv> <resolved.json>
// Re-running skips games that already exist, so hand edits are never overwritten.
import { promises as fs } from 'node:fs'
import type { Game, Status } from '../src/types.ts'
import { normalizeStatus } from '../src/types.ts'
import { createGame, download, exists, saveMedia, updateGame, extFor } from '../server/store.ts'
import { fetchSteamArt } from '../server/remote.ts'

interface Resolved {
  id: string; title: string; titleEn?: string; titleJa?: string; steamAppId?: number | null
  platforms?: string[]; release?: string; developer?: string; genres?: string[]; coverUrl?: string
}

// Initial scores inferred from which whiteboard section a game sat in and from the
// personal award sheet. Every one of them is flagged as inferred until the user edits it.
const SCORES: Record<string, number> = {
  sekiro: 98, 'hollow-knight': 97, 'elden-ring': 96, 'slay-the-spire': 94, 'raging-loop': 94,
  'ace-attorney-trilogy': 93, 'great-ace-attorney': 93, celeste: 92, '428-shibuya': 92,
  bloodborne: 91, 'steins-gate': 90, silksong: 90, 'to-the-moon': 90, manosaba: 89, 'it-takes-two': 89,
  'pummel-party': 88, ori: 88, 'zero-escape': 88, 'expedition-33': 88, 'steins-gate-0': 88,
  'dark-souls-3': 87, hades: 87, 'ghost-trick': 87, 'ace-attorney-investigations': 86, 'black-myth-wukong': 86,
  'rhythm-doctor': 86, unheard: 85, cuphead: 85, metroid: 85, 'shanhe-detective': 85, 'quanwang-gongdi': 84,
  'muse-dash': 84, 'zhentan-series': 84, 'shanbi-cike': 83, 'ni-qu-si-ba': 83,
  'lies-of-p': 84, 'ai-limit': 80, 'nine-sols': 83, 'titanfall-2': 83, paranormasight: 82, 'dark-souls': 82, 'hades-2': 81,
  'slay-the-princess': 81, 'into-the-breach': 80, 'dead-cells': 80, 'hi-fi-rush': 80, 'little-nightmares': 79,
  'the-operator': 79, 'her-story': 79, 'rusty-lake': 79, 'kanbayashi-murder': 78, khazan: 78, 'fate-stay-night': 80,
  wuchang: 77, 'blasphemous-2': 76, 'dark-souls-2': 76, fist: 77, 'the-rewinder': 78, 'duck-detective': 77,
  'backpack-battles': 77, 'blazblue-entropy': 76, astrea: 76, shinobi: 76, framed: 75, 'sanxiang-qitan': 76,
  'yanmie-xian': 75, 'zhentan-3': 76, 'jiali-mansion': 74, 'undetermined-observer': 74, 'ise-mermaid': 73,
  'yineng-jixiong': 74, 'moling-masquerade': 73, 'zaijian-duandao': 73, korokke: 72, 'wenzi-youxi': 76,
  'cytus-2': 78, phigros: 77, arcaea: 77, 'bang-dream': 72, deemo: 75, 'naruto-storm': 75, 'demon-slayer': 73,
  'assassins-creed-2': 76, 'human-fall-flat': 72, 'fall-guys': 72, 'i-hate-this-game': 70, 'i-wanna': 70,
  'draw-guess': 68, 'turtle-soup': 70, 'mobile-escape-rooms': 68,
}

async function main() {
  const [seedPath, resolvedPath] = process.argv.slice(2)
  const rows = (await fs.readFile(seedPath, 'utf8')).split('\n').filter((l) => l.trim() && !l.startsWith('#')).map((l) => l.split('\t'))
  const resolved = new Map((JSON.parse(await fs.readFile(resolvedPath, 'utf8')) as Resolved[]).map((r) => [r.id, r]))

  const queue = [...rows]
  let done = 0
  async function worker() {
    for (let row = queue.shift(); row; row = queue.shift()) {
      const [id, boardText, , statusLabel, section, note = ''] = row
      if (await exists(id)) { done++; continue }
      const r = resolved.get(id)
      const status = normalizeStatus(statusLabel) as Status
      const score = SCORES[id] ?? null
      const inferred: string[] = []
      if (score != null) inferred.push('score')
      if (!note && (section === '待定区' || section === '已玩不重玩' || section === '已上榜')) inferred.push('status')
      const g: Partial<Game> & { id: string; title: string } = {
        id,
        title: r?.title || boardText.replace(/（.*?）/g, '').trim(),
        titleEn: r?.titleEn || undefined,
        titleJa: r?.titleJa || undefined,
        steamAppId: r?.steamAppId ?? null,
        platforms: r?.platforms ?? [],
        release: r?.release || undefined,
        developer: r?.developer || undefined,
        genres: r?.genres ?? [],
        status,
        score: status === 'unplayed' || status === 'watched' || status === 'dropped' ? null : score,
        // The whiteboard notes are the user's own words, so they make an honest one-liner.
        oneLiner: note && /[，。了吧弃晕没意思]/.test(note) ? note : undefined,
        inferred,
      }
      if (g.score == null) g.inferred = inferred.filter((f) => f !== 'score')
      try {
        await createGame(g)
        if (g.steamAppId) {
          const art = await fetchSteamArt(id, g.steamAppId)
          await updateGame(id, { cover: art.cover, hero: art.hero })
        } else if (r?.coverUrl) {
          const img = await download(r.coverUrl)
          if (img) await updateGame(id, { cover: await saveMedia(id, '', `cover.${extFor(r.coverUrl, img.type)}`, img.data) })
        }
        done++
        process.stdout.write(`\r${done}/${rows.length} ${id}                    `)
      } catch (e) {
        console.error(`\n✗ ${id}: ${(e as Error).message}`)
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))
  console.log('\n完成')
}


main()
