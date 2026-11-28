import { isTemplateId, TEMPLATE_META, type TemplateId } from '../../stores/document'

export interface LocalDraft {
  templateId: TemplateId
  title: string
  updatedAt: string
}

const META_PREFIX = 'metamatrix:doc-meta:'

/** 从本地已存文档里取出最近写过的模板。不认识的键和坏数据跳过。 */
export function readLocalDrafts(entries: { key: string; value: string }[], limit = 6): LocalDraft[] {
  const drafts: LocalDraft[] = []
  for (const entry of entries) {
    if (!entry.key.startsWith(META_PREFIX)) continue
    let templateId = entry.key.slice(META_PREFIX.length)
    // 新键格式是 doc-meta:<用户 id>:<template:模板 | doc:文档 id>。
    // 草稿列表面向“未建档的模板草稿”，所以只认 template: 分区；
    // 旧的无前缀键继续按模板 id 读取，保证升级后仍能看到历史草稿。
    const sep = templateId.indexOf(':')
    if (sep !== -1) {
      const scoped = templateId.slice(sep + 1)
      if (!scoped.startsWith('template:')) continue
      templateId = scoped.slice('template:'.length)
    }
    if (!isTemplateId(templateId)) continue
    let meta: { title?: unknown; updatedAt?: unknown }
    try {
      meta = JSON.parse(entry.value) as { title?: unknown; updatedAt?: unknown }
    } catch {
      continue
    }
    if (typeof meta.updatedAt !== 'string' || Number.isNaN(Date.parse(meta.updatedAt))) continue
    const title = typeof meta.title === 'string' ? meta.title.trim() : ''
    drafts.push({
      templateId,
      title: title || TEMPLATE_META[templateId].name,
      updatedAt: meta.updatedAt,
    })
  }
  return drafts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit)
}

export function draftWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
