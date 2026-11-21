<script setup lang="ts">
/**
 * 统一图标选择器（系统级）。
 *
 * 全站凡是有「图标 / 表情」的地方都用它：知识库节点、文档标题、画布标题、
 * 项目图标。数据来自 Unicode emoji 全量库，按官方分类分组，可搜索。
 */
import { computed, ref } from 'vue'
import { Close, Search } from '@element-plus/icons-vue'
import { ICON_GROUPS, ICON_SEARCH, ICON_TOTAL, type IconItem } from './iconData'

const props = withDefaults(
  defineProps<{
    modelValue?: string
    /** 「恢复默认图标」按钮的目标值。 */
    defaultIcon?: string
    /** 面板宽度（px）。 */
    width?: number
  }>(),
  { modelValue: '', defaultIcon: '', width: 320 },
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

/** 中文别名：搜「文件」能命中 📄，搜「脑图」能命中 🧠。 */
const CN_ALIAS: Record<string, string[]> = {
  '📁': ['文件夹', '目录'],
  '📄': ['文档', '文件'],
  '📃': ['文档', '文件'],
  '📋': ['剪贴板', '清单'],
  '📊': ['表格', '数据', '统计'],
  '📈': ['增长', '趋势', '图表'],
  '🧠': ['脑图', '大脑', '思维', '想法'],
  '💡': ['想法', '灵感', '灯泡'],
  '🎯': ['目标', '靶心'],
  '🚀': ['启动', '发布', '火箭'],
  '🔥': ['火', '热', '紧急'],
  '⭐': ['星', '收藏', '重要'],
  '✅': ['完成', '对勾', '通过'],
  '❗': ['注意', '重要'],
  '⚠️': ['警告', '风险'],
  '🔍': ['搜索', '查找'],
  '🔔': ['提醒', '通知'],
  '📅': ['日历', '日程'],
  '⏰': ['时间', '闹钟'],
  '💬': ['对话', '消息', '评论'],
  '👥': ['团队', '成员', '用户'],
  '🏠': ['首页', '主页'],
  '🔗': ['链接'],
  '🧩': ['拼图', '组件', '模块'],
  '🛠️': ['工具', '设置'],
  '📝': ['编辑', '笔记', '文档'],
  '🧪': ['实验', '测试'],
  '🌱': ['成长', '种子', '开始'],
  '🏔️': ['目标', '高峰'],
  '🎨': ['设计', '画布', '美术'],
  '📌': ['置顶', '重点'],
  '🗂️': ['分类', '归档'],
  '🏁': ['结束', '终点'],
  '🌟': ['星光', '亮点'],
  '💰': ['钱', '收入', '预算'],
  '🛒': ['购物', '采购'],
  '🔒': ['私密', '锁'],
  '🔓': ['公开', '解锁'],
  '📚': ['学习', '书'],
  '🎧': ['音乐', '音频'],
  '📷': ['图片', '拍照'],
  '🎮': ['游戏'],
  '☕': ['咖啡', '休息'],
  '🐱': ['猫'],
  '🐶': ['狗'],
  '🇨🇳': ['中国', '中文'],
}

const query = ref('')
const searchPlaceholder = `搜索图标（共 ${ICON_TOTAL} 个）`
const activeGroup = ref('favorites')

function matches(item: IconItem, keyword: string): boolean {
  if (!keyword) return true
  if (item.name.includes(keyword)) return true
  const alias = CN_ALIAS[item.char]
  return alias ? alias.some((a) => a.includes(keyword)) : false
}

const searchResults = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  if (!keyword) return null
  return ICON_SEARCH.filter((item) => matches(item, keyword)).slice(0, 300)
})

const visibleItems = computed(() => {
  if (searchResults.value) return searchResults.value
  return ICON_GROUPS.find((g) => g.key === activeGroup.value)?.items ?? []
})

/** 当前选中图标的名称（用于底部回显）。 */
const currentName = computed(
  () => ICON_SEARCH.find((item) => item.char === props.modelValue)?.name ?? '未选择',
)

function pick(char: string) {
  emit('update:modelValue', char)
}
</script>

