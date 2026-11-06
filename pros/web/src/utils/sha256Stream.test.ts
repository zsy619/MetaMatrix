import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { sha256Blob, sha256Bytes } from './sha256Stream'

function oracle(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex')
}

describe('sha256Bytes', () => {
  it('matches node crypto across block boundaries', () => {
    const samples = [
      new Uint8Array(),
      new Uint8Array([0x61, 0x62, 0x63]),
      new Uint8Array(55).fill(1),
      new Uint8Array(56).fill(2),
      new Uint8Array(64).fill(3),
      new Uint8Array(200).map((_, i) => i & 0xff),
    ]
    for (const sample of samples) {
      expect(sha256Bytes([sample])).toBe(oracle(sample))
      const pieces = [sample.subarray(0, 1), sample.subarray(1, 63), sample.subarray(63)]
      expect(sha256Bytes(pieces.filter((p) => p.length))).toBe(oracle(sample))
    }
  })

  it('hashes a blob one small slice at a time', async () => {
    const raw = new Uint8Array(1000).map((_, i) => (i * 7) & 0xff)
    const blob = new Blob([raw])
    expect(await sha256Blob(blob, 13)).toBe(oracle(raw))
  })
})
