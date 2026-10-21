<p align="center">
  <a href="https://davidyen1124.github.io/wish-upon-a-slice/"><img src="docs/candle.jpg" width="820" alt="長崎カステラ with the lights down: a loaf of Nagasaki castella on a hinoki board, one spiral birthday candle burning in it, the knife resting in front, a hold-to-blow button at the bottom" /></a>
</p>

<h1 align="center">Wish Upon a Slice</h1>

<p align="center">
  <b>A loaf of Nagasaki castella you slice with your finger. Then you put a candle in it and blow it out through your microphone.</b><br />
  Zero calories. Infinite slices. One candle. A rigid-body physics engine, for cake. A fluid-ish one, for your feelings.
</p>

<p align="center">
  <a href="https://davidyen1124.github.io/wish-upon-a-slice/"><b>🔪 Cut it yourself → davidyen1124.github.io/wish-upon-a-slice</b></a>
  &nbsp;·&nbsp;
  <a href="https://davidyen1124.github.io/wish-upon-a-slice/?name=Mika"><b>🕯️ for Mika</b></a>
</p>

---

Somebody looked at a box of Fukusaya castella, a cake that has been perfectly fine since the 1600s, and thought:
*what if this needed Rapier, a constrained Delaunay triangulator, and a 360° HDR panorama rendered in Blender?*
And then, a week later, on somebody's birthday: *what if it also needed a microphone?*

This is that. A fullscreen, real-time 3D Nagasaki castella for phones and desktops. You swipe, a sujihiki comes over,
presses into the crust, breaks through, saws down to the board, and tips a thin slice onto its side. Then you press the
little candle, tap the slice you want, and a spiral birthday candle goes into the sponge. It lights. The morning goes
out of the room. You hold the button and blow at your laptop, and a coworker you didn't know was there asks if you're okay.

<p align="center">
  <img src="docs/sliced.jpg" width="820" alt="The same loaf in the morning after four cuts: a long block, a shorter one, three thin slices leaning in a row, crumbs on the paper" />
  <br /><sub>五切れ. Four cuts, five pieces, zero dishes.</sub>
</p>

## How to eat it (you can't)

| Do this | And this happens |
| --- | --- |
| **Swipe** across the cake | The knife comes over and cuts exactly where you swiped. Thin slices tip over. Thick ones just part, with dignity. |
| **Press and hold** a piece | The sponge gives under your fingertip. Yes, it's squishy. Yes, you'll do it more than once. |
| **Hold and move** | You pick the piece up and carry it around. Please don't drop it. (You will drop it. It squashes and springs back at 14 Hz.) |
| **Two fingers**, right-drag or shift-drag | Turn the view, like a food critic circling the plate. |
| **Pinch** or scroll | Get closer. Closer. Look at that crumb. |
| **Double tap** | Puts the view back where it started. |
| **🕯** (after the first cut) | Pick up a candle. Tap any piece to push it in, wherever you like. It lights, and the lights go down. Tap 🕯 again to move it. |
| **Hold the button and blow** | The flame bends, strains, goes blue at the root and goes out. Smoke. *Happy Birthday.* The lights come back up. |
| **Relight** | Do it again. Nobody's counting. |
| **もう一棹** | A whole new loaf. The castella economy is post-scarcity. |
| **音** | Sound on or off, for cutting cake in meetings. |

The candle is part of the cake's physics, not a sticker on it. Carry the piece it's in and the flame trails behind
(carry it fast enough and you've blown it out, which doesn't count as a wish). Cut off the slice it's in and the slice
tips over with the candle in it, which now sticks out sideways while the flame keeps burning straight up, because that's
what flames do. Bring the knife down *on* the candle and it's knocked out of the cake and rolls away, smoking. Turn a
lit candle upside down and it's smothered.

<p align="center">
  <img src="docs/happy-birthday.jpg" width="820" alt="A second after the candle is blown out: a thin thread of smoke curls up from the wick and the wall reads Happy Birthday, お誕生日おめでとう" />
  <br /><sub>One second after. The wish has been filed. Processing times may vary.</sub>
</p>

