#!/usr/bin/env node
// CLI for humans and agents. Run `npm run game -- help`.
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Game } from '../src/types.ts'
import { GENRES, STATUS_META, normalizeStatus } from '../src/types.ts'
import {
  addFanwork, addMoment, deleteGame, download, getGame, listGames, readAwards,
  setCoverFromBytes, updateGame, writeAwards,
} from '../server/store.ts'
import { biliInfo, fetchSteamArt, searchSteam, steamInfo } from '../server/remote.ts'
import { createWithSteam } from '../server/plugin.ts'

const HELP = `
GAME LIFE CLI —— 数据写入 data/games/<id>.json，开着的网页会自动刷新。

  npm run game -- list [--status 已完结]           列出游戏
  npm run game -- show <id>                         查看一条记录（JSON）
  npm run game -- add "<中文名>" [选项]             新增游戏
        --steam <appid|auto>   从 Steam 拉取信息和封面（auto = 按名字搜第一个结果）
        --en "<英文名>"         --id <slug>        --status <状态>   --score <0-100>
        --from YYYY-MM   --to YYYY-MM   --hours <n>   --genres 魂系,动作
        --platforms PC,PS5   --one-liner "<一句话>"   --review "<感受>" | --review-file <md>
  npm run game -- set <id> key=value [key=value...]  修改字段（数组用逗号；review=@file.md 读文件）
  npm run game -- steam-search "<关键词>"            搜索 Steam（中英文均可）
  npm run game -- steam-art <id> <appid>             补抓 Steam 封面和横幅
  npm run game -- shot <id> <图片路径> ["说明"]       上传精彩瞬间截图
  npm run game -- cover <id> <图片路径|URL> [hero]    设置封面（加 hero 则设置横幅）
  npm run game -- bili <id> <B站链接|BV号> ["备注"]   添加二创视频
  npm run game -- award "<奖项名>" <id|none>         设置喜好表奖项
  npm run game -- rm <id>                            删除（移到 data/.trash）

状态：${Object.values(STATUS_META).map((s) => s.label).join(' / ')}（也接受 finished/playing/paused/dropped/unplayed/watched）
类型建议：${GENRES.join(' ')}
`

type Flags = Record<string, string>

function parse(argv: string[]): { pos: string[]; flags: Flags } {
  const pos: string[] = []
  const flags: Flags = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) flags[key] = 'true'
      else { flags[key] = next; i++ }
    } else pos.push(a)
  }
  return { pos, flags }
}

function fieldPatch(key: string, value: string): Partial<Game> {
  const k = key === 'from' ? 'playedFrom' : key === 'to' ? 'playedTo' : key === 'en' ? 'titleEn' : key === 'one-liner' ? 'oneLiner' : key
  const arrays = ['genres', 'platforms', 'tags', 'inferred']
  if (arrays.includes(k)) return { [k]: value ? value.split(/[,，、]/).map((s) => s.trim()).filter(Boolean) : [] } as Partial<Game>
  if (k === 'score' || k === 'hours' || k === 'steamAppId') return { [k]: value === '' || value === 'null' ? null : Number(value) } as Partial<Game>
  if (k === 'status') {
    const s = normalizeStatus(value)
    if (!s) throw new Error(`未知状态：${value}`)
    return { status: s }
  }
  return { [k]: value } as Partial<Game>
}

async function readBytes(src: string): Promise<{ data: Uint8Array; name: string; type?: string }> {
  if (/^https?:\/\//.test(src)) {
    const img = await download(src)
    if (!img) throw new Error(`下载失败：${src}`)
    return { data: img.data, name: path.basename(new URL(src).pathname) || 'image.jpg', type: img.type }
  }
  return { data: await fs.readFile(src), name: path.basename(src) }
}

