<script setup lang="ts">
import { IconLink } from '../rteToolbarIcons'
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
/**
 * 配置分区用标签页承载，面板固定高度：
 * 弹窗高度不再随"样式 / 配色 / 高级"内容多少而跳动。
 */
type QrConfigTab = 'style' | 'color' | 'advanced'
const QR_CONFIG_TABS: { id: QrConfigTab; label: string }[] = [
  { id: 'style', label: '样式' },
  { id: 'color', label: '配色' },
  { id: 'advanced', label: '高级' },
]
const activeTab = ref<QrConfigTab>('style')

function onTabKeydown(event: KeyboardEvent) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  event.preventDefault()
  const idx = QR_CONFIG_TABS.findIndex((tab) => tab.id === activeTab.value)
  const step = event.key === 'ArrowRight' ? 1 : -1
  const next = (idx + step + QR_CONFIG_TABS.length) % QR_CONFIG_TABS.length
  activeTab.value = QR_CONFIG_TABS[next]!.id
}

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
        <p class="rte-qr-intro">输入链接或文字。中间留白放标记，纠错用最高等级，打印和屏幕上都能扫。</p>
        <div class="rte-tg-section-title">内容</div>
        <div class="rte-tg-card">
          <div class="rte-tg-row">
            <span class="rte-tg-row-icon" aria-hidden="true">
              <component :is="IconLink" />
            </span>
            <input
              v-model="text"
              class="rte-tg-row-field"
              type="text"
              maxlength="1000"
              placeholder="https:// 或任意文字"
              aria-label="二维码内容"
              title="二维码里的链接或文字，最多 1000 字，按 Enter 插入"
              @keydown.enter.prevent="confirm"
            />
          </div>
        </div>
        <div class="rte-tg-section-title">配置</div>
        <!--
          配置区改成标签页 + 固定高度面板：
          原来三段配置纵向堆叠，弹窗被拉到近 900px 高；
          现在拆成"样式 / 配色 / 高级"三页，面板高度固定，弹窗整体矮一截，
          切换标签时高度也不跳。
        -->
        <div class="rte-tg-card">
        <div class="rte-qr-tabs rte-tg-segmented" role="tablist" aria-label="二维码配置" @keydown="onTabKeydown">
          <button
            v-for="tab in QR_CONFIG_TABS"
            :key="tab.id"
            type="button"
            role="tab"
            :aria-selected="activeTab === tab.id"
            :tabindex="activeTab === tab.id ? 0 : -1"
            :class="{ active: activeTab === tab.id }"
            @click="activeTab = tab.id"
          >
            {{ tab.label }}
          </button>
        </div>
        <div class="rte-qr-tabpanel rte-tg-row rte-tg-row--block">
          <div v-show="activeTab === 'style'" class="rte-qr-tabbody" role="tabpanel" aria-label="码点样式">
            <div class="rte-qr-label">码点样式</div>
            <div class="rte-qr-styles" role="radiogroup" aria-label="码点样式">
              <button
                v-for="item in QR_STYLES"
                :key="item.id"
                type="button"
                :class="{ active: style === item.id }"
                :title="item.title"
                @click="style = item.id"
              >
                {{ item.label }}
              </button>
            </div>
          </div>
          <div v-show="activeTab === 'color'" class="rte-qr-tabbody" role="tabpanel" aria-label="配色">
            <div class="rte-qr-label">配色</div>
            <div class="rte-qr-presets">
              <div v-for="(row, index) in QR_PRESET_ROWS" :key="index" class="rte-qr-preset-row">
                <button
                  v-for="preset in row"
                  :key="preset.id"
                  type="button"
                  :class="{ active: presetId === preset.id }"
                  :title="'码用' + preset.label + '，深色画在浅底上'"
                  @click="presetId = preset.id"
                >
                  <i :style="{ background: preset.color }"></i>
                  {{ preset.label }}
                </button>
              </div>
            </div>
          </div>
          <div v-show="activeTab === 'advanced'" class="rte-qr-tabbody" role="tabpanel" aria-label="高级设置">
            <!--
              留白与纠错并排一行：
              两组都是"同一维度的小按钮组"，上下堆叠会拉长弹窗、让人误以为是两段内容。
            -->
            <div class="rte-qr-row">
              <div class="rte-qr-field">
                <div class="rte-qr-label">留白</div>
                <div class="rte-qr-styles" role="radiogroup" aria-label="留白">
                  <button type="button" :class="{ active: quiet === 2 }" title="四周留 2 个码点" @click="quiet = 2">窄</button>
                  <button type="button" :class="{ active: quiet === 4 }" title="四周留 4 个码点" @click="quiet = 4">标准</button>
                  <button type="button" :class="{ active: quiet === 6 }" title="四周留 6 个码点" @click="quiet = 6">宽</button>
                </div>
              </div>
              <div class="rte-qr-field">
                <div class="rte-qr-label">纠错</div>
                <div class="rte-qr-styles" role="radiogroup" aria-label="纠错等级">
                  <button type="button" :class="{ active: errorLevel === 'H' }" title="纠错最高，大约能恢复三成损坏" @click="errorLevel = 'H'">高</button>
                  <button type="button" :class="{ active: errorLevel === 'Q' }" title="纠错较高，大约能恢复四分之一损坏" @click="errorLevel = 'Q'">较高</button>
                  <button type="button" :class="{ active: errorLevel === 'M' }" title="纠错中等，大约能恢复 15% 损坏" @click="errorLevel = 'M'">中</button>
                </div>
              </div>
            </div>
            <label class="rte-qr-caption">
              <input v-model="caption" type="checkbox" title="勾选后，在码下方印出描述或内容" />
              底部显示内容
            </label>
            <input
              v-model="description"
              type="text"
              maxlength="40"
              placeholder="描述，例如：扫码查看详情。留空时底部显示二维码内容"
              aria-label="描述"
              title="底部说明，最多 40 字。留空时显示二维码内容"
            />
          </div>
        </div>
        </div>
        <div class="rte-tg-section-title">预览</div>
        <div class="rte-tg-card">
        <div class="rte-qr-preview">
          <img v-if="preview" :src="preview" alt="二维码预览" />
          <span v-else>{{ error || '输入内容后在这里预览' }}</span>
        </div>
        <p v-if="error && preview" class="rte-qr-error">{{ error }}</p>
        <a v-if="preview" class="rte-qr-download" :href="preview" download="qrcode.png" title="把当前预览存成 PNG">下载图片</a>
        </div>
        <div class="rte-tg-actions rte-qr-actions">
          <button type="button" title="不插入二维码" @click="close">取消</button>
          <button type="button" class="is-primary" :title="rte.qrEditingPos != null ? '用当前样式换掉这张二维码' : '把这张二维码插到光标处'" :disabled="!preview || busy" @click="confirm">{{ rte.qrEditingPos != null ? '更新' : '插入' }}</button>
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
/* Telegram App 风格外壳：浅灰页面底 + 白色分组卡（详见 telegram.ui.css 的第 7 节） */
.rte-qr-card {
  width: min(720px, 100%);
  max-height: calc(100vh - 48px);
  overflow: auto;
  padding: 18px 18px 16px;
  border-radius: 12px;
  background: #f2f2f7;
  box-shadow: 0 12px 40px rgba(15, 23, 42, 0.22);
}
.rte-qr-card h3 {
  margin: 0;
  text-align: center;
  font-size: 17px;
  font-weight: 600;
  color: #000;
}
.rte-qr-card > p {
  margin: 6px 0 0;
  color: #8e8e93;
  font-size: 12.5px;
  line-height: 1.5;
  text-align: center;
}
.rte-qr-card input[type='text'] {
  box-sizing: border-box;
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border: 1px solid #e5e5ea;
  border-radius: 8px;
  background: #fff;
  font-size: 14px;
  color: #000;
}
/* 分组行里的输入：去掉自身边框，融进行 */
.rte-tg-row .rte-tg-row-field {
  height: 32px;
  border-color: transparent;
  background: rgba(118, 118, 128, 0.1);
}
.rte-tg-row .rte-tg-row-field:focus {
  outline: none;
  border-color: #3370ff;
  background: #fff;
}
/* 卡片内的整块内容行 */
.rte-tg-row--block {
  display: block;
  padding: 12px 14px;
}
.rte-qr-label {
  margin: 12px 0 6px;
  font-size: 12px;
  color: #4e5969;
}
/* 配置区标签页：面板固定高度，切换标签时弹窗高度不跳。 */
.rte-qr-tabs {
  display: flex;
  justify-content: center;
  gap: 2px;
  margin: 0;
  padding: 3px;
  border-radius: 9px;
  background: rgba(118, 118, 128, 0.12);
}
.rte-qr-tabs button {
  height: 28px;
  padding: 0 14px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #4e5969;
  font-size: 13px;
  cursor: pointer;
  transition:
    background .16s ease,
    color .16s ease,
    box-shadow .16s ease;
}
.rte-qr-tabs button:hover {
  color: #1d2129;
}
.rte-qr-tabs button.active {
  background: #fff;
  color: #1664ff;
  box-shadow: 0 1px 3px rgba(15, 23, 42, .12);
}
.rte-qr-tabs button:focus-visible {
  outline: 2px solid rgba(22, 100, 255, .45);
  outline-offset: 1px;
}
.rte-qr-tabpanel {
  height: 156px;
  margin-top: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  border-top: 1px solid #e5e5ea;
}
.rte-qr-tabbody {
  padding-top: 4px;
}
.rte-qr-tabbody .rte-qr-label {
  margin-top: 6px;
}
/* 留白 / 纠错并排一行；窄屏时回落为上下排列，避免挤压。 */
.rte-qr-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 24px;
  align-items: flex-start;
}
.rte-qr-field {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.rte-qr-field .rte-qr-label {
  margin-top: 12px;
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
  min-height: 176px;
  border-radius: 0;
  background: #fff;
  color: #8e8e93;
  font-size: 13px;
}
.rte-qr-preview img {
  width: min(300px, 100%);
  max-height: 176px;
  height: auto;
  object-fit: contain;
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
  justify-content: flex-end;
  gap: 8px;
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
  flex: 0 0 auto;
  min-height: 34px;
  padding: 0 16px;
  border: none;
  border-radius: 8px;
  background: rgba(118, 118, 128, 0.12);
  color: #3370ff;
  font-size: 14px;
  cursor: pointer;
}
.rte-qr-actions .is-primary {
  background: #3370ff;
  color: #fff;
}
.rte-qr-actions .is-primary:disabled {
  opacity: 0.45;
  cursor: default;
}
</style>
