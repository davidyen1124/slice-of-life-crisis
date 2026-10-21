// The README's pictures, from the page itself (?qa: the same pixels every time), at 1600 × 900.
// usage: node scripts/docs.mjs [url]  ->  docs/sliced.jpg, docs/candle.jpg, docs/happy-birthday.jpg
import { chromium } from 'playwright'
import path from 'node:path'
import sharp from 'sharp'

const base = (process.argv[2] || 'http://localhost:5190/').replace(/\/?$/, '/')
const DOCS = path.resolve(import.meta.dirname, '../docs')
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-angle=metal'] })
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 })
await ctx.addInitScript(() => {
  MediaDevices.prototype.getUserMedia = async () => new AudioContext().createMediaStreamDestination().stream
})
const page = await ctx.newPage()
await page.goto(base + '?qa', { waitUntil: 'commit' })
await page.waitForFunction(() => window.__castella?.ready, null, { timeout: 120000 })
const C = (fn, a) => page.evaluate(fn, a)
const step = (n) => C((n) => window.__castella.step(n), n)
await C(() => { window.__castella.pause(); window.__castella.clock(0) })
await page.waitForTimeout(300)
const save = async (name) => {
  await page.waitForTimeout(400)
  const png = await page.screenshot()
  await sharp(png).resize(1600, 900, { kernel: 'lanczos3' }).jpeg({ quality: 88, mozjpeg: true }).toFile(path.join(DOCS, name))
  console.log('wrote docs/' + name)
}

// three thin slices off the end, the loaf cut in two
for (const x of [0.104, 0.078, 0.052, -0.02]) {
  await C((x) => window.__castella.cutWorld(x, -0.07, x, 0.07), x)
  for (let i = 0; i < 60 && (await C(() => window.__castella.busy)); i++) await step(10)
  await step(60)
}
await step(200)
await save('sliced.jpg')

// a candle in the bigger block, lit, the lights down
await C(() => window.__castella.candleAt(-0.065, 0.006))
await step(360)
await save('candle.jpg')

// blown out: the smoke a second later, and the wish
await page.click('.blow')
await page.waitForSelector('.sheet.open')
await page.click('.allow')
await page.waitForFunction(() => window.__castella.birthday.breath.status === 'granted')
await page.waitForTimeout(500)
await C(() => {
  const b = document.querySelector('.blow'), r = b.getBoundingClientRect()
  b.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 5, pointerType: 'touch', isPrimary: true, clientX: r.x + 40, clientY: r.y + 40, bubbles: true, cancelable: true, button: 0, buttons: 1 }))
  window.__castella.birthday.breath.forced = 3.4
})
for (let i = 0; i < 200 && (await C(() => window.__castella.birthday.flame.lit)); i++) await step(2)
await C(() => {
  window.__castella.birthday.breath.forced = null
  document.querySelector('.blow').dispatchEvent(new PointerEvent('pointerup', { pointerId: 5, pointerType: 'touch', bubbles: true }))
})
await step(75)
await save('happy-birthday.jpg')
await browser.close()
