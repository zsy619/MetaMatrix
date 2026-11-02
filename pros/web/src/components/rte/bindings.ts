import { provide, proxyRefs, type InjectionKey } from 'vue'

/**
 * 工具栏、正文区和弹层共用的运行时绑定。
 * 根组件在 setup 里 provide；子模板通过 `rte.xxx` 读写，行为与原先写在同一个
 * `<script setup>` 里相同（ref 自动解包，赋值写回 .value）。
 */
export type RteBindings = Record<string, any>

export const RTE_BINDINGS: InjectionKey<RteBindings> = Symbol('RTE_BINDINGS')

export function provideRteBindings(bindings: object) {
  provide(RTE_BINDINGS, proxyRefs(bindings) as RteBindings)
}
