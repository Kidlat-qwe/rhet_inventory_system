/**
 * Remove white / light-gray matte from Santa sleigh PNGs (edge flood + chroma key).
 * Usage: node scripts/clean-santa-png.mjs <input> <output> [width=640]
 */
import fs from 'node:fs'
import sharp from 'sharp'

function isEdgeBg(r, g, b) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const chroma = max - min
  const avg = (r + g + b) / 3
  if (avg <= 24 && chroma <= 14) return true
  if (avg >= 210 && chroma <= 20) return true
  return false
}

function isChromaKeyWhite(r, g, b, a) {
  if (a === 0) return true
  const dr = 255 - r
  const dg = 255 - g
  const db = 255 - b
  const dist = dr + dg + db
  if (r >= 242 && g >= 242 && b >= 242 && dist <= 36) return true
  if (r >= 235 && g >= 235 && b >= 235 && dist <= 22) return true
  return false
}

async function cleanSantaPng(input, output, width = 640) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const w = info.width
  const h = info.height
  const n = w * h

  const visited = new Uint8Array(n)
  const queue = new Int32Array(n)
  let qh = 0
  let qt = 0
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return
    const i = y * w + x
    if (visited[i]) return
    const p = i * 4
    if (!isEdgeBg(data[p], data[p + 1], data[p + 2])) return
    visited[i] = 1
    queue[qt++] = i
  }

  for (let x = 0; x < w; x += 1) {
    push(x, 0)
    push(x, h - 1)
  }
  for (let y = 0; y < h; y += 1) {
    push(0, y)
    push(w - 1, y)
  }

  while (qh < qt) {
    const i = queue[qh++]
    data[i * 4 + 3] = 0
    const x = i % w
    const y = (i / w) | 0
    push(x + 1, y)
    push(x - 1, y)
    push(x, y + 1)
    push(x, y - 1)
  }

  for (let i = 0; i < n; i += 1) {
    const p = i * 4
    if (isChromaKeyWhite(data[p], data[p + 1], data[p + 2], data[p + 3])) {
      data[p + 3] = 0
    }
  }

  for (let pass = 0; pass < 6; pass += 1) {
    const copy = Buffer.from(data)
    for (let y = 1; y < h - 1; y += 1) {
      for (let x = 1; x < w - 1; x += 1) {
        const i = y * w + x
        const p = i * 4
        if (copy[p + 3] === 0) continue
        if (!isChromaKeyWhite(copy[p], copy[p + 1], copy[p + 2], copy[p + 3])) continue
        let nearTransparent = false
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (copy[((y + dy) * w + (x + dx)) * 4 + 3] === 0) {
            nearTransparent = true
            break
          }
        }
        if (nearTransparent) data[p + 3] = 0
      }
    }
  }

  fs.mkdirSync(output.split(/[/\\]/).slice(0, -1).join('/').replace(/\//g, '\\') || '.', { recursive: true })

  await sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .trim({ threshold: 10 })
    .resize({ width, withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toFile(output)

  const meta = await sharp(output).metadata()
  console.log(`Wrote ${output} (${meta.width}x${meta.height}, alpha=${meta.hasAlpha})`)
}

const [input, output, widthArg] = process.argv.slice(2)
if (!input || !output) {
  console.error('Usage: node scripts/clean-santa-png.mjs <input> <output> [width]')
  process.exit(1)
}

await cleanSantaPng(input, output, widthArg ? Number(widthArg) : 640)
