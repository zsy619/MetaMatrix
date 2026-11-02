import { computed, nextTick, ref, type ShallowRef } from 'vue'
import { ElMessage } from 'element-plus'
import type { Editor } from '@tiptap/core'
import {
  collectFindMatches,
  pickNextMatchIndex,
  replaceAllFindMatches,
  replaceFindMatch,
  selectFindMatch,
  type RteFindMatch,
} from '../../../utils/rteFindReplace'
import { canRunFindReplace } from '../../../utils/rteRound5'

/** 查找 / 替换。模板绑定名与原先一致。 */
export function useFindReplace(deps: {
  editor: ShallowRef<Editor | undefined>
  closeMore: () => void
}) {
  const findDialogOpen = ref(false)
  const findQuery = ref('')
  const findReplaceText = ref('')
  const findCaseSensitive = ref(false)
  const findWholeWord = ref(false)
  const findMatches = ref<RteFindMatch[]>([])
  const findMatchIndex = ref(-1)

  function findOpts() {
    return {
      caseSensitive: findCaseSensitive.value,
      wholeWord: findWholeWord.value,
    }
  }

  function refreshFindMatches(selectNext = false) {
    const ed = deps.editor.value
    if (!ed) {
      findMatches.value = []
      findMatchIndex.value = -1
      return
    }
    const matches = collectFindMatches(ed.state.doc, findQuery.value, findOpts())
    findMatches.value = matches
    if (!matches.length) {
      findMatchIndex.value = -1
      return
    }
    if (selectNext || findMatchIndex.value < 0 || findMatchIndex.value >= matches.length) {
      const fromPos = ed.state.selection.from
      const idx = pickNextMatchIndex(matches, fromPos, 1)
      findMatchIndex.value = idx
      if (idx >= 0) selectFindMatch(ed, matches[idx]!)
    } else {
      selectFindMatch(ed, matches[findMatchIndex.value]!)
    }
  }

  function openFindDialog() {
    findDialogOpen.value = true
    deps.closeMore()
    const ed = deps.editor.value
    if (ed) {
      const { from, to, empty } = ed.state.selection
      if (!empty && to - from <= 80) {
        const t = ed.state.doc.textBetween(from, to, ' ')
        if (t && !findQuery.value) findQuery.value = t
      }
    }
    nextTick(() => {
      const el = document.querySelector('.rte-find-query') as HTMLInputElement | null
      el?.focus()
      el?.select()
      refreshFindMatches(true)
    })
  }

  function closeFindDialog() {
    findDialogOpen.value = false
  }

  function onFindQueryInput() {
    refreshFindMatches(true)
  }

  function findGo(direction: 1 | -1) {
    const ed = deps.editor.value
    const matches = findMatches.value
    if (!ed || !matches.length) {
      refreshFindMatches(true)
      return
    }
    let idx = findMatchIndex.value
    if (idx < 0) {
      idx = pickNextMatchIndex(matches, ed.state.selection.from, direction)
    } else {
      idx = (idx + direction + matches.length) % matches.length
    }
    findMatchIndex.value = idx
    selectFindMatch(ed, matches[idx]!)
  }

  function doReplaceOne() {
    const ed = deps.editor.value
    const matches = findMatches.value
    const idx = findMatchIndex.value
    if (!ed || idx < 0 || !matches[idx]) {
      ElMessage.info('没有可替换的匹配')
      return
    }
    replaceFindMatch(ed, matches[idx], findReplaceText.value)
    const nextFrom = matches[idx].from + findReplaceText.value.length
    const nextMatches = collectFindMatches(ed.state.doc, findQuery.value, findOpts())
    findMatches.value = nextMatches
    if (!nextMatches.length) {
      findMatchIndex.value = -1
      ElMessage.success('已替换，无更多匹配')
      return
    }
    const ni = pickNextMatchIndex(nextMatches, nextFrom, 1)
    findMatchIndex.value = ni
    if (ni >= 0) selectFindMatch(ed, nextMatches[ni]!)
  }

  function doReplaceAll() {
    const ed = deps.editor.value
    if (!ed) return
    const matches = collectFindMatches(ed.state.doc, findQuery.value, findOpts())
    if (!matches.length) {
      ElMessage.info('没有匹配项')
      findMatches.value = []
      findMatchIndex.value = -1
      return
    }
    const n = replaceAllFindMatches(ed, matches, findReplaceText.value)
    findMatches.value = []
    findMatchIndex.value = -1
    ElMessage.success(`已全部替换 ${n} 处`)
  }

  const findStatusText = computed(() => {
    const q = findQuery.value
    if (!q) return '输入要查找的内容'
    const total = findMatches.value.length
    if (!total) return '共 0 处'
    const cur = findMatchIndex.value >= 0 ? findMatchIndex.value + 1 : 0
    return `共 ${total} 处 · 第 ${cur} 处`
  })

  const canReplaceFind = computed(() => canRunFindReplace(findQuery.value, findMatches.value.length))

  return {
    findDialogOpen,
    findQuery,
    findReplaceText,
    findCaseSensitive,
    findWholeWord,
    findMatches,
    findMatchIndex,
    refreshFindMatches,
    openFindDialog,
    closeFindDialog,
    onFindQueryInput,
    findGo,
    doReplaceOne,
    doReplaceAll,
    findStatusText,
    canReplaceFind,
  }
}
