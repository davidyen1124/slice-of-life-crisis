// drives the page with a real mouse: swipe to cut, hold to press, drag to lift, orbit, zoom, reset, buttons
import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = '/private/tmp/claude-501/-Users-david-Projects/9561414f-ff56-5075-a687-5df1a11e430e/scratchpad/input'
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-angle=metal'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 })
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errs.push(m.text()))
await page.goto('http://localhost:5190/?qa')
await page.waitForFunction(() => window.__castella?.ready, null, { timeout: 120000 })
await page.waitForTimeout(1200)
const C = (fn, ...a) => page.evaluate(fn, ...a)
const S = (x, y, z) => C(([x, y, z]) => window.__castella.screen(x, y, z), [x, y, z])
const idle = async () => { await page.waitForFunction(() => !window.__castella.busy, null, { timeout: 30000 }); await page.waitForTimeout(1000) }
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` })
const swipe = async (a, b, steps = 14) => { await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps }); await page.mouse.up() }

// 1. swipe across the loaf near its right end, from behind to in front
let a = await S(0.1, 0.0605, -0.07), b = await S(0.1, 0.0605, 0.07)
await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 6 })
await shot('1-stroke')
await page.mouse.move(b.x, b.y, { steps: 6 }); await page.mouse.up()
await page.waitForTimeout(500)
await shot('2-knife')
await idle()
await shot('3-cut')
console.log('after swipe: pieces', await C(() => window.__castella.pieces), 'cuts', await C(() => window.__castella.cuts))

// 2. a diagonal swipe across the middle
a = await S(-0.02, 0.0605, -0.07); b = await S(0.03, 0.0605, 0.07)
await swipe(a, b)
await idle()
await shot('4-diagonal')
console.log('after diagonal: pieces', await C(() => window.__castella.pieces))

// 3. a swipe that misses the cake does nothing
a = await S(-0.2, 0, 0.17); b = await S(-0.1, 0, 0.17)
await swipe(a, b)
await page.waitForTimeout(400)
console.log('after miss: busy', await C(() => window.__castella.busy), 'pieces', await C(() => window.__castella.pieces))

// 4. press and hold on the big piece: the sponge gives
const p = await S(-0.08, 0.0605, 0)
await page.mouse.move(p.x, p.y); await page.mouse.down()
await page.waitForTimeout(700)
await shot('5-press')
// 5. then drag: the piece is lifted and carried
await page.mouse.move(p.x + 60, p.y - 30, { steps: 10 })
await page.waitForTimeout(500)
await page.mouse.move(p.x + 140, p.y + 20, { steps: 12 })
await page.waitForTimeout(400)
await shot('6-lift')
await page.mouse.up()
await page.waitForTimeout(1500)
await shot('7-dropped')

// 6. orbit with the right button, zoom with the wheel, double-click to put the view back
await page.mouse.move(640, 600); await page.mouse.down({ button: 'right' }); await page.mouse.move(400, 520, { steps: 10 }); await page.mouse.up({ button: 'right' })
await page.mouse.wheel(0, -300)
await page.waitForTimeout(900)
await shot('8-orbit')
await page.mouse.dblclick(80, 700)
await page.waitForTimeout(1200)
await shot('9-reset')

// 7. the buttons
await page.click('#sound'); console.log('sound pressed', await page.getAttribute('#sound', 'aria-pressed'))
await page.click('#sound'); console.log('sound pressed', await page.getAttribute('#sound', 'aria-pressed'))
await page.click('#again')
await page.waitForTimeout(300)
await shot('10-new-falling')
await page.waitForTimeout(1500)
await shot('11-new')
console.log('after new loaf: pieces', await C(() => window.__castella.pieces), 'count', await page.textContent('#count'), 'again hidden', await page.isHidden('#again'))
console.log('errors', JSON.stringify(errs))
await browser.close()
