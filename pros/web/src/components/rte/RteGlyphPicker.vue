<script lang="ts">
export interface GlyphCategory {
  id: string
  label: string
  /** 分类药丸上的代表字符 */
  icon: string
  items: string[]
  /** large：少列大字号；kaomoji：宽格文本 */
  mode?: 'grid' | 'large' | 'kaomoji'
}

export interface GlyphSearchHit {
  glyph: string
  label: string
  category: string
}
</script>

<script setup lang="ts">
/**
 * 通用「图形选择器」外壳：表情面板与符号面板共用。
 *
 * 结构（对齐 Telegram Web K / AGENTS.md §2）：
 *  - 顶部搜索框：圆角 12、白底 + 发丝线，聚焦转品牌蓝 + 3px 柔光环；
 *  - 分类条：灰底容器 + 白色药丸选中块，图标化分类，一行排完；
 *  - 网格标题：当前分类名 + 数量（或「搜索结果 N」）；
 *  - 网格：高度随内容自适应，分类多时内部滚动。
 *
 * 数据（分类、搜索、字形样式）由外面的包装组件传入，这里只管排版与交互。
 */
import { computed, nextTick, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    categories: GlyphCategory[]
    /** 当前分类（受控，状态由编辑器持有） */
    tabId: string
    /** 搜索函数：返回命中项 */
    search: (query: string) => GlyphSearchHit[]
    /** 非搜索态下单个字形的说明文字 */
    labelOf?: (glyph: string) => string
    placeholder?: string
    /** 字形字号 */
    glyphSize?: string
    /** 字形字体栈 */
    glyphFont?: string
    emptyText?: string
  }>(),
  {
    labelOf: undefined,
    placeholder: '搜索',
    glyphSize: '20px',
    glyphFont: undefined,
    emptyText: '没有匹配的内容',
  },
)

const emit = defineEmits<{
  (e: 'update:tabId', id: string): void
  (e: 'select', glyph: string): void
}>()

const query = ref('')
const inputRef = ref<HTMLInputElement | null>(null)
const stripRef = ref<HTMLElement | null>(null)

const activeCategory = computed(
  () => props.categories.find((c) => c.id === props.tabId) ?? props.categories[0],
)

const searching = computed(() => !!query.value.trim())

const searchHits = computed(() => (searching.value ? props.search(query.value) : []))

const cells = computed(() => {
  if (searching.value) {
    return searchHits.value.map((hit) => ({
      key: `s-${hit.glyph}`,
      glyph: hit.glyph,
      title: hit.category ? `${hit.label} · ${hit.category}` : hit.label,
      wide: false,
    }))
  }
  return (activeCategory.value?.items ?? []).map((glyph) => ({
    key: `g-${glyph}`,
    glyph,
    title: props.labelOf?.(glyph) ?? glyph,
    wide: glyph.includes('(') || glyph.includes('¯') || glyph.includes('∠'),
  }))
})

function pickCategory(id: string) {
  // 选分类时清掉搜索词：搜索态下分类条不可用，容易让人以为点击没反应。
  query.value = ''
  emit('update:tabId', id)
}

function clearQuery() {
  query.value = ''
  nextTick(() => inputRef.value?.focus())
}

/** 切分类时把选中的药丸滚进可视区。 */
watch(
  () => props.tabId,
  async () => {
    await nextTick()
    const strip = stripRef.value
    const active = strip?.querySelector('.rte-glyph-strip-btn.is-active') as HTMLElement | null
    if (strip && active) {
      strip.scrollTo({
        left: active.offsetLeft - strip.clientWidth / 2 + active.clientWidth / 2,
        behavior: 'smooth',
      })
    }
  },
)

defineExpose({ focusSearch: () => inputRef.value?.focus() })
</script>

