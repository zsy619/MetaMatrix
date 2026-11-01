import type { InjectionKey, Ref, ShallowRef } from 'vue'
import type { Editor } from '@tiptap/vue-3'

/** 根组件冻结的 10 个 props。子组件只通过 RTE_CTX 读取。 */
export type RteEditorProps = {
  modelValue: string
  title: string
  showTitle: boolean
  placeholder: string
  compact: boolean
  expanded: boolean
  showBottomBar: boolean
  showPublishActions: boolean
  showMarkdownHint: boolean
  panelId: string
}

/** 根组件冻结的 4 个 emit。 */
export type RteEditorEmit = {
  (event: 'update:modelValue', html: string): void
  (event: 'update:title', title: string): void
  (event: 'focus'): void
  (event: 'blur'): void
}

/**
 * 全编辑器只此一个 TipTap 实例。根组件 useEditor 创建后 provide，
 * 子组件 inject，不再各自 new Editor。
 */
export type RteContext = {
  editor: ShallowRef<Editor | undefined>
  props: RteEditorProps
  emit: RteEditorEmit
  ui: {
    rootEl: Ref<HTMLElement | null>
  }
}

export const RTE_CTX: InjectionKey<RteContext> = Symbol('RTE_CTX')
