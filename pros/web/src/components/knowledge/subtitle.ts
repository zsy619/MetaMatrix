/**
 * 字幕解析：把 SRT / VTT 转成纯文本行。
 *
 * 只保留台词：序号行、时间轴行与 WEBVTT 头都丢掉，标签也去掉。
 */
export function parseSubtitle(raw: string): string[] {
  const out: string[] = []
  for (const line of (raw ?? '').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (/^\d+$/.test(trimmed)) continue
    if (/-->/.test(trimmed)) continue
    if (/^WEBVTT/i.test(trimmed)) continue
    out.push(trimmed.replace(/<[^>]+>/g, ''))
  }
  return out
}
