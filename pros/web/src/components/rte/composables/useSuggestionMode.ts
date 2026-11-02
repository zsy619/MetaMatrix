import { computed, ref, type Ref, type ShallowRef } from 'vue'
import { ElMessage } from 'element-plus'
import type { Editor } from '@tiptap/core'
import {
  collectSuggestionRanges,
  dispatchSuggestionDecision,
  suggestionColor,
  type SuggestionAuthor,
} from '../../../utils/rteSuggestions'

/** 建议模式开关，以及接受 / 拒绝。正文里的标记就是修订本身。 */
export function useSuggestionMode(deps: {
  editor: () => ShallowRef<Editor | undefined>
  author: () => SuggestionAuthor
}) {
  const suggesting = ref(false)

  const suggestionEnabled = () => suggesting.value && deps.editor().value?.isEditable !== false

  function toggleSuggesting() {
    suggesting.value = !suggesting.value
    ElMessage.success(suggesting.value ? '已进入建议模式。之后的增删会记成修订。' : '已回到直接编辑')
  }

  const suggestionTick = ref(0)
  function bump() {
    suggestionTick.value += 1
  }

  const suggestionRanges = computed(() => {
    void suggestionTick.value
    const ed = deps.editor().value
    if (!ed) return []
    void ed.state.doc
    return collectSuggestionRanges(ed.state.doc)
  })

  const activeSuggestionId = computed(() => {
    void suggestionTick.value
    const ed = deps.editor().value
    if (!ed) return ''
    const { from } = ed.state.selection
    const hit = suggestionRanges.value.find((range) => from > range.from && from <= range.to)
      || suggestionRanges.value.find((range) => from >= range.from && from < range.to)
    return hit?.id || ''
  })

  function decide(mode: 'accept' | 'reject', id?: string) {
    const ed = deps.editor().value
    if (!ed) return
    const ok = dispatchSuggestionDecision(ed, mode, id)
    if (!ok) ElMessage.info(id ? '这里没有可处理的修订' : '没有修订')
    bump()
  }

  return {
    suggesting: suggesting as Ref<boolean>,
    suggestionEnabled,
    suggestionAuthor: deps.author,
    suggestionColor,
    toggleSuggesting,
    bumpSuggestions: bump,
    suggestionRanges,
    activeSuggestionId,
    acceptAllSuggestions: () => decide('accept'),
    rejectAllSuggestions: () => decide('reject'),
    acceptActiveSuggestion: () => {
      if (activeSuggestionId.value) decide('accept', activeSuggestionId.value)
    },
    rejectActiveSuggestion: () => {
      if (activeSuggestionId.value) decide('reject', activeSuggestionId.value)
    },
  }
}
