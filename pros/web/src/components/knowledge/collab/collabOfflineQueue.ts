/** 协同离线队列：按文档隔离存放未发出的 Yjs 更新。不存 token / 密钥。 */

const STORAGE_PREFIX = 'mm-collab-offline-v1:'
const IDB_NAME = 'mm-collab-offline'
const IDB_STORE = 'queues'

export type OfflineQueueStore = {
  load(documentId: string): Promise<string[]>
  save(documentId: string, payloads: string[]): Promise<void>
  clear(documentId: string): Promise<void>
}

export function memoryOfflineQueueStore(map = new Map<string, string[]>()): OfflineQueueStore {
  return {
    async load(documentId) {
      return [...(map.get(documentId) ?? [])]
    },
    async save(documentId, payloads) {
      map.set(documentId, [...payloads])
    },
    async clear(documentId) {
      map.delete(documentId)
    },
  }
}

export function localStorageOfflineQueueStore(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = localStorage,
): OfflineQueueStore {
  return {
    async load(documentId) {
      const raw = storage.getItem(STORAGE_PREFIX + documentId)
      if (!raw) return []
      try {
        const parsed = JSON.parse(raw) as { updates?: unknown }
        return Array.isArray(parsed.updates)
          ? parsed.updates.filter((u): u is string => typeof u === 'string')
          : []
      } catch {
        return []
      }
    },
    async save(documentId, payloads) {
      if (payloads.length === 0) {
        storage.removeItem(STORAGE_PREFIX + documentId)
        return
      }
      storage.setItem(STORAGE_PREFIX + documentId, JSON.stringify({ updates: payloads }))
    },
    async clear(documentId) {
      storage.removeItem(STORAGE_PREFIX + documentId)
    },
  }
}

function idbQueueStore(): OfflineQueueStore {
  const open = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(IDB_STORE)) {
          req.result.createObjectStore(IDB_STORE)
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'))
    })

  const withStore = async <T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>) => {
    const db = await open()
    try {
      return await new Promise<T>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, mode)
        const req = fn(tx.objectStore(IDB_STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error ?? new Error('indexedDB request failed'))
      })
    } finally {
      db.close()
    }
  }

  return {
    async load(documentId) {
      const value = await withStore('readonly', (store) => store.get(documentId))
      if (Array.isArray(value)) {
        return value.filter((u): u is string => typeof u === 'string')
      }
      if (value && typeof value === 'object' && Array.isArray((value as { updates?: unknown }).updates)) {
        return (value as { updates: unknown[] }).updates.filter((u): u is string => typeof u === 'string')
      }
      return []
    },
    async save(documentId, payloads) {
      if (payloads.length === 0) {
        await withStore('readwrite', (store) => store.delete(documentId))
        return
      }
      await withStore('readwrite', (store) => store.put({ updates: payloads }, documentId))
    },
    async clear(documentId) {
      await withStore('readwrite', (store) => store.delete(documentId))
    },
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('offline queue timeout')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

let idbAvailable: boolean | null = null

/** 浏览器优先 IndexedDB；打开失败或超时时退回 localStorage。测试可注入内存实现。 */
export function defaultOfflineQueueStore(): OfflineQueueStore {
  const fallback =
    typeof localStorage !== 'undefined' ? localStorageOfflineQueueStore() : memoryOfflineQueueStore()
  if (typeof indexedDB === 'undefined') return fallback
  const idb = idbQueueStore()
  const useIdb = async () => {
    if (idbAvailable != null) return idbAvailable
    try {
      await withTimeout(idb.load('__probe__'), 200)
      idbAvailable = true
    } catch {
      idbAvailable = false
    }
    return idbAvailable
  }
  const run = async <T>(primary: () => Promise<T>, secondary: () => Promise<T>): Promise<T> => {
    if (!(await useIdb())) return secondary()
    try {
      return await withTimeout(primary(), 500)
    } catch {
      idbAvailable = false
      return secondary()
    }
  }
  return {
    load: (documentId) => run(() => idb.load(documentId), () => fallback.load(documentId)),
    save: (documentId, payloads) => run(() => idb.save(documentId, payloads), () => fallback.save(documentId, payloads)),
    clear: (documentId) => run(() => idb.clear(documentId), () => fallback.clear(documentId)),
  }
}

export function isCollabWritable(info: { canWrite?: boolean; role?: string }): boolean {
  if (info.canWrite === false) return false
  return String(info.role || '').toLowerCase() !== 'viewer'
}
