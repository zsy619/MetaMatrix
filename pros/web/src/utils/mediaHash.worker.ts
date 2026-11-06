/// <reference lib="webworker" />
import { Sha256 } from './sha256Stream'

let hash = new Sha256()

self.onmessage = (event: MessageEvent<{ type: 'chunk' | 'finish'; chunk?: ArrayBuffer }>) => {
  const data = event.data
  if (data.type === 'chunk' && data.chunk) {
    hash.update(new Uint8Array(data.chunk))
    return
  }
  if (data.type === 'finish') {
    const hex = hash.digest()
    hash = new Sha256()
    self.postMessage({ type: 'done', hex })
  }
}
