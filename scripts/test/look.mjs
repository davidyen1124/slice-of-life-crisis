// screenshots: the first view, then a few cuts, on a given viewport
import { chromium } from 'playwright'
const [name, W, H, DPR, touch] = [process.argv[2] || 'desk', +(process.argv[3] || 1440), +(process.argv[4] || 900), +(process.argv[5] || 2), process.argv[6] === 'touch']
const OUT = process.argv[7] || '/private/tmp/claude-501/-Users-david-Projects/9561414f-ff56-5075-a687-5df1a11e430e/scratchpad/look'
import fs from 'node:fs'
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-angle=metal'] })
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, hasTouch: touch, isMobile: touch })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && console.log('[' + m.type() + ']', m.text()))
await page.goto('http://localhost:5190/?qa')
await page.waitForFunction(() => window.__castella?.ready, null, { timeout: 120000 })
await page.waitForTimeout(1800)
await page.screenshot({ path: `${OUT}/${name}-1.png` })
const C = (fn, ...a) => page.evaluate(fn, ...a)
const waitIdle = async () => { await page.waitForFunction(() => !window.__castella.busy, null, { timeout: 30000 }); await page.waitForTimeout(900) }
await C(() => window.__castella.cutWorld(0.105, -0.08, 0.105, 0.08))
await page.waitForTimeout(700)
await page.screenshot({ path: `${OUT}/${name}-2-knife.png` })
await waitIdle()
await page.screenshot({ path: `${OUT}/${name}-3-cut.png` })
await C(() => window.__castella.cutWorld(0.084, -0.08, 0.084, 0.08))
await waitIdle()
await C(() => window.__castella.cutWorld(0.06, -0.08, 0.06, 0.08))
await waitIdle()
await C(() => window.__castella.cutWorld(-0.04, -0.08, -0.04, 0.08))
await waitIdle()
await page.waitForTimeout(1000)
await page.screenshot({ path: `${OUT}/${name}-4-cuts.png` })
console.log(JSON.stringify(await C(() => window.__castella.info())))
await browser.close()