function line(g: Game): string {
  const s = STATUS_META[g.status]
  const score = g.score == null ? ' -- ' : String(g.score).padStart(3, ' ') + ' '
  return `${g.id.padEnd(30)} ${s.label}  ${score} ${g.title}${g.titleEn ? ` / ${g.titleEn}` : ''}`
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2)
  const { pos, flags } = parse(rest)
  switch (cmd) {
    case 'list': {
      let games = await listGames()
      if (flags.status) games = games.filter((g) => g.status === normalizeStatus(flags.status))
      games.sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
      console.log(games.map(line).join('\n'))
      console.log(`\n共 ${games.length} 个`)
      return
    }
    case 'show':
      console.log(JSON.stringify(await getGame(pos[0]), null, 2))
      return
    case 'add': {
      const title = pos[0]
      if (!title) throw new Error('用法：add "<中文名>" [选项]')
      let steamAppId: number | undefined
      if (flags.steam === 'auto') {
        const term = flags.en || title
        const hits = await searchSteam(term)
        const norm = (x: string) => x.toLowerCase().replace(/[\s™®:：\-—]/g, '')
        // Steam mostly returns English names, so a Chinese-only query must match exactly or we stop and ask.
        if (!flags.en && /[\u4e00-\u9fff]/.test(title) && !hits.some((h) => norm(h.name) === norm(title))) {
          throw new Error(`中文名「${title}」在 Steam 上没有完全一致的结果，为避免选错没有自动关联。\n候选：\n${hits.slice(0, 5).map((h) => `  ${h.appid}  ${h.name}`).join('\n') || '  （无）'}\n请加 --en "<英文名>" 再用 --steam auto，或直接 --steam <appid>`)
        }
        if (hits.length && norm(hits[0].name) !== norm(term)) {
          const exact = hits.find((h) => norm(h.name) === norm(term))
          if (exact) hits.unshift(exact)
        }
        if (!hits.length) console.warn('Steam 没有搜到，按手动条目创建')
        else {
          steamAppId = hits[0].appid
          console.log(`Steam 匹配：${hits[0].name} (${hits[0].appid})`)
          if (hits.length > 1) console.log(`  其他候选：${hits.slice(1, 3).map((h) => `${h.name} (${h.appid})`).join('；')}\n  如果选错了：npm run game -- steam-art <id> <appid>`)
        }
      } else if (flags.steam) steamAppId = Number(flags.steam)
      const patch: Partial<Game> = { title, steamAppId }
      for (const [k, v] of Object.entries(flags)) {
        if (['steam', 'review-file'].includes(k)) continue
        Object.assign(patch, fieldPatch(k, v))
      }
      if (flags['review-file']) patch.review = await fs.readFile(flags['review-file'], 'utf8')
      const g = await createWithSteam(patch)
      console.log(`已创建 ${g.id}\n${line(g)}`)
      return
    }
    case 'set': {
      const [id, ...pairs] = pos
      const patch: Partial<Game> = {}
      for (const p of pairs) {
        const i = p.indexOf('=')
        if (i < 0) throw new Error(`需要 key=value：${p}`)
        const key = p.slice(0, i)
        let value = p.slice(i + 1)
        if (value.startsWith('@')) value = await fs.readFile(value.slice(1), 'utf8')
        Object.assign(patch, fieldPatch(key, value))
      }
      // Editing a field by hand confirms it, so drop it from the inferred list.
      const prev = await getGame(id)
      if (prev.inferred && !('inferred' in patch)) patch.inferred = prev.inferred.filter((f) => !(f in patch))
      console.log(line(await updateGame(id, patch)))
      return
    }
    case 'steam-search':
      for (const h of await searchSteam(pos.join(' '))) console.log(`${String(h.appid).padEnd(10)} ${h.name}`)
      return
    case 'steam-info':
      console.log(JSON.stringify(await steamInfo(Number(pos[0])), null, 2))
      return
    case 'steam-art': {
      const [id, appid] = pos
      const art = await fetchSteamArt(id, Number(appid))
      const prev = await getGame(id)
      console.log(line(await updateGame(id, { steamAppId: Number(appid), cover: art.cover ?? prev.cover, hero: art.hero ?? prev.hero })), art)
      return
    }
    case 'shot': {
      const [id, file, caption] = pos
      const b = await readBytes(file)
      const g = await addMoment(id, b.data, b.name, b.type, caption)
      console.log(`已添加截图，共 ${g.moments.length} 张`)
      return
    }
    case 'cover': {
      const [id, file, kind] = pos
      const b = await readBytes(file)
      const g = await setCoverFromBytes(id, kind === 'hero' ? 'hero' : 'cover', b.data, b.name, b.type)
      console.log(`已更新 ${kind === 'hero' ? '横幅' : '封面'}：${kind === 'hero' ? g.hero : g.cover}`)
      return
    }
    case 'bili': {
      const [id, link, note] = pos
      const info = await biliInfo(id, link)
      const g = await addFanwork(id, { ...info, note })
      console.log(`已添加 ${info.bvid}${info.title ? ` 《${info.title}》` : ''}，共 ${g.fanworks.length} 个二创`)
      return
    }
    case 'award': {
      const [title, gameId] = pos
      const awards = await readAwards()
      const target = gameId === 'none' ? null : gameId
      if (target) await getGame(target)
      const found = awards.find((a) => a.title === title)
      if (found) found.gameId = target
      else awards.push({ id: `a${Date.now().toString(36)}`, title, gameId: target })
      await writeAwards(awards)
      console.log(`奖项「${title}」→ ${target ?? '空缺'}`)
      return
    }
    case 'rm':
      await deleteGame(pos[0])
      console.log(`已移到 data/.trash：${pos[0]}`)
      return
    default:
      console.log(HELP)
  }
}

main().catch((e) => {
  console.error(`✗ ${(e as Error).message}`)
  process.exit(1)
})
