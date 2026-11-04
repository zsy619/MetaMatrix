/**
 * 画布模板「上下文六要素」（v1）。
 *
 * 一个富文本编辑器画布：新建即带出六段（二级标题 + 一行占位文字）——
 * 任务目标 / AI的角色 / 我的角色 / 关键信息 / 行为规则 / 交付格式。
 *
 * 正文内容与富文本文档模板「上下文六要素」共用
 * src/utils/contextSixElements.ts 里的规格，保证两处文案一致。
 */
import type { ContextSixElementsDocumentJSON } from '../types/canvas'
import {
  CONTEXT_SIX_ELEMENTS_BLOCK_ID,
  CONTEXT_SIX_ELEMENTS_SECTIONS,
  contextSixElementsBodyHtml,
  contextSixElementsHeadingHtml,
} from '../utils/contextSixElements'

export function buildContextSixElementsItems() {
  const items = []
  for (const section of CONTEXT_SIX_ELEMENTS_SECTIONS) {
    items.push({
      id: `item_ctx_${section.key}_h`,
      text: contextSixElementsHeadingHtml(section),
    })
    items.push({
      id: `item_ctx_${section.key}_p`,
      text: contextSixElementsBodyHtml(section),
    })
  }
  return items
}

const contextSixElementsTemplate: ContextSixElementsDocumentJSON = {
  id: 'canvas_context_six_elements',
  type: 'context_six_elements',
  schemaVersion: 1,
  theme: {
    background: {
      pattern: 'none',
      color: '#f7f7f7',
    },
    page: '#ffffff',
    frame: '#ececec',
    hairline: 'rgba(60, 50, 20, 0.08)',
  },
  title: '上下文六要素',
  blocks: [
    {
      id: CONTEXT_SIX_ELEMENTS_BLOCK_ID,
      title: '上下文六要素',
      items: buildContextSixElementsItems(),
    },
  ],
}

export default contextSixElementsTemplate
