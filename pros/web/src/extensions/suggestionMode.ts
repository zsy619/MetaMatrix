import { Extension } from '@tiptap/core'
import { trackTransaction, type SuggestionAuthor } from '../utils/rteSuggestions'

export type SuggestionModeOptions = {
  enabled: () => boolean
  author: () => SuggestionAuthor
}

/** 建议模式：文本插入和删除改记成修订，不直接改掉原文。 */
export const SuggestionMode = Extension.create<SuggestionModeOptions>({
  name: 'suggestionMode',

  addOptions() {
    return {
      enabled: () => false,
      author: () => ({ id: 'local', name: '我' }),
    }
  },

  dispatchTransaction({ transaction, next }) {
    const on = this.options.enabled()
    if (!on) {
      next(transaction)
      return
    }
    const tracked = trackTransaction(this.editor.state, transaction, this.options.author())
    next(tracked ?? transaction)
  },
})

export default SuggestionMode
