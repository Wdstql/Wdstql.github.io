// Visual QA: full-page screenshots plus frame-by-frame captures of the key animations,
// tiled into contact sheets. Usage: node scripts/capture.ts [outDir]   (dev server on :5180)
// Set CHROME_PATH to use a specific Chromium build.
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { chromium, type Page } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:5180'
const OUT = path.resolve(process.argv[2] ?? 'qa-shots')
const MOTION_ONLY = !!process.env.MOTION_ONLY
if (!MOTION_ONLY) rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function newPage(width: number, height: number, view: string | null = 'constellation', edit = false) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 })
  await ctx.addInitScript(([v, e]) => {
    if (v) localStorage.setItem('game-life:view', v as string)
    localStorage.setItem('game-life:edit', e ? '1' : '0')
  }, [view, edit])
  return ctx.newPage()
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => {})
  // Scroll through once so whileInView content and lazy images resolve, then return.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 90)) }
    window.scrollTo(0, 0)
  })
  await sleep(900)
}

/** Grabs `n` frames every `every` ms while `act` runs, then tiles them into one sheet. */
async function sequence(page: Page, name: string, act: () => Promise<unknown>, n = 12, every = 80, cols = 4, clip?: { x: number; y: number; width: number; height: number }) {
  const dir = path.join(OUT, `${name}-frames`)
  mkdirSync(dir, { recursive: true })
  const run = act()
  for (let i = 0; i < n; i++) {
    await page.screenshot({ path: path.join(dir, `f${String(i).padStart(2, '0')}.png`), clip })
    await sleep(every)
  }
  await run
  const w = clip ? Math.min(clip.width, 720) : 720
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(dir, 'f%02d.png'),
    // Frames read left-to-right, top-to-bottom.
    '-vf', `scale=${w}:-1,tile=${cols}x${Math.ceil(n / cols)}:padding=6:color=0x222222`,
    '-frames:v', '1', path.join(OUT, `${name}-sheet.png`)])
}

