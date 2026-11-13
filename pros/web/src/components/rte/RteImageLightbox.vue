<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue'
import { RTE_BINDINGS } from './bindings'
import { imageDownloadName, lightboxImageSrc, stepImageZoom, wheelImageZoom } from '../../utils/rteImagePreview'
import { ensureMediaThumb, mediaThumbState, retryMediaThumb } from '../../utils/mediaThumb'

/**
 * 双击图片后的全屏预览。
 * 缩放、旋转和平移留在本组件；翻页和开关走编辑器绑定。
 */
const rte = inject(RTE_BINDINGS)
if (!rte) throw new Error('RteImageLightbox 必须放在 RichTextEditor 里')

const zoom = ref(1)
const rotate = ref(0)
const panX = ref(0)
const panY = ref(0)
const dragging = ref(false)
const toast = ref('')
const photoEl = ref<HTMLImageElement | null>(null)
const brokenSrc = ref('')
let toastTimer: ReturnType<typeof setTimeout> | null = null
let dragOrigin = { x: 0, y: 0, panX: 0, panY: 0, moved: false }

const open = computed(() => !!rte.imagePreviewOpen)
const items = computed(() => rte.imagePreviewItems || [])
const index = computed(() => Number(rte.imagePreviewIndex) || 0)
const current = computed(() => items.value[index.value] || null)
const count = computed(() => items.value.length)
const canPrev = computed(() => index.value > 0)
const canNext = computed(() => index.value < count.value - 1)
const caption = computed(() => current.value?.caption || current.value?.alt || '')
const photoState = computed(() => (current.value ? mediaThumbState(current.value.src) : null))
const photoUrl = computed(() => (photoState.value ? lightboxImageSrc(photoState.value) : ''))
const photoBroken = computed(() => !!current.value && brokenSrc.value === current.value.src)
const photoFailed = computed(() => photoBroken.value || photoState.value?.status === 'error')
const zoomLabel = computed(() => `${Math.round(zoom.value * 100)}%`)
const photoStyle = computed(() => ({
  transform: `translate(${panX.value}px, ${panY.value}px) rotate(${rotate.value}deg) scale(${zoom.value})`,
}))

function resetView() {
  zoom.value = 1
  rotate.value = 0
  panX.value = 0
  panY.value = 0
}

function showToast(text: string) {
  toast.value = text
  if (toastTimer != null) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = ''
    toastTimer = null
  }, 1600)
}

function close() {
  rte?.closeImagePreview()
}

function step(delta: number) {
  rte?.stepImagePreview(delta)
}

function fit() {
  zoom.value = 1
  panX.value = 0
  panY.value = 0
}

function zoomBy(direction: 1 | -1) {
  zoom.value = stepImageZoom(zoom.value, direction)
  if (zoom.value === 1) {
    panX.value = 0
    panY.value = 0
  }
}

function toggleZoom() {
  if (Math.abs(zoom.value - 1) < 0.02) zoom.value = 2
  else fit()
}

function zoomActual() {
  const img = photoEl.value
  if (!img?.naturalWidth) return
  const shown = img.getBoundingClientRect().width
  const layout = shown / (zoom.value || 1)
  if (!layout) return
  zoom.value = Math.min(8, Math.max(0.1, Math.round((img.naturalWidth / layout) * 100) / 100))
}

function onWheel(event: WheelEvent) {
  zoom.value = wheelImageZoom(zoom.value, event.deltaY)
  if (zoom.value === 1) {
    panX.value = 0
    panY.value = 0
  }
}

function turn(delta: number) {
  rotate.value = (rotate.value + delta + 360) % 360
}

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0) return
  const target = event.target as HTMLElement | null
  if (target?.closest('button, a')) return
  dragging.value = true
  dragOrigin = {
    x: event.clientX,
    y: event.clientY,
    panX: panX.value,
    panY: panY.value,
    moved: false,
  }
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
}

function onPointerMove(event: PointerEvent) {
  if (!dragging.value) return
  const dx = event.clientX - dragOrigin.x
  const dy = event.clientY - dragOrigin.y
  if (Math.abs(dx) + Math.abs(dy) > 3) dragOrigin.moved = true
  panX.value = dragOrigin.panX + dx
  panY.value = dragOrigin.panY + dy
}

function onPointerUp() {
  dragging.value = false
}

function thumbUrl(src: string): string {
  return lightboxImageSrc(mediaThumbState(src))
}

function onPhotoError() {
  brokenSrc.value = current.value?.src || ''
}

function retryPhoto() {
  const src = current.value?.src || ''
  brokenSrc.value = ''
  if (src) retryMediaThumb(src)
}

