import { chromium } from 'playwright'
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-angle=metal'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
await page.goto('http://localhost:5190/?qa')
await page.waitForFunction(() => window.__castella?.ready, null, { timeout: 120000 })
await page.waitForTimeout(800)
for (let i = 0; i < 3; i++) { await page.keyboard.press('Space'); await page.waitForTimeout(150) }
await page.waitForFunction(() => !window.__castella.busy, null, { timeout: 30000 })
await page.waitForTimeout(1500)
console.log('pieces', await page.evaluate(() => window.__castella.pieces), JSON.stringify(await page.evaluate(() => window.__castella.info().map((p) => p.vol))), 'errors', errs)
await page.screenshot({ path: '/private/tmp/claude-501/-Users-david-Projects/9561414f-ff56-5075-a687-5df1a11e430e/scratchpad/keys.png' })
await browser.close()
