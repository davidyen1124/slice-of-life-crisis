// Paints every picture the site uses with Codex CLI's built-in image_gen tool: one `codex exec` per picture.
// usage: node scripts/imagegen.mjs [--force] [--jobs 3] [name ...]       ->  assets-src/art/raw/<name>.png
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const RAW = path.join(ROOT, 'assets-src/art/raw')
const LOGS = path.join(ROOT, 'assets-src/art/logs')
const CODEX_IMAGES = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'generated_images')
fs.mkdirSync(RAW, { recursive: true })
fs.mkdirSync(LOGS, { recursive: true })

const PHOTO = 'A REAL PHOTOGRAPH (not a render, not an illustration), natural colour, very fine film grain.'
const FLAT = 'Shot perfectly flat-on from directly above, evenly lit by large soft diffuse light: no vignette, no shadows, no perspective, no edges or borders, no objects. The material fills the entire frame edge to edge so it can be used as a tiling texture.'

export const ART = [
  {
    name: 'backdrop',
    size: 'landscape 3:2 (1536x1024)',
    prompt: [
      PHOTO,
      'The softly blurred WALL behind a table in a quiet Japanese room on a spring morning, photographed with an 85mm lens at f/1.2 focused far in front, so nothing is sharp.',
      'Warm off-white plaster wall. On the left, the soft glow of a shoji paper window. Dappled sunlight with blurred maple-leaf shadows (komorebi) falls across the wall.',
      'At the right edge, a blurred ceramic vase with a single thin flowering branch. Palette: oatmeal, cream, warm grey, a hint of sage green.',
      'There is NO table, NO floor and NO food in the picture: only the wall, from edge to edge. No text, no people.',
    ].join('\n'),
  },
  {
    name: 'linen',
    size: 'square (1024x1024)',
    prompt: [PHOTO, 'Natural undyed linen tablecloth, oatmeal / greige colour, a fine visible plain weave with a few natural slubs.', FLAT].join('\n'),
  },
  {
    name: 'board',
    size: 'landscape 3:2 (1536x1024)',
    prompt: [
      PHOTO,
      'The surface of a pale hinoki (Japanese cypress) wood cutting board: very pale creamy blond wood, fine straight grain running LEFT TO RIGHT (horizontally),',
      'a few faint old knife marks, matte, clean. ' + FLAT,
    ].join('\n'),
  },
  {
    name: 'crust',
    size: 'square (1024x1024)',
    prompt: [
      PHOTO,
      'Macro photograph of the TOP CRUST of a Nagasaki castella (kasutera) sponge cake: a smooth, satin, deep caramel-brown skin (around #7a4020),',
      'with very fine pin-hole pores, gentle mottling from lighter amber to darker brown, and a faint sugary sheen. ' + FLAT,
    ].join('\n'),
  },
  {
    name: 'crumb',
    size: 'square (1024x1024)',
    prompt: [
      PHOTO,
      'Close-up photograph of the freshly cut cross-section of Nagasaki castella (the crumb), a field of view about 3 cm wide: a dense, moist, VERY FINE and uniform',
      'honey-yellow crumb (around #f2cf62), soft and velvety, with countless tiny pores (most under 0.5 mm, a few up to 1 mm) evenly spread, like a fine silky sponge,',
      'not a coarse kitchen sponge. Cut cleanly with a sharp knife. No crust anywhere. ' + FLAT,
    ].join('\n'),
  },
  {
    name: 'bottom',
    size: 'square (1024x1024)',
    prompt: [
      PHOTO,
      'Macro photograph of the BOTTOM of a Nagasaki castella cake: a deep reddish-brown caramelised base (around #6a2c14) densely set with coarse zarame sugar crystals,',
      'glassy and translucent, angular with softened corners, 2 to 4 mm across, catching tiny highlights. ' + FLAT,
    ].join('\n'),
  },
  {
    name: 'washi',
    size: 'square (1024x1024)',
    prompt: [PHOTO, 'A sheet of soft white Japanese washi paper (the paper a castella is baked on): faint long kozo fibres, gentle uneven texture, warm white.', FLAT].join('\n'),
  },
  {
    name: 'leaves',
    size: 'square (1024x1024)',
    prompt: [
      'A black-and-white photograph of soft morning sunlight falling on a plain white wall through a Japanese maple (momiji) tree: the dappled shadows of leaves and thin twigs (komorebi).',
      'Pure greyscale, high key: mostly bright white light, with soft-edged grey-to-black leaf-shadow shapes, some in focus, some blurred. No wall texture, no colour, no objects, no text. It will be used as a light gobo.',
    ].join('\n'),
  },
  {
    name: 'hero',
    size: 'landscape 3:2 (1536x1024)',
    prompt: [
      PHOTO,
      'An editorial photograph for a Japanese food magazine (in the quiet style of Kurashi no Techo or &Premium): a whole Nagasaki castella loaf on a pale hinoki board resting on oatmeal linen,',
      'two slices cut from its end, one fallen over, showing the bright honey-yellow fine crumb, the smooth deep caramel-brown top crust and the thin dark bottom crust set with zarame sugar crystals.',
      'A thin Japanese knife lies beside it. Soft morning window light from the left with gentle dappled leaf shadows, shallow depth of field,',
      'a celadon yunomi of green tea blurred in the background. Airy, muted, natural colours, lots of calm empty space on the right. No text, no hands.',
    ].join('\n'),
  },
  {
    name: 'wax',
    size: 'square (1024x1024)',
    prompt: [
      'Texture of the surface of an ivory beeswax-and-paraffin candle, about 3 x 3 cm, seen straight on.',
      'Creamy ivory (sRGB around #F1E6CF), smooth and slightly waxy with very faint swirls and micro-scratches, softly translucent look.',
      FLAT,
    ].join('\n'),
  },
  {
    name: 'seal',
    size: 'square (1024x1024), transparent background',
    prompt: [
      'A traditional Japanese red cinnabar ink seal stamp impression (hanko / rakkan) of the single kanji 祝 (celebration) in classic seal-script (tensho) style,',
      'inside a square border with slightly rounded corners, stamped by hand on paper: vermilion red (#C8372D), uneven ink density, tiny voids and',
      'speckles where the paper grain broke the ink, crisp but organic edges. Isolated stamp only, centred, flat front view.',
    ].join('\n'),
  },
  {
    name: 'icon',
    size: 'square (1024x1024)',
    prompt: [
      PHOTO,
      'A single slice of Nagasaki castella standing upright on a pale hinoki board, seen from the front at a slight angle: honey-yellow fine crumb, deep caramel-brown top crust,',
      'thin dark bottom crust with zarame sugar crystals. Soft morning window light from the left, warm oatmeal background softly out of focus. Centred, simple, no text.',
    ].join('\n'),
  },
]

