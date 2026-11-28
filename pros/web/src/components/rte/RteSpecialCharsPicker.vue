<script setup lang="ts">
/**
 * 工具栏「符号」面板。
 *
 * 与表情面板共用通用外壳 `RteGlyphPicker`；这里只提供符号分类、分类图标与搜索索引。
 */
import { computed } from 'vue'
import RteGlyphPicker, { type GlyphCategory } from './RteGlyphPicker.vue'
import { RTE_SPECIAL_CHAR_CATEGORIES } from '../../utils/rteSpecialChars'
import { searchSpecialChar, specialCharLabel } from '../../utils/rteSpecialCharSearch'

const props = defineProps<{ tabId: string }>()

const emit = defineEmits<{
  (e: 'update:tabId', id: string): void
  (e: 'select', char: string): void
}>()

/** 分类药丸上的代表字符。 */
const CATEGORY_ICON: Record<string, string> = {
  punct: '，',
  math: '∑',
  currency: '¥',
  arrows: '→',
  legal: '©',
  brackets: '（',
  greek: 'α',
  units: '°',
  circled: '①',
  roman: 'Ⅰ',
  fullwidth: 'Ａ',
  box: '┌',
  pinyin: 'ā',
}

const categories = computed<GlyphCategory[]>(() =>
  RTE_SPECIAL_CHAR_CATEGORIES.map((cat) => ({
    id: cat.id,
    label: cat.label,
    icon: CATEGORY_ICON[cat.id] || '·',
    items: cat.chars,
    mode: 'grid',
  })),
)

const search = (query: string) =>
  searchSpecialChar(query).map((hit) => ({ glyph: hit.char, label: hit.label, category: hit.category }))

/** 符号用等宽衬线字体，避免不同符号的字面宽度跳动。 */
const GLYPH_FONT =
  '"PingFang SC", "Helvetica Neue", Arial, "Segoe UI Symbol", "Noto Sans Symbols", "Songti SC", serif'
</script>

<template>
  <RteGlyphPicker
    :categories="categories"
    :tab-id="props.tabId"
    :search="search"
    :label-of="specialCharLabel"
    :glyph-font="GLYPH_FONT"
    glyph-size="18px"
    placeholder="搜索符号，如「逗号」「箭头」或粘贴字符"
    empty-text="没有匹配的符号，换个关键词试试"
    @update:tab-id="emit('update:tabId', $event)"
    @select="emit('select', $event)"
  />
</template>
