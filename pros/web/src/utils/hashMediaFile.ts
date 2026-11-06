import { sha256Blob } from './sha256Stream'

const SLICE = 1024 * 1024

/**
 * Stream the file through the hash worker. The main thread only holds one slice
 * at a time. Tests and workers that cannot spawn fall back to the same slice loop.
 */
export async function hashMediaFile(file: Blob): Promise<string> {
  if (typeof Worker === 'undefined') return sha256Blob(file, SLICE)
  try {
    return await hashInWorker(file)
  } catch {
    return sha256Blob(file, SLICE)
  }
}

function hashInWorker(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./mediaHash.worker.ts', import.meta.url), { type: 'module' })
    const fail = (error: unknown) => {
      worker.terminate()
      reject(error instanceof Error ? error : new Error('hash worker failed'))
    }
    worker.onerror = (event) => fail(event.error || new Error(event.message))
    worker.onmessage = (event: MessageEvent<{ type: string; hex?: string }>) => {
      if (event.data?.type === 'done' && event.data.hex) {
        worker.terminate()
        resolve(event.data.hex)
      }
    }
    void (async () => {
      try {
        for (let offset = 0; offset < file.size; offset += SLICE) {
          const buf = await file.slice(offset, offset + SLICE).arrayBuffer()
          worker.postMessage({ type: 'chunk', chunk: buf }, [buf])
        }
        worker.postMessage({ type: 'finish' })
      } catch (error) {
        fail(error)
      }
    })()
  })
}
