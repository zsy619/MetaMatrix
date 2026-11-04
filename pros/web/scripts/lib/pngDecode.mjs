/**
 * 极简 PNG 解码器（纯 Node，无第三方依赖）。
 *
 * 只为「图表导出像素级复验」服务：把导出物里的 PNG 解成 RGBA 像素，
 * 好在脚本里统计透明比例 / 背景色 / 非背景比例 / 近黑比例。
 *
 * 支持：8bit、非隔行、colorType 0(灰度) / 2(RGB) / 3(调色板) / 4(灰度+Alpha) / 6(RGBA)。
 * 不支持：16bit、隔行（Adam7）——遇到直接抛错，避免静默算错。
 */
import { inflateSync } from 'node:zlib'

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }

function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

/**
 * 解码 PNG。
 * @param {Buffer} buffer PNG 字节
 * @returns {{width:number,height:number,data:Uint8Array}} data 为 RGBA，每像素 4 字节
 */
export function decodePng(buffer) {
  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer)
  for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
    if (buffer[i] !== PNG_SIGNATURE[i]) throw new Error('不是 PNG 文件')
  }
  let pos = 8
  let header = null
  let palette = null
  let transparency = null
  const idat = []
  while (pos + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(pos)
    const type = buffer.toString('ascii', pos + 4, pos + 8)
    const data = buffer.subarray(pos + 8, pos + 8 + length)
    pos += 12 + length
    if (type === 'IHDR') {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12],
      }
    } else if (type === 'PLTE') {
      palette = data
    } else if (type === 'tRNS') {
      transparency = data
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
  }
  if (!header) throw new Error('PNG 缺少 IHDR')
  if (header.bitDepth !== 8) throw new Error(`暂不支持 bitDepth=${header.bitDepth}`)
  if (header.interlace !== 0) throw new Error('暂不支持隔行 PNG')
  const channels = CHANNELS[header.colorType]
  if (!channels) throw new Error(`暂不支持 colorType=${header.colorType}`)

  const raw = inflateSync(Buffer.concat(idat))
  const { width, height } = header
  const stride = width * channels
  const lines = Buffer.alloc(height * stride)
  let prev = Buffer.alloc(stride)
  let offset = 0
  for (let y = 0; y < height; y += 1) {
    const filter = raw[offset]
    offset += 1
    const line = raw.subarray(offset, offset + stride)
    offset += stride
    const cur = lines.subarray(y * stride, (y + 1) * stride)
    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? cur[x - channels] : 0
      const b = prev[x]
      const c = x >= channels ? prev[x - channels] : 0
      const value = line[x]
      switch (filter) {
        case 0:
          cur[x] = value
          break
        case 1:
          cur[x] = (value + a) & 0xff
          break
        case 2:
          cur[x] = (value + b) & 0xff
          break
        case 3:
          cur[x] = (value + ((a + b) >> 1)) & 0xff
          break
        case 4:
          cur[x] = (value + paeth(a, b, c)) & 0xff
          break
        default:
          throw new Error(`未知的 PNG 行过滤器 ${filter}`)
      }
    }
    prev = cur
  }

  const out = new Uint8Array(width * height * 4)
  for (let i = 0, p = 0; i < width * height; i += 1) {
    const s = i * channels
    if (header.colorType === 0) {
      out[p] = lines[s]
      out[p + 1] = lines[s]
      out[p + 2] = lines[s]
      out[p + 3] = 255
    } else if (header.colorType === 2) {
      out[p] = lines[s]
      out[p + 1] = lines[s + 1]
      out[p + 2] = lines[s + 2]
      out[p + 3] = 255
    } else if (header.colorType === 3) {
      const idx = lines[s]
      out[p] = palette ? palette[idx * 3] : 0
      out[p + 1] = palette ? palette[idx * 3 + 1] : 0
      out[p + 2] = palette ? palette[idx * 3 + 2] : 0
      out[p + 3] = transparency && idx < transparency.length ? transparency[idx] : 255
    } else if (header.colorType === 4) {
      out[p] = lines[s]
      out[p + 1] = lines[s]
      out[p + 2] = lines[s]
      out[p + 3] = lines[s + 1]
    } else {
      out[p] = lines[s]
      out[p + 1] = lines[s + 1]
      out[p + 2] = lines[s + 2]
      out[p + 3] = lines[s + 3]
    }
    p += 4
  }
  return { width, height, data: out }
}
