<script setup lang="ts">
import { inject, ref, watch } from 'vue'
import { RTE_BINDINGS } from './bindings'
import { QR_PRESETS, QR_PRESET_ROWS, QR_STYLES, makeQrArtwork, qrQuietModules, type QrModuleStyle } from '../../utils/rteQrArtwork'

const rte = inject(RTE_BINDINGS)
if (!rte) throw new Error('RteQrDialog 必须放在 RichTextEditor 里')

const text = ref('https://')
const description = ref('')
const presetId = ref(QR_PRESETS[1]!.id)
const style = ref<QrModuleStyle>('rounded')
const errorLevel = ref<'H' | 'Q' | 'M'>('H')
const quiet = ref<2 | 4 | 6>(4)
const caption = ref(true)
const preview = ref('')
const error = ref('')
const busy = ref(false)

async function refresh() {
  const value = text.value.trim()
  if (!value) {
    preview.value = ''
    error.value = ''
    return
  }
  const preset = QR_PRESETS.find((item) => item.id === presetId.value) || QR_PRESETS[0]!
  try {
    preview.value = await makeQrArtwork(value, {
      color: preset.color,
      background: preset.background,
      style: style.value,
      caption: caption.value,
      description: description.value,
      errorCorrectionLevel: errorLevel.value,
      quiet: quiet.value,
    })
    error.value = ''
  } catch (err) {
    preview.value = ''
    error.value = err instanceof Error ? err.message : '无法生成二维码'
  }
}

const QR_LAST_KEY = 'rte-qr-last'

function readLastQr(): { presetId?: string; style?: string; errorLevel?: string; caption?: boolean; quiet?: number } | null {
  try {
    return JSON.parse(localStorage.getItem(QR_LAST_KEY) || 'null')
  } catch {
    return null
  }
}

watch(() => rte.qrDialogOpen, (open) => {
  if (!open) return
  const draft = rte.qrDraft
  const last = draft ? null : readLastQr()
  text.value = draft?.text || 'https://'
  description.value = draft?.description || ''
  presetId.value = draft?.presetId || last?.presetId || QR_PRESETS[1]!.id
  style.value = (draft?.style as QrModuleStyle) || (last?.style as QrModuleStyle) || 'rounded'
  errorLevel.value = draft?.errorLevel === 'Q' || draft?.errorLevel === 'M'
    ? draft.errorLevel
    : last?.errorLevel === 'Q' || last?.errorLevel === 'M'
      ? last.errorLevel
      : 'H'
  caption.value = draft?.caption ?? last?.caption ?? true
  quiet.value = qrQuietModules(draft?.quiet ?? last?.quiet)
  void refresh()
})

watch([text, description, presetId, style, caption, errorLevel, quiet], () => {
  if (rte.qrDialogOpen) void refresh()
})

function close() {
  rte.qrDialogOpen = false
}

