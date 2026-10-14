import { chromium } from 'playwright'
const [W, H, DPR] = [+(process.argv[2] || 390), +(process.argv[3] || 844), 2]
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-angle=metal'] })
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DPR })
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
page.on('console', (m) => m.text().startsWith('[') || console.log('[c]', m.text()))
await page.goto('http://localhost:5190/?qa')
await page.waitForFunction(() => window.__castella?.ready, null, { timeout: 120000 })
const C = (fn, ...a) => page.evaluate(fn, ...a)
const idle = async () => { await page.waitForFunction(() => !window.__castella.busy, null, { timeout: 30000 }); await page.waitForTimeout(1500) }
for (const x of [0.105, 0.084, 0.06, -0.04]) {
  await C((x) => window.__castella.cutWorld(x, -0.08, x, 0.08), x)
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(250)
    const s = await C(() => window.__castella.info().map((p) => p.vol + '@' + p.y).join(' '))
    console.log('cut', x, 't', i, s)
  }
  await idle()
}
await browser.close()
