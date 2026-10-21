// The candle's own random numbers (the smoke, the flame's shimmer), kept apart from Math.random: a QA run seeds
// Math.random for the crumbs, and lighting a candle must not move a single crumb.
export function generator(seed = (Date.now() ^ 0x9e3779b9) >>> 0) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Run fn with Math.random set aside. three.js gives every object it makes an id drawn from Math.random, and a QA run
 * seeds Math.random for the crumbs: what the candle adds to the page (made here) leaves the crumbs where they fell.
 */
const spare = generator(0x5eed)
export function aside(fn) {
  const r = Math.random
  Math.random = spare
  try {
    return fn()
  } finally {
    Math.random = r
  }
}
