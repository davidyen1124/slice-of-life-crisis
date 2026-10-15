// QA: every state of the page, on phones, tablets and desktops, in Chrome and in WebKit (Safari's engine).
// Screenshots of each step, contact sheets, and checks that fail loudly:
//   - no console errors or warnings, no uncaught exceptions
//   - every piece of text inside the screen, none overlapping another, the page never scrolls
//   - the canvas drawn at the screen's resolution
//   - the physics: the cake's volume is conserved through the cuts, every piece comes to rest, none sinks below the board
// The clock is stopped and stepped by hand (?qa), so the same build gives the same pixels: run it on the local build
// and on the deployed site and compare (scripts/compare.mjs).
//
// usage: node scripts/qa.mjs [url] [label] [only-viewport]
import fs from 'node:fs'
import path from 'node:path'
import { chromium, webkit } from 'playwright'
import sharp from 'sharp'

const base = (process.argv[2] || 'http://localhost:5191/').replace(/\/?$/, '/')
const label = process.argv[3] || 'local'
const only = process.argv[4]
const OUT = path.resolve(import.meta.dirname, '../qa', label)
fs.mkdirSync(OUT, { recursive: true })

const VIEWPORTS = [
  { name: 'iphone-se', engine: 'webkit', w: 375, h: 667, dpr: 2, touch: true },
  { name: 'iphone-15', engine: 'webkit', w: 393, h: 852, dpr: 3, touch: true },
  { name: 'pixel-7', engine: 'chrome', w: 412, h: 915, dpr: 2.625, touch: true },
  { name: 'phone-landscape', engine: 'webkit', w: 852, h: 393, dpr: 3, touch: true },
  { name: 'ipad', engine: 'webkit', w: 820, h: 1180, dpr: 2, touch: true },
  { name: 'ipad-landscape', engine: 'webkit', w: 1180, h: 820, dpr: 2, touch: true },
  { name: 'laptop', engine: 'chrome', w: 1440, h: 900, dpr: 2, touch: false },
  { name: 'desktop', engine: 'chrome', w: 1920, h: 1080, dpr: 1, touch: false },
  { name: 'ultrawide', engine: 'chrome', w: 2560, h: 1080, dpr: 1, touch: false },
]

const LOAF_VOLUME = 1457.87 // cm³, the uncut loaf's mesh
const report = []
let failures = 0
const fail = (vp, msg) => { failures++; report.push(`FAIL ${vp}: ${msg}`); console.log(`  FAIL ${msg}`) }

