import { ref, type Ref, type ShallowRef } from 'vue'
import { ElMessage } from 'element-plus'
import type { Editor } from '@tiptap/core'
import html2canvas from 'html2canvas'
import { feishuClipboardDocument } from '../../../utils/rteRound7'
import { buildDocxBlob } from '../../../utils/rteExportDocx'
import { buildPdfFromElement } from '../../../utils/rteExportPdf'
import { htmlToMarkdown } from '../../../utils/rteExportMd'
import { escapeHtml } from '../../../utils/itemsHtml'
import type { PageMargin, PageMarginBox } from '../../../utils/rtePageMargin'
import type { RtePageSizeId } from '../../../utils/rtePageSize'

/** 导出菜单与 HTML / 文本 / Markdown / PNG / PDF / Word。 */
export function useExport(deps: {
  editor: ShallowRef<Editor | undefined>
  title: Ref<string>
  rootEl: Ref<HTMLElement | null>
  pageSize: { value: RtePageSizeId }
  pageSizeMeta: { value: { paper: boolean } }
  pageMargin: { value: PageMargin }
  pageScreenMargin: { value: PageMarginBox }
  closeMore: () => void
}) {
const exportMenuOpen = ref(false)
const exportBusy = ref(false)

function closeExportMenu() {
  exportMenuOpen.value = false
}

function onExportMenu() {
  exportMenuOpen.value = true
  deps.closeMore()
}

function exportFileBasename(): string {
  const raw = (deps.title.value || '').trim() || '未命名文档'
  return raw.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 80)
}

function triggerDownloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

async function copyAsFeishuHtml() {
  closeExportMenu()
  deps.closeMore()
  const ed = deps.editor.value
  if (!ed) {
    ElMessage.warning('编辑器未就绪')
    return
  }
  const title = (deps.title.value || '').trim()
  const html = feishuClipboardDocument(ed.getHTML() || '', title)
  const textBody = ed.getText({ blockSeparator: '\n' }) || ''
  const plain = title ? `${title}\n\n${textBody}` : textBody
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' }),
        }),
      ])
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(html)
    } else {
      throw new Error('clipboard unavailable')
    }
    ElMessage.success('已复制为可粘贴的 HTML')
  } catch (err) {
    console.error(err)
    try {
      await navigator.clipboard.writeText(html)
      ElMessage.success('已复制 HTML 源码')
    } catch {
      ElMessage.error('复制失败，请检查浏览器剪贴板权限')
    }
  }
}

function exportAsHtml() {
  closeExportMenu()
  deps.closeMore()
  const ed = deps.editor.value
  if (!ed) {
    ElMessage.warning('编辑器未就绪')
    return
  }
  const title = (deps.title.value || '').trim() || '未命名文档'
  const body = ed.getHTML()
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
body{font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;line-height:1.6;color:#1d2129;max-width:800px;margin:32px auto;padding:0 16px;}
img,video{max-width:100%;height:auto;}
table{border-collapse:collapse;width:100%;}
th,td{border:1px solid #e5e6eb;padding:6px 8px;}
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${body}
</body>
</html>
`
  triggerDownloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `${exportFileBasename()}.html`)
  ElMessage.success('已导出 HTML')
}

function exportAsPlainText() {
  closeExportMenu()
  deps.closeMore()
  const ed = deps.editor.value
  if (!ed) {
    ElMessage.warning('编辑器未就绪')
    return
  }
  const title = (deps.title.value || '').trim()
  const textBody = ed.getText({ blockSeparator: '\n' }) || ''
  const content = title ? `${title}\n\n${textBody}` : textBody
  triggerDownloadBlob(
    new Blob([content], { type: 'text/plain;charset=utf-8' }),
    `${exportFileBasename()}.txt`,
  )
  ElMessage.success('已导出纯文本')
}

async function exportAsPng() {
  closeExportMenu()
  deps.closeMore()
  if (exportBusy.value) return
  const root = deps.rootEl.value
  const el =
    (root?.querySelector?.('.ProseMirror') as HTMLElement | null) ||
    (root?.querySelector?.('.rte-body') as HTMLElement | null)
  if (!el) {
    ElMessage.warning('未找到可导出的正文区域')
    return
  }
  exportBusy.value = true
  root?.classList.add('rte-printing')
  try {
    const canvas = await html2canvas(el, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false,
    })
    const link = document.createElement('a')
    link.download = `${exportFileBasename()}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
    ElMessage.success('已导出图片')
  } catch (err) {
    console.error(err)
    ElMessage.error('导出图片失败')
  } finally {
    root?.classList.remove('rte-printing')
    exportBusy.value = false
  }
}

async function exportAsPdf() {
  closeExportMenu()
  deps.closeMore()
  if (exportBusy.value) return
  const root = deps.rootEl.value
  const el =
    (root?.querySelector?.('.ProseMirror') as HTMLElement | null) ||
    (root?.querySelector?.('.rte-body') as HTMLElement | null)
  if (!el) {
    ElMessage.warning('未找到可导出的正文区域')
    return
  }
  exportBusy.value = true
  root?.classList.add('rte-printing')
  try {
    const title = (deps.title.value || '').trim() || '未命名文档'
    const marginMm = deps.pageSizeMeta.value.paper ? deps.pageMargin.value : deps.pageScreenMargin.value
    const blob = await buildPdfFromElement(el, { title, pageSize: deps.pageSize.value, marginMm })
    triggerDownloadBlob(blob, `${exportFileBasename()}.pdf`)
    ElMessage.success('已导出 PDF')
  } catch (err) {
    console.error(err)
    ElMessage.error('导出 PDF 失败')
  } finally {
    root?.classList.remove('rte-printing')
    exportBusy.value = false
  }
}

async function exportAsDocx() {
  closeExportMenu()
  deps.closeMore()
  if (exportBusy.value) return
  const ed = deps.editor.value
  if (!ed) {
    ElMessage.warning('编辑器未就绪')
    return
  }
  exportBusy.value = true
  try {
    const title = (deps.title.value || '').trim() || '未命名文档'
    const bodyHtml = ed.getHTML() || ''
    const bodyText = ed.getText({ blockSeparator: '\n' }) || ''
    const blob = await buildDocxBlob({ title, bodyHtml, bodyText })
    triggerDownloadBlob(blob, `${exportFileBasename()}.docx`)
    ElMessage.success('已导出 Word')
  } catch (err) {
    console.error(err)
    ElMessage.error('导出 Word 失败')
  } finally {
    exportBusy.value = false
  }
}

function exportAsMarkdown() {
  closeExportMenu()
  deps.closeMore()
  const ed = deps.editor.value
  if (!ed) {
    ElMessage.warning('编辑器未就绪')
    return
  }
  const title = (deps.title.value || '').trim()
  const mdBody = htmlToMarkdown(ed.getHTML() || '')
  const md = title ? `# ${title}\n\n${mdBody}` : mdBody
  triggerDownloadBlob(
    new Blob([md], { type: 'text/markdown;charset=utf-8' }),
    `${exportFileBasename()}.md`,
  )
  ElMessage.success('已导出 Markdown')
}

  return {
    exportMenuOpen,
    exportBusy,
    closeExportMenu,
    onExportMenu,
    copyAsFeishuHtml,
    exportAsHtml,
    exportAsPlainText,
    exportAsMarkdown,
    exportAsPng,
    exportAsPdf,
    exportAsDocx,
  }
}
