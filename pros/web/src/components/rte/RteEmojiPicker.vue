<script setup lang="ts">
/**
 * 工具栏「表情」面板。
 *
 * 只负责把表情数据接进通用外壳 `RteGlyphPicker`（搜索框 / 分类条 / 网格）；
 * 排版与交互在 RteGlyphPicker 里，搜索索引在 utils/rteEmojiSearch.ts。
 */
import { computed } from 'vue'
import RteGlyphPicker, { type GlyphCategory } from './RteGlyphPicker.vue'
import { RTE_EMOJI_CATEGORIES } from '../../utils/rteEmojiList'
import { emojiLabel, searchEmoji } from '../../utils/rteEmojiSearch'

const props = defineProps<{ tabId: string }>()

const emit = defineEmits<{
  (e: 'update:tabId', id: string): void
  (e: 'select', emoji: string): void
}>()

/** 分类图标（代表性 emoji，比文字标签省横向空间）。 */
const CATEGORY_ICON: Record<string, string> = {
  frequent: '⭐',
  large: '😀',
  kaomoji: '^_^',
  smileys: '😊',
  gestures: '👋',
  people: '🧑',
  nature: '🌿',
  food: '🍎',
  objects: '💡',
  symbols: '❤️',
  travel: '✈️',
  activities: '⚽',
  flags: '🚩',
}

const categories = computed<GlyphCategory[]>(() =>
  RTE_EMOJI_CATEGORIES.map((cat) => ({
    id: cat.id,
    label: cat.label,
    icon: CATEGORY_ICON[cat.id] || '🙂',
    items: cat.emojis,
    mode: cat.large ? 'large' : cat.kaomoji ? 'kaomoji' : 'grid',
  })),
)

const search = (query: string) =>
  searchEmoji(query).map((hit) => ({ glyph: hit.emoji, label: hit.label, category: hit.category }))
</script>

<template>
  <RteGlyphPicker
    :categories="categories"
    :tab-id="props.tabId"
    :search="search"
    :label-of="emojiLabel"
    placeholder="搜索表情，如「笑」「火」或粘贴表情"
    empty-text="没有匹配的表情，换个关键词试试"
    @update:tab-id="emit('update:tabId', $event)"
    @select="emit('select', $event)"
  />
</template>