**Personalise it:** add `?name=` to the link, e.g. [`?name=Mika`](https://davidyen1124.github.io/wish-upon-a-slice/?name=Mika),
and the candle goes in by itself, the lights go down, and the headline sings their name. Send it to someone you love,
or someone you forgot to buy a present for.

The counter in the corner keeps score in kanji: 一棹 for the whole loaf, then 二切れ, 三切れ, and so on up to
九十九切れ. Past that it gives up and switches to Arabic numerals, like a tourist who ran out of phrasebook. While a
candle stands in the cake, the seal under the title says 祝 instead of 切. It's a premium birthday.

## FAQ

**Can I eat it?**
No. We tried. The screen tastes like glass and regret.

**Will singing "Happy Birthday" louder put it out?**
No. A voice is loud but moves almost no air, and the page can tell. It measures spectral flatness: breath is noise,
singing is harmonic, and singing only counts for part of its level. You have to actually blow. Like an adult.

**Is it recording me?**
No. Your breath only counts while you hold the button, and nothing is recorded or uploaded: the audio becomes a wind
speed inside your browser, and that's the end of it. The candle is a very small, very judgmental weather station.

**I'm in a library / my mic is blocked / I have no mic.**
Then holding the button is the breath. The page says "Hold to blow instead" and you can be festive in total silence.

**Why won't my slice fall over?**
Because it's thicker than 3.1 cm, which makes it a *piece*, not a *slice*, and pieces stand their ground. Cut thinner.
Also check there isn't another piece leaning on it. Physics is a team sport.

**Why only one candle?**
Because the flame is a streakline simulation of every bit of gas that left the wick in the last 60 ms, and we were only
emotionally ready to do that once. Also: castella is not a fire hazard and we'd like to keep it that way.

**Is the cake's volume really conserved through every cut?**
Yes. The QA run checks, candle or no candle. This cake does better bookkeeping than most startups.

**Why is the loaf exactly 580 g?**
A Fukusaya 1号 loaf is 580 g. The loaf here is 27 × 9 × 6 cm at 398 kg/m³, which comes out to… 580 g. The candle is
2 g of paraffin. We did the math so the knife could feel the weight of its choices.

**Is this a cake or a physics thesis?**
Yes.

## The serious part

Built from references found online: Fukusaya's own pages (a 1号 loaf is 580 g in ten slices; batter poured into a
paper-lined wooden frame; zarame sugar left to settle at the base), a Shooken 1号 box of 28.5 × 10 × 6.5 cm, and many
photographs of cut castella, from dancyu, Tennen Seikatsu and the makers (the caramel band under the top, the yellow
fine crumb, the dark sugary base), and candle macro and blow-out photography. Colours were sampled from those photographs.

### The cake

- **The loaf** is cut from a baked slab, so its four sides are cut crumb, and only the top (a satin caramel skin) and
  the bottom (dark, with zarame) are crust.
- **The cut is exact** (`src/slice.js`): the mesh is clipped by the knife's plane, both halves stay watertight, and the
  hole is closed with a new face of crumb, triangulated with a constrained Delaunay grid. Pieces keep the loaf's own
  coordinates, and the shader draws the sponge from where each point was inside the loaf, so neighbouring slices line
  up exactly: the crust band, the golden crumb under it, the base and its sugar crystals.
- **The physics** (`src/physics.js`, Rapier): every piece is a rigid body with its true mass, the convex polytope of the
  loaf's box cut by every plane it has received, friction 0.78, no bounce. The blade is a kinematic body: it wedges the
  halves apart and, by tilting, tips a slice thinner than 3.1 cm over; a thicker piece only parts.
- **The sponge gives** (`src/castella.js`): the knife's edge is a line load that pushes a V-shaped crease into the crust
  before it breaks through; a fingertip is a round dimple. Both fade over a few millimetres and toward the supported
  base, and the normals are bent analytically so the light reads them. A piece that lands hard squashes and springs
  back (a damped spring at 14 Hz driven by the contact force).
- **Crumbs** (`src/crumbs.js`): flakes of crust settle along the cut on the cake; bits of crumb, crust and sugar fall
  from where the blade comes out and come to rest on the washi.

### The candle

- **The candle** (`src/candle.js`): a slim spiral birthday candle, 6.2 mm across and 74 mm long, with eight twisted
  flutes, a melted cup at the top, a braided cotton wick that curls over at the tip, and one vermilion stripe that
  follows the spiral. Ivory wax with light that wraps a little way round it and glows near the flame.
- **Where it goes** (`src/birthday.js`): pieces are convex, so the place is a matter of planes: straight down into the
  top of the piece under your finger, at least 4.6 mm from its sides, up to 16 mm deep (less in a thin piece; not at
  all in a shaving). It comes down, the sponge dimples around it, and it goes in.
- **It is part of the cake**: the wax standing out of the sponge becomes a cylinder collider on the piece's own rigid
  body, so it is carried, tipped and propped up with it. After a cut, the half that holds its place keeps it. A blade
  that comes down within a few millimetres of it knocks it out of the cake: it becomes a 2 g body of its own.
