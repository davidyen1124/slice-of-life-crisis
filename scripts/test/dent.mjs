import { chromium } from 'playwright'
const OUT = '/private/tmp/claude-501/-Users-david-Projects/9561414f-ff56-5075-a687-5df1a11e430e/scratchpad/seq'
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-angle=metal'] })
const page = await browser.newPage({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 2 })
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
await page.goto('http://localhost:5190/?qa')
await page.waitForFunction(() => window.__castella?.ready, null, { timeout: 120000 })
const C = (fn, ...a) => page.evaluate(fn, ...a)
await C(() => { document.getElementById('page').style.display = 'none'; const v = window.__castella.view; v.az = 0.21; v.el = -0.32; v.zoom = 0.42 })
await page.waitForTimeout(1500)
await C(() => { window.__castella.pause(); window.__castella.cutWorld(0.02, -0.08, 0.02, 0.08) })
for (const [n, name] of [[38, 'dent-a'], [2, 'dent-b'], [3, 'dent-c'], [70, 'dent-d']]) {
  await C((n) => window.__castella.step(n), n)
  await page.screenshot({ path: `${OUT}/${name}.png` })
}
await browser.close()