<template>
  <div class="icon-picker" :style="{ width: `${props.width}px` }">
    <div class="icon-picker__head">
      <div class="icon-picker__search">
        <el-icon class="icon-picker__search-icon"><Search /></el-icon>
        <input
          v-model="query"
          class="icon-picker__search-input"
          type="text"
          :placeholder="searchPlaceholder"
          aria-label="搜索图标"
        />
        <button
          v-if="query"
          type="button"
          class="icon-picker__search-clear"
          aria-label="清空搜索"
          @click="query = ''"
        >
          <el-icon><Close /></el-icon>
        </button>
      </div>
      <span v-if="searchResults" class="icon-picker__count">
        匹配 <b>{{ searchResults.length }}</b> 个
      </span>
    </div>

    <div v-if="!searchResults" class="icon-picker__tabs" role="tablist" aria-label="图标分类">
      <button
        v-for="group in ICON_GROUPS"
        :key="group.key"
        type="button"
        role="tab"
        class="icon-picker__tab"
        :class="{ 'is-on': activeGroup === group.key }"
        :aria-selected="activeGroup === group.key"
        @click="activeGroup = group.key"
      >
        <span class="icon-picker__tab-label">{{ group.label }}</span>
        <span class="icon-picker__tab-count">{{ group.items.length }}</span>
      </button>
    </div>

    <div class="icon-picker__grid" role="listbox" aria-label="图标列表">
      <button
        v-for="item in visibleItems"
        :key="item.char"
        type="button"
        class="icon-picker__item"
        :class="{ 'is-on': item.char === props.modelValue }"
        :title="item.name"
        :aria-label="item.name"
        :aria-selected="item.char === props.modelValue"
        role="option"
        @click="pick(item.char)"
      >
        {{ item.char }}
      </button>
      <div v-if="!visibleItems.length" class="icon-picker__empty">
        <el-icon class="icon-picker__empty-icon"><Search /></el-icon>
        <span>没有匹配的图标</span>
        <button type="button" class="icon-picker__empty-reset" @click="query = ''">清空搜索</button>
      </div>
    </div>

    <div class="icon-picker__foot">
      <div class="icon-picker__current">
        <span class="icon-picker__current-icon">{{ props.modelValue || '—' }}</span>
        <span class="icon-picker__current-text">
          <span class="icon-picker__current-label">当前图标</span>
          <span class="icon-picker__current-name">{{ currentName }}</span>
        </span>
      </div>
      <button
        v-if="props.defaultIcon"
        type="button"
        class="icon-picker__reset"
        @click="pick(props.defaultIcon)"
      >
        恢复默认
      </button>
    </div>
  </div>
</template>