- **Breath → air** (`src/breath.js`): the microphone runs without voice processing, band-limited to < 1.6 kHz. Blowing
  on a capsule is wind noise, p′ ∝ ½ρU², so air speed is U ∝ √(level above the room's noise floor). A voice is loud but
  moves little air: spectral flatness tells harmonic sound from noise, and a voice counts for only part of its level.
  The puff reaches the flame with a short lag, carries on briefly after you stop, and is turbulent.
- **Flame** (`src/flame.js`): a streakline. The flame is the gas that left the wick in the last ~60 ms. A parcel of age
  τ has risen ½aτ² and been carried sideways by the air it met on the way up, so gusts travel from root to tip. The air
  is your breath plus the candle's own movement: carry it and the flame trails. Under strain it shortens, thins and
  turns blue. It lights the room as a point light at the middle of its luminous zone, ~1850 K, with shadows.
- **Blow-out**: a blow-off. Past ~1.9 m/s at the base, the flame loses heat at a rate that grows with (U/U꜀ − 1)^1.5;
  below it, it recovers. Gentle breath bends it; a firm breath puts it out in about a second; a hard one in a quarter
  of a second.
- **Smoke** (`src/smoke.js`): parcels of warm air with buoyancy that fades as they mix, drag toward the local air (a
  divergence-free curl field that grows with height, plus the leftover breath). The thread is drawn as a streakline
  ribbon, laminar near the wick and curling higher up; each parcel leaves from where the wick was when it left, so a
  candle knocked over still trails one continuous thread.
- **The picture**: the flame, its glow and the smoke are drawn after the lens blur, in focus (the camera focuses on the
  candle while it burns), and each looks up the scene's depth so a piece in front still hides them. The lights going
  down is the room itself dimming: the sun, the bounce, the window light and the wall, with the page's ink turning to
  paper in step.

### The pictures

- `assets-src/blender/scene.py` (Blender, headless) builds the loaf mesh, the hinoki board, the washi sheet, the knife
  and the yunomi, exports `public/scene.glb`, and renders the morning room in Cycles as a 360° HDR panorama that lights
  the scene and is what the knife reflects.
- `scripts/imagegen.mjs` paints every photograph with Codex CLI's built-in image_gen: the crumb, the top crust, the
  sugared base, the hinoki, the linen, the washi, the maple-leaf shadows that the window light carries as a gobo, the
  wall behind, the candle's wax, the 祝 seal, and the photographs for the icon and the link preview.
- `scripts/textures.py` makes them tile and grades the cake's colours to the photographs of real castella;
  `scripts/art.mjs` makes the icons, the link preview and the manifest.

## Run it

```sh
npm install
npm run dev                    # http://localhost:5190  (?qa: fixed time steps, for tests · ?name=Mika: a birthday link)
npm run build                  # static site in dist/; pushing to main deploys it to GitHub Pages

/Applications/Blender.app/Contents/MacOS/Blender -b -P assets-src/blender/scene.py
node scripts/imagegen.mjs      # needs a logged-in Codex CLI
python3 scripts/textures.py && node scripts/art.mjs
npm test                                                    # the cutting geometry
node scripts/qa.mjs http://localhost:5191/ local            # every state, 40 screens a device, 9 devices, Chrome + WebKit
node scripts/qa.mjs https://davidyen1124.github.io/wish-upon-a-slice/ live
node scripts/compare.mjs qa/local qa/live                   # pixel parity between the two runs (--mask: leave out the candle button)
node scripts/physics-qa.mjs http://localhost:5191/          # the microphone path, with recorded breath, speech and silence
node scripts/motion.mjs http://localhost:5191/              # films it in real time: frame strips and GIFs of the movement
```

With `?qa` the page's clock stops and only moves when a test steps it, transitions are off and the crumbs and the smoke
are seeded, so a build renders the same pixels every time; the QA run checks layout, fonts, canvas size, console, the
physics (the cake's volume is conserved through every cut, every piece comes to rest, nothing sinks into the board),
and the birthday (the candle goes in where it's tapped, lights, survives a gentle breath, goes out in a hard one, says
Happy Birthday, relights, gets knocked over by the knife; a birthday link with the microphone refused blows out by
holding the button).

---

<p align="center"><sub>No castella was harmed in the making of this repository. Several were eaten for research. Don't blow on the actual screen, it doesn't help.</sub></p>
