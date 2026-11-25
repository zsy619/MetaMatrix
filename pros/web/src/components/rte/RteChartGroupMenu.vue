<script setup lang="ts">
/**
 * 图表一级分类下拉面板（基础 / 统计 / 关系 / 层级 / 地理 / 金融 / 坐标系 / 组件 / 3D·GL）。
 *
 * Ribbon 上的悬浮下拉与「更多」里的内联下拉共用这一份结构，
 * 保证两处面板的层级、间距、图标完全一致。
 */
import { computed } from 'vue'
import RteMenuGlyph from './RteMenuGlyph.vue'
import { chartGroupIcon } from '../rteToolbarIcons'
import type { ChartGroupWithCategories } from '../../utils/echarts/chartGroups'

const props = withDefaults(
  defineProps<{
    /** 一级分类 id（basic / stats / …）。 */
    groupId: string
    /** 面板标题，如「基础图表」。 */
    title: string
    /** 一级分类说明，如「折线 / 柱状 / 饼图 / 散点」。 */
    hint: string
    /** 该分类下的具体图表类别。 */
    categories: ChartGroupWithCategories['categories']
    /** 当前展开的类别 id。 */
    openCategoryId: string | null
    /** float = 悬浮面板；inline = 「更多」菜单里的内联面板。 */
    variant?: 'float' | 'inline'
  }>(),
  { variant: 'float' },
)

const emit = defineEmits<{
  (event: 'toggle-category', categoryId: string): void
  (event: 'insert-template', templateId: string): void
  (event: 'open-generator'): void
}>()

const groupIcon = computed(() => chartGroupIcon(props.groupId))
</script>

<template>
  <div class="rte-chart-menu" :class="`is-${variant}`">
    <header class="rte-chart-menu__head">
      <span class="rte-chart-menu__head-icon">
        <component :is="groupIcon" />
      </span>
      <span class="rte-chart-menu__head-text">
        <strong data-rte-own>{{ title }}</strong>
        <em data-rte-own>{{ hint }}</em>
      </span>
    </header>

    <div class="rte-chart-menu__list">
      <div v-for="cat in categories" :key="cat.id" class="rte-chart-menu__group">
        <button
          data-rte-own
          type="button"
          class="rte-chart-menu__row"
          :class="{ 'is-open': openCategoryId === cat.id }"
          :aria-expanded="openCategoryId === cat.id"
          @click="emit('toggle-category', cat.id)"
        >
          <span class="rte-chart-menu__icon">
            <RteMenuGlyph :id="`chart:${cat.id}`" :label="cat.label" fallback="chart" />
          </span>
          <span data-rte-own class="rte-chart-menu__name">{{ cat.label }}</span>
          <span data-rte-own class="rte-chart-menu__desc">{{ cat.hint }}</span>
          <span data-rte-own class="rte-chart-menu__count">{{ cat.templates.length }} 种</span>
          <svg data-rte-own class="rte-chart-menu__caret" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
            <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>

        <div v-if="openCategoryId === cat.id" class="rte-chart-menu__sub">
          <button
            v-for="tpl in cat.templates"
            :key="'tpl-' + tpl.id"
            data-rte-own
            type="button"
            class="rte-chart-menu__sub-row"
            @click="emit('insert-template', tpl.id)"
          >
            <span class="rte-chart-menu__sub-dot" aria-hidden="true"></span>
            <span data-rte-own class="rte-chart-menu__sub-name">{{ tpl.label }}</span>
            <span data-rte-own class="rte-chart-menu__sub-hint">{{ tpl.hint }}</span>
          </button>
        </div>
      </div>
    </div>

    <footer class="rte-chart-menu__foot">
      <button data-rte-own type="button" class="rte-chart-menu__gen" @click="emit('open-generator')">
        <svg data-rte-own class="rte-chart-menu__gen-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path
            d="M12 3l1.8 4.6L18.4 9.4 13.8 11.2 12 15.8l-1.8-4.6L5.6 9.4l4.6-1.8z"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linejoin="round"
          />
          <path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" />
        </svg>
        <span data-rte-own>一键生成图表…</span>
      </button>
    </footer>
  </div>
</template>

