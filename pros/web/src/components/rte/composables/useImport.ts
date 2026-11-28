import { ref, type ShallowRef } from 'vue'
import { ElMessage } from 'element-plus'
import type { Editor } from '@tiptap/core'
import { escapeHtml } from '../../../utils/itemsHtml'
import { markdownToHtml as rteMarkdownToHtml } from '../../../utils/rteMarkdown'
import JSZip from 'jszip'

/** 导入 md/docx/链接。markdownToHtml 仍供粘贴路径使用。 */
export function useImport(deps: {
  editor: ShallowRef<Editor | undefined>
  closeMore: () => void
}) {
const importMenuOpen = ref(false)
const importFileInputRef = ref<HTMLInputElement | null>(null)
const linkImportOpen = ref(false)
const linkImportUrl = ref('')
const linkImportBusy = ref(false)

/** Markdown 导入：所见即所得预览弹窗。 */
const markdownImportOpen = ref(false)
const markdownFileName = ref('')
const markdownSource = ref('')
const markdownHtml = ref('')
const markdownStats = ref('')
const markdownView = ref<'split' | 'preview' | 'source'>('split')

function closeImportMenu() {
  importMenuOpen.value = false
}

function openMarkdownImport(source: string, fileName: string) {
  markdownSource.value = source
  markdownFileName.value = fileName
  markdownHtml.value = markdownToHtml(source)
  markdownStats.value = describeMarkdown(markdownHtml.value)
  markdownView.value = 'split'
  markdownImportOpen.value = true
}

function closeMarkdownImport() {
  markdownImportOpen.value = false
  markdownSource.value = ''
  markdownHtml.value = ''
  markdownFileName.value = ''
  markdownStats.value = ''
}

/**
 * 按预览结果落库。
 * - cursor：插到当前光标处
 * - replace：替换整篇正文
 * - append：追加到文末
 */
function confirmMarkdownImport(mode: 'cursor' | 'replace' | 'append') {
  const ed = deps.editor.value
  if (!ed || !markdownHtml.value) return
  const html = markdownHtml.value
  if (mode === 'replace') {
    ed.chain().focus().setContent(html).run()
  } else if (mode === 'append') {
    const end = ed.state.doc.content.size
    ed.chain().focus().insertContentAt(end, html).run()
  } else {
    ed.chain().focus().insertContent(html).run()
  }
  ElMessage.success(`已导入文档：${markdownFileName.value}（${markdownStats.value}）`)
  closeMarkdownImport()
}

function onImport() {
  // 紧凑「更多」菜单入口：打开同款双选项
  importMenuOpen.value = true
  deps.closeMore()
}

function pickImportDocument() {
  closeImportMenu()
  deps.closeMore()
  importFileInputRef.value?.click()
}

function openImportLinkDialog() {
  closeImportMenu()
  deps.closeMore()
  linkImportUrl.value = ''
  linkImportOpen.value = true
}

function closeImportLinkDialog() {
  linkImportOpen.value = false
  linkImportUrl.value = ''
  linkImportBusy.value = false
}

/** 导入后的结构摘要，让用户知道解析出了什么。 */
function describeMarkdown(html: string): string {
  const tables = (html.match(/<table[\s>]/g) || []).length
  const headings = (html.match(/<h[1-6][\s>]/g) || []).length
  const lists = (html.match(/<(ul|ol)[\s>]/g) || []).length
  const codes = (html.match(/<pre[\s>]/g) || []).length
  const parts: string[] = []
  if (headings) parts.push(`${headings} 个标题`)
  if (tables) parts.push(`${tables} 个表格`)
  if (lists) parts.push(`${lists} 组列表`)
  if (codes) parts.push(`${codes} 个代码块`)
  return parts.join(' · ') || '已按段落导入'
}

/**
 * Markdown → HTML。
 *
 * 解析逻辑放在 utils/rteMarkdown（导入与粘贴共用同一套）：
 * 支持标题、段落软换行、多级列表 / 任务列表、引用、围栏与缩进代码块、
 * GFM 表格、分隔线，以及行内的转义 / 代码 / 粗斜体 / 删除线 / 链接 / 图片。
 */
function markdownToHtml(md: string): string {
  return rteMarkdownToHtml(md)
}

async function extractDocxText(buf: ArrayBuffer): Promise<string> {
  // 轻量解析：docx 是 zip，读 word/document.xml 抽文本
  const zip = await JSZip.loadAsync(buf)
  const xmlFile = zip.file('word/document.xml')
  if (!xmlFile) throw new Error('NO_DOCUMENT_XML')
  const xml = await xmlFile.async('string')
  const texts: string[] = []
  const re = /<w:t[^>]*>([^<]*)<\/w:t>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) {
    texts.push(m[1]!)
  }
  // 粗略按段落：遇 </w:p> 换行
  const paras = xml
    .split(/<\/w:p>/)
    .map((chunk: string) => {
      const parts: string[] = []
      const r = /<w:t[^>]*>([^<]*)<\/w:t>/g
      let mm: RegExpExecArray | null
      while ((mm = r.exec(chunk))) parts.push(mm[1]!)
      return parts.join('')
    })
    .map((s: string) => s.trim())
    .filter(Boolean)
  return paras.join('\n\n') || texts.join('')
}

