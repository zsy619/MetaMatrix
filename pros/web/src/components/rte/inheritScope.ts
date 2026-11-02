import { getCurrentInstance, onMounted, onUpdated } from 'vue'

/**
 * 子组件模板不在根 SFC 里，Vue 不会给它们打上根组件的 data-v。
 * 模板元素带 `data-rte-own`（含 Teleport 到 body 的节点）。挂载和更新后补上
 * 与根组件相同的 scope 属性，这样原有 scoped 选择器仍然命中。
 */
export function useParentScopeStamp() {
  const inst = getCurrentInstance()
  let scopeId = (inst?.parent?.type as { __scopeId?: string } | undefined)?.__scopeId || ''

  const resolveScopeId = () => {
    if (scopeId) return scopeId
    const el = inst?.parent?.vnode?.el
    if (el instanceof Element) {
      for (const attr of el.attributes) {
        if (attr.name.startsWith('data-v-')) return attr.name
      }
    }
    return ''
  }

  const stamp = () => {
    scopeId = resolveScopeId()
    if (!scopeId || typeof document === 'undefined') return
    for (const el of document.querySelectorAll<Element>('[data-rte-own]')) {
      if (!el.hasAttribute(scopeId)) el.setAttribute(scopeId, '')
    }
  }

  onMounted(stamp)
  onUpdated(stamp)
}
