export const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024

const ALLOWED_EXT = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'pdf',
  'txt',
  'md',
  'markdown',
  'json',
  'csv',
])

function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  if (i < 0) return ''
  return name.slice(i + 1).toLowerCase()
}

/** Returns a Chinese reason when the file must be rejected, otherwise null. */
export function attachmentRejectReason(name: string, mime: string, size: number): string | null {
  if (size > MAX_ATTACHMENT_BYTES) {
    return `文件超过 3MB（当前 ${(size / 1024 / 1024).toFixed(1)}MB），请压缩后重试或改用链接。`
  }
  const ext = extOf(name)
  const type = mime.toLowerCase()
  const mimeOk =
    type.startsWith('image/') && type !== 'image/svg+xml' ||
    type === 'application/pdf' ||
    type.startsWith('text/') ||
    type === 'application/json'
  if (!ALLOWED_EXT.has(ext) && !mimeOk) {
    return '只支持图片、PDF、文本、Markdown、JSON 或 CSV。'
  }
  if (ext === 'svg' || type === 'image/svg+xml' || ext === 'html' || ext === 'htm' || ext === 'js') {
    return '为安全起见，不接受网页脚本或 SVG。请改用 PNG、PDF 或链接。'
  }
  return null
}

/** DataURL 字符串本身不超过 3MB（与面板附件策略一致）。 */
export function dataUrlExceedsAttachmentLimit(dataUrl: string): boolean {
  return dataUrl.length > MAX_ATTACHMENT_BYTES
}