// ---------- full pages ----------
const pages: [string, string, string?][] = [
  ['overview-starmap', '/', 'constellation'], ['overview-timeline', '/', 'timeline'], ['overview-shelf', '/', 'shelf'],
  ['ranking', '/ranking'], ['hall', '/hall'], ['detail-sekiro', '/game/sekiro'], ['detail-bloodborne', '/game/bloodborne'], ['detail-portal2', '/game/portal-2'],
]
for (const [name, url, view] of MOTION_ONLY ? [] : pages) {
  const p = await newPage(1440, 900, view)
  await p.goto(BASE + url)
  await settle(p)
  await p.screenshot({ path: path.join(OUT, `${name}-fold.png`) })
  await p.screenshot({ path: path.join(OUT, `${name}-full.png`), fullPage: true })
  await p.context().close()
}
// Header regression check: nothing in the bar may cross the viewport edge at any common width.
for (const w of MOTION_ONLY ? [] : [320, 360, 390, 640, 768, 900, 1024, 1280, 1440]) {
  const p = await newPage(w, 800, null)
  await p.goto(BASE + '/')
  await sleep(700)
  const n = await p.evaluate(() => [...document.querySelectorAll('header *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).length)
  console.log(`header @${w}px: ${n ? `✗ ${n} element(s) overflow` : 'ok'}`)
  await p.context().close()
}
for (const w of MOTION_ONLY ? [] : [768, 1024]) {
  for (const [name, url] of [['overview', '/'], ['detail', '/game/sekiro'], ['ranking', '/ranking']]) {
    const p = await newPage(w, 1000, null)
    await p.goto(BASE + url)
    await settle(p)
    await p.screenshot({ path: path.join(OUT, `t${w}-${name}.png`) })
    const overflow = await p.evaluate(() => [...document.querySelectorAll('header *')].some((e) => e.getBoundingClientRect().right > innerWidth + 1))
    if (overflow) console.warn(`! header overflows at ${w}px on ${url}`)
    await p.context().close()
  }
}
for (const [name, url] of MOTION_ONLY ? [] : [['m-overview', '/'], ['m-detail', '/game/sekiro'], ['m-ranking', '/ranking'], ['m-hall', '/hall']]) {
  const p = await newPage(390, 844, null) // phones use the site's own default view
  await p.goto(BASE + url)
  await settle(p)
  await p.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true })
  await p.context().close()
}

if (!MOTION_ONLY) {
  // Phone with the star map chosen explicitly.
  const p = await newPage(390, 844, 'constellation')
  await p.goto(BASE + '/')
  await settle(p)
  const star = p.getByText('横轴', { exact: false }).first()
  await star.scrollIntoViewIfNeeded()
  await sleep(700)
  await p.screenshot({ path: path.join(OUT, 'm-starmap.png') })
  await p.context().close()
}

// ---------- motion ----------
{
  const p = await newPage(1440, 900)
  await sequence(p, 'motion-hero-load', () => p.goto(BASE + '/'), 12, 110)
  await sleep(1500)
  await sequence(p, 'motion-eyecatch', () => p.click('nav a[href="/ranking"]'), 12, 55)
  await sleep(1200)
  await p.goto(BASE + '/')
  await sleep(1500)
  await sequence(p, 'motion-eyecatch-to-game', () => p.click('a[href="/game/sekiro"] >> nth=0'), 12, 55)
  await p.context().close()
}
{
  const p = await newPage(1440, 900)
  const box = await (async () => {
    await p.goto(BASE + '/game/fate-stay-night')
    await p.getByText('当时', { exact: true }).waitFor()
    const b = (await p.getByText('当时', { exact: true }).locator('xpath=../..').boundingBox())!
    return { x: Math.max(0, b.x - 10), y: Math.max(0, b.y - 24), width: Math.min(1000, b.width + 20), height: b.height + 40 }
  })()
  await p.goto(BASE + '/game/fate-stay-night')
  await sleep(380)
  await sequence(p, 'motion-dialogue', async () => {}, 12, 120, 3, box)
  await p.context().close()
}
{
  const p = await newPage(1440, 900, 'shelf')
  await p.goto(BASE + '/')
  await settle(p)
  const spine = p.locator('button[aria-label="空洞骑士"]').first()
  await spine.scrollIntoViewIfNeeded()
  await sleep(600)
  const box = (await spine.boundingBox())!
  await sequence(p, 'motion-shelf-hover', () => spine.hover(), 8, 70, 4, { x: Math.max(0, box.x - 200), y: box.y - 40, width: 700, height: 330 })
  await p.context().close()
}
{
  const p = await newPage(1440, 900)
  await p.goto(BASE + '/')
  await settle(p)
  const node = p.locator('button[aria-label="艾尔登法环"]').first()
  await node.scrollIntoViewIfNeeded()
  await sleep(600)
  await node.hover()
  await sleep(500)
  await p.screenshot({ path: path.join(OUT, 'starmap-hover.png') })
  await p.context().close()
}

// ---------- loading states & keyboard focus ----------
{
  // Slow every cover so the shimmer placeholder and the fade-in are observable.
  const p = await newPage(1440, 900)
  await p.route('**/media/**', async (route) => { await sleep(1800); await route.continue() })
  const go = p.goto(BASE + '/ranking#tiers')
  await sleep(1300)
  await p.evaluate(() => document.getElementById('tiers')?.scrollIntoView())
  await sequence(p, 'loading-shimmer', async () => { await go }, 8, 160, 4, { x: 0, y: 60, width: 1440, height: 520 })
  await p.context().close()
}
{
  const p = await newPage(1440, 900)
  await p.goto(BASE + '/')
  await sleep(1500)
  const shots: string[] = []
  for (let i = 1; i <= 8; i++) {
    await p.keyboard.press('Tab')
    await sleep(150)
    const box = await p.evaluate(() => { const r = document.activeElement?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, w: r.width, h: r.height, tag: document.activeElement!.tagName, text: (document.activeElement as HTMLElement).innerText?.slice(0, 20) } : null })
    if (!box) continue
    const f = path.join(OUT, `focus-${i}.png`)
    await p.screenshot({ path: f, clip: { x: Math.max(0, box.x - 24), y: Math.max(0, box.y - 18), width: Math.min(1440, box.w + 48), height: box.h + 36 } })
    shots.push(`${i}: ${box.tag} "${box.text}"`)
  }
  console.log('focus order:\n' + shots.join('\n'))
  await p.context().close()
}

await browser.close()
console.log(`saved to ${OUT}`)
