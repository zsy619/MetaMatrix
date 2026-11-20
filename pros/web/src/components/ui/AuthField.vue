<script setup lang="ts">
/**
 * 带图标的表单输入框。
 *
 * 把"左侧图标 + 输入框 + 右侧按钮"这套结构收敛到一个组件里，
 * 登录页和注册页共用，避免两个页面各写一遍 DOM 结构导致样式漂移。
 *
 * 图标用内联 SVG 铺在输入框左侧（pointer-events: none，不会挡住点击），
 * 右侧的尾部区域留给"显示密码"这类操作按钮。
 */
import { computed, useAttrs } from 'vue'

const props = withDefaults(
  defineProps<{
    /** 输入框 id，同时作为 label 的 for 目标 */
    id: string
    /** 字段标签文字 */
    label: string
    /** 输入框类型 */
    type?: string
    /** 占位提示 */
    placeholder?: string
    /** 左侧图标的 SVG 路径数据，空则不显示图标 */
    icon?: string
    /** 右侧是否留出尾部按钮的位置（没有尾部按钮时不要留白） */
    hasTrailing?: boolean
  }>(),
  { type: 'text', placeholder: '', icon: '', hasTrailing: false },
)

/** 双向绑定的输入值。 */
const model = defineModel<string>({ default: '' })

/**
 * 透传给原生 input 的属性。
 * 用 inheritAttrs=false + 手动 v-bind，保证多传的属性落在 input 上而不是组件根节点。
 */
defineOptions({ inheritAttrs: false })
const attrs = useAttrs()

const trailingVisible = computed(() => props.hasTrailing)
</script>

<template>
  <div class="auth-field">
    <label class="auth-field__label" :for="id">{{ label }}</label>
    <div
      class="auth-field__control"
      :class="{ 'has-icon': Boolean(icon), 'has-trailing': trailingVisible }"
    >
      <!--
        左侧图标：纯装饰，aria-hidden 让读屏软件跳过。
        pointer-events: none 保证点击图标等于点击输入框。
      -->
      <span v-if="icon" class="auth-field__icon" aria-hidden="true" v-html="icon" />
      <input
        :id="id"
        v-model="model"
        v-bind="attrs"
        class="auth-input"
        :type="type"
        :placeholder="placeholder"
      />
      <!-- 尾部操作区（显示/隐藏密码这类按钮） -->
      <span v-if="$slots.trailing" class="auth-field__trailing">
        <slot name="trailing" />
      </span>
    </div>
    <slot name="hint" />
  </div>
</template>
