// QA: every state of the page, on phones, tablets and desktops, in Chrome and in WebKit (Safari's engine).
// Screenshots of each step, contact sheets, and checks that fail loudly:
//   - no console errors or warnings, no uncaught exceptions
//   - every piece of text inside the screen, none overlapping another, the page never scrolls
//   - the canvas drawn at the screen's resolution
//   - the physics: the cake's volume is conserved through the cuts, every piece comes to rest, none sinks below the board
//   - the birthday: the candle goes in where it is tapped and lights, the room goes dark, the microphone card, a breath
//     bends the flame, strains it and blows it out, the smoke, Happy Birthday, the lights back up, Relight; the knife
//     knocking the candle over; a birthday link (?name=) with the microphone refused, blown out by holding the button
// The clock is stopped and stepped by hand (?qa), so the same build gives the same pixels: run it on the local build
// and on the deployed site and compare (scripts/compare.mjs). The first twenty screens are the slicing alone.
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

// every visible block of the page's text and controls: inside the screen, and no two overlapping
function audit() {
  const vis = (el) => {
    if (!el || el.hidden) return false
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const cs = getComputedStyle(e)
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return false
    }
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }
  const blocks = {
    kicker: '.masthead .kicker', title: '.title h1', sub: '.title .sub', count: '.count span', hint: '#hint', place: '.hint.place',
    sound: '#sound', again: '#again', candle: '#candle', caption: '.caption', control: '.control', relight: '.relight',
    happy: '.headline .l1', birthday: '.headline .l2', name: '.hb-name', jp: '.jp-sub', toast: '.toast', card: '.sheet .card',
  }
  const W = innerWidth, H = innerHeight
  const boxes = {}
  for (const [k, sel] of Object.entries(blocks)) {
    const el = document.querySelector(sel)
    if (vis(el)) boxes[k] = el.getBoundingClientRect().toJSON()
  }
  const issues = []
  for (const [k, b] of Object.entries(boxes)) {
    if (b.left < -0.5 || b.top < -0.5 || b.right > W + 0.5 || b.bottom > H + 0.5) issues.push(`${k} outside the screen ${JSON.stringify([b.left, b.top, b.right, b.bottom].map(Math.round))}`)
  }
  const together = new Set(['title|sub', 'happy|birthday', 'happy|name', 'birthday|name', 'happy|jp', 'birthday|jp', 'name|jp'])
  const keys = Object.keys(boxes)
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    const [a, b] = [keys[i], keys[j]]
    if (together.has(`${a}|${b}`) || together.has(`${b}|${a}`) || a === 'card' || b === 'card') continue
    const A = boxes[a], B = boxes[b]
    const ox = Math.min(A.right, B.right) - Math.max(A.left, B.left), oy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top)
    if (ox > 1 && oy > 1) issues.push(`${a} overlaps ${b} (${Math.round(ox)}x${Math.round(oy)})`)
  }
  for (const el of document.querySelectorAll('.label, .caption, .relight, .headline span, .jp-sub, .toast, .card h2, .card p, .card button, .hint span')) {
    if (vis(el) && el.scrollWidth > el.clientWidth + 1) issues.push(`clipped text: "${el.textContent.slice(0, 24)}"`)
  }
  // the cover line stays clear of the candle's flame
  const c = window.__castella
  const b = c.birthday
  if (b.candle && b.candle.state !== 'none') {
    const f = c.screen(b.root.x, b.root.y + 0.012, b.root.z)
    for (const k of ['happy', 'birthday', 'name', 'jp']) {
      const r = boxes[k]
      if (r && f.x > r.left && f.x < r.right && f.y > r.top && f.y < r.bottom) issues.push(`${k} covers the flame`)
    }
  }
  return issues
}

