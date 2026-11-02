import { Mark, mergeAttributes } from '@tiptap/core'
import { suggestionColor } from '../utils/rteSuggestions'

type SuggestionAttrs = {
  id?: string
  authorId?: string
  authorName?: string
  createdAt?: string
}

function suggestionAttributes() {
  return {
    id: {
      default: '',
      parseHTML: (element: HTMLElement) => element.getAttribute('data-suggestion-id') || '',
      renderHTML: (attrs: SuggestionAttrs) => (attrs.id ? { 'data-suggestion-id': attrs.id } : {}),
    },
    authorId: {
      default: '',
      parseHTML: (element: HTMLElement) => element.getAttribute('data-author-id') || '',
      renderHTML: (attrs: SuggestionAttrs) => (attrs.authorId ? { 'data-author-id': attrs.authorId } : {}),
    },
    authorName: {
      default: '',
      parseHTML: (element: HTMLElement) => element.getAttribute('data-author-name') || '',
      renderHTML: (attrs: SuggestionAttrs) => {
        const name = attrs.authorName || ''
        return name ? { 'data-author-name': name, title: name } : {}
      },
    },
    createdAt: {
      default: '',
      parseHTML: (element: HTMLElement) => element.getAttribute('data-created-at') || '',
      renderHTML: (attrs: SuggestionAttrs) =>
        attrs.createdAt ? { 'data-created-at': attrs.createdAt } : {},
    },
  }
}

function paint(kind: 'insert' | 'delete', attrs: Record<string, string>) {
  const color = suggestionColor(attrs['data-author-id'] || attrs.authorId || '')
  if (kind === 'insert') {
    return {
      class: 'rte-suggestion rte-suggestion-insert',
      'data-suggestion': 'insert',
      style: `color:${color};background-color:${color}1f;border-bottom:2px solid ${color}`,
    }
  }
  return {
    class: 'rte-suggestion rte-suggestion-delete',
    'data-suggestion': 'delete',
    style: `color:${color};text-decoration:line-through;background-color:${color}14`,
  }
}

export const SuggestionInsert = Mark.create({
  name: 'suggestionInsert',
  inclusive: false,
  addAttributes() {
    return suggestionAttributes()
  },
  parseHTML() {
    return [{ tag: 'span[data-suggestion="insert"]' }, { tag: 'span[data-suggestion-insert]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, paint('insert', HTMLAttributes)), 0]
  },
})

export const SuggestionDelete = Mark.create({
  name: 'suggestionDelete',
  inclusive: false,
  addAttributes() {
    return suggestionAttributes()
  },
  parseHTML() {
    return [{ tag: 'span[data-suggestion="delete"]' }, { tag: 'span[data-suggestion-delete]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, paint('delete', HTMLAttributes)), 0]
  },
})
