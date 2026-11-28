<script setup lang="ts">
/**
 * 统一图标选择器（系统级）。
 *
 * 全站凡是有「图标 / 表情」的地方都用它：知识库节点、文档标题、画布标题、
 * 项目图标。数据来自 Unicode emoji 全量库 + 扩展符号库，按分类分组，可搜索。
 */
import { computed, onMounted, ref } from 'vue'
import { Close, Search } from '@element-plus/icons-vue'
import { ICON_GROUPS, ICON_SEARCH, ICON_TOTAL, type IconItem } from './iconData'
import { ensurePinyin, matchesPinyin } from '../../utils/rtePinyin'

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
  '📁': ['文件夹', '目录', 'folder'],
  '📄': ['文档', '文件', 'doc'],
  '📃': ['文档', '文件', 'doc'],
  '📋': ['剪贴板', '清单', 'clipboard'],
  '📊': ['表格', '数据', '统计', 'chart'],
  '📈': ['增长', '趋势', '图表', 'chart'],
  '🧠': ['脑图', '大脑', '思维', '想法', 'mindmap'],
  '💡': ['想法', '灵感', '灯泡', 'idea'],
  '🎯': ['目标', '靶心', 'target'],
  '🚀': ['启动', '发布', '火箭', 'launch'],
  '🔥': ['火', '热', '紧急', 'hot'],
  '⭐': ['星', '收藏', '重要', 'star'],
  '✅': ['完成', '对勾', '通过', 'done'],
  '❗': ['注意', '重要', 'alert'],
  '⚠️': ['警告', '风险', 'warning'],
  '🔍': ['搜索', '查找', 'search'],
  '🔔': ['提醒', '通知', 'bell'],
  '📅': ['日历', '日程', 'calendar'],
  '⏰': ['时间', '闹钟', 'time'],
  '💬': ['对话', '消息', '评论', 'chat'],
  '👥': ['团队', '成员', '用户', 'team'],
  '🏠': ['首页', '主页', 'home'],
  '🔗': ['链接', 'link'],
  '🧩': ['拼图', '组件', '模块', 'module'],
  '🛠️': ['工具', '设置', 'tool'],
  '📝': ['编辑', '笔记', '文档', 'note'],
  '🧪': ['实验', '测试', 'test'],
  '🌱': ['成长', '种子', '开始', 'growth'],
  '🏔️': ['高峰', '目标', 'peak'],
  '🎨': ['设计', '画布', '美术', 'design'],
  '📌': ['置顶', '重点', 'pin'],
  '🗂️': ['分类', '归档', 'category'],
  '🏁': ['结束', '终点', 'finish'],
  '🌟': ['星光', '亮点', 'star'],
  '💰': ['钱', '收入', '预算', 'money'],
  '🛒': ['购物', '采购', 'shopping'],
  '🔒': ['私密', '锁', 'private'],
  '🔓': ['公开', '解锁', 'public'],
  '📚': ['学习', '书', 'book'],
  '🎧': ['音乐', '音频', 'audio'],
  '📷': ['图片', '拍照', 'photo'],
  '🎮': ['游戏', 'game'],
  '☕': ['咖啡', '休息', 'coffee'],
  '🐱': ['猫', 'cat'],
  '🐶': ['狗', 'dog'],
  '🇨🇳': ['中国', '中文', 'china'],
  '🗓️': ['日历', '计划', 'schedule'],
  '🧭': ['指南针', '方向', 'compass'],
  '🎈': ['气球', '庆祝', 'celebrate'],
  '🏆': ['奖杯', '成就', 'award'],
  '🥇': ['金牌', '第一', 'first'],
  '🧱': ['积木', '构建', 'build'],
  '🛡️': ['安全', '防护', 'security'],
  '🔧': ['维修', '配置', 'config'],
  '🧮': ['计算', '统计', 'calc'],
  '📦': ['包', '交付', '打包', 'package'],
  '🖊️': ['书写', '批注', 'write'],
  '🔖': ['书签', '标记', 'bookmark'],
  '🏷️': ['标签', '分类', 'tag'],
  '📎': ['附件', '链接', 'attach'],
  '🖼️': ['图片', '画板', 'image'],
  '🕒': ['时间', '时钟', 'clock'],
  '🔁': ['循环', '同步', 'sync'],
  '🔀': ['分支', '流程', 'branch'],
  '🧵': ['流程', '串联', 'flow'],
  '📐': ['设计', '原型', 'design'],
  '🗺️': ['地图', '路线', 'map'],
  '🗃️': ['卡片', '文件盒', 'cards'],
  '🧹': ['清理', '维护', 'clean'],
  '🗒️': ['记录', '备忘', 'note'],
}

const query = ref('')
const searchPlaceholder = `搜索图标（共 ${ICON_TOTAL} 个）`
const activeGroup = ref('favorites')

onMounted(() => {
  // 拼音检索需要 pinyin-pro，后台预热，不阻塞面板打开
  void ensurePinyin()
})

function matches(item: IconItem, keyword: string): boolean {
  if (!keyword) return true
  if (item.name.toLowerCase().includes(keyword)) return true
  const alias = CN_ALIAS[item.char]
  if (!alias) return false
  return alias.some((a) => matchesPinyin(a, keyword))
}

const searchResults = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  if (!keyword) return null
  return ICON_SEARCH.filter((item) => matches(item, keyword)).slice(0, 400)
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
/*
 * 玻璃拟态：外壳、搜索框、分类胶囊、网格、底栏全部用 --glass-* 令牌；
 * 图标本身是字形（纸面），保持清晰不透明。
 */