async function onImportFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const name = file.name.toLowerCase()
  const ed = deps.editor.value
  if (!ed) return

  try {
    if (name.endsWith('.md') || name.endsWith('.markdown') || name.endsWith('.txt')) {
      const textContent = await file.text()
      if (name.endsWith('.txt')) {
        const html =
          textContent
            .split(/\n{2,}/)
            .map((p) => `<p>${escapeHtml(p.trim())}</p>`)
            .join('') || `<p>${escapeHtml(textContent)}</p>`
        ed.chain().focus().insertContent(html).run()
        ElMessage.success(`已导入文档：${file.name}`)
        return
      }
      // Markdown：先给所见即所得预览，确认后再落库。
      openMarkdownImport(textContent, file.name)
      return
    }

    if (name.endsWith('.docx')) {
      const buf = await file.arrayBuffer()
      try {
        const plain = await extractDocxText(buf)
        const html = plain
          .split(/\n{2,}/)
          .map((p) => `<p>${escapeHtml(p.trim())}</p>`)
          .join('')
        ed.chain().focus().insertContent(html || `<p></p>`).run()
        ElMessage.success(`已导入文档：${file.name}`)
      } catch {
        ElMessage.warning('无法解析该 .docx，请另存为 Markdown (.md) 后再导入')
      }
      return
    }

    if (name.endsWith('.doc')) {
      ElMessage.warning(`暂不支持旧版 .doc「${file.name}」，请另存为 .docx 或 .md 后导入`)
      return
    }

    ElMessage.warning('请选择 .md / .docx 文档')
  } catch (err) {
    console.error(err)
    ElMessage.error('导入失败，请重试')
  }
}

async function confirmImportLink() {
  const ed = deps.editor.value
  if (!ed) return
  const url = linkImportUrl.value.trim()
  if (!url) {
    ElMessage.warning('请输入公众号文章链接')
    return
  }
  let href = url
  if (!/^https?:\/\//i.test(href)) href = `https://${href}`

  linkImportBusy.value = true
  let title = ''
  let excerpt = ''
  try {
    // 浏览器侧常被 CORS 拦截；失败则走占位插入
    const ctrl = new AbortController()
    const timer = window.setTimeout(() => ctrl.abort(), 6000)
    const res = await fetch(href, { signal: ctrl.signal, mode: 'cors' })
    window.clearTimeout(timer)
    if (res.ok) {
      const html = await res.text()
      const t = /<title[^>]*>([^<]*)<\/title>/i.exec(html)
      title = (t?.[1] || '').trim()
      const desc =
        /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i.exec(
          html,
        ) ||
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i.exec(
          html,
        )
      if (desc?.[1]) title = desc[1].trim()
      const d2 =
        /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)/i.exec(
          html,
        ) ||
        /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i.exec(
          html,
        )
      if (d2?.[1]) excerpt = d2[1].trim()
    }
  } catch {
    // CORS / network — expected for 公众号
  } finally {
    linkImportBusy.value = false
  }

  const label = title || '公众号文章'
  const safeHref = escapeHtml(href)
  const safeLabel = escapeHtml(label)
  const safeExcerpt = excerpt ? `<p>${escapeHtml(excerpt)}</p>` : ''
  const block = `<p><a href="${safeHref}" class="rte-link" target="_blank" rel="noopener">🔗 ${safeLabel}</a></p>${safeExcerpt}<p><code>来源：${safeHref}</code></p>`
  ed.chain().focus().insertContent(block).run()
  if (title) {
    ElMessage.success('已导入链接并写入标题')
  } else {
    ElMessage.info('无法抓取正文（公众号常限制跨域），已插入可点击链接占位')
  }
  closeImportLinkDialog()
}

  return {
    importMenuOpen,
    importFileInputRef,
    linkImportOpen,
    linkImportUrl,
    linkImportBusy,
    markdownImportOpen,
    markdownFileName,
    markdownSource,
    markdownHtml,
    markdownStats,
    markdownView,
    closeImportMenu,
    onImport,
    pickImportDocument,
    openImportLinkDialog,
    closeImportLinkDialog,
    onImportFileChange,
    confirmImportLink,
    openMarkdownImport,
    closeMarkdownImport,
    confirmMarkdownImport,
    markdownToHtml,
  }
}
