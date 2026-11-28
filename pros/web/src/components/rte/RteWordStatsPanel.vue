<script setup lang="ts">
/**
 * 工具栏「字数 ▾」统计面板。
 *
 * 设计口径（对齐 Telegram Web K / AGENTS.md §2）：
 *  - 浮层表面：纯白底、12px 圆角、1px 发丝线、中性投影；
 *  - 标题左对齐 16px/600，无竖条；关闭按钮 28×28、圆角 8px、hover 浅灰；
 *  - 数字用 tabular-nums，等宽对齐，避免刷新时左右跳动；
 *  - 主次分层：概览（字数/词数/阅读）用大数字卡，明细用两列 label-value 网格；
 *  - 选区有内容时高亮（品牌蓝软底），没有时弱化成一句提示，而不是两个「—」。
 */
import { computed } from 'vue'
import { IconEye, IconList, IconWordStats } from '../rteToolbarIcons'
import { wordStatTitle } from '../../utils/rteToolbarOptimize'

const props = defineProps<{
  charCount: number
  wordCount: number
  readingMinutes: number
  paragraphs: number
  lines: number
  headings: number
  cjk: number
  asciiWords: number
  images: number
  hasSelection: boolean
  selectionChars: number
  selectionWords: number
}>()

const emit = defineEmits<{ (e: 'close'): void }>()

const overview = computed(() => [
  {
    key: 'chars',
    label: '字数',
    value: props.charCount,
    unit: '',
    icon: IconWordStats,
    title: wordStatTitle('chars'),
  },
  {
    key: 'words',
    label: '词数',
    value: props.wordCount,
    unit: '',
    icon: IconList,
    title: wordStatTitle('words'),
  },
  {
    key: 'minutes',
    label: '阅读',
    value: props.readingMinutes,
    unit: '分钟',
    icon: IconEye,
    title: wordStatTitle('minutes'),
  },
])

const details = computed(() => [
  { key: 'paragraphs', label: '段落', value: props.paragraphs, title: wordStatTitle('paragraphs') },
  { key: 'lines', label: '行数', value: props.lines, title: wordStatTitle('lines') },
  { key: 'headings', label: '标题数', value: props.headings, title: wordStatTitle('headings') },
  { key: 'cjk', label: '汉字', value: props.cjk, title: wordStatTitle('cjk') },
  { key: 'ascii', label: '英文词', value: props.asciiWords, title: wordStatTitle('ascii') },
  { key: 'images', label: '图片', value: props.images, title: wordStatTitle('images') },
])
</script>

<template>
  <div class="rte-ws" role="dialog" aria-label="字数统计">
    <div class="rte-ws-head">
      <div class="rte-ws-head-text">
        <div class="rte-ws-title">字数统计</div>
        <p class="rte-ws-note">全文含标题、表格和代码中的文字，不含评论。</p>
      </div>
      <button
        type="button"
        class="rte-ws-close"
        aria-label="关闭字数统计"
        title="关闭"
        @click.stop="emit('close')"
      >×</button>
    </div>

    <div class="rte-ws-overview">
      <div v-for="item in overview" :key="item.key" class="rte-ws-card" :title="item.title">
        <span class="rte-ws-card-ico" aria-hidden="true">
          <component :is="item.icon" />
        </span>
        <span class="rte-ws-card-label">{{ item.label }}</span>
        <span class="rte-ws-card-value">
          {{ item.value }}<span v-if="item.unit" class="rte-ws-card-unit">{{ item.unit }}</span>
        </span>
      </div>
    </div>

    <div class="rte-ws-divider" />

    <div class="rte-ws-details">
      <div v-for="item in details" :key="item.key" class="rte-ws-detail" :title="item.title">
        <span class="rte-ws-detail-label">{{ item.label }}</span>
        <strong class="rte-ws-detail-value">{{ item.value }}</strong>
      </div>
    </div>

    <div class="rte-ws-divider" />

    <div class="rte-ws-selection" :class="{ 'is-active': hasSelection }">
      <template v-if="hasSelection">
        <span class="rte-ws-selection-label">选区</span>
        <span class="rte-ws-selection-values">
          <span class="rte-ws-selection-chip" :title="wordStatTitle('selectionChars')">
            字符 <strong>{{ selectionChars }}</strong>
          </span>
          <span class="rte-ws-selection-chip" :title="wordStatTitle('selectionWords')">
            词数 <strong>{{ selectionWords }}</strong>
          </span>
        </span>
      </template>
      <template v-else>
        <span class="rte-ws-selection-label">选区</span>
        <span class="rte-ws-selection-empty">未选中内容</span>
      </template>
    </div>
  </div>
