// Genera los iconos PNG de la app sin dependencias (codificador PNG con zlib nativo).
// Uso: node scripts/gen-icons.mjs
import zlib from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

const BG = [11, 18, 32] // #0b1220
const FG = [34, 211, 238] // #22d3ee
const PTS = [
  [104, 332],
  [168, 250],
  [216, 300],
  [300, 150],
  [348, 210],
  [416, 120],
]
const STROKE = 26

function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const l2 = dx * dx + dy * dy
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function render(size) {
  const s = size / 512
  const r = (STROKE / 2) * s
  const pts = PTS.map(([x, y]) => [x * s, y * s])
  const buf = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let d = Infinity
      for (let i = 0; i < pts.length - 1; i++) {
        const dd = distToSeg(x + 0.5, y + 0.5, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1])
        if (dd < d) d = dd
      }
      const aa = Math.max(0, Math.min(1, r - d + 0.5)) // antialias de 1px en el borde
      const o = (y * size + x) * 4
      for (let k = 0; k < 3; k++) buf[o + k] = Math.round(BG[k] * (1 - aa) + FG[k] * aa)
      buf[o + 3] = 255
    }
  }
  return buf
}

const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}
function png(size) {
  const raw = render(size)
  const stride = size * 4
  const filtered = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    filtered[y * (stride + 1)] = 0
    raw.copy(filtered, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  const idat = zlib.deflateSync(filtered, { level: 9 })
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

mkdirSync('public', { recursive: true })
writeFileSync('public/icon-512.png', png(512))
writeFileSync('public/icon-192.png', png(192))
writeFileSync('public/apple-touch-icon.png', png(180))
console.log('Iconos generados: icon-512.png, icon-192.png, apple-touch-icon.png')
