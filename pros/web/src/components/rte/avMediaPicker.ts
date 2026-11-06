import { reactive, type Ref } from 'vue'

/** 视频 / 音频共用的选择窗：个人素材与外部链接。 */
export type AvMediaKind = 'video' | 'audio'
export type AvDialogTab = 'personal' | 'external'

export type AvStoredAsset = {
  id: string
  src: string
  name: string
  categoryId: string
  createdAt: number
}

export type AvCategory = { id: string; name: string }

export type AvPickerCopy = {
  ariaLabel: string
  libraryLabel: string
  uploadLabel: string
  urlHint: string
  urlPlaceholder: string
  sideIcon: string
  preview: 'video' | 'audio'
}

export type AvInsertItem = { src: string; name: string }

const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v|ogg|ogv|mkv)$/i
const AUDIO_EXT_RE = /\.(mp3|wav|m4a|aac|ogg|oga|flac|webm|opus)$/i

export function isVideoFile(file: File): boolean {
  if (file.type && file.type.startsWith('video/')) return true
  return VIDEO_EXT_RE.test(file.name || '')
}

export function isAudioFile(file: File): boolean {
  if (file.type.startsWith('video/')) return false
  if (file.type.startsWith('audio/')) return true
  return AUDIO_EXT_RE.test(file.name || '')
}