<style scoped>
.icon-picker {
  display: flex;
  flex-direction: column;
  color: var(--ent-text, #1f2733);
  background: var(--ent-surface, #fff);
}
.icon-picker__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 12px 8px;
}
.icon-picker__search {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  height: 32px;
  padding: 0 8px 0 10px;
  border: 1px solid var(--ent-border, #e6e9ef);
  border-radius: var(--ent-radius-sm, 8px);
  background: var(--ent-surface-2, #f8fafc);
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}
.icon-picker__search:focus-within {
  border-color: var(--ent-primary, #1a73e8);
  background: var(--ent-surface, #fff);
  box-shadow: 0 0 0 3px var(--ent-primary-soft, #eaf1fe);
}
.icon-picker__search-icon {
  color: var(--ent-text-3, #8a94a3);
  font-size: 14px;
  flex-shrink: 0;
}
.icon-picker__search-input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: 0;
  background: transparent;
  font-size: 13px;
  color: var(--ent-text, #1f2733);
  outline: none;
}
.icon-picker__search-input::placeholder {
  color: var(--ent-text-3, #8a94a3);
}
.icon-picker__search-clear {
  display: flex;
  align-items: center;
  border: 0;
  padding: 2px;
  border-radius: 50%;
  background: var(--ent-surface-3, #f1f5f9);
  color: var(--ent-text-3, #8a94a3);
  font-size: 12px;
  cursor: pointer;
}
.icon-picker__search-clear:hover {
  color: var(--ent-text-2, #5a6472);
}
.icon-picker__count {
  flex-shrink: 0;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--ent-primary-soft, #eaf1fe);
  color: var(--ent-primary-strong, #1758b8);
  font-size: 12px;
  white-space: nowrap;
}
.icon-picker__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding: 0 12px 10px;
}
.icon-picker__tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: var(--ent-surface-3, #f1f5f9);
  padding: 3px 9px;
  font-size: 11.5px;
  color: var(--ent-text-2, #5a6472);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
.icon-picker__tab:hover {
  background: var(--ent-border, #e6e9ef);
  color: var(--ent-text, #1f2733);
}
.icon-picker__tab.is-on {
  background: var(--ent-primary-soft, #eaf1fe);
  border-color: var(--ent-primary, #1a73e8);
  color: var(--ent-primary-strong, #1758b8);
  font-weight: 600;
}
.icon-picker__tab:focus-visible {
  outline: 2px solid var(--ent-primary, #1a73e8);
  outline-offset: 1px;
}
.icon-picker__tab-count {
  padding: 0 5px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.06);
  font-size: 11px;
  line-height: 16px;
  color: var(--ent-text-3, #8a94a3);
}
.icon-picker__tab.is-on .icon-picker__tab-count {
  background: rgba(26, 115, 232, 0.12);
  color: var(--ent-primary-strong, #1758b8);
}
.icon-picker__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(32px, 1fr));
  gap: 4px;
  max-height: 260px;
  overflow-y: auto;
  padding: 10px 12px 12px;
  border-top: 1px solid var(--ent-border, #e6e9ef);
  scrollbar-width: thin;
  scrollbar-color: var(--ent-border-strong, #d7dce5) transparent;
}
.icon-picker__grid::-webkit-scrollbar {
  width: 6px;
}
.icon-picker__grid::-webkit-scrollbar-thumb {
  border-radius: 3px;
  background: var(--ent-border-strong, #d7dce5);
}
.icon-picker__item {
  position: relative;
  height: 32px;
  border: 1px solid transparent;
  border-radius: var(--ent-radius-sm, 8px);
  background: transparent;
  font-size: 17px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease, transform 0.12s ease;
}
.icon-picker__item:hover {
  background: var(--ent-surface-3, #f1f5f9);
  transform: translateY(-1px);
}
.icon-picker__item.is-on {
  border-color: var(--ent-primary, #1a73e8);
  background: var(--ent-primary-soft, #eaf1fe);
}
.icon-picker__item.is-on::after {
  content: '';
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ent-primary, #1a73e8);
}
.icon-picker__item:focus-visible {
  outline: 2px solid var(--ent-primary, #1a73e8);
  outline-offset: 1px;
}
.icon-picker__empty {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 28px 0;
  font-size: 12px;
  color: var(--ent-text-3, #8a94a3);
}
.icon-picker__empty-icon {
  font-size: 22px;
  color: var(--ent-border-strong, #d7dce5);
}
.icon-picker__empty-reset {
  border: 0;
  background: none;
  padding: 0;
  font-size: 12px;
  color: var(--ent-primary, #1a73e8);
  cursor: pointer;
}
.icon-picker__foot {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-top: 1px solid var(--ent-border, #e6e9ef);
  background: var(--ent-surface-2, #f8fafc);
}
.icon-picker__current {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.icon-picker__current-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--ent-radius-sm, 8px);
  border: 1px solid var(--ent-border, #e6e9ef);
  background: var(--ent-surface, #fff);
  font-size: 16px;
}
.icon-picker__current-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.icon-picker__current-label {
  font-size: 11px;
  color: var(--ent-text-3, #8a94a3);
}
.icon-picker__current-name {
  font-size: 12px;
  color: var(--ent-text-2, #5a6472);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.icon-picker__reset {
  margin-left: auto;
  border: 1px solid var(--ent-border, #e6e9ef);
  border-radius: var(--ent-radius-sm, 8px);
  background: var(--ent-surface, #fff);
  padding: 4px 10px;
  font-size: 12px;
  color: var(--ent-text-2, #5a6472);
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
}
.icon-picker__reset:hover {
  border-color: var(--ent-primary, #1a73e8);
  color: var(--ent-primary, #1a73e8);
}
</style>