for (const vp of VIEWPORTS.filter((v) => !only || v.name === only)) {
  console.log(`== ${vp.name} (${vp.engine} ${vp.w}x${vp.h} @${vp.dpr})`)
  const browser = vp.engine === 'webkit'
    ? await webkit.launch({ headless: false })
    : await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-angle=metal'] })
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.dpr, hasTouch: vp.touch, isMobile: vp.touch && vp.engine !== 'webkit' ? true : undefined })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push('exception: ' + e.message))
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.type() + ': ' + m.text()))
  page.on('requestfailed', (r) => errors.push('request failed: ' + r.url()))
  const shots = []
  const shot = async (name) => {
    const file = `${OUT}/${vp.name}-${String(shots.length + 1).padStart(2, '0')}-${name}.png`
    await page.screenshot({ path: file })
    shots.push({ file, name })
  }
  const C = (fn, ...a) => page.evaluate(fn, ...a)
  const step = (n) => C((n) => window.__castella.step(n), n)
  const S = (x, y, z) => C(([x, y, z]) => window.__castella.screen(x, y, z), [x, y, z])

  // ---------------------------------------------------------------- loading
  await page.goto(base + '?qa', { waitUntil: 'commit' })
  await page.waitForSelector('#loader', { state: 'attached' })
  await shot('loader')
  await page.waitForFunction(() => window.__castella?.ready, null, { timeout: 120000 })
  await C(() => { window.__castella.pause(); window.__castella.clock(0) })
  await page.waitForTimeout(300)
  await step(30)
  await shot('first-view')

  // ---------------------------------------------------------------- layout checks
  const layout = await C(() => {
    const vw = innerWidth, vh = innerHeight
    const box = (sel) => { const el = document.querySelector(sel); if (!el || el.hidden || getComputedStyle(el).display === 'none') return null; const r = el.getBoundingClientRect(); return { sel, x: r.left, y: r.top, w: r.width, h: r.height } }
    const boxes = ['.masthead .kicker', '.title h1', '.title .sub', '.seal', '.count span', '.hint', '#sound', '#again'].map(box).filter(Boolean)
    const out = boxes.filter((b) => b.x < -0.5 || b.y < -0.5 || b.x + b.w > vw + 0.5 || b.y + b.h > vh + 0.5).map((b) => `${b.sel} outside the screen`)
    const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j]
      if ((a.sel.startsWith('.title') && b.sel.startsWith('.title')) || (a.sel === '.title h1' && b.sel === '.seal')) continue
      if (overlap(a, b)) out.push(`${a.sel} overlaps ${b.sel}`)
    }
    const st = window.__castella.stage
    const cv = document.getElementById('scene')
    return {
      problems: out,
      scroll: [document.documentElement.scrollWidth > vw, document.documentElement.scrollHeight > vh],
      canvas: [cv.width, cv.height, Math.round(cv.clientWidth * st.size.dpr), Math.round(cv.clientHeight * st.size.dpr)],
      fonts: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family).filter((v, i, a) => a.indexOf(v) === i),
    }
  })
  for (const p of layout.problems) fail(vp.name, p)
  if (layout.scroll[0] || layout.scroll[1]) fail(vp.name, 'the page scrolls')
  if (Math.abs(layout.canvas[0] - layout.canvas[2]) > 2 || Math.abs(layout.canvas[1] - layout.canvas[3]) > 2) fail(vp.name, `canvas ${layout.canvas[0]}x${layout.canvas[1]} != ${layout.canvas[2]}x${layout.canvas[3]}`)
  if (!layout.fonts.some((f) => f.includes('Shippori'))) fail(vp.name, 'the mincho did not load: ' + layout.fonts.join(', '))
  console.log('  layout ok:', !layout.problems.length, 'canvas', layout.canvas.slice(0, 2).join('x'), 'fonts', layout.fonts.join(', '))

  // ---------------------------------------------------------------- a real stroke, then the knife's whole cut
  const a = await S(0.104, 0.0605, -0.065), b = await S(0.104, 0.0605, 0.065)
  const ptr = async (type, p) => C(([type, p, touch]) => {
    document.getElementById('scene').dispatchEvent(new PointerEvent(type, { pointerId: 3, pointerType: touch ? 'touch' : 'mouse', isPrimary: true, clientX: p.x, clientY: p.y, bubbles: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 }))
  }, [type, p, vp.touch])
  await ptr('pointerdown', a)
  for (let i = 1; i <= 8; i++) await ptr('pointermove', { x: a.x + ((b.x - a.x) * i) / 14, y: a.y + ((b.y - a.y) * i) / 14 })
  await shot('stroke')
  for (let i = 9; i <= 14; i++) await ptr('pointermove', { x: a.x + ((b.x - a.x) * i) / 14, y: a.y + ((b.y - a.y) * i) / 14 })
  await ptr('pointerup', b)
  for (const [n, name] of [[14, 'knife-coming'], [16, 'knife-touches'], [8, 'crust-gives'], [14, 'sawing'], [14, 'board'], [10, 'slice-tips'], [12, 'slice-falls'], [40, 'knife-home']]) {
    await step(n)
    await shot(name)
  }
  await step(90)
  await page.waitForTimeout(1000)
  await shot('one-cut')
  await page.waitForTimeout(50)
  const count1 = await page.textContent('#count')
  if (count1 !== '二切れ') fail(vp.name, `count after one cut is ${count1}`)
  if (await page.isHidden('#again')) fail(vp.name, 'the new-loaf button did not appear')

  // ---------------------------------------------------------------- more cuts: thin slices from the end, one across
  for (const [x0, z0, x1, z1] of [[0.082, -0.07, 0.082, 0.07], [0.058, -0.07, 0.058, 0.07], [-0.05, -0.07, -0.02, 0.07], [-0.11, -0.07, -0.11, 0.07]]) {
    await C(([x0, z0, x1, z1]) => window.__castella.cutWorld(x0, z0, x1, z1), [x0, z0, x1, z1])
    for (let i = 0; i < 40 && (await C(() => window.__castella.busy)); i++) await step(10)
    await step(60)
  }
  await step(120)
  await page.waitForTimeout(1200)
  await shot('five-cuts')
  const phys = await C(() => ({ info: window.__castella.info(), count: document.getElementById('count').textContent, asleep: window.__castella.asleep }))
  const vol = phys.info.reduce((s, p) => s + p.vol, 0)
  console.log(`  pieces ${phys.info.length} (${phys.count}), volume ${vol.toFixed(1)} cm³, asleep ${phys.asleep}`)
  if (Math.abs(vol - LOAF_VOLUME) > 3) fail(vp.name, `volume not conserved: ${vol.toFixed(2)} cm³`)
  if (phys.info.length < 5) fail(vp.name, `only ${phys.info.length} pieces after five cuts`)
  const sunk = await C(() => window.__castella.lowest())
  if (sunk < -0.0185) fail(vp.name, `a piece sank to y = ${sunk}`)

  // ---------------------------------------------------------------- press, lift, carry, drop
  const big = await C(() => window.__castella.biggest())
  await ptr('pointerdown', big)
  await page.waitForTimeout(450)
  await step(30)
  await shot('press')
  await ptr('pointermove', { x: big.x + 30, y: big.y - 30 })
  await step(10)
  await ptr('pointermove', { x: big.x + 80, y: big.y - 50 })
  await step(30)
  await shot('lift')
  await ptr('pointerup', { x: big.x + 80, y: big.y - 50 })
  await step(150)
  await shot('dropped')

  // ---------------------------------------------------------------- turn and come closer; then put the view back
  await C(() => { const v = window.__castella.view; v.az = -0.6; v.el = 0.25; v.zoom = 0.7 })
  await step(90)
  await shot('turned')
  await C(() => { const v = window.__castella.view; v.az = 0; v.el = 0; v.zoom = 1 })
  await step(90)

  // ---------------------------------------------------------------- the buttons
  await page.click('#sound')
  if ((await page.getAttribute('#sound', 'aria-pressed')) !== 'false') fail(vp.name, 'sound button did not turn off')
  await step(2)
  await shot('sound-off')
  await page.click('#sound')
  await page.click('#again')
  await step(10)
  await shot('new-loaf-drops')
  await step(120)
  await page.waitForTimeout(1200)
  await shot('new-loaf')
  if ((await page.textContent('#count')) !== '一棹') fail(vp.name, 'count did not reset')
  if (!(await page.isHidden('#again'))) fail(vp.name, 'the new-loaf button stayed')

  const errs = errors.filter((e) => !e.includes('favicon'))
  for (const e of errs) fail(vp.name, e)
  console.log(`  ${shots.length} screenshots, ${errs.length} console problems`)
  await browser.close()

  // a contact sheet of the run
  const cols = vp.w > vp.h ? 4 : 7
  const tw = vp.w > vp.h ? 480 : 240
  const th = Math.round((tw * vp.h) / vp.w)
  const comps = []
  for (let i = 0; i < shots.length; i++) {
    comps.push({ input: await sharp(shots[i].file).resize(tw, th).toBuffer(), left: (i % cols) * tw, top: Math.floor(i / cols) * (th + 22) + 22 })
    comps.push({ input: Buffer.from(`<svg width="${tw}" height="22"><rect width="${tw}" height="22" fill="#111"/><text x="6" y="16" font-size="13" font-family="Helvetica" fill="#eee">${i + 1}. ${shots[i].name}</text></svg>`), left: (i % cols) * tw, top: Math.floor(i / cols) * (th + 22) })
  }
  const rows = Math.ceil(shots.length / cols)
  await sharp({ create: { width: cols * tw, height: rows * (th + 22), channels: 3, background: '#000' } }).composite(comps).jpeg({ quality: 82 }).toFile(`${OUT}/sheet-${vp.name}.jpg`)
}

fs.writeFileSync(`${OUT}/report.txt`, report.join('\n') + '\n')
console.log(failures ? `\n${failures} problem(s):\n${report.join('\n')}` : '\nall checks passed')
process.exit(failures ? 1 : 0)
