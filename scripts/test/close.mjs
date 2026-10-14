// close-ups of cut faces and of slices laid over
import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = '/private/tmp/claude-501/-Users-david-Projects/9561414f-ff56-5075-a687-5df1a11e430e/scratchpad/close'
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-angle=metal'] })
const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 2 })
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
await page.goto('http://localhost:5190/?qa')
await page.waitForFunction(() => window.__castella?.ready, null, { timeout: 120000 })
const C = (fn, ...a) => page.evaluate(fn, ...a)
const idle = async () => { await page.waitForFunction(() => !window.__castella.busy, null, { timeout: 30000 }); await page.waitForTimeout(1200) }
await C(() => { document.getElementById('page').style.display = 'none' })
for (const x of [0.112, 0.09, 0.066]) { await C((x) => window.__castella.cutWorld(x, -0.08, x, 0.08), x); await idle() }
await page.screenshot({ path: `${OUT}/a-overview.png` })
await C(() => { const v = window.__castella.view; v.az = 0.75; v.el = 0.05; v.zoom = 0.55 })
await page.waitForTimeout(1500)
await page.screenshot({ path: `${OUT}/b-close.png` })
await C(() => { const v = window.__castella.view; v.az = 1.25; v.el = -0.1; v.zoom = 0.62 })
await page.waitForTimeout(1500)
await page.screenshot({ path: `${OUT}/c-side.png` })
console.log(JSON.stringify(await C(() => window.__castella.info())))
await browser.close()
