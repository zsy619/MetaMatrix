<script setup lang="ts">
/**
 * 工具栏「模板 ▾」面板。
 *
 * 设计口径（对齐 Telegram Web K）：
 *  - 纯白表面 + 12px 圆角 + 中性投影，标题左对齐无竖条；
 *  - 顶部固定搜索框（88 个模板靠肉眼翻找不现实）；
 *  - 分组标题带色标，条目是卡片，图标用分组强调色做 chip；
 *  - 交互统一 160ms cubic-bezier(.2,.8,.3,1)，文字对比度 ≥ 4.5:1。
 */
import { computed, ref } from 'vue'
import type { Component } from 'vue'
import { RTE_DOC_TEMPLATE_GROUPS, RTE_DOC_TEMPLATES } from '../rteDocTemplates'
import {
  IconCallout,
  IconTemplate,
  IconDocument,
  IconEmoji,
  IconFind,
  IconForm,
  IconFormCheckbox,
  IconFormRadio,
  IconFormText,
  IconCode,
  IconGuide,
  IconLink,
  IconLinkButton,
  IconList,
  IconListOrdered,
  IconListTask,
  IconMarkdown,
  IconOptimize,
  IconOutline,
  IconQuote,
  IconSigma,
  IconTable,
  IconTableRows,
} from '../rteToolbarIcons'

const emit = defineEmits<{ (e: 'select', id: string): void }>()

type GroupUi = { accent: string; soft: string; icons: Component[] }

/**
 * 分组强调色与图标：一组一个色标，条目 chip 跟随所属分组。
 * 组内给 3 个同色系图标轮换，避免整组条目图标完全一样（原始面板的通病），
 * 同时保持「按分类」的色彩语义。
 */
const GROUP_UI: Record<string, GroupUi> = {
  office: { accent: '#3390ec', soft: 'rgba(51,144,236,.12)', icons: [IconDocument, IconListTask, IconTable] },
  product: { accent: '#8b5cf6', soft: 'rgba(139,92,246,.12)', icons: [IconOptimize, IconCode, IconGuide] },
  project: { accent: '#4fae4e', soft: 'rgba(79,174,78,.12)', icons: [IconListTask, IconListOrdered, IconTable] },
  sales: { accent: '#ef8f3c', soft: 'rgba(239,143,60,.12)', icons: [IconLink, IconLinkButton, IconCallout] },
  hr: { accent: '#26a6a6', soft: 'rgba(38,166,166,.12)', icons: [IconForm, IconFormText, IconFormCheckbox] },
  notes: { accent: '#e05b8a', soft: 'rgba(224,91,138,.12)', icons: [IconEmoji, IconQuote, IconMarkdown] },
  formHr: { accent: '#26a6a6', soft: 'rgba(38,166,166,.12)', icons: [IconForm, IconFormRadio, IconFormCheckbox] },
  formSales: { accent: '#ef8f3c', soft: 'rgba(239,143,60,.12)', icons: [IconLink, IconLinkButton, IconCallout] },
  formFinance: { accent: '#4fae4e', soft: 'rgba(79,174,78,.12)', icons: [IconTable, IconSigma, IconTableRows] },
  formProject: { accent: '#3390ec', soft: 'rgba(51,144,236,.12)', icons: [IconListTask, IconList, IconOutline] },
  formOffice: { accent: '#8b5cf6', soft: 'rgba(139,92,246,.12)', icons: [IconDocument, IconTable, IconMarkdown] },
  formSurvey: { accent: '#e05b8a', soft: 'rgba(224,91,138,.12)', icons: [IconListOrdered, IconList, IconFormText] },
  formApproval: { accent: '#f7bc2f', soft: 'rgba(247,188,47,.14)', icons: [IconFormCheckbox, IconFormRadio, IconCallout] },
}

const FALLBACK_UI: GroupUi = {
  accent: '#707579',
  soft: 'rgba(112,117,121,.12)',
  icons: [IconDocument, IconTemplate],
}

const query = ref('')

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return RTE_DOC_TEMPLATES
  return RTE_DOC_TEMPLATES.filter(
    (tpl) =>
      tpl.label.toLowerCase().includes(q) ||
      (tpl.description || '').toLowerCase().includes(q),
  )
})

const groups = computed(() =>
  RTE_DOC_TEMPLATE_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    ui: GROUP_UI[group.id] || FALLBACK_UI,
    items: filtered.value.filter((tpl) => tpl.group === group.id),
  })).filter((group) => group.items.length > 0),
)

const matchedCount = computed(() => filtered.value.length)
const totalCount = RTE_DOC_TEMPLATES.length

function clearQuery() {
  query.value = ''
}
</script>

