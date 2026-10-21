// assets-src/art/raw (Codex's photographs) -> public: the link-preview card, the icons, the web manifest.
// usage: node scripts/art.mjs
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const ROOT = path.resolve(import.meta.dirname, '..')
const raw = (n) => path.join(ROOT, 'assets-src/art/raw', n)
const pub = (n) => path.join(ROOT, 'public', n)

// icons: the single slice, cropped close
for (const [n, s] of [['icon-512.png', 512], ['icon-192.png', 192], ['apple-touch-icon.png', 180], ['favicon-32.png', 32]]) {
  await sharp(raw('icon.png')).extract({ left: 150, top: 120, width: 960, height: 960 }).resize(s, s).png().toFile(pub(n))
}

// the link preview: the editorial photograph, with the title set vertically in the quiet space on its right
const W = 1200, H = 630
const ink = '#2b2420'
const title = [...'長崎カステラ'].map((c, i) => `<text x="1080" y="${118 + i * 72}" font-family="Hiragino Mincho ProN" font-weight="600" font-size="58" fill="${ink}" text-anchor="middle">${c}</text>`).join('')
const subText = [...'一棹、好きな厚さに。'].map((c, i) => {
  // the ideographic comma and full stop sit in the top right of their square when set vertically
  const punct = c === '、' || c === '。'
  return `<text x="${punct ? 1000 : 992}" y="${126 + i * 30 - (punct ? 14 : 0)}" font-family="Hiragino Mincho ProN" font-size="21" fill="${ink}" fill-opacity="0.66" text-anchor="middle">${c}</text>`
}).join('')
const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="g" x1="0" x2="1">
    <stop offset="0.55" stop-color="#efe9df" stop-opacity="0"/><stop offset="0.82" stop-color="#efe9df" stop-opacity="0.78"/><stop offset="1" stop-color="#efe9df" stop-opacity="0.9"/>
  </linearGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  ${title}
  ${subText}
  <rect x="1067" y="563" width="26" height="26" rx="3" fill="#b6382b" transform="rotate(-3 1080 576)"/>
  <text x="1080" y="584" font-family="Hiragino Mincho ProN" font-weight="600" font-size="17" fill="#fbf3ea" text-anchor="middle">切</text>
</svg>`
await sharp(raw('hero.png'))
  .resize(W, H, { fit: 'cover', position: 'left' })
  .composite([{ input: Buffer.from(svg) }])
  .jpeg({ quality: 86, mozjpeg: true })
  .toFile(pub('og.jpg'))

fs.writeFileSync(pub('manifest.webmanifest'), JSON.stringify({
  name: '長崎カステラ',
  short_name: 'カステラ',
  description: 'A Nagasaki castella you slice with your finger.',
  start_url: './',
  display: 'fullscreen',
  background_color: '#efe9df',
  theme_color: '#efe9df',
  icons: [
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
  ],
}, null, 2) + '\n')
// the 祝 seal on the microphone card: the stamp alone, trimmed to its ink
await sharp(await sharp(raw('seal.png')).trim({ threshold: 40 }).toBuffer())
  .resize(176, 176, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .extend({ top: 32, bottom: 32, left: 32, right: 32, background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .webp({ quality: 88, alphaQuality: 90 })
  .toFile(process.env.SEAL_OUT || pub('seal.webp'))

console.log('art done')
