// a strip of frames through one cut, close up
import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = '/private/tmp/claude-501/-Users-david-Projects/9561414f-ff56-5075-a687-5df1a11e430e/scratchpad/seq'
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-angle=metal'] })
const page = await browser.newPage({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 2 })
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
await page.goto('http://localhost:5190/?qa')
await page.waitForFunction(() => window.__castella?.ready, null, { timeout: 120000 })
const C = (fn, ...a) => page.evaluate(fn, ...a)
await C(() => { document.getElementById('page').style.display = 'none'; const v = window.__castella.view; v.az = 0.5; v.el = 0.12; v.zoom = 0.62 })
await page.waitForTimeout(1500)
await C(() => { window.__castella.pause(); window.__castella.cutWorld(0.115, -0.08, 0.115, 0.08) })
for (let i = 0; i < 24; i++) {
  await C(() => window.__castella.step(6))
  await page.screenshot({ path: `${OUT}/f${String(i).padStart(2, '0')}.png` })
}
await browser.close()