/** 每行一个 http(s) URL，空白和逗号也可分隔；去重，丢掉非 http(s)。 */
export function parseExternalMediaUrls(raw: string): string[] {
  const lines = raw
    .split(/[\n\r]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const urls: string[] = []
  const seen = new Set<string>()
  for (const line of lines) {
    const parts = line.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)
    for (const part of parts) {
      if (!/^https?:\/\//i.test(part)) continue
      if (seen.has(part)) continue
      seen.add(part)
      urls.push(part)
    }
  }
  return urls
}

export type AvPickerMessages = {
  badType: string
  tooBig: (name: string, maxMb: number) => string
  allTooBig: string
  readFail: string
  badUrl: string
  noneSelected: string
  missingData: string
  inserted: (count: number) => string
}

export type AvPickerOptions = {
  kind: AvMediaKind
  copy: AvPickerCopy
  catStorageKey: string
  assetStorageKey: string
  maxBytes: number
  isFile: (file: File) => boolean
  fileInput: Ref<HTMLInputElement | null>
  messages: AvPickerMessages
  closeMore: () => void
  toast: (type: 'success' | 'warning' | 'error' | 'info', message: string) => void
  uid: () => string
  insertItems: (items: AvInsertItem[]) => void
}

export type AvPicker = {
  kind: AvMediaKind
  copy: AvPickerCopy
  open: boolean
  tab: AvDialogTab
  sidebarKey: string
  categories: AvCategory[]
  assets: AvStoredAsset[]
  selectedIds: Set<string>
  selectAll: boolean
  externalUrls: string
  addingCategory: boolean
  newCategoryName: string
  readonly filteredAssets: AvStoredAsset[]
  close: () => void
  openDialog: () => void
  toggleSelect: (id: string) => void
  onSelectAllChange: () => void
  startAddCategory: () => void
  confirmAddCategory: () => void
  triggerLocalPick: () => void
  onFiles: (event: Event) => Promise<void>
  confirm: () => void
}

export function createAvPicker(options: AvPickerOptions): AvPicker {
  const picker = reactive({
    kind: options.kind,
    copy: options.copy,
    open: false,
    tab: 'personal',
    sidebarKey: 'all',
    categories: [] as AvCategory[],
    assets: [] as AvStoredAsset[],
    selectedIds: new Set<string>(),
    selectAll: false,
    externalUrls: '',
    addingCategory: false,
    newCategoryName: '',
  }) as AvPicker

  function loadStore() {
    try {
      const cats = JSON.parse(localStorage.getItem(options.catStorageKey) || '[]') as AvCategory[]
      const assets = JSON.parse(localStorage.getItem(options.assetStorageKey) || '[]') as AvStoredAsset[]
      picker.categories = Array.isArray(cats) ? cats : []
      picker.assets = Array.isArray(assets) ? assets.filter((a) => !!a.src) : []
    } catch {
      picker.categories = []
      picker.assets = []
    }
  }

  function saveStore() {
    try {
      localStorage.setItem(options.catStorageKey, JSON.stringify(picker.categories))
      // blob: 仅会话有效，不落库；http(s) 可持久。DataURL 过大则丢弃 src 以免撑爆配额
      const persistable = picker.assets
        .filter((a) => a.src && !a.src.startsWith('blob:'))
        .map((a) =>
          a.src.startsWith('data:') && a.src.length > 400_000 ? { ...a, src: '' } : a,
        )
        .filter((a) => !!a.src)
        .slice(0, 40)
      localStorage.setItem(options.assetStorageKey, JSON.stringify(persistable))
    } catch {
      try {
        localStorage.setItem(options.catStorageKey, JSON.stringify(picker.categories))
        const light = picker.assets.filter((a) => /^https?:\/\//i.test(a.src)).slice(0, 30)
        localStorage.setItem(options.assetStorageKey, JSON.stringify(light))
      } catch {
        /* private mode */
      }
    }
  }

  function reset() {
    picker.tab = 'personal'
    picker.sidebarKey = 'all'
    picker.selectedIds = new Set()
    picker.selectAll = false
    picker.externalUrls = ''
    picker.addingCategory = false
    picker.newCategoryName = ''
  }

  function currentCategoryId() {
    const key = picker.sidebarKey
    if (key === 'all' || key === 'uncategorized') return 'uncategorized'
    return key
  }

  Object.defineProperty(picker, 'filteredAssets', {
    enumerable: true,
    get() {
      const key = picker.sidebarKey
      if (key === 'all') return picker.assets
      if (key === 'uncategorized') {
        return picker.assets.filter((a) => !a.categoryId || a.categoryId === 'uncategorized')
      }
      return picker.assets.filter((a) => a.categoryId === key)
    },
  })

  picker.close = () => {
    picker.open = false
    reset()
  }

  picker.openDialog = () => {
    loadStore()
    reset()
    picker.open = true
    options.closeMore()
  }

  picker.toggleSelect = (id: string) => {
    const next = new Set(picker.selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    picker.selectedIds = next
    const visible = picker.filteredAssets
    picker.selectAll = visible.length > 0 && visible.every((a) => next.has(a.id))
  }

  picker.onSelectAllChange = () => {
    const checked = !picker.selectAll
    picker.selectAll = checked
    picker.selectedIds = checked ? new Set(picker.filteredAssets.map((a) => a.id)) : new Set()
  }

  picker.startAddCategory = () => {
    picker.addingCategory = true
    picker.newCategoryName = ''
  }

  picker.confirmAddCategory = () => {
    const name = picker.newCategoryName.trim()
    if (!name) {
      picker.addingCategory = false
      return
    }
    if (picker.categories.some((c) => c.name === name)) {
      options.toast('warning', '分类已存在')
      return
    }
    const cat: AvCategory = { id: options.uid(), name }
    picker.categories = [...picker.categories, cat]
    saveStore()
    picker.sidebarKey = cat.id
    picker.addingCategory = false
    picker.newCategoryName = ''
  }

  picker.triggerLocalPick = () => {
    options.fileInput.value?.click()
  }

  function insertAndClose(items: AvInsertItem[], success: string) {
    options.insertItems(items)
    picker.close()
    options.toast('success', success)
  }

  picker.onFiles = async (event: Event) => {
    const input = event.target as HTMLInputElement
    const rawFiles = Array.from(input.files || [])
    input.value = ''
    const files = rawFiles.filter(options.isFile)
    if (!files.length) {
      options.toast('warning', options.messages.badType)
      return
    }
    const catId = currentCategoryId()
    const added: AvStoredAsset[] = []
    let skippedSize = 0
    for (const file of files) {
      if (file.size > options.maxBytes) {
        skippedSize += 1
        options.toast('warning', options.messages.tooBig(file.name, Math.round(options.maxBytes / (1024 * 1024))))
        continue
      }
      try {
        const src = URL.createObjectURL(file)
        if (!src) continue
        added.push({
          id: options.uid(),
          src,
          name: file.name,
          categoryId: catId,
          createdAt: Date.now(),
        })
      } catch {
        /* skip */
      }
    }
    if (!added.length) {
      options.toast('error', skippedSize ? options.messages.allTooBig : options.messages.readFail)
      return
    }
    picker.assets = [...added, ...picker.assets]
    saveStore()
    const next = new Set(picker.selectedIds)
    added.forEach((a) => next.add(a.id))
    picker.selectedIds = next
    insertAndClose(
      added.map((a) => ({ src: a.src, name: a.name })),
      options.messages.inserted(added.length),
    )
  }

  picker.confirm = () => {
    if (picker.tab === 'external') {
      const urls = parseExternalMediaUrls(picker.externalUrls)
      if (!urls.length) {
        options.toast('warning', options.messages.badUrl)
        return
      }
      insertAndClose(
        urls.map((src) => ({ src, name: '' })),
        options.messages.inserted(urls.length),
      )
      return
    }
    const selected = picker.assets.filter((a) => picker.selectedIds.has(a.id))
    if (!selected.length) {
      options.toast('warning', options.messages.noneSelected)
      return
    }
    const usable = selected.filter((a) => !!a.src && String(a.src).trim())
    if (!usable.length) {
      options.toast('warning', options.messages.missingData)
      return
    }
    insertAndClose(
      usable.map((a) => ({ src: a.src, name: a.name })),
      options.messages.inserted(usable.length),
    )
  }

  return picker
}
