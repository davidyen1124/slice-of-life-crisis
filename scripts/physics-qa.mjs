// The breath, through the real microphone path: the microphone plays a recording (the page's getUserMedia is replaced
// by a stream that loops it; headless Chrome on macOS cannot open even its fake capture device without a privacy
// prompt). Everything after getUserMedia, the filters, the level, the noise floor, the air and the flame, runs exactly
// as for a real microphone. A candle goes in, the button is held, and the flame's survival is timed.
// Expect: silence and speech never blow it out; a soft breath slowly or not at all; a louder one faster.
// usage: node scripts/physics-qa.mjs [url]
import { chromium } from 'playwright'
import path from 'node:path'

const url = (process.argv[2] || 'http://localhost:5190/').replace(/\/?$/, '/') // the real clock: the breath is a recording, played in real time
const AUDIO = path.resolve(import.meta.dirname, 'test/breath')
const clips = ['silence', 'speech', 'soft', 'medium', 'loud']
const results = []

for (const clip of clips) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] })
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.route('**/__qa/breath/*.wav', (route) => route.fulfill({ path: path.join(AUDIO, path.basename(route.request().url())) }))
  await page.addInitScript((src) => {
    navigator.mediaDevices.getUserMedia = async () => {
      const ctx = new AudioContext()
      const buffer = await ctx.decodeAudioData(await fetch(src).then((r) => r.arrayBuffer()))
      const node = ctx.createBufferSource()
      node.buffer = buffer
      node.loop = true
      const out = ctx.createMediaStreamDestination()
      node.connect(out)
      node.start()
      window.__fakeMic = { startedAt: performance.now() }
      return out.stream
    }
  }, `/__qa/breath/${clip}.wav`)
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__castella?.ready, null, { timeout: 60000 })
  await page.evaluate(() => window.__castella.candleAt(-0.03, 0.004))
  await page.waitForFunction(() => window.__castella.birthday.flame.lit, null, { timeout: 10000 })
  await page.click('.blow')
  await page.waitForSelector('.sheet.open')
  await page.click('.allow')
  await page.waitForFunction(() => window.__castella.birthday.breath.status === 'granted', null, { timeout: 8000 })
  // let the noise floor settle on the recording's quiet lead-in, then hold as the breath starts
  await page.waitForFunction(() => window.__fakeMic && performance.now() - window.__fakeMic.startedAt > 1450)
  const box = await page.locator('.blow').boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  const trace = await page.evaluate(() => new Promise((resolve) => {
    const b = window.__castella.birthday
    const t0 = performance.now()
    const samples = []
    const tick = () => {
      const t = (performance.now() - t0) / 1000
      samples.push({ t, rms: b.breath.rms, flat: b.breath.flat, U: b.air.U })
      if (!b.flame.lit || t > 6.5) resolve({ out: !b.flame.lit, t: +t.toFixed(2), wish: document.body.classList.contains('wished'), samples })
      else setTimeout(tick, 100)
    }
    tick()
  }))
  await page.mouse.up()
  const peakU = Math.max(...trace.samples.map((s) => s.U))
  const meanRms = trace.samples.reduce((a, s) => a + s.rms, 0) / trace.samples.length
  const meanFlat = trace.samples.reduce((a, s) => a + s.flat, 0) / trace.samples.length
  results.push({ clip, out: trace.out, seconds: trace.t, wish: trace.wish, errors })
  console.log(`${clip.padEnd(8)} ${trace.out ? `OUT after ${trace.t}s` : 'still lit after 6.5s'}  peak air ${peakU.toFixed(2)} m/s  mean rms ${meanRms.toFixed(4)}  flatness ${meanFlat.toFixed(3)}${errors.length ? '  ERRORS ' + errors.join(' | ') : ''}`)
  await browser.close()
}

const by = Object.fromEntries(results.map((r) => [r.clip, r]))
const checks = [
  ['silence never blows it out', !by.silence.out],
  ['speech at ordinary loudness never blows it out', !by.speech.out],
  ['medium breath blows it out', by.medium.out],
  ['loud breath blows it out', by.loud.out],
  ['louder is faster (loud < medium)', by.loud.out && by.medium.out && by.loud.seconds < by.medium.seconds],
  ['soft is slower than medium or holds', !by.soft.out || by.soft.seconds > by.medium.seconds],
  ['a breath that blows it out is a wish (Happy Birthday)', by.loud.wish && by.medium.wish],
  ['no page errors', results.every((r) => !r.errors.length)],
]
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
process.exit(checks.every(([, ok]) => ok) ? 0 : 1)
