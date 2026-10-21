// Motion QA: films the birthday, in real time, on a desktop and a phone, then cuts frame strips and GIFs so the
// movement itself can be checked frame by frame: the candle pushed in, the flame catching, the lights going down, a
// breath that bends, strains and blows out the flame, the smoke, the lights coming back up, Relight, the lit candle
// carried on its piece, and the knife knocking it over.
// usage: node scripts/motion.mjs [url]  ->  qa/motion/<device>.webm, <device>-strip.jpg, <device>.gif
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const base = (process.argv[2] || 'http://localhost:5190/').replace(/\/?$/, '/')
const OUT = path.resolve(import.meta.dirname, '../qa/motion')
fs.mkdirSync(OUT, { recursive: true })

const DEVICES = {
  desk: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
}

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] })

for (const [dev, opts] of Object.entries(DEVICES).filter(([d]) => !process.argv[3] || d === process.argv[3])) {
  const ctx = await browser.newContext({ ...opts, recordVideo: { dir: OUT, size: opts.viewport } })
  await ctx.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => new AudioContext().createMediaStreamDestination().stream
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  const marks = []
  const t0 = Date.now()
  const mark = (name) => marks.push([name, (Date.now() - t0) / 1000])
  const C = (fn, a) => page.evaluate(fn, a)
  const tap = (sel) => (opts.hasTouch ? page.tap(sel) : page.click(sel))
  await page.goto(base, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__castella?.ready, null, { timeout: 60000 })
  await page.waitForTimeout(1800)
  mark('ready')
  await C(() => window.__castella.cutWorld(0.075, -0.07, 0.075, 0.07))
  await page.waitForFunction(() => !window.__castella.busy, null, { timeout: 10000 })
  await page.waitForTimeout(600)
  await tap('#candle')
  mark('placing')
  await page.waitForTimeout(700)
  const at = await C(() => window.__castella.screen(-0.03, 0.0605, 0.004))
  if (opts.hasTouch) await page.touchscreen.tap(at.x, at.y)
  else await page.mouse.click(at.x, at.y)
  mark('tap')
  await page.waitForTimeout(2600)
  await tap('.blow')
  await page.waitForSelector('.sheet.open')
  mark('card')
  await page.waitForTimeout(900)
  await tap('.allow')
  await page.waitForFunction(() => window.__castella.birthday.breath.status === 'granted')
  await page.waitForTimeout(900)
  const b = await page.locator('.blow').boundingBox()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await page.mouse.down()
  mark('hold')
  // a breath that builds: a gentle bend, then strain, then a firm puff
  for (const [u, ms] of [[0.6, 700], [1.3, 1200], [2.1, 1100]]) {
    await C((u) => (window.__castella.birthday.breath.forced = u), u)
    mark(`breath ${u} m/s`)
    await page.waitForTimeout(ms)
    if (!(await C(() => window.__castella.birthday.flame.lit))) break
  }
  await C(() => (window.__castella.birthday.breath.forced = 3.6))
  mark('breath 3.6 m/s')
  await page.waitForFunction(() => !window.__castella.birthday.flame.lit, null, { timeout: 10000 })
  mark('out')
  await C(() => (window.__castella.birthday.breath.forced = null))
  await page.mouse.up()
  await page.waitForTimeout(5600)
  await tap('.relight')
  mark('relight')
  await page.waitForTimeout(2400)
  // carry the lit piece a little way: the flame trails behind the moving candle
  const grab = await C(() => window.__castella.screen(-0.06, 0.0605, 0.02))
  await page.mouse.move(grab.x, grab.y)
  await page.mouse.down()
  await page.waitForTimeout(500)
  mark('carry')
  for (let i = 1; i <= 30; i++) {
    await page.mouse.move(grab.x - i * 3, grab.y - i * 1.5)
    await page.waitForTimeout(33)
  }
  await page.waitForTimeout(600)
  await page.mouse.up()
  await page.waitForTimeout(1800)
  // the knife comes down on the candle
  const pos = await C(() => { const p = window.__castella.birthday.candle.object.getWorldPosition(window.__castella.birthday.root.clone()); return [p.x, p.z] })
  await C(([x]) => window.__castella.cutWorld(x, -0.07, x, 0.07), pos)
  mark('knock')
  await page.waitForTimeout(3500)
  const video = page.video()
  await ctx.close()
  const file = path.join(OUT, `${dev}.webm`)
  fs.renameSync(await video.path(), file)
  fs.writeFileSync(path.join(OUT, `${dev}-marks.json`), JSON.stringify(marks, null, 1))

  // strips: from the tap, one frame every 0.5 s
  const start = Math.max(0, marks.find((m) => m[0] === 'tap')[1] - 0.3)
  const w = dev === 'phone' ? 156 : 320
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(start), '-i', file, '-vf', `fps=2,scale=${w}:-1,tile=10x6:padding=4:color=white`, '-frames:v', '1', path.join(OUT, `${dev}-strip.jpg`)])
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(start), '-i', file, '-vf', `fps=12,scale=${dev === 'phone' ? 300 : 640}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160[p];[b][p]paletteuse=dither=sierra2_4a`, path.join(OUT, `${dev}.gif`)])
  console.log(dev, marks.map(([n, t]) => `${n}@${t.toFixed(1)}s`).join('  '), errors.length ? 'ERRORS ' + errors.join(' | ') : '')
}
await browser.close()
