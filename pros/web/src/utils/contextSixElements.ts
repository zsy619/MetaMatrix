/**
 * 「上下文六要素」共享规格。
 *
 * 同一份数据被两处消费，避免文案漂移：
 * 1. 富文本文档模板（src/components/rteDocTemplates.ts）：工具栏「模板 ▾」/ 斜杠菜单插入；
 * 2. 画布模板（src/templates/context-six-elements-v1.ts）：新建画布时自动带出六段。
 */
export interface ContextSixElementsSection {
  /** 稳定 id，用作画布里的条目序号与测试锚点 */
  key: string
  /** 二级标题 */
  title: string
  /** 标题下面那一行的占位文字 */
  placeholder: string
}

export const CONTEXT_SIX_ELEMENTS_SECTIONS: ContextSixElementsSection[] = [
  { key: 'goal', title: '任务目标', placeholder: '此处填写任务目标' },
  { key: 'ai_role', title: 'AI的角色', placeholder: '此处填写AI的角色' },
  { key: 'my_role', title: '我的角色', placeholder: '此处填写我的角色' },
  { key: 'key_info', title: '关键信息', placeholder: '此处填写关键信息' },
  { key: 'rules', title: '行为规则', placeholder: '此处填写行为规则' },
  { key: 'deliverable', title: '交付格式', placeholder: '此处填写交付格式' },
]

/** 画布 / 文档模板的块 id（画布里唯一一块富文本正文） */
export const CONTEXT_SIX_ELEMENTS_BLOCK_ID = 'context'

/** 二级标题的 HTML 片段（画布正文按块存储，一段标题一块） */
export function contextSixElementsHeadingHtml(section: ContextSixElementsSection): string {
  return `<h2>${section.title}</h2>`
}

/** 占位文字的 HTML 片段 */
export function contextSixElementsBodyHtml(section: ContextSixElementsSection): string {
  return `<p>${section.placeholder}</p>`
}
