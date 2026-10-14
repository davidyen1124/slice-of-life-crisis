export function weldedOpen(m) {
  const key = (i) => `${m.pos[i * 3]},${m.pos[i * 3 + 1]},${m.pos[i * 3 + 2]}`
  const id = new Map(); const w = new Int32Array(m.skin.length)
  for (let i = 0; i < w.length; i++) { const k = key(i); if (!id.has(k)) id.set(k, id.size); w[i] = id.get(k) }
  const e = new Map()
  for (let t = 0; t < m.idx.length; t += 3) for (let k = 0; k < 3; k++) {
    const a = w[m.idx[t + k]], b = w[m.idx[t + (k + 1) % 3]]; e.set(a + ',' + b, (e.get(a + ',' + b) || 0) + 1) }
  let open = 0, dup = 0
  for (const [k, c] of e) { const [a, b] = k.split(','); if (!e.has(b + ',' + a)) open++; if (c > 1) dup++ }
  return { open, dup }
}