function activeSrc(): string {
  if (photoFailed.value) return ''
  return photoUrl.value
}

async function blobFromSrc(src: string): Promise<Blob> {
  const res = await fetch(src)
  if (!res.ok) throw new Error('fetch')
  return res.blob()
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('img'))
    img.src = src
  })
}

async function toPng(src: string, blob: Blob): Promise<Blob> {
  if (blob.type === 'image/png') return blob
  const img = await loadHtmlImage(src)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth || img.width || 1
  canvas.height = img.naturalHeight || img.height || 1
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas')
  ctx.drawImage(img, 0, 0)
  const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!png) throw new Error('png')
  return png
}

async function copyCurrent() {
  const item = current.value
  const src = activeSrc()
  if (!item || !src) {
    showToast(photoFailed.value ? '图片加载失败' : '图片还在加载')
    return
  }
  try {
    const png = await toPng(src, await blobFromSrc(src))
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('clipboard')
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
    showToast('已复制图片')
    return
  } catch {
    /* 跨域或剪贴板不支持图片时，退回复制地址 */
  }
  try {
    await navigator.clipboard.writeText(src)
    showToast('已复制图片地址')
  } catch {
    showToast('复制失败')
  }
}

async function downloadCurrent() {
  const item = current.value
  const src = activeSrc()
  if (!item || !src) {
    showToast(photoFailed.value ? '图片加载失败' : '图片还在加载')
    return
  }
  const name = imageDownloadName(item, index.value)
  try {
    const blob = await blobFromSrc(src)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.click()
    URL.revokeObjectURL(url)
  } catch {
    const link = document.createElement('a')
    link.href = src
    link.download = name
    link.target = '_blank'
    link.rel = 'noopener'
    link.click()
  }
  showToast('已开始下载')
}

function onKey(event: KeyboardEvent) {
  if (!open.value) return
  const key = event.key
  if (key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    close()
    return
  }
  if (key === 'ArrowLeft') {
    event.preventDefault()
    step(-1)
  } else if (key === 'ArrowRight') {
    event.preventDefault()
    step(1)
  } else if (key === '+' || key === '=') {
    event.preventDefault()
    zoomBy(1)
  } else if (key === '-' || key === '_') {
    event.preventDefault()
    zoomBy(-1)
  } else if (key === '0') {
    event.preventDefault()
    fit()
  }
}

watch(
  () => (open.value ? items.value.map((item: { src: string }) => item.src) : []),
  (srcs: string[]) => {
    srcs.forEach((src) => ensureMediaThumb(src))
  },
  { immediate: true },
)

watch(
  () => rte.imagePreviewOpen,
  (visible) => {
    if (visible) {
      resetView()
      window.addEventListener('keydown', onKey, true)
      document.documentElement.classList.add('rte-image-preview-open')
    } else {
      window.removeEventListener('keydown', onKey, true)
      document.documentElement.classList.remove('rte-image-preview-open')
    }
  },
)

