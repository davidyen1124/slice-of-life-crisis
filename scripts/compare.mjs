// Pixel parity between two QA runs (say, the local build and the deployed site): every screenshot with the same
// name is compared pixel by pixel. Reports how many pixels differ by more than a hair, and writes a diff image
// (differences in red over a faded copy) for any screenshot that is not identical.
// With --mask, the squares a run lists in its masks.json (per device: the candle button, which an older build does
// not have) are left out of the count; they show in blue on the diff.
// usage: node scripts/compare.mjs qa/local qa/prod [--mask]
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const args = process.argv.slice(2)
const [A, B] = args.filter((a) => !a.startsWith('--')).map((p) => path.resolve(p))
const masks = args.includes('--mask') ? JSON.parse(fs.readFileSync(path.join(fs.existsSync(path.join(B, 'masks.json')) ? B : A, 'masks.json'), 'utf8')) : {}
const OUT = path.join(B, 'diff')
fs.mkdirSync(OUT, { recursive: true })
const names = fs.readdirSync(A).filter((f) => f.endsWith('.png') && fs.existsSync(path.join(B, f))).sort()
let worst = 0
const rows = []
for (const n of names) {
  const [a, b] = await Promise.all([A, B].map((d) => sharp(path.join(d, n)).removeAlpha().raw().toBuffer({ resolveWithObject: true })))
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) {
    rows.push(`${n}: SIZE ${a.info.width}x${a.info.height} vs ${b.info.width}x${b.info.height}`)
    worst = 1
    continue
  }
  const px = a.info.width * a.info.height
  let diff = 0, sum = 0
  const out = Buffer.alloc(px * 3)
  const mask = Object.entries(masks).filter(([k]) => n.startsWith(k + '-')).sort((x, y) => y[0].length - x[0].length)[0]?.[1]
  for (let i = 0; i < px; i++) {
    if (mask) {
      const x = i % a.info.width, y = (i / a.info.width) | 0
      if (x >= mask[0] && x <= mask[2] && y >= mask[1] && y <= mask[3]) {
        out[i * 3] = 120; out[i * 3 + 1] = 150; out[i * 3 + 2] = 255
        continue
      }
    }
    let m = 0
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(a.data[i * 3 + c] - b.data[i * 3 + c])
      m = Math.max(m, d)
      sum += d
    }
    if (m > 6) diff++
    const g = (a.data[i * 3] + a.data[i * 3 + 1] + a.data[i * 3 + 2]) / 3
    out[i * 3] = m > 6 ? 255 : g * 0.35 + 160
    out[i * 3 + 1] = m > 6 ? 0 : g * 0.35 + 160
    out[i * 3 + 2] = m > 6 ? 0 : g * 0.35 + 160
  }
  const frac = diff / px
  worst = Math.max(worst, frac)
  rows.push(`${n}: ${(frac * 100).toFixed(3)}% of pixels differ, mean ${(sum / px / 3).toFixed(3)}`)
  if (diff) await sharp(out, { raw: { width: a.info.width, height: a.info.height, channels: 3 } }).png().toFile(path.join(OUT, n))
}
fs.writeFileSync(path.join(B, 'compare.txt'), rows.join('\n') + '\n')
console.log(rows.join('\n'))
console.log(`\n${names.length} screenshots compared; worst: ${(worst * 100).toFixed(3)}% of pixels differ`)
