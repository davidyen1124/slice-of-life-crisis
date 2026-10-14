// the page in WebKit (Safari's engine) on an iPhone-sized touch screen: loads, renders, cuts with a real touch swipe
import { webkit, devices } from 'playwright'
import fs from 'node:fs'
const OUT = '/private/tmp/claude-501/-Users-david-Projects/9561414f-ff56-5075-a687-5df1a11e430e/scratchpad/webkit'
fs.mkdirSync(OUT, { recursive: true })
const url = process.argv[2] || 'http://localhost:5190/?qa'
const browser = await webkit.launch({ headless: false })
const ctx = await browser.newContext({ ...devices['iPhone 15'] })
const page = await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push('pageerror ' + e.message))
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errs.push(m.type() + ' ' + m.text()))
const t0 = Date.now()
await page.goto(url)
await page.waitForFunction(() => window.__castella?.ready, null, { timeout: 120000 })
console.log('ready in', Date.now() - t0, 'ms', await page.evaluate(() => { const gl = document.getElementById('scene').getContext('webgl2'); return [gl.getParameter(gl.VERSION), window.__castella.stage.rt.texture.type, window.__castella.stage.size] }))
await page.waitForTimeout(1500)
await page.screenshot({ path: `${OUT}/1.png` })
// a one-finger swipe, as touch events
const S = (x, y, z) => page.evaluate(([x, y, z]) => window.__castella.screen(x, y, z), [x, y, z])
const a = await S(0.1, 0.0605, -0.06), b = await S(0.1, 0.0605, 0.06)
const touch = async (type, pts) => page.evaluate(([type, pts]) => {
  const el = document.getElementById('scene')
  const ev = new PointerEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: pts.x, clientY: pts.y, bubbles: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 })
  el.dispatchEvent(ev)
}, [type, pts])
await touch('pointerdown', a)
for (let i = 1; i <= 12; i++) { await touch('pointermove', { x: a.x + ((b.x - a.x) * i) / 12, y: a.y + ((b.y - a.y) * i) / 12 }); await page.waitForTimeout(16) }
await touch('pointerup', b)
await page.waitForTimeout(800)
await page.screenshot({ path: `${OUT}/2-knife.png` })
await page.waitForFunction(() => !window.__castella.busy, null, { timeout: 30000 })
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/3-cut.png` })
console.log('pieces', await page.evaluate(() => window.__castella.pieces))
const perf = await page.evaluate(async () => { const t0 = performance.now(); await new Promise((r) => { let n = 0; const f = () => (++n < 60 ? requestAnimationFrame(f) : r()); requestAnimationFrame(f) }); return (performance.now() - t0) / 60 })
console.log('ms/frame', perf.toFixed(1))
console.log('errors', JSON.stringify(errs))
await browser.close()