async function confirm() {
  const value = text.value.trim()
  if (!value || !preview.value || busy.value) return
  busy.value = true
  try {
    const meta = JSON.stringify({
      text: value,
      description: description.value,
      presetId: presetId.value,
      style: style.value,
      errorLevel: errorLevel.value,
      caption: caption.value,
      quiet: quiet.value,
    })
    try {
      localStorage.setItem(
        QR_LAST_KEY,
        JSON.stringify({ presetId: presetId.value, style: style.value, errorLevel: errorLevel.value, caption: caption.value, quiet: quiet.value }),
      )
    } catch {
      /* 隐私模式 */
    }
    await rte.insertQrArtwork(preview.value, meta)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="rte.qrDialogOpen"
      class="rte-qr-mask"
      role="dialog"
      aria-modal="true"
      aria-label="插入二维码"
      @click.self="close"
    >
      <div class="rte-qr-card">
        <h3>{{ rte.qrEditingPos != null ? '修改二维码' : '插入二维码' }}</h3>
        <p>输入链接或文字。中间留白放标记，纠错用最高等级，打印和屏幕上都能扫。</p>
        <input
          v-model="text"
          type="text"
          maxlength="1000"
          placeholder="https:// 或任意文字"
          aria-label="二维码内容"
          @keydown.enter.prevent="confirm"
        />
        <div class="rte-qr-label">样式</div>
        <div class="rte-qr-styles" role="radiogroup" aria-label="码点样式">
          <button
            v-for="item in QR_STYLES"
            :key="item.id"
            type="button"
            :class="{ active: style === item.id }"
            @click="style = item.id"
          >
            {{ item.label }}
          </button>
        </div>
        <div class="rte-qr-label">配色</div>
        <div class="rte-qr-presets">
          <div v-for="(row, index) in QR_PRESET_ROWS" :key="index" class="rte-qr-preset-row">
            <button
              v-for="preset in row"
              :key="preset.id"
              type="button"
              :class="{ active: presetId === preset.id }"
              @click="presetId = preset.id"
            >
              <i :style="{ background: preset.color }"></i>
              {{ preset.label }}
            </button>
          </div>
        </div>
        <div class="rte-qr-label">留白</div>
        <div class="rte-qr-styles" role="radiogroup" aria-label="留白">
          <button type="button" :class="{ active: quiet === 2 }" @click="quiet = 2">窄</button>
          <button type="button" :class="{ active: quiet === 4 }" @click="quiet = 4">标准</button>
          <button type="button" :class="{ active: quiet === 6 }" @click="quiet = 6">宽</button>
        </div>
        <div class="rte-qr-label">纠错</div>
        <div class="rte-qr-styles" role="radiogroup" aria-label="纠错等级">
          <button type="button" :class="{ active: errorLevel === 'H' }" @click="errorLevel = 'H'">高</button>
          <button type="button" :class="{ active: errorLevel === 'Q' }" @click="errorLevel = 'Q'">较高</button>
          <button type="button" :class="{ active: errorLevel === 'M' }" @click="errorLevel = 'M'">中</button>
        </div>
        <label class="rte-qr-caption">
          <input v-model="caption" type="checkbox" />
          底部显示内容
        </label>
        <input
          v-model="description"
          type="text"
          maxlength="40"
          placeholder="描述，例如：扫码查看详情。留空时底部显示二维码内容"
          aria-label="描述"
        />
        <div class="rte-qr-preview">
          <img v-if="preview" :src="preview" alt="二维码预览" />
          <span v-else>{{ error || '输入内容后在这里预览' }}</span>
        </div>
        <p v-if="error && preview" class="rte-qr-error">{{ error }}</p>
        <a v-if="preview" class="rte-qr-download" :href="preview" download="qrcode.png">下载图片</a>
        <div class="rte-qr-actions">
          <button type="button" @click="close">取消</button>
          <button type="button" class="is-primary" :disabled="!preview || busy" @click="confirm">{{ rte.qrEditingPos != null ? '更新' : '插入' }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.rte-qr-mask {
  position: fixed;
  inset: 0;
  z-index: 12000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.45);
}
.rte-qr-card {
  width: min(720px, 100%);
  max-height: calc(100vh - 48px);
  overflow: auto;
  padding: 20px 20px 16px;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.24);
}
.rte-qr-card h3 {
  margin: 0;
  text-align: center;
  font-size: 18px;
  color: #1d2129;
}
.rte-qr-card > p {
  margin: 8px 0 12px;
  color: #86909c;
  font-size: 13px;
  line-height: 1.5;
}
.rte-qr-card input[type='text'] {
  box-sizing: border-box;
  width: 100%;
  height: 40px;
  padding: 0 12px;
  border: 1px solid #94bfff;
  border-radius: 8px;
  font-size: 14px;
  color: #1d2129;
}
.rte-qr-label {
  margin: 12px 0 6px;
  font-size: 12px;
  color: #4e5969;
}
.rte-qr-styles {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.rte-qr-preset-row {
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
}
.rte-qr-presets {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rte-qr-styles button,
.rte-qr-presets button,
.rte-qr-actions button {
  border: 1px solid #e5e6eb;
  background: #fff;
  border-radius: 8px;
  cursor: pointer;
}
.rte-qr-styles button,
.rte-qr-presets button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  font-size: 13px;
  color: #1d2129;
}
.rte-qr-styles button.active,
.rte-qr-presets button.active {
  border-color: #1664ff;
  background: #f2f6ff;
  color: #1664ff;
}
.rte-qr-presets i {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}
.rte-qr-caption {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 12px 0 8px;
  font-size: 13px;
  color: #1d2129;
}
.rte-qr-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 220px;
  border-radius: 10px;
  background: #f7f8fa;
  color: #86909c;
  font-size: 13px;
}
.rte-qr-preview img {
  width: min(360px, 100%);
  height: auto;
  border-radius: 8px;
  background: #fff;
}
.rte-qr-error {
  margin: 8px 0 0;
  color: #f53f3f;
  font-size: 12px;
}
.rte-qr-actions {
  display: flex;
  gap: 12px;
  margin-top: 14px;
}
.rte-qr-download {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 36px;
  margin-top: 12px;
  border-radius: 8px;
  color: #1664ff;
  font-size: 14px;
  text-decoration: none;
}
.rte-qr-actions button {
  flex: 1 1 0;
  height: 40px;
  font-size: 15px;
}
.rte-qr-actions .is-primary {
  border-color: #1664ff;
  background: #1664ff;
  color: #fff;
}
.rte-qr-actions .is-primary:disabled {
  opacity: 0.45;
  cursor: default;
}
</style>