watch(
  () => rte.imagePreviewIndex,
  () => {
    if (open.value) resetView()
  },
)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey, true)
  document.documentElement.classList.remove('rte-image-preview-open')
  if (toastTimer != null) clearTimeout(toastTimer)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open && current"
      class="rte-image-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="图片预览"
      @wheel.prevent="onWheel"
      @click.self="close"
    >
      <div class="rte-image-lightbox-top">
        <span class="rte-image-lightbox-count">{{ index + 1 }} / {{ count }}</span>
        <button type="button" class="rte-image-lightbox-icon" aria-label="关闭预览" title="关闭 (Esc)" @click="close">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M3.2 2.2 8 7l4.8-4.8 1 1L9 8l4.8 4.8-1 1L8 9l-4.8 4.8-1-1L7 8 2.2 3.2z"/></svg>
        </button>
      </div>

      <button
        type="button"
        class="rte-image-lightbox-nav is-prev"
        aria-label="上一张"
        title="看上一张"
        :disabled="!canPrev"
        @click="step(-1)"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M10.6 2.2 4.8 8l5.8 5.8-1.2 1.2L2.4 8l7-7z"/></svg>
      </button>
      <button
        type="button"
        class="rte-image-lightbox-nav is-next"
        aria-label="下一张"
        title="看下一张"
        :disabled="!canNext"
        @click="step(1)"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M5.4 2.2 11.2 8l-5.8 5.8 1.2 1.2 7-7-7-7z"/></svg>
      </button>

      <div
        class="rte-image-lightbox-stage"
        :class="{ 'is-dragging': dragging }"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @dblclick.stop.prevent="toggleZoom"
      >
        <img
          v-if="photoUrl && !photoBroken"
          ref="photoEl"
          class="rte-image-lightbox-photo"
          :class="{ 'is-dragging': dragging }"
          :src="photoUrl"
          :alt="current.alt || current.caption || '图片预览'"
          :style="photoStyle"
          draggable="false"
          @error="onPhotoError"
        />
        <div v-else class="rte-image-lightbox-fallback" role="status">
          <template v-if="photoFailed">
            <p>{{ photoState?.error || '图片加载失败，请重试' }}</p>
            <button type="button" class="rte-image-lightbox-retry" @click.stop="retryPhoto">重试</button>
          </template>
          <template v-else>
            <span class="rte-image-lightbox-spinner" aria-hidden="true"></span>
            <p>正在加载图片…</p>
          </template>
        </div>
      </div>

      <p v-if="caption" class="rte-image-lightbox-caption">{{ caption }}</p>

      <div v-if="count > 1" class="rte-image-lightbox-thumbs" @click.stop>
        <button
          v-for="(item, i) in items"
          :key="item.pos + '-' + i"
          type="button"
          class="rte-image-lightbox-thumb"
          :class="{ active: i === index }"
          :aria-label="'第 ' + (Number(i) + 1) + ' 张'"
          :title="'看第 ' + (Number(i) + 1) + ' 张'"
          :aria-current="i === index ? 'true' : undefined"
          @click="rte.setImagePreviewIndex(i)"
        >
          <img v-if="thumbUrl(item.src)" :src="thumbUrl(item.src)" alt="" />
          <span v-else class="rte-image-lightbox-thumb-empty"></span>
        </button>
      </div>

      <div class="rte-image-lightbox-bar" role="toolbar" aria-label="图片预览操作" @click.stop>
        <button type="button" class="rte-image-lightbox-icon" aria-label="缩小" title="缩小一档，最小 10%" @click="zoomBy(-1)">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M2 7h12v2H2z"/></svg>
        </button>
        <button type="button" class="rte-image-lightbox-zoom" aria-label="适应屏幕" title="回到刚好放下的大小" @click="fit">
          {{ zoomLabel }}
        </button>
        <button type="button" class="rte-image-lightbox-icon" aria-label="放大" title="放大一档，最大 8 倍" @click="zoomBy(1)">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M7 2h2v5h5v2H9v5H7V9H2V7h5z"/></svg>
        </button>
        <button type="button" class="rte-image-lightbox-text" aria-label="原始尺寸" title="按图片原始像素显示" @click="zoomActual">
          1:1
        </button>
        <span class="rte-image-lightbox-sep" aria-hidden="true"></span>
        <button type="button" class="rte-image-lightbox-icon" aria-label="向左旋转" title="逆时针转 90 度" @click="turn(-90)">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M7.5 2.2A6 6 0 0 1 13.8 8H12a4.2 4.2 0 0 0-7.2-2.9L6.5 6.8H2.2V2.5l1.8 1.8A6 6 0 0 1 7.5 2.2zM3.2 9.2A4.2 4.2 0 0 0 12 11.2l-1.7-1.6h4.3v4.3l-1.8-1.8A6 6 0 0 1 3.2 9.2z"/></svg>
        </button>
        <button type="button" class="rte-image-lightbox-icon" aria-label="向右旋转" title="顺时针转 90 度" @click="turn(90)">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8.5 2.2A6 6 0 0 1 12 4.3l1.8-1.8v4.3H9.5l1.7-1.7A4.2 4.2 0 0 0 4 8H2.2a6 6 0 0 1 6.3-5.8zM4 11.2A4.2 4.2 0 0 0 12.8 9.2H14.6A6 6 0 0 1 5.7 13.9l-1.8 1.8V11.4h4.3L6.5 13A4.2 4.2 0 0 0 4 11.2z"/></svg>
        </button>
        <span class="rte-image-lightbox-sep" aria-hidden="true"></span>
        <button type="button" class="rte-image-lightbox-text" aria-label="下载" title="下载当前这张图片" @click="downloadCurrent">
          下载
        </button>
        <button type="button" class="rte-image-lightbox-text" aria-label="复制图片" title="复制这张图片。复制不了时改为复制地址" @click="copyCurrent">
          复制
        </button>
      </div>

      <p class="rte-image-lightbox-hint">滚轮缩放 · 拖动平移 · 双击放大 · ← → 切换</p>
      <div v-if="toast" class="rte-image-lightbox-toast" role="status">{{ toast }}</div>
    </div>
  </Teleport>
</template>
