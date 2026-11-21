<script setup lang="ts">
/**
 * 统一图标选择器（系统级）。
 *
 * 全站凡是有「图标 / 表情」的地方都用它：知识库节点、文档标题、画布标题、
 * 项目图标。数据来自 Unicode emoji 全量库，按官方分类分组，可搜索。
 */
import { computed, ref } from 'vue'
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

function pick(char: string) {
  emit('update:modelValue', char)
}
</script>

<template>
  <div class="icon-picker" :style="{ width: `${props.width}px` }">
    <input
      v-model="query"
      class="icon-picker__search"
      type="search"
      :placeholder="searchPlaceholder"
      aria-label="搜索图标"
    />

    <div v-if="!searchResults" class="icon-picker__tabs">
      <button
        v-for="group in ICON_GROUPS"
        :key="group.key"
        type="button"
        class="icon-picker__tab"
        :class="{ 'is-on': activeGroup === group.key }"
        @click="activeGroup = group.key"
      >
        {{ group.label }}
        <em>{{ group.items.length }}</em>
      </button>
    </div>
    <p v-else class="icon-picker__count">匹配 {{ searchResults.length }} 个图标</p>

    <div class="icon-picker__grid">
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
      <p v-if="!visibleItems.length" class="icon-picker__empty">没有匹配的图标</p>
    </div>

    <button
      v-if="props.defaultIcon"
      type="button"
      class="icon-picker__reset"
      @click="pick(props.defaultIcon)"
    >
      恢复默认图标
    </button>
  </div>
</template>

<style scoped>
.icon-picker {
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: var(--mm-text, #1d2129);
}
.icon-picker__search {
  width: 100%;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--mm-line, #e5e6eb);
  border-radius: 6px;
  font-size: 12px;
  outline: none;
}
.icon-picker__search:focus {
  border-color: var(--mm-blue, #3370ff);
}
.icon-picker__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.icon-picker__tab {
  border: 0;
  border-radius: 6px;
  background: #f2f3f5;
  padding: 3px 7px;
  font-size: 11px;
  color: var(--mm-muted, #86909c);
  cursor: pointer;
}
.icon-picker__tab.is-on {
  background: #e8f1ff;
  color: var(--mm-blue, #3370ff);
}
.icon-picker__tab em {
  margin-left: 3px;
  font-style: normal;
  opacity: 0.7;
}
.icon-picker__count {
  margin: 0;
  font-size: 11px;
  color: var(--mm-muted, #86909c);
}
.icon-picker__grid {
  display: grid;
  grid-template-columns: repeat(10, minmax(0, 1fr));
  gap: 2px;
  max-height: 220px;
  overflow-y: auto;
}
.icon-picker__item {
  height: 28px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}
.icon-picker__item:hover {
  background: #f1f3f4;
}
.icon-picker__item.is-on {
  border-color: var(--mm-blue, #3370ff);
  background: #e8f1ff;
}
.icon-picker__empty {
  grid-column: 1 / -1;
  margin: 8px 0;
  font-size: 12px;
  color: var(--mm-muted, #86909c);
}
.icon-picker__reset {
  align-self: flex-start;
  border: 0;
  background: none;
  padding: 2px 0;
  font-size: 12px;
  color: var(--mm-blue, #3370ff);
  cursor: pointer;
}
</style>
