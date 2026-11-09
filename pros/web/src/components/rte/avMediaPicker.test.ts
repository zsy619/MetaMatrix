// @vitest-environment happy-dom
import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import {
  createAvPicker,
  isAudioFile,
  isVideoFile,
  parseExternalMediaUrls,
  type AvInsertItem,
} from './avMediaPicker'

describe('parseExternalMediaUrls', () => {
  it('只保留 http(s)，去重，丢掉其它协议', () => {
    const urls = parseExternalMediaUrls('https://a.mp3, ftp://x\nhttp://b.wav https://a.mp3\nnotaurl')
    expect(urls).toEqual(['https://a.mp3', 'http://b.wav'])
  })
})

describe('音视频文件判断', () => {
  it('按 MIME 或扩展名区分，互不认领', () => {
    expect(isAudioFile(new File(['a'], 'song.mp3', { type: 'audio/mpeg' }))).toBe(true)
    expect(isAudioFile(new File(['a'], 'song.wav', { type: '' }))).toBe(true)
    expect(isAudioFile(new File(['a'], 'clip.mp4', { type: 'video/mp4' }))).toBe(false)
    expect(isVideoFile(new File(['a'], 'clip.mp4', { type: '' }))).toBe(true)
    expect(isVideoFile(new File(['a'], 'song.mp3', { type: 'audio/mpeg' }))).toBe(false)
  })
})

function harness(kind: 'video' | 'audio', confirm = true as boolean) {
  const inserted: AvInsertItem[][] = []
  const toasts: string[] = []
  const fileInput = ref<HTMLInputElement | null>(null)
  const picker = createAvPicker({
    kind,
    copy: {
      ariaLabel: kind === 'video' ? '插入视频' : '插入音频',
      libraryLabel: kind === 'video' ? '我的视频' : '我的音频',
      uploadLabel: kind === 'video' ? '本地视频上传' : '本地音频上传',
      urlHint: '',
      urlPlaceholder: '',
      sideIcon: kind === 'video' ? '🎬' : '♪',
      preview: kind,
    },
    catStorageKey: `test-${kind}-cat`,
    assetStorageKey: `test-${kind}-asset`,
    maxBytes: 50 * 1024 * 1024,
    isFile: kind === 'video' ? isVideoFile : isAudioFile,
    fileInput,
    messages: {
      badType: 'bad-type',
      tooBig: (name) => `big:${name}`,
      allTooBig: 'all-big',
      readFail: 'read-fail',
      badUrl: 'bad-url',
      noneSelected: 'none',
      missingData: 'missing',
      inserted: (count) => `inserted:${count}`,
    },
    closeMore: vi.fn(),
    toast: (_type, message) => {
      toasts.push(message)
    },
    uid: () => `id-${inserted.length}-${toasts.length}`,
    insertItems: (items) => {
      inserted.push(items)
    },
    confirmDelete: async () => confirm,
  })
  return { picker, inserted, toasts, fileInput }
}

