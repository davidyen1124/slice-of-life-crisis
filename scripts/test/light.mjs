import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = '/private/tmp/claude-501/-Users-david-Projects/9561414f-ff56-5075-a687-5df1a11e430e/scratchpad/light'
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-angle=metal'] })
const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 })
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
await page.goto('http://localhost:5190/?qa')
await page.waitForFunction(() => window.__castella?.ready, null, { timeout: 120000 })
await page.waitForTimeout(1500)
const variants = JSON.parse(process.argv[2] || '[]')
for (const v of variants) {
  await page.evaluate((v) => {
    const st = window.__castella.stage
    st.scene.environmentIntensity = v.env ?? 0.42
    st.sun.intensity = v.sun ?? 30
    st.bounce.intensity = v.bounce ?? 0.35
    st.finish.uniforms.uExposure.value = v.exp ?? 1
    document.getElementById('page').style.display = 'none'
  }, v)
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/${v.name}.png` })
}
console.log(await page.evaluate(() => { const s = window.__castella.stage.sun; return JSON.stringify({ castShadow: s.castShadow, map: !!s.map, pos: s.position, shadowMap: s.shadow.map ? [s.shadow.map.width, s.shadow.map.height] : null }) }))
await browser.close()