const brief = (a) => [
  'Use the imagegen skill with your BUILT-IN image_gen tool (not the CLI fallback; no API key is needed).',
  'Make exactly ONE image_gen call for the brief below. Do not write code, do not ask questions.',
  `When the image exists, copy the generated PNG from ${CODEX_IMAGES}/<this thread>/ to ./${a.name}.png in the current directory, then reply DONE.`,
  `Canvas: ${a.size}.`,
  '',
  'BRIEF:',
  a.prompt,
].join('\n')

const run = (a) => new Promise((resolve) => {
  const started = Date.now()
  const out = path.join(RAW, a.name + '.png')
  const log = fs.createWriteStream(path.join(LOGS, a.name + '.jsonl'))
  const p = spawn('codex', ['exec', '--skip-git-repo-check', '--json', '-s', 'workspace-write', '-c', 'model_reasoning_effort="low"', '-C', RAW, '-'], { stdio: ['pipe', 'pipe', 'pipe'] })
  let thread = ''
  p.stdout.on('data', (d) => {
    const s = d.toString()
    thread ||= (s.match(/"thread_id":"([^"]+)"/) || [])[1] || ''
    log.write(d)
  })
  p.stderr.on('data', (d) => log.write(d))
  p.stdin.end(brief(a))
  p.on('close', () => {
    log.end()
    if (!fs.existsSync(out) || fs.statSync(out).mtimeMs < started) {
      const dir = thread && path.join(CODEX_IMAGES, thread)
      const pngs = dir && fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort() : []
      const src = pngs.length ? path.join(dir, pngs.at(-1)) : null
      if (src) fs.copyFileSync(src, out)
      else return resolve(console.log(`FAIL ${a.name} (${((Date.now() - started) / 1000) | 0}s)`))
    }
    resolve(console.log(`ok   ${a.name} (${((Date.now() - started) / 1000) | 0}s)`))
  })
})

const args = process.argv.slice(2)
const force = args.includes('--force')
const jobs = +(args[args.indexOf('--jobs') + 1] || 0) || 3
const names = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--jobs')
const todo = ART.filter((a) => (!names.length || names.includes(a.name)) && (force || !fs.existsSync(path.join(RAW, a.name + '.png'))))
const queue = [...todo]
await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async () => {
  while (queue.length) await run(queue.shift())
}))