<template>
  <div class="rte-glyph" :style="{ '--rte-glyph-size': glyphSize }">
    <!-- 搜索 -->
    <div class="rte-glyph-search">
      <svg class="rte-glyph-search-ico" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" stroke-width="1.5" />
        <path d="M10.6 10.6 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      </svg>
      <input
        ref="inputRef"
        v-model="query"
        class="rte-glyph-search-input"
        type="search"
        :placeholder="placeholder"
        aria-label="搜索"
        @mousedown.stop
        @keydown.esc.prevent="clearQuery"
      />
      <button
        v-if="query"
        type="button"
        class="rte-glyph-search-clear"
        aria-label="清空搜索"
        title="清空"
        @mousedown.stop
        @click="clearQuery"
      >
        ×
      </button>
    </div>

    <!-- 分类条 -->
    <div ref="stripRef" class="rte-glyph-strip" role="tablist" aria-label="分类">
      <button
        v-for="cat in categories"
        :key="'tab-' + cat.id"
        type="button"
        role="tab"
        class="rte-glyph-strip-btn"
        :class="{ 'is-active': !searching && tabId === cat.id }"
        :aria-selected="!searching && tabId === cat.id"
        :aria-label="cat.label"
        :title="`${cat.label} · ${cat.items.length}`"
        @click="pickCategory(cat.id)"
      >
        <span class="rte-glyph-strip-ico" aria-hidden="true">{{ cat.icon }}</span>
      </button>
    </div>

    <!-- 网格 -->
    <div
      class="rte-glyph-grid"
      :class="{
        'is-large': !searching && activeCategory?.mode === 'large',
        'is-kaomoji': !searching && activeCategory?.mode === 'kaomoji',
      }"
      role="tabpanel"
      :aria-label="searching ? '搜索结果' : activeCategory?.label"
    >
      <div class="rte-glyph-grid-head">
        <span>{{ searching ? '搜索结果' : activeCategory?.label }}</span>
        <strong>{{ searching ? searchHits.length : activeCategory?.items.length }}</strong>
      </div>
      <button
        v-for="cell in cells"
        :key="cell.key"
        type="button"
        class="rte-glyph-cell"
        :class="{ 'is-kaomoji': cell.wide }"
        :style="glyphFont ? { fontFamily: glyphFont } : undefined"
        :title="cell.title"
        @click="emit('select', cell.glyph)"
      >{{ cell.glyph }}</button>
      <div v-if="searching && !cells.length" class="rte-glyph-empty">
        {{ emptyText }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.rte-glyph {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--tg-surface, #fff);
  color: var(--tg-text, #0f0f0f);
}

/* —— 搜索 —— */
.rte-glyph-search {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--tg-border, #e6e6e6);
}

.rte-glyph-search-ico {
  flex: 0 0 auto;
  width: 15px;
  height: 15px;
  color: var(--tg-text-3, #8e8e8e);
}

.rte-glyph-search-input {
  flex: 1 1 auto;
  min-width: 0;
  height: 30px;
  padding: 0 6px;
  border: 1px solid var(--tg-border, #e6e6e6);
  border-radius: var(--tg-radius-sm, 8px);
  background: var(--tg-surface, #fff);
  color: var(--tg-text, #0f0f0f);
  font-size: 13px;
  outline: none;
  transition: border-color var(--tg-dur, 160ms) var(--tg-ease, cubic-bezier(0.2, 0.8, 0.3, 1)),
    box-shadow var(--tg-dur, 160ms) var(--tg-ease, cubic-bezier(0.2, 0.8, 0.3, 1));
}

.rte-glyph-search-input::-webkit-search-cancel-button {
  display: none;
}

.rte-glyph-search-input:focus {
  border-color: var(--tg-blue, #3390ec);
  box-shadow: 0 0 0 3px rgba(51, 144, 236, 0.16);
}

.rte-glyph-search-input::placeholder {
  color: var(--tg-text-3, #8e8e8e);
}

.rte-glyph-search-clear {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px !important;
  height: 22px !important;
  min-height: 22px !important;
  padding: 0 !important;
  border: none;
  border-radius: var(--tg-radius-xs, 6px) !important;
  background: var(--tg-surface-2, #f4f4f5);
  color: var(--tg-text-2, #707579);
  font-size: 14px !important;
  line-height: 1;
  cursor: pointer;
}

.rte-glyph-search-clear:hover {
  background: var(--tg-surface-3, #ececf1);
  color: var(--tg-text, #0f0f0f);
}

/* —— 分类条 —— */
.rte-glyph-strip {
  display: flex;
  align-items: center;
  /* 13 个药丸（30px）在 420px 面板里刚好一行：390 + 12 个间隙 + 12 内边距 = 414 ≤ 418 */
  gap: 1px;
  padding: 6px;
  background: var(--tg-surface-2, #f4f4f5);
  flex: 0 0 auto;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}

.rte-glyph-strip::-webkit-scrollbar {
  display: none;
}

.rte-glyph-strip-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  /*
   * !important：压过 telegram.ui.css 的 `.rte-float-menu button`（该浮层运行时
   * 会被加上 .rte-float-menu 类，里面所有按钮被强制 30px 行高 / 6px 圆角 /
   * 0 10px 内边距 / 13px 字号）。分类药丸要的是圆形 + 无内边距。
   */
  min-height: 30px !important;
  padding: 0 !important;
  border: none;
  border-radius: 999px !important;
  background: transparent;
  color: var(--tg-text-2, #707579);
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color var(--tg-dur, 160ms) var(--tg-ease, cubic-bezier(0.2, 0.8, 0.3, 1)),
    color var(--tg-dur, 160ms) var(--tg-ease, cubic-bezier(0.2, 0.8, 0.3, 1));
}

.rte-glyph-strip-btn:hover {
  color: var(--tg-text, #0f0f0f);
}

.rte-glyph-strip-btn.is-active {
  /* !important：选中态是白色药丸，要压过 telegram.ui.css 的 `.rte-float-menu button:hover`
     强加的浅灰 hover 底色，否则鼠标停在选中项上时药丸会消失。 */
  background: var(--tg-surface, #fff) !important;
  color: var(--tg-text, #0f0f0f) !important;
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.12);
}

.rte-glyph-strip-ico {
  font-size: 16px;
  line-height: 1;
}

/* —— 网格 —— */
.rte-glyph-grid {
  display: grid;
  grid-template-columns: repeat(10, minmax(0, 1fr));
  gap: 2px;
  padding: 8px;
  flex: 1 1 auto;
  min-height: 0;
  max-height: 320px;
  overflow-y: auto;
  overflow-x: hidden;
  align-content: start;
  scrollbar-width: thin;
}

.rte-glyph-grid.is-large {
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 4px;
}

.rte-glyph-grid.is-kaomoji {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
}

.rte-glyph-grid-head {
  grid-column: 1 / -1;
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 2px 4px 6px;
  font-size: 12px;
  color: var(--tg-text-2, #707579);
}

.rte-glyph-grid-head strong {
  color: var(--tg-text, #0f0f0f);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.rte-glyph-cell {
  width: 100%;
  aspect-ratio: 1;
  /* 同上：压过 `.rte-float-menu button` 的内边距 / 圆角 / 字号。 */
  min-height: 30px !important;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 !important;
  border: none;
  border-radius: var(--tg-radius-sm, 8px) !important;
  background: transparent;
  color: var(--tg-text, #0f0f0f);
  font-size: var(--rte-glyph-size, 20px) !important;
  line-height: 1;
  cursor: pointer;
  transition: background-color var(--tg-dur, 160ms) var(--tg-ease, cubic-bezier(0.2, 0.8, 0.3, 1));
}

.rte-glyph-cell:hover {
  background: var(--tg-surface-2, #f4f4f5);
}

.rte-glyph-grid.is-large .rte-glyph-cell {
  font-size: calc(var(--rte-glyph-size, 20px) * 1.4) !important;
  min-height: 40px !important;
}

.rte-glyph-cell.is-kaomoji {
  aspect-ratio: auto;
  min-height: 36px !important;
  grid-column: span 1;
  font-size: 13px !important;
  padding: 4px 6px !important;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rte-glyph-empty {
  grid-column: 1 / -1;
  padding: 28px 8px;
  text-align: center;
  font-size: 12.5px;
  color: var(--tg-text-3, #8e8e8e);
}
</style>
