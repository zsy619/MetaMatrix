/** Incremental SHA-256. The worker feeds file slices so the whole file is not copied into one buffer. */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

function rotr(x: number, n: number) {
  return (x >>> n) | (x << (32 - n))
}

export class Sha256 {
  private h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ])
  private blockBuf = new ArrayBuffer(64)
  private block = new Uint8Array(this.blockBuf)
  private blockLen = 0
  private bytes = 0

  update(data: Uint8Array) {
    let offset = 0
    while (offset < data.length) {
      const n = Math.min(64 - this.blockLen, data.length - offset)
      this.block.set(data.subarray(offset, offset + n), this.blockLen)
      this.blockLen += n
      offset += n
      this.bytes += n
      if (this.blockLen === 64) {
        this.compress()
        this.blockLen = 0
      }
    }
  }

  /** Hex digest. The instance is finished and must not be updated again. */
  digest(): string {
    const bitLen = this.bytes * 8
    this.block[this.blockLen++] = 0x80
    if (this.blockLen > 56) {
      this.block.fill(0, this.blockLen)
      this.compress()
      this.block.fill(0)
    } else {
      this.block.fill(0, this.blockLen)
    }
    const view = new DataView(this.blockBuf)
    view.setUint32(56, Math.floor(bitLen / 0x100000000))
    view.setUint32(60, bitLen >>> 0)
    this.compress()
    let hex = ''
    for (let i = 0; i < 8; i++) hex += this.h[i].toString(16).padStart(8, '0')
    return hex
  }

  private compress() {
    const w = new Uint32Array(64)
    const view = new DataView(this.blockBuf)
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(i * 4)
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }
    let a = this.h[0]
    let b = this.h[1]
    let c = this.h[2]
    let d = this.h[3]
    let e = this.h[4]
    let f = this.h[5]
    let g = this.h[6]
    let h = this.h[7]
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (S0 + maj) >>> 0
      h = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }
    this.h[0] = (this.h[0] + a) >>> 0
    this.h[1] = (this.h[1] + b) >>> 0
    this.h[2] = (this.h[2] + c) >>> 0
    this.h[3] = (this.h[3] + d) >>> 0
    this.h[4] = (this.h[4] + e) >>> 0
    this.h[5] = (this.h[5] + f) >>> 0
    this.h[6] = (this.h[6] + g) >>> 0
    this.h[7] = (this.h[7] + h) >>> 0
  }
}

export function sha256Bytes(chunks: Uint8Array[]): string {
  const hash = new Sha256()
  for (const chunk of chunks) hash.update(chunk)
  return hash.digest()
}

/** Read a blob in slices. This is the same update loop the worker runs. */
export async function sha256Blob(blob: Blob, sliceBytes = 64 * 1024): Promise<string> {
  const hash = new Sha256()
  for (let offset = 0; offset < blob.size; offset += sliceBytes) {
    const buf = await blob.slice(offset, offset + sliceBytes).arrayBuffer()
    hash.update(new Uint8Array(buf))
  }
  return hash.digest()
}