describe('createAvPicker', () => {
  it('打开选择窗而不是直接读文件', () => {
    const { picker } = harness('audio')
    expect(picker.open).toBe(false)
    picker.openDialog()
    expect(picker.open).toBe(true)
    expect(picker.copy.ariaLabel).toBe('插入音频')
    expect(picker.copy.libraryLabel).toBe('我的音频')
  })

  it('外部链接确认后把 URL 交给插入回调并关闭', () => {
    const audio = harness('audio')
    audio.picker.openDialog()
    audio.picker.tab = 'external'
    audio.picker.externalUrls = 'https://cdn.example/a.mp3\nftp://nope'
    audio.picker.confirm()
    expect(audio.inserted).toEqual([[{ src: 'https://cdn.example/a.mp3', name: '' }]])
    expect(audio.picker.open).toBe(false)
    expect(audio.toasts).toEqual(['inserted:1'])

    const video = harness('video')
    video.picker.openDialog()
    video.picker.tab = 'external'
    video.picker.externalUrls = 'https://cdn.example/a.mp4'
    video.picker.confirm()
    expect(video.inserted[0][0].src).toBe('https://cdn.example/a.mp4')
  })

  it('本地音频进入同一选择流，插入项带文件名', async () => {
    const { picker, inserted } = harness('audio')
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:audio-1' })
    picker.openDialog()
    const input = document.createElement('input')
    const file = new File(['abcd'], 'voice.mp3', { type: 'audio/mpeg' })
    Object.defineProperty(input, 'files', { value: [file] })
    await picker.onFiles({ target: input } as unknown as Event)
    expect(inserted).toEqual([[{ src: 'blob:audio-1', name: 'voice.mp3' }]])
    expect(picker.open).toBe(false)
  })

  it('无效链接不插入；关掉再打开不留上次的错误文本', () => {
    const { picker, inserted, toasts } = harness('video')
    picker.openDialog()
    picker.tab = 'external'
    picker.externalUrls = 'notaurl'
    picker.confirm()
    expect(inserted).toEqual([])
    expect(toasts).toContain('bad-url')
    expect(picker.open).toBe(true)
    picker.close()
    picker.openDialog()
    expect(picker.externalUrls).toBe('')
    expect(picker.tab).toBe('personal')
    expect(picker.open).toBe(true)
  })

  it('有未提交的链接时点遮罩不关闭、不插入；空白时遮罩等于取消', () => {
    const { picker, inserted } = harness('audio')
    picker.openDialog()
    picker.tab = 'external'
    picker.externalUrls = 'https://cdn.example/a.mp3'
    picker.onMask()
    expect(picker.open).toBe(true)
    expect(picker.externalUrls).toBe('https://cdn.example/a.mp3')
    expect(inserted).toEqual([])
    picker.externalUrls = ''
    picker.onMask()
    expect(picker.open).toBe(false)
    expect(inserted).toEqual([])
  })

  it('文件选择器还开着时遮罩不关闭', () => {
    const { picker } = harness('video')
    picker.openDialog()
    picker.filePickActive = true
    picker.onMask()
    expect(picker.open).toBe(true)
  })

  it('确认后删除素材和分类；取消则保留', async () => {
    const kept = harness('audio', false)
    kept.picker.openDialog()
    kept.picker.assets = [
      { id: 'a1', src: 'blob:a', name: 'a.mp3', categoryId: 'cat', createdAt: 1 },
    ]
    kept.picker.categories = [{ id: 'cat', name: '录音' }]
    await kept.picker.deleteAsset('a1')
    await kept.picker.deleteCategory('cat')
    expect(kept.picker.assets).toHaveLength(1)
    expect(kept.picker.categories).toHaveLength(1)

    const gone = harness('video', true)
    gone.picker.openDialog()
    gone.picker.assets = [
      { id: 'v1', src: 'blob:v1', name: 'clip.mp4', categoryId: 'cat', createdAt: 1 },
      { id: 'v2', src: 'https://cdn.example/b.mp4', name: 'b.mp4', categoryId: 'cat', createdAt: 2 },
    ]
    gone.picker.categories = [{ id: 'cat', name: '片头' }]
    gone.picker.sidebarKey = 'cat'
    gone.picker.selectedIds = new Set(['v1', 'v2'])
    await gone.picker.deleteSelected()
    expect(gone.picker.assets).toEqual([])
    expect(gone.picker.selectedIds.size).toBe(0)

    gone.picker.assets = [
      { id: 'v3', src: 'https://cdn.example/c.mp4', name: 'c.mp4', categoryId: 'cat', createdAt: 3 },
    ]
    await gone.picker.deleteCategory('cat')
    expect(gone.picker.categories).toEqual([])
    expect(gone.picker.assets[0]?.categoryId).toBe('uncategorized')
    expect(gone.picker.sidebarKey).toBe('all')
  })

  it('非音频文件不插入', async () => {
    const { picker, inserted, toasts } = harness('audio')
    picker.openDialog()
    const input = document.createElement('input')
    const file = new File(['abcd'], 'clip.mp4', { type: 'video/mp4' })
    Object.defineProperty(input, 'files', { value: [file] })
    await picker.onFiles({ target: input } as unknown as Event)
    expect(inserted).toEqual([])
    expect(toasts).toContain('bad-type')
    expect(picker.open).toBe(true)
  })
})
