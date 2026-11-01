/** 斜杠菜单左侧短标记。只依赖 action.type，便于单测。 */
export function rteSlashGlyph(item: {
  label: string
  action: { type: string; level?: number }
}): string {
  const action = item.action
  switch (action.type) {
    case 'heading':
      return `H${action.level ?? ''}`
    case 'paragraph':
      return '正文'
    case 'bulletList':
      return '•'
    case 'orderedList':
      return '1.'
    case 'taskList':
      return '☐'
    case 'blockquote':
      return '“'
    case 'codeBlock':
      return '</>'
    case 'hr':
      return '—'
    case 'table':
      return '表'
    case 'columns':
      return '栏'
    case 'dateChip':
    case 'dateRemind':
    case 'plainDate':
    case 'plainDateTime':
      return '日'
    case 'formula':
      return 'Σ'
    case 'image':
      return '图'
    case 'link':
      return '链'
    case 'callout':
      return '!'
    default:
      return item.label.slice(0, 1)
  }
}