.icon-picker {
  display: flex;
  flex-direction: column;
  color: #1f2733;
  background: var(--glass-bg-strong);
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  border: 1px solid var(--glass-border);
  border-radius: 14px;
  box-shadow: var(--glass-shadow);
  overflow: hidden;
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
  height: 34px;
  padding: 0 8px 0 10px;
  border: 1px solid var(--glass-border);
  border-radius: 10px;
  background: var(--glass-bg);
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}
.icon-picker__search:focus-within {
  background: var(--glass-bg-strong);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.18);
}
.icon-picker__search-icon {
  color: rgba(15, 23, 42, 0.5);
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
  color: #1f2733;
  outline: none;
}
.icon-picker__search-input::placeholder {
  color: rgba(15, 23, 42, 0.45);
}
.icon-picker__search-clear {
  display: flex;
  align-items: center;
  border: 0;
  padding: 2px;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.08);
  color: rgba(15, 23, 42, 0.55);
  font-size: 12px;
  cursor: pointer;
}
.icon-picker__search-clear:hover {
  background: rgba(15, 23, 42, 0.14);
  color: #1f2733;
}
.icon-picker__count {
  flex-shrink: 0;
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.12);
  color: #1d4ed8;
  font-size: 12px;
  white-space: nowrap;
}
.icon-picker__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding: 0 12px 10px;
  max-height: 124px;
  overflow-y: auto;
  scrollbar-width: thin;
  /* 分组多时底部渐隐，提示还可以继续滚动 */
  mask-image: linear-gradient(180deg, #000 0, #000 calc(100% - 14px), transparent 100%);
  -webkit-mask-image: linear-gradient(180deg, #000 0, #000 calc(100% - 14px), transparent 100%);
}
.icon-picker__tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.5);
  padding: 3px 9px;
  font-size: 11.5px;
  color: rgba(15, 23, 42, 0.72);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease,
    transform 0.15s ease, box-shadow 0.15s ease;
}
.icon-picker__tab:hover {
  background: var(--glass-bg-hover);
  transform: translateY(-1px);
  box-shadow: var(--glass-shadow-sm);
}
.icon-picker__tab.is-on {
  background: rgba(37, 99, 235, 0.14);
  border-color: rgba(37, 99, 235, 0.45);
  color: #1d4ed8;
  font-weight: 600;
}
.icon-picker__tab:focus-visible {
  outline: 2px solid rgba(37, 99, 235, 0.6);
  outline-offset: 1px;
}
.icon-picker__tab-count {
  padding: 0 5px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.08);
  font-size: 11px;
  line-height: 16px;
  color: rgba(15, 23, 42, 0.55);
}
.icon-picker__tab.is-on .icon-picker__tab-count {
  background: rgba(37, 99, 235, 0.16);
  color: #1d4ed8;
}
.icon-picker__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(34px, 1fr));
  gap: 4px;
  max-height: 268px;
  overflow-y: auto;
  padding: 10px 12px 12px;
  border-top: 1px solid var(--glass-ring);
  scrollbar-width: thin;
  scrollbar-color: rgba(15, 23, 42, 0.18) transparent;
}
.icon-picker__grid::-webkit-scrollbar {
  width: 6px;
}
.icon-picker__grid::-webkit-scrollbar-thumb {
  border-radius: 3px;
  background: rgba(15, 23, 42, 0.18);
}
.icon-picker__item {
  position: relative;
  height: 34px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease, transform 0.12s ease,
    box-shadow 0.12s ease;
}
.icon-picker__item:hover {
  background: var(--glass-bg-hover);
  transform: translateY(-1px);
  box-shadow: var(--glass-shadow-sm);
}
.icon-picker__item.is-on {
  border-color: rgba(37, 99, 235, 0.6);
  background: rgba(37, 99, 235, 0.14);
}
.icon-picker__item.is-on::after {
  content: '';
  position: absolute;
  right: 3px;
  bottom: 3px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #2563eb;
}
.icon-picker__item:focus-visible {
  outline: 2px solid rgba(37, 99, 235, 0.6);
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
  color: rgba(15, 23, 42, 0.5);
}
.icon-picker__empty-icon {
  font-size: 22px;
  color: rgba(15, 23, 42, 0.25);
}
.icon-picker__empty-reset {
  border: 0;
  background: none;
  padding: 0;
  font-size: 12px;
  color: #1d4ed8;
  cursor: pointer;
}
.icon-picker__foot {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-top: 1px solid var(--glass-ring);
  background: var(--glass-bg-soft);
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
  width: 30px;
  height: 30px;
  border-radius: 9px;
  border: 1px solid var(--glass-border);
  background: rgba(255, 255, 255, 0.55);
  font-size: 17px;
}
.icon-picker__current-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.icon-picker__current-label {
  font-size: 11px;
  color: rgba(15, 23, 42, 0.5);
}
.icon-picker__current-name {
  font-size: 12px;
  color: rgba(15, 23, 42, 0.75);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.icon-picker__reset {
  margin-left: auto;
  border: 1px solid var(--glass-border);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.55);
  padding: 5px 11px;
  font-size: 12px;
  color: rgba(15, 23, 42, 0.75);
  cursor: pointer;
  transition: background 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
}
.icon-picker__reset:hover {
  background: var(--glass-bg-hover);
  transform: translateY(-1px);
  box-shadow: var(--glass-shadow-sm);
}
@media (prefers-reduced-motion: reduce) {
  .icon-picker__item,
  .icon-picker__tab,
  .icon-picker__reset {
    transition: none;
  }
  .icon-picker__item:hover,
  .icon-picker__tab:hover,
  .icon-picker__reset:hover {
    transform: none;
  }
}
</style>