// the microphone, replaced: a quiet room (the breath is driven directly, so every frame is reproducible), or a refusal
async function fakeMic(ctx, mode) {
  await ctx.addInitScript((mode) => {
    const fake = async () => {
      if (mode === 'deny') throw new DOMException('Permission denied', 'NotAllowedError')
      const ac = new AudioContext()
      const o = ac.createOscillator(), g = ac.createGain()
      g.gain.value = 0.0005
      o.connect(g)
      const out = ac.createMediaStreamDestination()
      g.connect(out)
      o.start()
      return out.stream
    }
    // (WebKit only takes it on the prototype)
    if (window.MediaDevices) MediaDevices.prototype.getUserMedia = fake
    else Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: fake }, configurable: true })
  }, mode)
}
const report = []
const masks = {}
let failures = 0
const fail = (vp, msg) => { failures++; report.push(`FAIL ${vp}: ${msg}`); console.log(`  FAIL ${msg}`) }

for (const vp of VIEWPORTS.filter((v) => !only || v.name === only)) {
  console.log(`== ${vp.name} (${vp.engine} ${vp.w}x${vp.h} @${vp.dpr})`)
  const browser = vp.engine === 'webkit'
    ? await webkit.launch({ headless: false })
    : await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-angle=metal'] })
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.dpr, hasTouch: vp.touch, isMobile: vp.touch && vp.engine !== 'webkit' ? true : undefined })
  await fakeMic(ctx, 'allow')
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
  const check = async (name) => { for (const p of await C(audit)) fail(vp.name, `${name}: ${p}`) }

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
  // the candle button is new beside the slicing's own: compare.mjs leaves its square out when it compares with an
  // older build (with a pixel of margin for its soft edge)
  const cb = await C(() => document.getElementById('candle').getBoundingClientRect().toJSON())
  masks[vp.name] = [cb.left - 2, cb.top - 2, cb.right + 2, cb.bottom + 2].map((v) => Math.round(v * vp.dpr))

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
  if (!(await page.isHidden('#candle'))) fail(vp.name, 'the candle button stayed')

  // ---------------------------------------------------------------- the birthday: a candle where it is tapped
  await C(() => window.__castella.cutWorld(0.075, -0.07, 0.075, 0.07))
  for (let i = 0; i < 40 && (await C(() => window.__castella.busy)); i++) await step(10)
  await step(120)
  if (await page.isHidden('#candle')) fail(vp.name, 'the candle button did not appear after a cut')
  await page.click('#candle')
  await step(2)
  const B = (fn, a) => C(fn, a)
  const where = await S(-0.035, 0.0605, 0.004)
  if (!vp.touch) await ptr('pointermove', where) // a mouse over the cake shows where the candle would go
  await step(2)
  await shot('candle-placing')
  await check('placing')
  if (!vp.touch && !(await B(() => window.__castella.birthday.ghost.visible))) fail(vp.name, 'no candle shows where it would go')
  await ptr('pointerdown', where)
  await ptr('pointerup', where)
  await step(8)
  await shot('candle-going-in')
  const placed = await B(() => ({ state: window.__castella.birthday.candle.state, placing: document.body.classList.contains('placing') }))
  if (placed.state !== 'planted' || placed.placing) fail(vp.name, `the tap did not put the candle in: ${JSON.stringify(placed)}`)
  await step(30)
  await shot('candle-lights')
  await step(110)
  await page.waitForTimeout(400)
  await shot('lights-down')
  await check('lit')
  const lit = await B(() => ({ lit: window.__castella.birthday.flame.lit, dusk: window.__castella.stage.dusk, label: document.querySelector('.label').textContent }))
  if (!lit.lit) fail(vp.name, 'the candle did not light')
  if (lit.dusk < 0.99) fail(vp.name, `the lights did not go down (${lit.dusk})`)
  if (lit.label !== 'Enable mic') fail(vp.name, `label "${lit.label}"`)

  // the microphone card, allowed
  await page.click('.blow')
  await page.waitForSelector('.sheet.open')
  await page.waitForTimeout(300)
  await shot('mic-card')
  await check('card')
  await page.click('.allow')
  await page.waitForFunction(() => window.__castella.birthday.breath.status === 'granted')
  await page.waitForTimeout(450)
  await step(30)
  await shot('mic-ready')
  if ((await page.textContent('.label')) !== 'Hold & blow') fail(vp.name, 'label after the microphone: ' + (await page.textContent('.label')))

  // hold, and blow: a breath that bends the flame, one that strains it, one that puts it out
  const hold = (type) => C((type) => {
    const b = document.querySelector('.blow'), r = b.getBoundingClientRect()
    b.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 }))
  }, type)
  await hold('pointerdown')
  await step(20)
  if (!(await B(() => window.__castella.birthday.breath.holding))) fail(vp.name, 'holding the button did not hold')
  await B(() => (window.__castella.birthday.breath.forced = 1.3))
  await step(60)
  await shot('breath-bends-flame')
  await check('holding')
  if ((await page.textContent('.label')) !== 'Blow') fail(vp.name, 'label while holding: ' + (await page.textContent('.label')))
  if (!(await B(() => window.__castella.birthday.flame.lit))) fail(vp.name, 'a gentle breath put the flame out')
  await B(() => (window.__castella.birthday.breath.forced = 2.15))
  for (let i = 0; i < 120 && (await B(() => window.__castella.birthday.flame.vitality > 0.55)); i++) await step(2)
  await shot('breath-strains-flame')
  await B(() => (window.__castella.birthday.breath.forced = 3.4))
  let frames = 0
  for (; frames < 240 && (await B(() => window.__castella.birthday.flame.lit)); frames += 2) await step(2)
  await B(() => (window.__castella.birthday.breath.forced = null))
  await hold('pointerup')
  if (frames >= 240) fail(vp.name, 'a hard breath did not blow the candle out')
  await step(6)
  await shot('blown-out')
  await step(54)
  await shot('smoke-1s')
  await step(90)
  await page.waitForTimeout(300)
  await shot('happy-birthday')
  await check('wish')
  if (!(await B(() => document.body.classList.contains('wished')))) fail(vp.name, 'no Happy Birthday after the breath')
  if (!(await B(() => window.__castella.birthday.smoke.active))) fail(vp.name, 'no smoke after the flame went out')
  await step(240)
  await page.waitForTimeout(300)
  await shot('lights-up-relight')
  await check('relight')
  const up = await B(() => ({ dusk: window.__castella.stage.dusk, relight: document.body.classList.contains('relightable') }))
  if (up.dusk > 0.01) fail(vp.name, `the lights did not come back up (${up.dusk})`)
  if (!up.relight) fail(vp.name, 'no Relight')
  await page.click('.relight')
  await step(150)
  await page.waitForTimeout(300)
  await shot('relit')
  if (!(await B(() => window.__castella.birthday.flame.lit && !document.body.classList.contains('wished')))) fail(vp.name, 'Relight did not relight')

  // the knife comes down on the candle: it is knocked out of the cake and goes out
  await C(() => window.__castella.cutWorld(-0.035, -0.07, -0.035, 0.07))
  await step(26)
  await shot('knife-knocks-candle')
  for (let i = 0; i < 40 && (await C(() => window.__castella.busy)); i++) await step(10)
  await step(200)
  await page.waitForTimeout(300)
  await shot('candle-knocked-over')
  const knocked = await B(() => ({ state: window.__castella.birthday.candle.state, lit: window.__castella.birthday.flame.lit, dusk: window.__castella.stage.dusk }))
  if (knocked.state !== 'loose' || knocked.lit) fail(vp.name, `the knife did not knock the candle over: ${JSON.stringify(knocked)}`)
  const vol2 = (await C(() => window.__castella.info())).reduce((s, p) => s + p.vol, 0)
  if (Math.abs(vol2 - LOAF_VOLUME) > 3) fail(vp.name, `volume not conserved with the candle: ${vol2.toFixed(2)} cm³`)
  await page.click('#again')
  await step(150)
  await page.waitForTimeout(300)
  await shot('new-loaf-no-candle')
  const reset = await B(() => ({ state: window.__castella.birthday.candle.state, cls: document.body.className, dusk: window.__castella.stage.dusk }))
  if (reset.state !== 'none' || /candle-on|lit|wished|dusk/.test(reset.cls)) fail(vp.name, `a new loaf kept the candle: ${JSON.stringify(reset)}`)

  // ---------------------------------------------------------------- a birthday link, the microphone refused
  {
    const ctx2 = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.dpr, hasTouch: vp.touch, isMobile: vp.touch && vp.engine !== 'webkit' ? true : undefined })
    await fakeMic(ctx2, 'deny')
    const p2 = await ctx2.newPage()
    p2.on('pageerror', (e) => errors.push('exception: ' + e.message))
    p2.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.type() + ': ' + m.text()))
    await p2.goto(base + '?qa&name=Mika', { waitUntil: 'commit' })
    await p2.waitForFunction(() => window.__castella?.ready, null, { timeout: 120000 })
    await p2.evaluate(() => { window.__castella.pause(); window.__castella.clock(0) })
    await p2.waitForTimeout(300)
    const step2 = (n) => p2.evaluate((n) => window.__castella.step(n), n)
    const shot2 = async (name) => {
      const file = `${OUT}/${vp.name}-${String(shots.length + 1).padStart(2, '0')}-${name}.png`
      await p2.screenshot({ path: file })
      shots.push({ file, name })
      for (const p of await p2.evaluate(audit)) fail(vp.name, `${name}: ${p}`)
    }
    await step2(30)
    if (await p2.isHidden('#candle')) fail(vp.name, 'no candle button on a birthday link')
    await step2(200)
    await p2.waitForTimeout(300)
    await shot2('birthday-link-lit')
    if (!(await p2.evaluate(() => window.__castella.birthday.flame.lit))) fail(vp.name, 'a birthday link did not light its candle')
    await p2.click('.blow')
    await p2.waitForSelector('.sheet.open')
    await p2.click('.allow')
    await p2.waitForSelector('.toast:not([hidden])')
    await p2.waitForTimeout(450)
    await step2(20)
    await shot2('mic-refused-toast')
    const toast = await p2.textContent('.toast')
    if (!toast.includes('Hold to blow instead')) fail(vp.name, `toast "${toast}"`)
    if ((await p2.textContent('.label')) !== 'Hold to blow') fail(vp.name, 'label without a microphone: ' + (await p2.textContent('.label')))
    await p2.evaluate(() => {
      const b = document.querySelector('.blow'), r = b.getBoundingClientRect()
      b.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 8, pointerType: 'touch', isPrimary: true, clientX: r.x + 40, clientY: r.y + 40, bubbles: true, cancelable: true, button: 0, buttons: 1 }))
    })
    await step2(40)
    await shot2('holding-to-blow')
    let f2 = 0
    for (; f2 < 600 && (await p2.evaluate(() => window.__castella.birthday.flame.lit)); f2 += 5) await step2(5)
    if (f2 >= 600) fail(vp.name, 'holding the button did not blow the candle out')
    await p2.evaluate(() => document.querySelector('.blow').dispatchEvent(new PointerEvent('pointerup', { pointerId: 8, pointerType: 'touch', bubbles: true })))
    await step2(150)
    await p2.waitForTimeout(400)
    await shot2('happy-birthday-mika')
    if ((await p2.textContent('.hb-name')) !== 'Mika') fail(vp.name, 'the name is missing')
    await ctx2.close()
  }

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
fs.writeFileSync(`${OUT}/masks.json`, JSON.stringify(masks))
console.log(failures ? `\n${failures} problem(s):\n${report.join('\n')}` : '\nall checks passed')
process.exit(failures ? 1 : 0)