<style scoped>
.rte-chart-menu {
  display: flex;
  flex-direction: column;
  min-width: 252px;
  max-height: inherit;
  color: var(--rte-tg-text, #1d2129);
}

/* —— 标题栏：分类图标 + 分类名 + 说明 —— */
.rte-chart-menu__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px 9px;
  border-bottom: 1px solid var(--rte-tg-line-soft, #f0f1f3);
}
.rte-chart-menu__head-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  flex: 0 0 26px;
  border-radius: 8px;
  background: var(--rte-tg-accent-soft, #eef3ff);
  color: var(--rte-tg-accent, #3370ff);
}
.rte-chart-menu__head-icon :deep(svg) {
  width: 16px;
  height: 16px;
}
.rte-chart-menu__head-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.rte-chart-menu__head-text strong {
  font-size: 13px;
  font-weight: 600;
  line-height: 18px;
  color: var(--rte-tg-text, #1d2129);
}
.rte-chart-menu__head-text em {
  font-size: 11px;
  font-style: normal;
  line-height: 15px;
  color: var(--rte-tg-hint, #86909c);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* —— 类别列表 —— */
.rte-chart-menu__list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px;
}
.rte-chart-menu__group + .rte-chart-menu__group {
  margin-top: 1px;
}

/*
 * 行高/内边距/字号/圆角都要压过 telegram.ui.css 的
 * `.rte-float-menu button { padding: 0 10px !important; font-size: 13px !important; }`，
 * 那条规则用 !important 统一了所有浮层菜单项，scoped 普通声明打不过它，
 * 所以这里显式 !important 并写明原因（AGENTS：覆盖旧规则要写清原因）。
 */
.rte-chart-menu__row {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  width: 100%;
  min-height: 36px !important;
  padding: 0 8px !important;
  border-radius: 8px !important;
  font-size: 13px !important;
  color: var(--rte-tg-text, #1d2129) !important;
  cursor: pointer;
}
.rte-chart-menu__row:hover {
  background: var(--rte-tg-hover, #f2f3f5) !important;
}
.rte-chart-menu__row.is-open {
  background: var(--rte-tg-accent-soft, #eef3ff) !important;
  color: var(--rte-tg-accent, #3370ff) !important;
}

/* 类别图标：小方块，浅底 + 主色描边，hover 跟随行状态 */
.rte-chart-menu__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  border-radius: 6px;
  background: var(--rte-tg-line-soft, #f0f1f3);
  color: var(--rte-tg-hint, #86909c);
  transition: background var(--rte-tg-dur, 140ms) ease, color var(--rte-tg-dur, 140ms) ease;
}
.rte-chart-menu__icon :deep(svg) {
  width: 16px;
  height: 16px;
}
.rte-chart-menu__row:hover .rte-chart-menu__icon {
  background: #fff;
  color: var(--rte-tg-accent, #3370ff);
}
.rte-chart-menu__row.is-open .rte-chart-menu__icon {
  background: #fff;
  color: var(--rte-tg-accent, #3370ff);
}

.rte-chart-menu__name {
  font-weight: 600;
  white-space: nowrap;
}
.rte-chart-menu__desc {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 11px;
  color: var(--rte-tg-hint, #86909c);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 数量胶囊：贴右、弱化，不抢标题 */
.rte-chart-menu__count {
  flex: 0 0 auto;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--rte-tg-line-soft, #f0f1f3);
  font-size: 11px;
  line-height: 16px;
  color: var(--rte-tg-hint, #86909c);
}
.rte-chart-menu__row.is-open .rte-chart-menu__count {
  background: rgba(51, 112, 255, 0.12);
  color: var(--rte-tg-accent, #3370ff);
}

/* 展开箭头：折叠时朝右，展开时朝下 */
.rte-chart-menu__caret {
  flex: 0 0 12px;
  color: var(--rte-tg-hint, #86909c);
  transition: transform var(--rte-tg-dur, 140ms) ease, color var(--rte-tg-dur, 140ms) ease;
}
.rte-chart-menu__row.is-open .rte-chart-menu__caret {
  transform: rotate(90deg);
  color: var(--rte-tg-accent, #3370ff);
}

/* —— 子列表：缩进 + 左侧引导线 —— */
.rte-chart-menu__sub {
  display: flex;
  flex-direction: column;
  margin: 2px 0 4px 20px;
  padding: 2px 0 2px 10px;
  border-left: 1px solid var(--rte-tg-line, #e5e6eb);
}
.rte-chart-menu__sub-row {
  display: flex !important;
  align-items: baseline !important;
  gap: 8px !important;
  width: 100%;
  min-height: 28px !important;
  padding: 2px 8px !important;
  border-radius: 6px !important;
  font-size: 12px !important;
  color: var(--rte-tg-text, #1d2129) !important;
  cursor: pointer;
}
.rte-chart-menu__sub-row:hover {
  background: var(--rte-tg-hover, #f2f3f5) !important;
}
.rte-chart-menu__sub-dot {
  width: 4px;
  height: 4px;
  flex: 0 0 4px;
  align-self: center;
  border-radius: 50%;
  background: var(--rte-tg-line, #e5e6eb);
}
.rte-chart-menu__sub-name {
  font-weight: 500;
  white-space: nowrap;
}
.rte-chart-menu__sub-hint {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 11px;
  color: var(--rte-tg-hint, #86909c);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* —— 底部：一键生成 —— */
.rte-chart-menu__foot {
  padding: 4px;
  border-top: 1px solid var(--rte-tg-line-soft, #f0f1f3);
}
.rte-chart-menu__gen {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  width: 100%;
  min-height: 34px !important;
  padding: 0 10px !important;
  border-radius: 8px !important;
  font-size: 13px !important;
  font-weight: 500;
  color: var(--rte-tg-accent, #3370ff) !important;
  cursor: pointer;
}
.rte-chart-menu__gen:hover {
  background: var(--rte-tg-accent-soft, #eef3ff) !important;
  color: var(--rte-tg-accent, #3370ff) !important;
}
.rte-chart-menu__gen-icon {
  flex: 0 0 16px;
  color: currentColor;
}

/* 内联形态（「更多」菜单里）：列表限高，不撑破菜单 */
.rte-chart-menu.is-inline {
  min-width: 236px;
}
.rte-chart-menu.is-inline .rte-chart-menu__list {
  max-height: 320px;
}
</style>
