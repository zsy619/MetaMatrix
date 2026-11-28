import type { Component } from 'vue'
import { Connection, Document } from '@element-plus/icons-vue'
import type { NodeGraphNodeType } from '../../../types/nodeGraph'
import RichTextNodeBody from './RichTextNodeBody.vue'
import CanvasRefNodeBody from './CanvasRefNodeBody.vue'

/**
 * 节点类型注册表。
 *
 * 新增节点类型只改这一个文件：类型、图标、画布上的外观组件
 * 都在这里登记，别处不再写类型分支。
 */
export type NodeTypeSpec = {
  type: NodeGraphNodeType
  /** 类型名，显示在节点类型标记与选择器里。 */
  label: string
  /** 画布上区分类型的图标。 */
  icon: Component
  /** 主题色：图标底色与强调色。 */
  accent: string
  /** 节点卡片内容组件。 */
  body: Component
}

export const NODE_TYPES: Record<NodeGraphNodeType, NodeTypeSpec> = {
  richtext: {
    type: 'richtext',
    label: '富文本',
    icon: Document,
    accent: '#2563eb',
    body: RichTextNodeBody,
  },
  canvasRef: {
    type: 'canvasRef',
    label: '画布',
    icon: Connection,
    accent: '#7c3aed',
    body: CanvasRefNodeBody,
  },
}

export function nodeTypeSpec(type: string | undefined): NodeTypeSpec {
  return NODE_TYPES[(type || 'richtext') as NodeGraphNodeType] || NODE_TYPES.richtext
}
