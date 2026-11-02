import { onBeforeUnmount, onMounted } from 'vue'
import { RTE_OVERLAY_CLOSE_ORDER, topOpenModal } from '../../../utils/rteRound8'

/** Escape 关闭最上层浮层。keydown 监听在本组合式内成对注册。 */
export function useOverlayStack(deps: {
  askOpen: () => { value: boolean }
  linkImportOpen: () => { value: boolean }
  imageDialogOpen: () => { value: boolean }
  videoDialogOpen: () => { value: boolean }
  formulaDialogOpen: () => { value: boolean }
  tableDialogOpen: () => { value: boolean }
  noteDialogOpen: () => { value: boolean }
  attachDialogOpen: () => { value: boolean }
  snippetDialogOpen: () => { value: boolean }
  xrefDialogOpen: () => { value: boolean }
  readTimeDialogOpen: () => { value: boolean }
  linkCardDialogOpen: () => { value: boolean }
  wave21ReportOpen: () => { value: boolean }
  findDialogOpen: () => { value: boolean }
  linkDialogOpen: () => { value: boolean }
  printPreviewOpen: () => { value: boolean }
  wordCountDockOpen: () => { value: boolean }
  shortcutsOpen: () => { value: boolean }
  blockMenuOpen: () => { value: boolean }
  notesOpen: () => { value: boolean }
  historyOpen: () => { value: boolean }
  closeAskDialog: (reason: 'cancel' | 'ok') => void
  closeImportLinkDialog: () => void
  closeImageDialog: () => void
  closeVideoDialog: () => void
  closeFormulaDialog: () => void
  closeTableDialog: () => void
  closeNoteDialog: () => void
  closeAttachDialog: () => void
  closeLinkCardDialog: () => void
  closeFindDialog: () => void
  closeLinkDialog: () => void
  closePrintPreview: () => void
}) {
function closeTopOverlay(): boolean {
  const id = topOpenModal(
    {
      ask: deps.askOpen().value,
      linkImport: deps.linkImportOpen().value,
      image: deps.imageDialogOpen().value,
      video: deps.videoDialogOpen().value,
      formula: deps.formulaDialogOpen().value,
      table: deps.tableDialogOpen().value,
      note: deps.noteDialogOpen().value,
      attach: deps.attachDialogOpen().value,
      snippet: deps.snippetDialogOpen().value,
      xref: deps.xrefDialogOpen().value,
      readTime: deps.readTimeDialogOpen().value,
      linkCard: deps.linkCardDialogOpen().value,
      wave21: deps.wave21ReportOpen().value,
      find: deps.findDialogOpen().value,
      link: deps.linkDialogOpen().value,
      print: deps.printPreviewOpen().value,
      wordCount: deps.wordCountDockOpen().value,
      shortcuts: deps.shortcutsOpen().value,
      blockMenu: deps.blockMenuOpen().value,
      notes: deps.notesOpen().value,
      history: deps.historyOpen().value,
    },
    RTE_OVERLAY_CLOSE_ORDER,
  )
  if (!id) return false
  switch (id) {
    case 'ask':
      deps.closeAskDialog('cancel')
      break
    case 'linkImport':
      deps.closeImportLinkDialog()
      break
    case 'image':
      deps.closeImageDialog()
      break
    case 'video':
      deps.closeVideoDialog()
      break
    case 'formula':
      deps.closeFormulaDialog()
      break
    case 'table':
      deps.closeTableDialog()
      break
    case 'note':
      deps.closeNoteDialog()
      break
    case 'attach':
      deps.closeAttachDialog()
      break
    case 'snippet':
      deps.snippetDialogOpen().value = false
      break
    case 'xref':
      deps.xrefDialogOpen().value = false
      break
    case 'readTime':
      deps.readTimeDialogOpen().value = false
      break
    case 'linkCard':
      deps.closeLinkCardDialog()
      break
    case 'wave21':
      deps.wave21ReportOpen().value = false
      break
    case 'find':
      deps.closeFindDialog()
      break
    case 'link':
      deps.closeLinkDialog()
      break
    case 'print':
      deps.closePrintPreview()
      break
    case 'wordCount':
      deps.wordCountDockOpen().value = false
      break
    case 'shortcuts':
      deps.shortcutsOpen().value = false
      break
    case 'blockMenu':
      deps.blockMenuOpen().value = false
      break
    case 'notes':
      deps.notesOpen().value = false
      break
    case 'history':
      deps.historyOpen().value = false
      break
    default:
      return false
  }
  return true
}

function onWindowEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.defaultPrevented) return
  if (!closeTopOverlay()) return
  event.preventDefault()
}


  onMounted(() => {
    window.addEventListener('keydown', onWindowEscape)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onWindowEscape)
  })
}
