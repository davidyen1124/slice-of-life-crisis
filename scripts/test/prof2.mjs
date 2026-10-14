import { chromium } from 'playwright'
const W = +(process.argv[2] || 1280), H = +(process.argv[3] || 800), DPR = +(process.argv[4] || 1)
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'], headless: true })
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DPR })
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
await page.goto('http://localhost:5190/?qa')
await page.waitForFunction(() => window.__castella?.ready, null, { timeout: 120000 })
const r = await page.evaluate(async () => {
  const C = window.__castella, st = C.stage, R = st.renderer
  const frames = (n) => new Promise((res) => { const t0 = performance.now(); let k = 0; const f = () => (++k < n ? requestAnimationFrame(f) : res((performance.now() - t0) / n)); requestAnimationFrame(f) })
  const time = async (label, fn, undo) => { fn && fn(); await frames(5); const ms = await frames(30); undo && undo(); return [label, +ms.toFixed(1)] }
  const out = []
  out.push(await time('full'))
  out.push(await time('no dof', () => (st.finish.uniforms.uTaps.value = 0), () => (st.finish.uniforms.uTaps.value = 22)))
  out.push(await time('no shadows', () => { R.shadowMap.enabled = false }, () => { R.shadowMap.enabled = true }))
  const cast = st.scene.children.filter((o) => o.userData?.piece)
  out.push(await time('no cake', () => cast.forEach((o) => (o.visible = false)), () => cast.forEach((o) => (o.visible = true))))
  out.push(await time('sun off', () => (st.sun.visible = false), () => (st.sun.visible = true)))
  const sc = st.scene
  out.push(await time('empty scene', () => sc.children.forEach((o) => (o.userData.v = o.visible, o.visible = false)), () => sc.children.forEach((o) => (o.visible = o.userData.v))))
  return { out, px: [st.rt.width, st.rt.height] }
})
console.log(JSON.stringify(r))
await browser.close()
