import { chromium } from 'playwright'
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--ignore-gpu-blocklist'], headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
await page.goto('http://localhost:5190/?qa')
await page.waitForFunction(() => window.__castella?.ready, null, { timeout: 120000 })
const r = await page.evaluate(() => {
  const C = window.__castella, st = C.stage, R = st.renderer, gl = R.getContext()
  const time = (label, fn, undo) => {
    fn && fn()
    for (let i = 0; i < 3; i++) st.render(1 / 60)
    gl.finish()
    const t0 = performance.now()
    for (let i = 0; i < 10; i++) st.render(1 / 60)
    gl.finish()
    const ms = (performance.now() - t0) / 10
    undo && undo()
    return [label, +ms.toFixed(2)]
  }
  const out = []
  out.push(time('full'))
  out.push(time('no dof', () => (st.finish.uniforms.uTaps.value = 0), () => (st.finish.uniforms.uTaps.value = 22)))
  out.push(time('no shadows', () => { R.shadowMap.enabled = false }, () => { R.shadowMap.enabled = true }))
  const cast = st.scene.children.filter((o) => o.userData?.piece)
  out.push(time('no cake', () => cast.forEach((o) => (o.visible = false)), () => cast.forEach((o) => (o.visible = true))))
  out.push(time('sun off', () => (st.sun.visible = false), () => (st.sun.visible = true)))
  out.push(time('no msaa', () => { st.rt.samples = 0; st.rt.dispose() }, () => { st.rt.samples = 4; st.rt.dispose() }))
  return { out, px: [st.rt.width, st.rt.height], calls: R.info.render.calls, tris: R.info.render.triangles }
})
console.log(JSON.stringify(r))
await browser.close()
