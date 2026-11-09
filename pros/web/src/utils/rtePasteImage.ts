/**
 * 判断一次粘贴是不是「只有图片」。
 * 截图和复制图片经常带着空的 HTML 外壳，这种要走素材库上传，而不是把外壳插进正文。
 */

export function pasteCarriesText(plain: string, html: string): boolean {
  if (plain.replace(/\u00a0/g, ' ').trim()) return true
  if (!html.trim()) return false
  if (typeof document === 'undefined') {
    return html.replace(/<[^>]+>/g, '').replace(/\u00a0/g, ' ').trim().length > 0
  }
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  tmp.querySelectorAll('img, picture, source, meta, style, script, link, title, head').forEach((el) => {
    el.remove()
  })
  return Boolean((tmp.textContent || '').replace(/\u00a0/g, ' ').trim())
}

/** 从粘贴的 HTML 里取出 data URL 图片，交给素材库上传。远程地址不在这里下载。 */
export function filesFromImageDataUrls(html: string): File[] {
  if (!html || typeof File === 'undefined') return []
  const out: File[] = []
  const pattern = /src\s*=\s*["'](data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+)["']/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(html))) {
    const file = dataUrlToImageFile(match[1] || '', out.length)
    if (file) out.push(file)
  }
  return out
}

function dataUrlToImageFile(dataUrl: string, index: number): File | null {
  const parsed = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(dataUrl.trim())
  if (!parsed) return null
  const mime = (parsed[1] || 'image/png').toLowerCase()
  const payload = (parsed[2] || '').replace(/\s/g, '')
  if (!payload) return null
  let binary = ''
  try {
    binary = atob(payload)
  } catch {
    return null
  }
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  const ext = mime.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
  return new File([bytes], `粘贴的图片-${index + 1}.${ext}`, { type: mime })
}