<template>
  <div data-rte-own class="rte-tpl-picker">
    <div class="rte-tpl-head">
      <div class="rte-tpl-head-row">
        <span class="rte-tpl-head-title">模板</span>
        <span class="rte-tpl-head-count">{{ matchedCount }} / {{ totalCount }}</span>
      </div>
      <label class="rte-tpl-search">
        <span class="rte-tpl-search-ico"><IconFind /></span>
        <input
          v-model="query"
          type="text"
          class="rte-tpl-search-input"
          placeholder="搜索模板名称或用途"
          aria-label="搜索模板"
          @mousedown.stop
        />
        <button
          v-if="query"
          type="button"
          class="rte-tpl-search-clear"
          aria-label="清空搜索"
          @click.stop="clearQuery"
        >×</button>
      </label>
    </div>

    <div class="rte-tpl-body">
      <section
        v-for="group in groups"
        :key="group.id"
        class="rte-tpl-group"
        :style="{ '--tpl-accent': group.ui.accent, '--tpl-accent-soft': group.ui.soft }"
      >
        <div class="rte-tpl-group-head">
          <span class="rte-tpl-group-bar" aria-hidden="true"></span>
          <span class="rte-tpl-group-name">{{ group.label }}</span>
          <span class="rte-tpl-group-count">{{ group.items.length }}</span>
        </div>
        <div class="rte-tpl-grid">
          <button
            v-for="(tpl, idx) in group.items"
            :key="tpl.id"
            type="button"
            class="rte-tpl-item"
            :title="tpl.description || tpl.label"
            @click.stop="emit('select', tpl.id)"
          >
            <span class="rte-tpl-item-ico" aria-hidden="true">
              <component :is="group.ui.icons[idx % group.ui.icons.length]" />
            </span>
            <span class="rte-tpl-item-text">
              <span class="rte-tpl-item-label">{{ tpl.label }}</span>
              <span v-if="tpl.description" class="rte-tpl-item-desc">{{
                tpl.description
              }}</span>
            </span>
          </button>
        </div>
      </section>

      <div v-if="!groups.length" class="rte-tpl-empty">
        <span class="rte-tpl-empty-ico" aria-hidden="true"><IconFind /></span>
        <span class="rte-tpl-empty-title">没有匹配的模板</span>
        <span class="rte-tpl-empty-desc">换个关键词试试，或清空搜索框</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rte-tpl-picker {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  width: 100%;
  min-height: 0;
  max-height: var(--rte-float-max-h, min(70vh, 560px));
  background: var(--tg-surface, #fff);
  color: var(--tg-text, #0f0f0f);
}

/* —— 头部：标题 + 搜索 —— */
.rte-tpl-head {
  flex: 0 0 auto;
  padding: 12px 14px 10px;
  border-bottom: 1px solid var(--tg-border, #e6e6e6);
}

.rte-tpl-head-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.rte-tpl-head-title {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--tg-text, #0f0f0f);
}

.rte-tpl-head-count {
  font-size: 12px;
  font-weight: 500;
  color: var(--tg-text-3, #8e8e8e);
  font-variant-numeric: tabular-nums;
}

.rte-tpl-search {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--tg-border, #e6e6e6);
  border-radius: 12px;
  background: var(--tg-surface, #fff);
  transition: border-color var(--tg-dur, 160ms) var(--tg-ease, cubic-bezier(0.2, 0.8, 0.3, 1)),
    box-shadow var(--tg-dur, 160ms) var(--tg-ease, cubic-bezier(0.2, 0.8, 0.3, 1));
}

.rte-tpl-search:focus-within {
  border-color: var(--tg-blue, #3390ec);
  box-shadow: 0 0 0 3px rgba(51, 144, 236, 0.12);
}

.rte-tpl-search-ico {
  display: inline-flex;
  color: var(--tg-text-3, #8e8e8e);
}

.rte-tpl-search-ico :deep(svg) {
  width: 16px;
  height: 16px;
}

.rte-tpl-search-input {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  border: none;
  outline: none;
  background: transparent;
  font-size: 13.5px;
  color: var(--tg-text, #0f0f0f);
}

.rte-tpl-search-input::placeholder {
  color: var(--tg-text-3, #8e8e8e);
}

.rte-tpl-search-clear {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  /* !important 压过 telegram.ui.css 的通用菜单项规则（.rte-float-menu button），
   * 保持 × 按钮小巧，不被拉成 30px 高的菜单项。 */
  min-height: 22px !important;
  padding: 0 !important;
  border: none !important;
  border-radius: 8px !important;
  background: var(--tg-surface-2, #f4f4f5) !important;
  color: var(--tg-text-2, #707579) !important;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  transition: background-color var(--tg-dur, 160ms) var(--tg-ease, cubic-bezier(0.2, 0.8, 0.3, 1));
}

.rte-tpl-search-clear:hover {
  background: var(--tg-surface-3, #ececf1) !important;
  color: var(--tg-text, #0f0f0f) !important;
}

/* —— 分组 —— */
.rte-tpl-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px 14px 14px;
}

.rte-tpl-group {
  padding-top: 12px;
}

.rte-tpl-group-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 2px 8px;
}

.rte-tpl-group-bar {
  width: 3px;
  height: 12px;
  border-radius: 2px;
  background: var(--tpl-accent, var(--tg-blue, #3390ec));
}

.rte-tpl-group-name {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--tg-text-2, #707579);
}

.rte-tpl-group-count {
  font-size: 11px;
  font-weight: 500;
  color: var(--tg-text-3, #8e8e8e);
  font-variant-numeric: tabular-nums;
}

/* —— 条目卡片 —— */
.rte-tpl-grid {
  display: grid;
  /* 自适应列数：窄容器 1 列，工具栏面板 2 列，「更多」宽面板 3 列 */
  grid-template-columns: repeat(auto-fill, minmax(228px, 1fr));
  gap: 6px;
}

.rte-tpl-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
  /*
   * !important 用来压过 telegram.ui.css 的通用菜单项规则
   * （.rte-float-menu button 强制 30px 行高 / 6px 圆角 / 13px 字号）。
   * 模板面板要的是「卡片」而不是「菜单项」，所以在这里放开。
   */
  min-height: 0;
  padding: 9px 10px !important;
  border: 1px solid transparent !important;
  border-radius: 12px !important;
  background: var(--tg-surface, #fff) !important;
  font-size: 13px !important;
  color: inherit !important;
  text-align: left;
  cursor: pointer;
  transition: background-color var(--tg-dur, 160ms) var(--tg-ease, cubic-bezier(0.2, 0.8, 0.3, 1)),
    border-color var(--tg-dur, 160ms) var(--tg-ease, cubic-bezier(0.2, 0.8, 0.3, 1)),
    transform var(--tg-dur, 160ms) var(--tg-ease, cubic-bezier(0.2, 0.8, 0.3, 1)),
    box-shadow var(--tg-dur, 160ms) var(--tg-ease, cubic-bezier(0.2, 0.8, 0.3, 1));
}

.rte-tpl-item:hover {
  background: var(--tg-surface-2, #f4f4f5) !important;
  color: inherit !important;
  border-color: var(--tg-border-strong, #d8d8dc) !important;
  transform: translateY(-1px);
  box-shadow: var(--tg-shadow-1, 0 1px 2px rgba(15, 23, 42, 0.06));
}

.rte-tpl-item:active {
  transform: translateY(0);
}

.rte-tpl-item:focus-visible {
  outline: 2px solid var(--tg-blue, #3390ec);
  outline-offset: 1px;
}

.rte-tpl-item-ico {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: var(--tpl-accent-soft, rgba(51, 144, 236, 0.12));
  color: var(--tpl-accent, var(--tg-blue, #3390ec));
  transition: background-color var(--tg-dur, 160ms) var(--tg-ease, cubic-bezier(0.2, 0.8, 0.3, 1));
}

.rte-tpl-item-ico :deep(svg) {
  width: 16px;
  height: 16px;
  /* 压过 telegram.ui.css「菜单内图标统一灰」的规则：图标跟随分组色 */
  color: inherit !important;
}

.rte-tpl-item:hover .rte-tpl-item-ico {
  background: var(--tpl-accent, var(--tg-blue, #3390ec));
  color: #fff;
}

.rte-tpl-item:hover .rte-tpl-item-ico :deep(svg) {
  color: #fff !important;
}

.rte-tpl-item-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.rte-tpl-item-label {
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--tg-text, #0f0f0f);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rte-tpl-item-desc {
  font-size: 12px;
  font-weight: 400;
  line-height: 1.4;
  color: var(--tg-text-2, #707579);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* —— 空态 —— */
.rte-tpl-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 40px 0 32px;
  text-align: center;
}

.rte-tpl-empty-ico {
  display: inline-flex;
  margin-bottom: 6px;
  color: var(--tg-text-3, #8e8e8e);
}

.rte-tpl-empty-ico :deep(svg) {
  width: 28px;
  height: 28px;
  stroke-width: 1.4;
}

.rte-tpl-empty-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--tg-text, #0f0f0f);
}

.rte-tpl-empty-desc {
  font-size: 12.5px;
  color: var(--tg-text-2, #707579);
}
</style>