</template>

<style scoped>
.rte-ws {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 100%;
  padding: 14px;
  background: var(--tg-surface, #fff);
  color: var(--tg-text, #0f0f0f);
}

/* —— 头部 —— */
.rte-ws-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.rte-ws-head-text {
  min-width: 0;
}

.rte-ws-title {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--tg-text, #0f0f0f);
}

.rte-ws-note {
  margin: 3px 0 0;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--tg-text-2, #707579);
}

.rte-ws-close {
  /*
   * !important 压过 telegram.ui.css 的通用菜单项规则
   * （.rte-float-menu button 强制 30px 行高 / 6px 圆角），
   * 这里要的是 28×28、圆角 8px 的关闭按钮（AGENTS.md §2）。
   */
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px !important;
  min-width: 28px;
  height: 28px;
  min-height: 28px !important;
  padding: 0 !important;
  border: none !important;
  border-radius: 8px !important;
  background: transparent !important;
  color: var(--tg-text-3, #8e8e8e) !important;
  font-size: 17px !important;
  line-height: 1;
  cursor: pointer;
  transition: background-color var(--tg-dur, 160ms) var(--tg-ease, cubic-bezier(0.2, 0.8, 0.3, 1)),
    color var(--tg-dur, 160ms) var(--tg-ease, cubic-bezier(0.2, 0.8, 0.3, 1));
}

.rte-ws-close:hover {
  background: var(--tg-surface-2, #f4f4f5) !important;
  color: var(--tg-text, #0f0f0f) !important;
}

/* —— 概览卡 —— */
.rte-ws-overview {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.rte-ws-card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--tg-border, #e6e6e6);
  border-radius: 12px;
  background: var(--tg-surface-2, #f4f4f5);
}

.rte-ws-card-ico {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin-bottom: 4px;
  border-radius: 8px;
  background: var(--tg-blue-soft, rgba(51, 144, 236, 0.12));
  color: var(--tg-blue, #3390ec);
}

.rte-ws-card-ico :deep(svg) {
  width: 14px;
  height: 14px;
  /* 压过 telegram.ui.css「菜单内图标统一灰」的规则 */
  color: inherit !important;
}

.rte-ws-card-label {
  font-size: 11.5px;
  line-height: 1.3;
  color: var(--tg-text-2, #707579);
}

.rte-ws-card-value {
  display: flex;
  align-items: baseline;
  gap: 2px;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.15;
  color: var(--tg-text, #0f0f0f);
  font-variant-numeric: tabular-nums;
}

.rte-ws-card-unit {
  font-size: 11px;
  font-weight: 500;
  color: var(--tg-text-2, #707579);
}

/* —— 分隔 —— */
.rte-ws-divider {
  height: 1px;
  margin: 12px 0;
  background: var(--tg-border, #e6e6e6);
}

/* —— 明细 —— */
.rte-ws-details {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 14px;
}

.rte-ws-detail {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.rte-ws-detail-label {
  font-size: 12.5px;
  color: var(--tg-text-2, #707579);
  white-space: nowrap;
}

.rte-ws-detail-value {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--tg-text, #0f0f0f);
  font-variant-numeric: tabular-nums;
}

/* —— 选区 —— */
.rte-ws-selection {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 30px;
  padding: 0 2px;
  font-size: 12.5px;
}

.rte-ws-selection.is-active {
  margin: 0 -6px;
  padding: 5px 8px;
  border-radius: 8px;
  background: var(--tg-blue-soft, rgba(51, 144, 236, 0.12));
}

.rte-ws-selection-label {
  color: var(--tg-text-2, #707579);
}

.rte-ws-selection.is-active .rte-ws-selection-label {
  color: var(--tg-blue, #3390ec);
  font-weight: 600;
}

.rte-ws-selection-values {
  display: flex;
  align-items: center;
  gap: 6px;
}

.rte-ws-selection-chip {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--tg-surface, #fff);
  color: var(--tg-text-2, #707579);
  font-variant-numeric: tabular-nums;
}

.rte-ws-selection-chip strong {
  color: var(--tg-blue, #3390ec);
  font-weight: 700;
}

.rte-ws-selection-empty {
  color: var(--tg-text-3, #8e8e8e);
}
</style>
