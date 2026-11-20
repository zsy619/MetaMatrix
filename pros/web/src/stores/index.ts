import { createPinia } from 'pinia'

/**
 * 全局唯一的 pinia 实例。
 *
 * 单独导出而不是在 main.ts 里内联创建，是因为路由守卫需要在
 * 组件之外拿到 store（守卫不是组件，没有 setup 上下文）。
 * 显式传入实例比依赖 pinia 的"当前活跃实例"更可靠，
 * 也让单元测试可以直接注入一个测试用实例。
 */
export const pinia = createPinia()

export default pinia
