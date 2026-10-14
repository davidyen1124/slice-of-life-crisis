// real frame rate in a visible Chrome window (vsync on): ms per frame for a few configurations
import { chromium } from 'playwright'
const [W, H, DPR] = [+(process.argv[2] || 1512), +(process.argv[3] || 860), +(process.argv[4] || 2)]
const qs = process.argv[5] || ''
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-angle=metal'] })
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DPR })
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
page.on('console', (m) => m.type() === 'error' && console.log('[error]', m.text()))
await page.goto('http://localhost:5190/?qa' + qs)
await page.waitForFunction(() => window.__castella?.ready, null, { timeout: 120000 })
await page.waitForTimeout(1500)
const r = await page.evaluate(async () => {
  const st = window.__castella.stage, R = st.renderer
  const frames = (n) => new Promise((res) => { const t0 = performance.now(); let k = 0; const f = () => (++k < n ? requestAnimationFrame(f) : res((performance.now() - t0) / n)); requestAnimationFrame(f) })
  const time = async (label, fn, undo) => { fn && fn(); await frames(10); const ms = await frames(60); undo && undo(); return label + ': ' + ms.toFixed(1) }
  const out = [document.visibilityState, st.rt.width + 'x' + st.rt.height]
  out.push(await time('full'))
  out.push(await time('no dof', () => (st.finish.uniforms.uTaps.value = 0), () => (st.finish.uniforms.uTaps.value = 22)))
  out.push(await time('no shadows', () => { R.shadowMap.enabled = false }, () => { R.shadowMap.enabled = true }))
  const cast = st.scene.children.filter((o) => o.userData?.piece)
  out.push(await time('no cake', () => cast.forEach((o) => (o.visible = false)), () => cast.forEach((o) => (o.visible = true))))
  return out
})
console.log(r.join(' | '))
await browser.close()
