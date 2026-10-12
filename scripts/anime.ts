#!/usr/bin/env node
// CLI for the anime sub-site. Run `npm run anime -- help`.
import { promises as fs } from 'node:fs'
import type { Anime } from '../src/anime/model.ts'
import { AIR_META, WATCH_META, normalizeAir, normalizeWatch } from '../src/anime/model.ts'
import { searchBangumi } from '../src/anime/sources.ts'
import { createAnime, deleteAnime, getAnime, listAnime, refreshAnime, setAnimeArt, updateAnime } from '../server/anime.ts'
import { download } from '../server/store.ts'

const HELP = `
ANIME LIFE CLI —— 数据写入 data/anime/<id>.json，开着的网页会自动刷新。一季 = 一条记录。

  npm run anime -- search "<关键词>"                   搜索 Bangumi（中日文均可），列出条目 ID
  npm run anime -- add <BangumiID> [选项]              按 Bangumi 条目新增（自动填名字、集数、制作、封面、横幅、是否完结）
  npm run anime -- add "<中文名>" --manual [选项]      不关联 Bangumi，手动新增
        --status 已看过|正在看|待观看|已弃坑   --score <0-100>   --progress "<进度说明>"
        --series "<系列名>"   --season "<第二季>"   --id <slug>   --from YYYY-MM   --to YYYY-MM
        --one-liner "<一句话>"   --title "<改用的中文名>"
  npm run anime -- list [--status 正在看]               列出番剧
  npm run anime -- show <id>                           查看一条记录（JSON）
  npm run anime -- set <id> key=value [...]            修改字段（数组用逗号；review=@file.md 读文件）
  npm run anime -- refresh <id|all>                    重新读取 Bangumi / AniList（放送状态、集数、评分）
  npm run anime -- cover <id> <图片路径|URL> [hero]     设置封面（加 hero 则设置横幅）
  npm run anime -- rm <id>                             删除（移到 data/.trash/anime）

观看状态：${Object.values(WATCH_META).map((s) => s.label).join(' / ')}
放送状态 air：${Object.values(AIR_META).map((s) => s.label).join(' / ')}
`

type Flags = Record<string, string>

function parse(argv: string[]): { pos: string[]; flags: Flags } {
  const pos: string[] = []
  const flags: Flags = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) flags[a.slice(2)] = 'true'
      else { flags[a.slice(2)] = next; i++ }
    } else pos.push(a)
  }
  return { pos, flags }
}

async function fieldPatch(key: string, value: string): Promise<Partial<Anime>> {
  const alias: Record<string, string> = { from: 'watchedFrom', to: 'watchedTo', 'one-liner': 'oneLiner', ja: 'titleJa', romaji: 'titleRomaji' }
  const k = alias[key] ?? key
  if (['genres', 'tags', 'inferred'].includes(k)) return { [k]: value ? value.split(/[,，、]/).map((s) => s.trim()).filter(Boolean) : [] }
  if (['score', 'bgmScore', 'episodes', 'watchedEps', 'bangumiId', 'anilistId'].includes(k)) return { [k]: value === '' || value === 'null' ? null : Number(value) }
  if (k === 'status') {
    const s = normalizeWatch(value)
    if (!s) throw new Error(`未知观看状态：${value}`)
    return { status: s }
  }
  if (k === 'air') {
    const s = normalizeAir(value)
    if (!s) throw new Error(`未知放送状态：${value}`)
    return { air: s }
  }
  if (value.startsWith('@')) return { [k]: await fs.readFile(value.slice(1), 'utf8') }
  return { [k]: value === '' ? undefined : value }
}

async function flagsPatch(flags: Flags): Promise<Partial<Anime>> {
  let patch: Partial<Anime> = {}
  for (const [k, v] of Object.entries(flags)) {
    if (k === 'manual') continue
    patch = { ...patch, ...(await fieldPatch(k, v)) }
  }
  return patch
}

const line = (a: Anime) => `${a.id.padEnd(34)} ${WATCH_META[a.status].label}  ${AIR_META[a.air].label}  ${(a.airStart ?? '').padEnd(7)} ${a.title}${a.progress ? `（${a.progress}）` : ''}`

const [cmd, ...rest] = process.argv.slice(2)
const { pos, flags } = parse(rest)

try {
  switch (cmd) {
    case 'search': {
      for (const h of await searchBangumi(pos.join(' '))) console.log(`${String(h.id).padEnd(8)} ${(h.date ?? '????').padEnd(10)} ${h.platform.padEnd(4)} ${String(h.eps).padStart(4)}话  ${h.nameCn || h.name}${h.nameCn ? ` | ${h.name}` : ''}`)
      break
    }
    case 'add': {
      const key = pos[0]
      if (!key) throw new Error('用法：add <BangumiID> 或 add "<中文名>" --manual')
      const patch = await flagsPatch(flags)
      const input: Partial<Anime> = /^\d+$/.test(key) && !flags.manual ? { ...patch, bangumiId: Number(key) } : { ...patch, title: patch.title ?? key }
      const a = await createAnime(input)
      console.log(`已添加 ${line(a)}`)
      break
    }
    case 'list': {
      const s = flags.status ? normalizeWatch(flags.status) : null
      const all = (await listAnime()).filter((a) => !s || a.status === s).sort((x, y) => (x.airStart ?? '').localeCompare(y.airStart ?? ''))
      all.forEach((a) => console.log(line(a)))
      console.log(`共 ${all.length} 部`)
      break
    }
    case 'show':
      console.log(JSON.stringify(await getAnime(pos[0]), null, 2))
      break
    case 'set': {
      const [id, ...pairs] = pos
      let patch: Partial<Anime> = {}
      for (const p of pairs) {
        const i = p.indexOf('=')
        if (i < 0) throw new Error(`需要 key=value：${p}`)
        patch = { ...patch, ...(await fieldPatch(p.slice(0, i), p.slice(i + 1))) }
      }
      const prev = await getAnime(id)
      // Setting a field by hand confirms it.
      if (prev.inferred && !('inferred' in patch)) patch.inferred = prev.inferred.filter((f) => !(f in patch))
      console.log(`已更新 ${line(await updateAnime(id, patch))}`)
      break
    }
    case 'refresh': {
      const ids = pos[0] === 'all' ? (await listAnime()).filter((a) => a.bangumiId).map((a) => a.id) : [pos[0]]
      for (const id of ids) {
        try { console.log(`已刷新 ${line(await refreshAnime(id))}`) } catch (e) { console.warn(`${id}: ${(e as Error).message}`) }
      }
      break
    }
    case 'cover': {
      const [id, src, kind] = pos
      const k = kind === 'hero' ? 'hero' : 'cover'
      const img = /^https?:/.test(src) ? await download(src) : { data: new Uint8Array(await fs.readFile(src)), type: '' }
      if (!img) throw new Error(`下载失败：${src}`)
      console.log(`已设置${k === 'hero' ? '横幅' : '封面'} ${line(await setAnimeArt(id, k, img.data, src, img.type))}`)
      break
    }
    case 'rm':
      await deleteAnime(pos[0])
      console.log(`已移到 data/.trash/anime：${pos[0]}`)
      break
    default:
      console.log(HELP)
  }
} catch (e) {
  console.error(`错误：${(e as Error).message}`)
  process.exit(1)
}
