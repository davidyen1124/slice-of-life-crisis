// opens the page in Chromium, reports frame timings by part, and takes a screenshot
import { chromium } from 'playwright'
const url = process.argv[2] || 'http://localhost:5190/?qa'
const out = process.argv[3] || '/tmp/perf.png'
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'], headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
page.on('console', (m) => console.log('[console]', m.type(), m.text()))
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
const t0 = Date.now()
await page.goto(url)
await page.waitForFunction(() => window.__castella?.ready, null, { timeout: 120000 })
console.log('ready in', Date.now() - t0, 'ms')
const r = await page.evaluate(async () => {
  const gl = document.getElementById('scene').getContext('webgl2')
  const dbg = gl.getExtension('WEBGL_debug_renderer_info')
  const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '?'
  const t0 = performance.now()
  await new Promise((res) => { let n = 0; const f = () => (++n < 20 ? requestAnimationFrame(f) : res()); requestAnimationFrame(f) })
  return { renderer, msPerFrame: (performance.now() - t0) / 20 }
})
console.log(JSON.stringify(r))
await page.screenshot({ path: out })
await browser.close()
