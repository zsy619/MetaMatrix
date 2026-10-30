import { Node, Extension, mergeAttributes, type Editor } from '@tiptap/core'

/** 选项用 | 分隔，便于落在 HTML data-* 上且旧内容可读 */
export function splitFormOptions(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x).trim()).filter(Boolean)
  }
  const s = String(raw ?? '').trim()
  if (!s) return []
  // 兼容 JSON 数组
  if (s.startsWith('[')) {
    try {
      const parsed = JSON.parse(s)
      if (Array.isArray(parsed)) {
        return parsed.map((x) => String(x).trim()).filter(Boolean)
      }
    } catch {
      /* fall through */
    }
  }
  return s.split('|').map((x) => x.trim()).filter(Boolean)
}

export function joinFormOptions(opts: string[]): string {
  return opts.map((x) => x.trim()).filter(Boolean).join('|')
}

export function splitFormValues(raw: unknown): string[] {
  return splitFormOptions(raw)
}

export function joinFormValues(vals: string[]): string {
  return joinFormOptions(vals)
}

function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

function stopNodeViewEvent(event: Event) {
  event.stopPropagation()
}

function parseAttr(el: HTMLElement, key: string, fallback = '') {
  return el.getAttribute(key) || fallback
}

function parseBoolAttr(el: HTMLElement, key: string, fallback = false) {
  const raw = el.getAttribute(key)
  if (raw == null) return fallback
  const v = raw.trim().toLowerCase()
  if (v === '' || v === 'true' || v === '1' || v === 'yes') return true
  if (v === 'false' || v === '0' || v === 'no') return false
  return fallback
}

function boolAttrHtml(key: string, value: boolean) {
  return value ? { [key]: 'true' } : { [key]: 'false' }
}

function isRequired(attrs: { required?: boolean }) {
  return Boolean(attrs.required)
}

function isEmptyValue(value: unknown) {
  if (value == null) return true
  if (typeof value === 'boolean') return !value
  return String(value).trim() === ''
}

function applyRequiredMark(labelEl: HTMLElement, label: string, required: boolean) {
  labelEl.replaceChildren()
  labelEl.append(document.createTextNode(label || ''))
  if (required) {
    const star = document.createElement('span')
    star.className = 'rte-form-required'
    star.setAttribute('aria-hidden', 'true')
    star.textContent = '*'
    labelEl.append(star)
  }
}

function setInvalidState(root: HTMLElement, invalid: boolean) {
  if (invalid) {
    root.classList.add('rte-form-invalid')
    root.setAttribute('data-invalid', 'true')
  } else {
    root.classList.remove('rte-form-invalid')
    root.removeAttribute('data-invalid')
  }
}

function validateRequiredEmpty(root: HTMLElement, required: boolean, value: unknown) {
  const invalid = required && isEmptyValue(value)
  setInvalidState(root, invalid)
  return invalid
}

/** 编译用户填写的 pattern；非法正则视为不校验 */
export function compileFormPattern(raw: unknown): RegExp | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  try {
    return new RegExp(`^(?:${s})$`)
  } catch {
    return null
  }
}

/**
 * 文本类字段校验：必填 → pattern（空值且非必填时跳过 pattern）。
 * 返回 true 表示通过。
 */
export function validateTextField(
  root: HTMLElement,
  attrs: { required?: boolean; pattern?: string },
  value: unknown,
): boolean {
  if (isRequired(attrs) && isEmptyValue(value)) {
    setInvalidState(root, true)
    return false
  }
  if (isEmptyValue(value)) {
    setInvalidState(root, false)
    return true
  }
  const re = compileFormPattern(attrs.pattern)
  if (!re) {
    setInvalidState(root, false)
    return true
  }
  const ok = re.test(String(value))
  setInvalidState(root, !ok)
  return ok
}

const requiredAttrSpec = {
  required: {
    default: false,
    parseHTML: (el: HTMLElement) => parseBoolAttr(el, 'data-required', false),
    renderHTML: (attrs: { required?: boolean }) => boolAttrHtml('data-required', Boolean(attrs.required)),
  },
}

/** 字段绑定表达式：导出/代码生成时提示 Vue v-model / React value+onChange */
const bindExprAttrSpec = {
  bindExpr: {
    default: '',
    parseHTML: (el: HTMLElement) => parseAttr(el, 'data-bind-expr'),
    renderHTML: (attrs: { bindExpr?: string }) => ({
      'data-bind-expr': attrs.bindExpr || '',
    }),
  },
}

const readonlyAttrSpec = {
  readonly: {
    default: false,
    parseHTML: (el: HTMLElement) => parseBoolAttr(el, 'data-readonly', false),
    renderHTML: (attrs: { readonly?: boolean }) =>
      boolAttrHtml('data-readonly', Boolean(attrs.readonly)),
  },
}

const disabledAttrSpec = {
  disabled: {
    default: false,
    parseHTML: (el: HTMLElement) => parseBoolAttr(el, 'data-disabled', false),
    renderHTML: (attrs: { disabled?: boolean }) =>
      boolAttrHtml('data-disabled', Boolean(attrs.disabled)),
  },
}

const helpTextAttrSpec = {
  helpText: {
    default: '',
    parseHTML: (el: HTMLElement) => parseAttr(el, 'data-help'),
    renderHTML: (attrs: { helpText?: string }) => ({
      'data-help': attrs.helpText || '',
    }),
  },
}

/** 文本类字数约束（空串表示不限制） */
const lengthAttrSpec = {
  minLength: {
    default: '',
    parseHTML: (el: HTMLElement) => parseAttr(el, 'data-minlength'),
    renderHTML: (attrs: { minLength?: string }) => ({
      'data-minlength': attrs.minLength || '',
    }),
  },
  maxLength: {
    default: '',
    parseHTML: (el: HTMLElement) => parseAttr(el, 'data-maxlength'),
    renderHTML: (attrs: { maxLength?: string }) => ({
      'data-maxlength': attrs.maxLength || '',
    }),
  },
}

/** 正则校验（HTML pattern 语义：整串匹配 ^(?:pattern)$） */
const patternAttrSpec = {
  pattern: {
    default: '',
    parseHTML: (el: HTMLElement) => parseAttr(el, 'data-pattern'),
    renderHTML: (attrs: { pattern?: string }) => ({
      'data-pattern': attrs.pattern || '',
    }),
  },
}


/** —— 条件显示（show-if）：依赖另一字段名 + 运算符 + 比较值 —— */
export type FormShowIfOp = 'eq' | 'neq' | 'empty' | 'nonempty'

export function normalizeShowIfOp(raw: unknown): FormShowIfOp {
  const v = String(raw ?? '').trim().toLowerCase()
  if (v === 'neq' || v === '!=' || v === 'notEquals') return 'neq'
  if (v === 'empty') return 'empty'
  if (v === 'nonempty' || v === 'notempty') return 'nonempty'
  return 'eq'
}

export const SHOW_IF_OP_LABELS: Record<FormShowIfOp, string> = {
  eq: '等于',
  neq: '不等于',
  empty: '为空',
  nonempty: '非空',
}

export type ShowIfAttrsLike = {
  showIfField?: string
  showIfOp?: string
  showIfValue?: string
}

/** 将表单节点 value 规范成可比较的字符串（开关 → true/false） */
export function formValueToCompareString(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (value == null) return ''
  return String(value).trim()
}

/**
 * 评估条件显示。
 * - 未配置 showIfField → 始终显示
 * - eq / neq：与 showIfValue 字符串比较（忽略首尾空白）
 * - empty / nonempty：看依赖字段当前值是否为空
 */
export function evalShowIf(
  attrs: ShowIfAttrsLike,
  valuesByName: Record<string, string>,
): boolean {
  const field = String(attrs.showIfField ?? '').trim()
  if (!field) return true
  const op = normalizeShowIfOp(attrs.showIfOp)
  const actual = valuesByName[field] ?? ''
  if (op === 'empty') return actual === ''
  if (op === 'nonempty') return actual !== ''
  const expect = String(attrs.showIfValue ?? '').trim()
  if (op === 'neq') return actual !== expect
  return actual === expect
}

export function formatShowIfBadgeText(attrs: ShowIfAttrsLike): string {
  const field = String(attrs.showIfField ?? '').trim()
  if (!field) return ''
  const op = normalizeShowIfOp(attrs.showIfOp)
  const opLabel = SHOW_IF_OP_LABELS[op]
  if (op === 'empty' || op === 'nonempty') return `若 ${field} ${opLabel}`
  const val = String(attrs.showIfValue ?? '').trim()
  return `若 ${field} ${opLabel} ${val || '…'}`
}

function ensureShowIfBadge(root: HTMLElement): HTMLElement {
  let badge = root.querySelector(':scope > .rte-form-showif-badge') as HTMLElement | null
  if (!badge) {
    badge = document.createElement('span')
    badge.className = 'rte-form-showif-badge'
    badge.setAttribute('aria-hidden', 'true')
    // 放在根节点最前，编辑态一眼可见
    root.insertBefore(badge, root.firstChild)
  }
  return badge
}

/** 同步 data-* / 角标；隐藏逻辑由 FormShowIf 插件按预览态处理 */
export function syncShowIfUi(root: HTMLElement, attrs: ShowIfAttrsLike) {
  const field = String(attrs.showIfField ?? '').trim()
  const op = normalizeShowIfOp(attrs.showIfOp)
  const value = String(attrs.showIfValue ?? '')
  root.setAttribute('data-show-if-field', field)
  root.setAttribute('data-show-if-op', field ? op : '')
  root.setAttribute('data-show-if-value', field ? value : '')
  root.classList.toggle('has-show-if', Boolean(field))
  const badge = ensureShowIfBadge(root)
  if (field) {
    badge.hidden = false
    badge.textContent = formatShowIfBadgeText(attrs)
    badge.title = `条件显示：${badge.textContent}`
  } else {
    badge.hidden = true
    badge.textContent = ''
    badge.removeAttribute('title')
  }
}

const showIfAttrSpec = {
  showIfField: {
    default: '',
    parseHTML: (el: HTMLElement) => parseAttr(el, 'data-show-if-field'),
    renderHTML: (attrs: ShowIfAttrsLike) => ({
      'data-show-if-field': attrs.showIfField || '',
    }),
  },
  showIfOp: {
    default: 'eq',
    parseHTML: (el: HTMLElement) => normalizeShowIfOp(parseAttr(el, 'data-show-if-op', 'eq')),
    renderHTML: (attrs: ShowIfAttrsLike) => ({
      'data-show-if-op': normalizeShowIfOp(attrs.showIfOp),
    }),
  },
  showIfValue: {
    default: '',
    parseHTML: (el: HTMLElement) => parseAttr(el, 'data-show-if-value'),
    renderHTML: (attrs: ShowIfAttrsLike) => ({
      'data-show-if-value': attrs.showIfValue || '',
    }),
  },
}

/** 企业表单通用：只读 / 禁用 / 帮助文案 */
const enterpriseFieldAttrSpec = {
  ...readonlyAttrSpec,
  ...disabledAttrSpec,
  ...helpTextAttrSpec,
  ...showIfAttrSpec,
}

function isReadonly(attrs: { readonly?: boolean }) {
  return Boolean(attrs.readonly)
}

function isDisabled(attrs: { disabled?: boolean }) {
  return Boolean(attrs.disabled)
}

function applyHelpText(helpEl: HTMLElement, helpText: unknown) {
  const t = String(helpText ?? '').trim()
  if (!t) {
    helpEl.hidden = true
    helpEl.textContent = ''
    return
  }
  helpEl.hidden = false
  helpEl.textContent = t
}

function syncRootEnterpriseFlags(
  root: HTMLElement,
  attrs: {
    readonly?: boolean
    disabled?: boolean
    helpText?: string
    showIfField?: string
    showIfOp?: string
    showIfValue?: string
  },
) {
  root.setAttribute('data-readonly', attrs.readonly ? 'true' : 'false')
  root.setAttribute('data-disabled', attrs.disabled ? 'true' : 'false')
  root.setAttribute('data-help', String(attrs.helpText ?? ''))
  root.classList.toggle('is-readonly', Boolean(attrs.readonly))
  root.classList.toggle('is-disabled', Boolean(attrs.disabled))
  syncShowIfUi(root, attrs)
}

function parseLengthAttr(raw: unknown): string {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  const n = Number(s)
  if (!Number.isFinite(n) || n < 0) return ''
  return String(Math.floor(n))
}

function applyTextControlState(
  el: HTMLInputElement | HTMLTextAreaElement,
  attrs: {
    readonly?: boolean
    disabled?: boolean
    minLength?: string
    maxLength?: string
    pattern?: string
  },
  opts?: { supportLength?: boolean; supportPattern?: boolean },
) {
  const disabled = isDisabled(attrs)
  const readonly = isReadonly(attrs)
  el.disabled = disabled
  // disabled 时无需再设 readOnly；只读仍可聚焦展示
  el.readOnly = readonly && !disabled
  if (opts?.supportLength) {
    const minL = parseLengthAttr(attrs.minLength)
    const maxL = parseLengthAttr(attrs.maxLength)
    if (minL !== '') el.minLength = Number(minL)
    else el.removeAttribute('minLength')
    if (maxL !== '') el.maxLength = Number(maxL)
    else el.removeAttribute('maxLength')
  }
  if (opts?.supportPattern) {
    const p = String(attrs.pattern ?? '').trim()
    if (p) el.setAttribute('pattern', p)
    else el.removeAttribute('pattern')
  }
}

function applySelectControlState(
  el: HTMLSelectElement,
  attrs: { readonly?: boolean; disabled?: boolean },
) {
  // native <select> 无 readOnly；只读按禁用交互处理，展示仍保留当前值
  el.disabled = isDisabled(attrs) || isReadonly(attrs)
}

function applyChoiceControlState(
  el: HTMLInputElement,
  attrs: { readonly?: boolean; disabled?: boolean },
) {
  // radio/checkbox 无 readOnly；只读与禁用均禁止改选，样式靠根上 is-* 区分
  el.disabled = isDisabled(attrs) || isReadonly(attrs)
}


/** 日期格式预设（国内习惯） */
export const DATE_FORMAT_PRESETS = [
  'YYYY-MM-DD',
  'YYYY/MM/DD',
  'YYYY年M月D日',
  'YYYY-MM-DD HH:mm',
  'YYYY-MM-DD HH:mm:ss',
  'YYYY/MM/DD HH:mm',
] as const

export type DateFormatPreset = (typeof DATE_FORMAT_PRESETS)[number]

export function defaultDateFormat(kind: string): string {
  return kind === 'datetime' ? 'YYYY-MM-DD HH:mm' : 'YYYY-MM-DD'
}

export type FormChoiceLayout = 'row' | 'column' | 'grid'

export function normalizeChoiceLayout(raw: unknown): FormChoiceLayout {
  const v = String(raw ?? '').trim().toLowerCase()
  if (v === 'row' || v === 'grid') return v
  return 'column'
}

export function normalizeLayoutColumns(raw: unknown): number {
  const n = Number(raw)
  if (Number.isFinite(n) && n >= 1 && n <= 12) return Math.floor(n)
  return 2
}

function applyChoiceLayoutStyles(
  list: HTMLElement,
  root: HTMLElement,
  layoutRaw: unknown,
  columnsRaw: unknown,
) {
  const layout = normalizeChoiceLayout(layoutRaw)
  const cols = normalizeLayoutColumns(columnsRaw)
  root.setAttribute('data-layout', layout)
  root.setAttribute('data-layout-columns', String(cols))
  list.style.removeProperty('display')
  list.style.removeProperty('flex-direction')
  list.style.removeProperty('flex-wrap')
  list.style.removeProperty('grid-template-columns')
  list.style.removeProperty('--rte-form-cols')
  if (layout === 'row') {
    list.style.display = 'flex'
    list.style.flexDirection = 'row'
    list.style.flexWrap = 'wrap'
  } else if (layout === 'grid') {
    list.style.display = 'grid'
    list.style.setProperty('--rte-form-cols', String(cols))
    list.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`
  } else {
    list.style.display = 'flex'
    list.style.flexDirection = 'column'
  }
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    formTextInput: {
      insertFormTextInput: (attrs?: Partial<FormTextAttrs>) => ReturnType
    }
    formRadioGroup: {
      insertFormRadioGroup: (attrs?: Partial<FormChoiceAttrs>) => ReturnType
    }
    formCheckboxGroup: {
      insertFormCheckboxGroup: (attrs?: Partial<FormChoiceAttrs>) => ReturnType
    }
    formSelect: {
      insertFormSelect: (attrs?: Partial<FormSelectAttrs>) => ReturnType
    }
    formTextarea: {
      insertFormTextarea: (attrs?: Partial<FormTextareaAttrs>) => ReturnType
    }
    formNumberInput: {
      insertFormNumberInput: (attrs?: Partial<FormNumberAttrs>) => ReturnType
    }
    formDateInput: {
      insertFormDateInput: (attrs?: Partial<FormDateAttrs>) => ReturnType
    }
    formSwitch: {
      insertFormSwitch: (attrs?: Partial<FormSwitchAttrs>) => ReturnType
    }
  }
}

export interface FormTextAttrs {
  name: string
  /** 绑定表达式，如 form.xxx / values.xxx；导出时映射 Vue v-model / React value+onChange */
  bindExpr: string
  label: string
  placeholder: string
  value: string
  required: boolean
  readonly: boolean
  disabled: boolean
  helpText: string
  minLength: string
  maxLength: string
  /** 正则字符串（HTML pattern 语义） */
  pattern: string

  /** 条件显示：依赖的字段名（空=不启用） */
  showIfField: string
  /** eq | neq | empty | nonempty */
  showIfOp: string
  /** 比较值（empty/nonempty 时忽略） */
  showIfValue: string
}

export interface FormChoiceAttrs {
  name: string
  bindExpr: string
  label: string
  options: string
  value: string
  required: boolean
  readonly: boolean
  disabled: boolean
  helpText: string
  /** 选项布局：row 只有一行 / column 只有一列 / grid 一行多列 */
  layout: 'row' | 'column' | 'grid'
  /** grid 列数，默认 2 */
  layoutColumns: number

  /** 条件显示：依赖的字段名（空=不启用） */
  showIfField: string
  /** eq | neq | empty | nonempty */
  showIfOp: string
  /** 比较值（empty/nonempty 时忽略） */
  showIfValue: string
}

export interface FormSelectAttrs {
  name: string
  bindExpr: string
  label: string
  options: string
  placeholder: string
  value: string
  required: boolean
  readonly: boolean
  disabled: boolean
  helpText: string

  /** 条件显示：依赖的字段名（空=不启用） */
  showIfField: string
  /** eq | neq | empty | nonempty */
  showIfOp: string
  /** 比较值（empty/nonempty 时忽略） */
  showIfValue: string
}

export interface FormTextareaAttrs {
  name: string
  bindExpr: string
  label: string
  placeholder: string
  value: string
  rows: number
  required: boolean
  readonly: boolean
  disabled: boolean
  helpText: string
  minLength: string
  maxLength: string
  /** 正则字符串（HTML pattern 语义） */
  pattern: string

  /** 条件显示：依赖的字段名（空=不启用） */
  showIfField: string
  /** eq | neq | empty | nonempty */
  showIfOp: string
  /** 比较值（empty/nonempty 时忽略） */
  showIfValue: string
}

export interface FormNumberAttrs {
  name: string
  bindExpr: string
  label: string
  placeholder: string
  value: string
  min: string
  max: string
  step: string
  required: boolean
  readonly: boolean
  disabled: boolean
  helpText: string

  /** 条件显示：依赖的字段名（空=不启用） */
  showIfField: string
  /** eq | neq | empty | nonempty */
  showIfOp: string
  /** 比较值（empty/nonempty 时忽略） */
  showIfValue: string
}

export interface FormDateAttrs {
  name: string
  bindExpr: string
  label: string
  /** date | datetime */
  kind: string
  /** 展示/导出格式，如 YYYY-MM-DD、YYYY-MM-DD HH:mm */
  dateFormat: string
  value: string
  required: boolean
  readonly: boolean
  disabled: boolean
  helpText: string

  /** 条件显示：依赖的字段名（空=不启用） */
  showIfField: string
  /** eq | neq | empty | nonempty */
  showIfOp: string
  /** 比较值（empty/nonempty 时忽略） */
  showIfValue: string
}

export interface FormSwitchAttrs {
  name: string
  bindExpr: string
  label: string
  value: boolean
  required: boolean
  readonly: boolean
  disabled: boolean
  helpText: string

  /** 条件显示：依赖的字段名（空=不启用） */
  showIfField: string
  /** eq | neq | empty | nonempty */
  showIfOp: string
  /** 比较值（empty/nonempty 时忽略） */
  showIfValue: string
}

type PosGetter = (() => number | undefined) | boolean

function readPos(getPos: PosGetter): number | null {
  const pos = typeof getPos === 'function' ? getPos() : null
  return typeof pos === 'number' ? pos : null
}

/** —— 文本输入 —— */
export const FormTextInput = Node.create({
  name: 'formTextInput',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      name: {
        default: '',
        parseHTML: (el: HTMLElement) => parseAttr(el, 'data-name') || uid('text'),
        renderHTML: (attrs: FormTextAttrs) => ({ 'data-name': attrs.name || '' }),
      },
      ...bindExprAttrSpec,
      label: {
        default: '文本输入',
        parseHTML: (el: HTMLElement) => parseAttr(el, 'data-label', '文本输入'),
        renderHTML: (attrs: FormTextAttrs) => ({ 'data-label': attrs.label || '文本输入' }),
      },
      placeholder: {
        default: '请输入…',
        parseHTML: (el: HTMLElement) => parseAttr(el, 'data-placeholder', '请输入…'),
        renderHTML: (attrs: FormTextAttrs) => ({
          'data-placeholder': attrs.placeholder || '请输入…',
        }),
      },
      value: {
        default: '',
        parseHTML: (el: HTMLElement) => {
          const input = el.querySelector('input')
          return input?.getAttribute('value') || parseAttr(el, 'data-value')
        },
        renderHTML: (attrs: FormTextAttrs) => ({ 'data-value': attrs.value || '' }),
      },
      ...requiredAttrSpec,
      ...enterpriseFieldAttrSpec,
      ...lengthAttrSpec,
      ...patternAttrSpec,
    }
  },

  parseHTML() {
    return [
      { tag: 'div[data-type="form-text-input"]' },
      { tag: 'div.rte-form-text' },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'form-text-input',
        class: 'rte-form rte-form-text',
      }),
    ]
  },

  addCommands() {
    return {
      insertFormTextInput:
        (attrs = {}) =>
        ({ chain }) =>
          chain()
            .focus()
            .insertContent({
              type: this.name,
              attrs: {
                name: attrs.name || uid('text'),
                bindExpr: attrs.bindExpr ?? '',
                label: attrs.label ?? '文本输入',
                placeholder: attrs.placeholder ?? '请输入…',
                value: attrs.value ?? '',
                required: attrs.required ?? true,
                readonly: attrs.readonly ?? false,
                disabled: attrs.disabled ?? false,
                helpText: attrs.helpText ?? '',
                minLength: attrs.minLength ?? '',
                maxLength: attrs.maxLength ?? '',
                pattern: attrs.pattern ?? '',
              },
            })
            .run(),
    }
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const root = document.createElement('div')
      root.className = 'rte-form rte-form-text'
      root.setAttribute('data-type', 'form-text-input')
      root.contentEditable = 'false'

      const labelEl = document.createElement('div')
      labelEl.className = 'rte-form-label'

      const helpEl = document.createElement('div')
      helpEl.className = 'rte-form-help'

      const input = document.createElement('input')
      input.type = 'text'
      input.className = 'rte-form-input'

      const paint = () => {
        root.setAttribute('data-name', node.attrs.name || '')
        root.setAttribute('data-bind-expr', node.attrs.bindExpr || '')
        root.setAttribute('data-value', node.attrs.value || '')
        root.setAttribute('data-required', node.attrs.required ? 'true' : 'false')
        root.setAttribute('data-minlength', node.attrs.minLength || '')
        root.setAttribute('data-maxlength', node.attrs.maxLength || '')
        root.setAttribute('data-pattern', node.attrs.pattern || '')
        syncRootEnterpriseFlags(root, node.attrs)
        applyRequiredMark(labelEl, node.attrs.label || '文本输入', isRequired(node.attrs))
        applyHelpText(helpEl, node.attrs.helpText)
        input.placeholder = node.attrs.placeholder || '请输入…'
        input.name = node.attrs.name || ''
        input.required = isRequired(node.attrs)
        applyTextControlState(input, node.attrs, { supportLength: true, supportPattern: true })
        if (document.activeElement !== input) {
          input.value = node.attrs.value || ''
          validateTextField(root, node.attrs, node.attrs.value)
        }
      }

      const commit = (opts?: { validate?: boolean }) => {
        const pos = readPos(getPos)
        if (pos == null) return
        const nextValue = input.value
        editor
          .chain()
          .command(({ tr }) => {
            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              value: nextValue,
            })
            return true
          })
          .run()
        if (opts?.validate !== false) {
          validateTextField(root, node.attrs, nextValue)
        }
      }

      input.addEventListener('mousedown', stopNodeViewEvent)
      input.addEventListener('click', stopNodeViewEvent)
      input.addEventListener('keydown', stopNodeViewEvent)
      input.addEventListener('input', () => {
        root.setAttribute('data-value', input.value)
        if (!isEmptyValue(input.value)) {
          if (isRequired(node.attrs)) setInvalidState(root, false)
        }
      })
      input.addEventListener('change', () => commit())
      input.addEventListener('blur', () => commit({ validate: true }))

      paint()
      root.append(labelEl, helpEl, input)

      return {
        dom: root,
        update: (updated) => {
          if (updated.type.name !== 'formTextInput') return false
          node = updated
          paint()
          return true
        },
        ignoreMutation: () => true,
        selectNode: () => root.classList.add('ProseMirror-selectednode'),
        deselectNode: () => root.classList.remove('ProseMirror-selectednode'),
      }
    }
  },
})

function buildChoiceNodeView(
  kind: 'radio' | 'checkbox',
  typeName: string,
  dataType: string,
  className: string,
) {
  return ({ node, editor, getPos }: {
    node: { attrs: FormChoiceAttrs; type: { name: string } }
    editor: {
      chain: () => {
        command: (fn: (args: { tr: { setNodeMarkup: (pos: number, type: undefined, attrs: FormChoiceAttrs) => unknown } }) => boolean) => {
          run: () => boolean
        }
      }
    }
    getPos: PosGetter
  }) => {
    const root = document.createElement('div')
    root.className = `rte-form ${className}`
    root.setAttribute('data-type', dataType)
    root.setAttribute('data-name', node.attrs.name || '')
    root.setAttribute('data-bind-expr', node.attrs.bindExpr || '')
    root.setAttribute('data-required', node.attrs.required ? 'true' : 'false')
    root.contentEditable = 'false'

    const labelEl = document.createElement('div')
    labelEl.className = 'rte-form-label'

    const helpEl = document.createElement('div')
    helpEl.className = 'rte-form-help'

    const list = document.createElement('div')
    list.className = 'rte-form-options'

    const syncAttrs = (nextValue: string, validate = true) => {
      const pos = readPos(getPos)
      if (pos == null) return
      editor
        .chain()
        .command(({ tr }) => {
          tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            value: nextValue,
          })
          return true
        })
        .run()
      if (validate) {
        validateRequiredEmpty(root, isRequired(node.attrs), nextValue)
      }
    }

    const renderOptions = () => {
      list.replaceChildren()
      const opts = splitFormOptions(node.attrs.options)
      const selected = new Set(splitFormValues(node.attrs.value))
      const groupName = node.attrs.name || uid(kind)

      opts.forEach((opt, idx) => {
        const row = document.createElement('label')
        row.className = 'rte-form-option'

        const control = document.createElement('input')
        control.type = kind
        control.name = kind === 'radio' ? groupName : `${groupName}_${idx}`
        control.value = opt
        control.checked = selected.has(opt)
        if (kind === 'radio') control.required = isRequired(node.attrs)
        applyChoiceControlState(control, node.attrs)

        control.addEventListener('mousedown', stopNodeViewEvent)
        control.addEventListener('click', stopNodeViewEvent)
        control.addEventListener('change', () => {
          if (kind === 'radio') {
            root.setAttribute('data-value', opt)
            syncAttrs(opt)
            return
          }
          const next = new Set(splitFormValues(node.attrs.value))
          if (control.checked) next.add(opt)
          else next.delete(opt)
          const joined = joinFormValues([...next])
          root.setAttribute('data-value', joined)
          syncAttrs(joined)
        })
        control.addEventListener('blur', () => {
          validateRequiredEmpty(root, isRequired(node.attrs), node.attrs.value)
        })

        const text = document.createElement('span')
        text.textContent = opt

        row.append(control, text)
        list.append(row)
      })

      if (!opts.length) {
        const empty = document.createElement('div')
        empty.className = 'rte-form-empty'
        empty.textContent = '暂无选项'
        list.append(empty)
      }
    }

    const paint = () => {
      applyRequiredMark(
        labelEl,
        node.attrs.label || (kind === 'radio' ? '单选题' : '多选题'),
        isRequired(node.attrs),
      )
      root.setAttribute('data-name', node.attrs.name || '')
      root.setAttribute('data-bind-expr', node.attrs.bindExpr || '')
      root.setAttribute('data-options', node.attrs.options || '')
      root.setAttribute('data-value', node.attrs.value || '')
      root.setAttribute('data-label', node.attrs.label || '')
      root.setAttribute('data-required', node.attrs.required ? 'true' : 'false')
      syncRootEnterpriseFlags(root, node.attrs)
      applyHelpText(helpEl, node.attrs.helpText)
      applyChoiceLayoutStyles(list, root, node.attrs.layout, node.attrs.layoutColumns)
      renderOptions()
    }

    paint()
    root.append(labelEl, helpEl, list)

    return {
      dom: root,
      update: (updated: { type: { name: string }; attrs: FormChoiceAttrs }) => {
        if (updated.type.name !== typeName) return false
        node = updated as typeof node
        paint()
        return true
      },
      ignoreMutation: () => true,
      selectNode: () => root.classList.add('ProseMirror-selectednode'),
      deselectNode: () => root.classList.remove('ProseMirror-selectednode'),
    }
  }
}

const choiceAttrs = {
  name: {
    default: '',
    parseHTML: (el: HTMLElement) => parseAttr(el, 'data-name') || uid('choice'),
    renderHTML: (attrs: FormChoiceAttrs) => ({ 'data-name': attrs.name || '' }),
  },
  label: {
    default: '',
    parseHTML: (el: HTMLElement) => parseAttr(el, 'data-label'),
    renderHTML: (attrs: FormChoiceAttrs) => ({ 'data-label': attrs.label || '' }),
  },
  options: {
    default: '选项一|选项二|选项三',
    parseHTML: (el: HTMLElement) => {
      const raw = parseAttr(el, 'data-options')
      if (raw) return joinFormOptions(splitFormOptions(raw))
      const fromDom = Array.from(el.querySelectorAll('input[type="radio"], input[type="checkbox"]'))
        .map((n) => (n as HTMLInputElement).value || (n.parentElement?.textContent || '').trim())
        .filter(Boolean)
      return fromDom.length ? joinFormOptions(fromDom) : '选项一|选项二|选项三'
    },
    renderHTML: (attrs: FormChoiceAttrs) => ({
      'data-options': attrs.options || '选项一|选项二|选项三',
    }),
  },
  value: {
    default: '',
    parseHTML: (el: HTMLElement) => {
      const raw = parseAttr(el, 'data-value')
      if (raw) return joinFormValues(splitFormValues(raw))
      const checked = Array.from(
        el.querySelectorAll('input[type="radio"]:checked, input[type="checkbox"]:checked'),
      ).map((n) => (n as HTMLInputElement).value)
      return joinFormValues(checked)
    },
    renderHTML: (attrs: FormChoiceAttrs) => ({ 'data-value': attrs.value || '' }),
  },
  layout: {
    default: 'column',
    parseHTML: (el: HTMLElement) => normalizeChoiceLayout(parseAttr(el, 'data-layout')),
    renderHTML: (attrs: FormChoiceAttrs) => ({
      'data-layout': normalizeChoiceLayout(attrs.layout),
    }),
  },
  layoutColumns: {
    default: 2,
    parseHTML: (el: HTMLElement) =>
      normalizeLayoutColumns(parseAttr(el, 'data-layout-columns')),
    renderHTML: (attrs: FormChoiceAttrs) => ({
      'data-layout-columns': String(normalizeLayoutColumns(attrs.layoutColumns)),
    }),
  },
  ...bindExprAttrSpec,
  ...requiredAttrSpec,
  ...enterpriseFieldAttrSpec,
}

/** —— 单选组 —— */
export const FormRadioGroup = Node.create({
  name: 'formRadioGroup',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      ...choiceAttrs,
      label: {
        ...choiceAttrs.label,
        default: '单选题',
        parseHTML: (el: HTMLElement) => parseAttr(el, 'data-label', '单选题'),
        renderHTML: (attrs: FormChoiceAttrs) => ({
          'data-label': attrs.label || '单选题',
        }),
      },
    }
  },

  parseHTML() {
    return [
      { tag: 'div[data-type="form-radio-group"]' },
      { tag: 'div.rte-form-radio' },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'form-radio-group',
        class: 'rte-form rte-form-radio',
      }),
    ]
  },

  addCommands() {
    return {
      insertFormRadioGroup:
        (attrs = {}) =>
        ({ chain }) =>
          chain()
            .focus()
            .insertContent({
              type: this.name,
              attrs: {
                name: attrs.name || uid('radio'),
                bindExpr: attrs.bindExpr ?? '',
                label: attrs.label ?? '单选题',
                options: attrs.options ?? '选项一|选项二|选项三',
                value: attrs.value ?? '',
                required: attrs.required ?? true,
                readonly: attrs.readonly ?? false,
                disabled: attrs.disabled ?? false,
                helpText: attrs.helpText ?? '',
                layout: normalizeChoiceLayout(attrs.layout ?? 'column'),
                layoutColumns: normalizeLayoutColumns(attrs.layoutColumns ?? 2),
              },
            })
            .run(),
    }
  },

  addNodeView() {
    return buildChoiceNodeView(
      'radio',
      'formRadioGroup',
      'form-radio-group',
      'rte-form-radio',
    ) as never
  },
})

/** —— 多选组 —— */
export const FormCheckboxGroup = Node.create({
  name: 'formCheckboxGroup',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      ...choiceAttrs,
      label: {
        ...choiceAttrs.label,
        default: '多选题',
        parseHTML: (el: HTMLElement) => parseAttr(el, 'data-label', '多选题'),
        renderHTML: (attrs: FormChoiceAttrs) => ({
          'data-label': attrs.label || '多选题',
        }),
      },
    }
  },

  parseHTML() {
    return [
      { tag: 'div[data-type="form-checkbox-group"]' },
      { tag: 'div.rte-form-checkbox' },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'form-checkbox-group',
        class: 'rte-form rte-form-checkbox',
      }),
    ]
  },

  addCommands() {
    return {
      insertFormCheckboxGroup:
        (attrs = {}) =>
        ({ chain }) =>
          chain()
            .focus()
            .insertContent({
              type: this.name,
              attrs: {
                name: attrs.name || uid('check'),
                bindExpr: attrs.bindExpr ?? '',
                label: attrs.label ?? '多选题',
                options: attrs.options ?? '选项一|选项二|选项三',
                value: attrs.value ?? '',
                required: attrs.required ?? true,
                readonly: attrs.readonly ?? false,
                disabled: attrs.disabled ?? false,
                helpText: attrs.helpText ?? '',
                layout: normalizeChoiceLayout(attrs.layout ?? 'column'),
                layoutColumns: normalizeLayoutColumns(attrs.layoutColumns ?? 2),
              },
            })
            .run(),
    }
  },

  addNodeView() {
    return buildChoiceNodeView(
      'checkbox',
      'formCheckboxGroup',
      'form-checkbox-group',
      'rte-form-checkbox',
    ) as never
  },
})

/** —— 下拉选择 —— */
export const FormSelect = Node.create({
  name: 'formSelect',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      name: {
        default: '',
        parseHTML: (el: HTMLElement) => parseAttr(el, 'data-name') || uid('select'),
        renderHTML: (attrs: FormSelectAttrs) => ({ 'data-name': attrs.name || '' }),
      },
      ...bindExprAttrSpec,
      label: {
        default: '下拉选择',
        parseHTML: (el: HTMLElement) => parseAttr(el, 'data-label', '下拉选择'),
        renderHTML: (attrs: FormSelectAttrs) => ({ 'data-label': attrs.label || '下拉选择' }),
      },
      options: {
        default: '选项一|选项二|选项三',
        parseHTML: (el: HTMLElement) => {
          const raw = parseAttr(el, 'data-options')
          if (raw) return joinFormOptions(splitFormOptions(raw))
          const fromDom = Array.from(el.querySelectorAll('option'))
            .map((n) => (n as HTMLOptionElement).value || n.textContent || '')
            .map((x) => x.trim())
            .filter((x) => x && x !== '请选择')
          return fromDom.length ? joinFormOptions(fromDom) : '选项一|选项二|选项三'
        },
        renderHTML: (attrs: FormSelectAttrs) => ({
          'data-options': attrs.options || '选项一|选项二|选项三',
        }),
      },
      placeholder: {
        default: '请选择',
        parseHTML: (el: HTMLElement) => parseAttr(el, 'data-placeholder', '请选择'),
        renderHTML: (attrs: FormSelectAttrs) => ({
          'data-placeholder': attrs.placeholder || '请选择',
        }),
      },
      value: {
        default: '',
        parseHTML: (el: HTMLElement) => {
          const sel = el.querySelector('select') as HTMLSelectElement | null
          return sel?.value || parseAttr(el, 'data-value')
        },
        renderHTML: (attrs: FormSelectAttrs) => ({ 'data-value': attrs.value || '' }),
      },
      ...requiredAttrSpec,
      ...enterpriseFieldAttrSpec,
    }
  },

  parseHTML() {
    return [
      { tag: 'div[data-type="form-select"]' },
      { tag: 'div.rte-form-select' },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'form-select',
        class: 'rte-form rte-form-select',
      }),
    ]
  },

  addCommands() {
    return {
      insertFormSelect:
        (attrs = {}) =>
        ({ chain }) =>
          chain()
            .focus()
            .insertContent({
              type: this.name,
              attrs: {
                name: attrs.name || uid('select'),
                bindExpr: attrs.bindExpr ?? '',
                label: attrs.label ?? '下拉选择',
                options: attrs.options ?? '选项一|选项二|选项三',
                placeholder: attrs.placeholder ?? '请选择',
                value: attrs.value ?? '',
                required: attrs.required ?? true,
                readonly: attrs.readonly ?? false,
                disabled: attrs.disabled ?? false,
                helpText: attrs.helpText ?? '',
              },
            })
            .run(),
    }
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const root = document.createElement('div')
      root.className = 'rte-form rte-form-select'
      root.setAttribute('data-type', 'form-select')
      root.contentEditable = 'false'

      const labelEl = document.createElement('div')
      labelEl.className = 'rte-form-label'

      const helpEl = document.createElement('div')
      helpEl.className = 'rte-form-help'

      const select = document.createElement('select')
      select.className = 'rte-form-input rte-form-select-control'

      const commit = (validate = true) => {
        const pos = readPos(getPos)
        if (pos == null) return
        const nextValue = select.value
        editor
          .chain()
          .command(({ tr }) => {
            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              value: nextValue,
            })
            return true
          })
          .run()
        if (validate) validateRequiredEmpty(root, isRequired(node.attrs), nextValue)
      }

      const paintOptions = () => {
        select.replaceChildren()
        const ph = document.createElement('option')
        ph.value = ''
        ph.textContent = node.attrs.placeholder || '请选择'
        ph.disabled = true
        ph.hidden = true
        select.append(ph)
        splitFormOptions(node.attrs.options).forEach((opt) => {
          const o = document.createElement('option')
          o.value = opt
          o.textContent = opt
          select.append(o)
        })
        select.value = node.attrs.value || ''
        if (!select.value) select.selectedIndex = 0
      }

      const paint = () => {
        root.setAttribute('data-name', node.attrs.name || '')
        root.setAttribute('data-bind-expr', node.attrs.bindExpr || '')
        root.setAttribute('data-options', node.attrs.options || '')
        root.setAttribute('data-value', node.attrs.value || '')
        root.setAttribute('data-placeholder', node.attrs.placeholder || '')
        root.setAttribute('data-required', node.attrs.required ? 'true' : 'false')
        syncRootEnterpriseFlags(root, node.attrs)
        applyRequiredMark(labelEl, node.attrs.label || '下拉选择', isRequired(node.attrs))
        applyHelpText(helpEl, node.attrs.helpText)
        select.name = node.attrs.name || ''
        select.required = isRequired(node.attrs)
        applySelectControlState(select, node.attrs)
        paintOptions()
      }

      select.addEventListener('mousedown', stopNodeViewEvent)
      select.addEventListener('click', stopNodeViewEvent)
      select.addEventListener('change', () => {
        root.setAttribute('data-value', select.value)
        commit(true)
      })
      select.addEventListener('blur', () => {
        validateRequiredEmpty(root, isRequired(node.attrs), select.value)
      })

      paint()
      root.append(labelEl, helpEl, select)

      return {
        dom: root,
        update: (updated) => {
          if (updated.type.name !== 'formSelect') return false
          node = updated
          paint()
          return true
        },
        ignoreMutation: () => true,
        selectNode: () => root.classList.add('ProseMirror-selectednode'),
        deselectNode: () => root.classList.remove('ProseMirror-selectednode'),
      }
    }
  },
})

/** —— 多行文本 —— */
export const FormTextarea = Node.create({
  name: 'formTextarea',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      name: {
        default: '',
        parseHTML: (el: HTMLElement) => parseAttr(el, 'data-name') || uid('textarea'),
        renderHTML: (attrs: FormTextareaAttrs) => ({ 'data-name': attrs.name || '' }),
      },
      ...bindExprAttrSpec,
      label: {
        default: '多行文本',
        parseHTML: (el: HTMLElement) => parseAttr(el, 'data-label', '多行文本'),
        renderHTML: (attrs: FormTextareaAttrs) => ({ 'data-label': attrs.label || '多行文本' }),
      },
      placeholder: {
        default: '请输入…',
        parseHTML: (el: HTMLElement) => parseAttr(el, 'data-placeholder', '请输入…'),
        renderHTML: (attrs: FormTextareaAttrs) => ({
          'data-placeholder': attrs.placeholder || '请输入…',
        }),
      },
      value: {
        default: '',
        parseHTML: (el: HTMLElement) => {
          const ta = el.querySelector('textarea')
          return ta?.textContent || parseAttr(el, 'data-value')
        },
        renderHTML: (attrs: FormTextareaAttrs) => ({ 'data-value': attrs.value || '' }),
      },
      rows: {
        default: 4,
        parseHTML: (el: HTMLElement) => {
          const n = Number(parseAttr(el, 'data-rows', '4'))
          return Number.isFinite(n) && n > 0 ? Math.min(20, Math.floor(n)) : 4
        },
        renderHTML: (attrs: FormTextareaAttrs) => ({ 'data-rows': String(attrs.rows || 4) }),
      },
      ...requiredAttrSpec,
      ...enterpriseFieldAttrSpec,
      ...lengthAttrSpec,
      ...patternAttrSpec,
    }
  },

  parseHTML() {
    return [
      { tag: 'div[data-type="form-textarea"]' },
      { tag: 'div.rte-form-textarea' },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'form-textarea',
        class: 'rte-form rte-form-textarea',
      }),
    ]
  },

  addCommands() {
    return {
      insertFormTextarea:
        (attrs = {}) =>
        ({ chain }) =>
          chain()
            .focus()
            .insertContent({
              type: this.name,
              attrs: {
                name: attrs.name || uid('textarea'),
                bindExpr: attrs.bindExpr ?? '',
                label: attrs.label ?? '多行文本',
                placeholder: attrs.placeholder ?? '请输入…',
                value: attrs.value ?? '',
                rows: attrs.rows ?? 4,
                required: attrs.required ?? true,
                readonly: attrs.readonly ?? false,
                disabled: attrs.disabled ?? false,
                helpText: attrs.helpText ?? '',
                minLength: attrs.minLength ?? '',
                maxLength: attrs.maxLength ?? '',
                pattern: attrs.pattern ?? '',
              },
            })
            .run(),
    }
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const root = document.createElement('div')
      root.className = 'rte-form rte-form-textarea'
      root.setAttribute('data-type', 'form-textarea')
      root.contentEditable = 'false'

      const labelEl = document.createElement('div')
      labelEl.className = 'rte-form-label'

      const helpEl = document.createElement('div')
      helpEl.className = 'rte-form-help'

      const ta = document.createElement('textarea')
      ta.className = 'rte-form-input rte-form-textarea-control'

      const commit = (validate = true) => {
        const pos = readPos(getPos)
        if (pos == null) return
        const nextValue = ta.value
        editor
          .chain()
          .command(({ tr }) => {
            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              value: nextValue,
            })
            return true
          })
          .run()
        if (validate) validateTextField(root, node.attrs, nextValue)
      }

      const paint = () => {
        root.setAttribute('data-name', node.attrs.name || '')
        root.setAttribute('data-bind-expr', node.attrs.bindExpr || '')
        root.setAttribute('data-value', node.attrs.value || '')
        root.setAttribute('data-rows', String(node.attrs.rows || 4))
        root.setAttribute('data-required', node.attrs.required ? 'true' : 'false')
        root.setAttribute('data-minlength', node.attrs.minLength || '')
        root.setAttribute('data-maxlength', node.attrs.maxLength || '')
        root.setAttribute('data-pattern', node.attrs.pattern || '')
        syncRootEnterpriseFlags(root, node.attrs)
        applyRequiredMark(labelEl, node.attrs.label || '多行文本', isRequired(node.attrs))
        applyHelpText(helpEl, node.attrs.helpText)
        ta.placeholder = node.attrs.placeholder || '请输入…'
        ta.name = node.attrs.name || ''
        ta.rows = Number(node.attrs.rows) || 4
        ta.required = isRequired(node.attrs)
        applyTextControlState(ta, node.attrs, { supportLength: true, supportPattern: true })
        if (document.activeElement !== ta) {
          ta.value = node.attrs.value || ''
          validateTextField(root, node.attrs, node.attrs.value)
        }
      }

      ta.addEventListener('mousedown', stopNodeViewEvent)
      ta.addEventListener('click', stopNodeViewEvent)
      ta.addEventListener('keydown', stopNodeViewEvent)
      ta.addEventListener('input', () => {
        root.setAttribute('data-value', ta.value)
        if (isRequired(node.attrs) && !isEmptyValue(ta.value)) setInvalidState(root, false)
      })
      ta.addEventListener('change', () => commit(true))
      ta.addEventListener('blur', () => commit(true))

      paint()
      root.append(labelEl, helpEl, ta)

      return {
        dom: root,
        update: (updated) => {
          if (updated.type.name !== 'formTextarea') return false
          node = updated
          paint()
          return true
        },
        ignoreMutation: () => true,
        selectNode: () => root.classList.add('ProseMirror-selectednode'),
        deselectNode: () => root.classList.remove('ProseMirror-selectednode'),
      }
    }
  },
})

/** —— 数字输入 —— */
export const FormNumberInput = Node.create({
  name: 'formNumberInput',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      name: {
        default: '',
        parseHTML: (el: HTMLElement) => parseAttr(el, 'data-name') || uid('number'),
        renderHTML: (attrs: FormNumberAttrs) => ({ 'data-name': attrs.name || '' }),
      },
      ...bindExprAttrSpec,
      label: {
        default: '数字输入',
        parseHTML: (el: HTMLElement) => parseAttr(el, 'data-label', '数字输入'),
        renderHTML: (attrs: FormNumberAttrs) => ({ 'data-label': attrs.label || '数字输入' }),
      },
      placeholder: {
        default: '请输入数字',
        parseHTML: (el: HTMLElement) => parseAttr(el, 'data-placeholder', '请输入数字'),
        renderHTML: (attrs: FormNumberAttrs) => ({
          'data-placeholder': attrs.placeholder || '请输入数字',
        }),
      },
      value: {
        default: '',
        parseHTML: (el: HTMLElement) => {
          const input = el.querySelector('input')
          return input?.getAttribute('value') || parseAttr(el, 'data-value')
        },
        renderHTML: (attrs: FormNumberAttrs) => ({ 'data-value': attrs.value || '' }),
      },
      min: {
        default: '',
        parseHTML: (el: HTMLElement) => parseAttr(el, 'data-min'),
        renderHTML: (attrs: FormNumberAttrs) => ({ 'data-min': attrs.min || '' }),
      },
      max: {
        default: '',
        parseHTML: (el: HTMLElement) => parseAttr(el, 'data-max'),
        renderHTML: (attrs: FormNumberAttrs) => ({ 'data-max': attrs.max || '' }),
      },
      step: {
        default: '1',
        parseHTML: (el: HTMLElement) => parseAttr(el, 'data-step', '1'),
        renderHTML: (attrs: FormNumberAttrs) => ({ 'data-step': attrs.step || '1' }),
      },
      ...requiredAttrSpec,
      ...enterpriseFieldAttrSpec,
    }
  },

  parseHTML() {
    return [
      { tag: 'div[data-type="form-number-input"]' },
      { tag: 'div.rte-form-number' },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'form-number-input',
        class: 'rte-form rte-form-number',
      }),
    ]
  },

  addCommands() {
    return {
      insertFormNumberInput:
        (attrs = {}) =>
        ({ chain }) =>
          chain()
            .focus()
            .insertContent({
              type: this.name,
              attrs: {
                name: attrs.name || uid('number'),
                bindExpr: attrs.bindExpr ?? '',
                label: attrs.label ?? '数字输入',
                placeholder: attrs.placeholder ?? '请输入数字',
                value: attrs.value ?? '',
                min: attrs.min ?? '',
                max: attrs.max ?? '',
                step: attrs.step ?? '1',
                required: attrs.required ?? true,
                readonly: attrs.readonly ?? false,
                disabled: attrs.disabled ?? false,
                helpText: attrs.helpText ?? '',
              },
            })
            .run(),
    }
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const root = document.createElement('div')
      root.className = 'rte-form rte-form-number'
      root.setAttribute('data-type', 'form-number-input')
      root.contentEditable = 'false'

      const labelEl = document.createElement('div')
      labelEl.className = 'rte-form-label'

      const helpEl = document.createElement('div')
      helpEl.className = 'rte-form-help'

      const input = document.createElement('input')
      input.type = 'number'
      input.className = 'rte-form-input'

      const commit = (validate = true) => {
        const pos = readPos(getPos)
        if (pos == null) return
        const nextValue = input.value
        editor
          .chain()
          .command(({ tr }) => {
            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              value: nextValue,
            })
            return true
          })
          .run()
        if (validate) validateRequiredEmpty(root, isRequired(node.attrs), nextValue)
      }

      const paint = () => {
        root.setAttribute('data-name', node.attrs.name || '')
        root.setAttribute('data-bind-expr', node.attrs.bindExpr || '')
        root.setAttribute('data-value', node.attrs.value || '')
        root.setAttribute('data-min', node.attrs.min || '')
        root.setAttribute('data-max', node.attrs.max || '')
        root.setAttribute('data-step', node.attrs.step || '1')
        root.setAttribute('data-required', node.attrs.required ? 'true' : 'false')
        syncRootEnterpriseFlags(root, node.attrs)
        applyRequiredMark(labelEl, node.attrs.label || '数字输入', isRequired(node.attrs))
        applyHelpText(helpEl, node.attrs.helpText)
        input.placeholder = node.attrs.placeholder || '请输入数字'
        input.name = node.attrs.name || ''
        input.required = isRequired(node.attrs)
        applyTextControlState(input, node.attrs)
        if (node.attrs.min !== '') input.min = node.attrs.min
        else input.removeAttribute('min')
        if (node.attrs.max !== '') input.max = node.attrs.max
        else input.removeAttribute('max')
        input.step = node.attrs.step || '1'
        if (document.activeElement !== input) input.value = node.attrs.value || ''
      }

      input.addEventListener('mousedown', stopNodeViewEvent)
      input.addEventListener('click', stopNodeViewEvent)
      input.addEventListener('keydown', stopNodeViewEvent)
      input.addEventListener('input', () => {
        root.setAttribute('data-value', input.value)
        if (isRequired(node.attrs) && !isEmptyValue(input.value)) setInvalidState(root, false)
      })
      input.addEventListener('change', () => commit(true))
      input.addEventListener('blur', () => commit(true))

      paint()
      root.append(labelEl, helpEl, input)

      return {
        dom: root,
        update: (updated) => {
          if (updated.type.name !== 'formNumberInput') return false
          node = updated
          paint()
          return true
        },
        ignoreMutation: () => true,
        selectNode: () => root.classList.add('ProseMirror-selectednode'),
        deselectNode: () => root.classList.remove('ProseMirror-selectednode'),
      }
    }
  },
})

/** —— 日期 / 日期时间 —— */
export const FormDateInput = Node.create({
  name: 'formDateInput',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      name: {
        default: '',
        parseHTML: (el: HTMLElement) => parseAttr(el, 'data-name') || uid('date'),
        renderHTML: (attrs: FormDateAttrs) => ({ 'data-name': attrs.name || '' }),
      },
      ...bindExprAttrSpec,
      label: {
        default: '日期',
        parseHTML: (el: HTMLElement) => parseAttr(el, 'data-label', '日期'),
        renderHTML: (attrs: FormDateAttrs) => ({ 'data-label': attrs.label || '日期' }),
      },
      kind: {
        default: 'date',
        parseHTML: (el: HTMLElement) => {
          const k = parseAttr(el, 'data-kind', 'date')
          return k === 'datetime' || k === 'datetime-local' ? 'datetime' : 'date'
        },
        renderHTML: (attrs: FormDateAttrs) => ({
          'data-kind': attrs.kind === 'datetime' ? 'datetime' : 'date',
        }),
      },
      dateFormat: {
        default: 'YYYY-MM-DD',
        parseHTML: (el: HTMLElement) => {
          const kindRaw = parseAttr(el, 'data-kind', 'date')
          const kind =
            kindRaw === 'datetime' || kindRaw === 'datetime-local' ? 'datetime' : 'date'
          return parseAttr(el, 'data-date-format') || defaultDateFormat(kind)
        },
        renderHTML: (attrs: FormDateAttrs) => ({
          'data-date-format':
            attrs.dateFormat ||
            defaultDateFormat(attrs.kind === 'datetime' ? 'datetime' : 'date'),
        }),
      },
      value: {
        default: '',
        parseHTML: (el: HTMLElement) => {
          const input = el.querySelector('input')
          return input?.getAttribute('value') || parseAttr(el, 'data-value')
        },
        renderHTML: (attrs: FormDateAttrs) => ({ 'data-value': attrs.value || '' }),
      },
      ...requiredAttrSpec,
      ...enterpriseFieldAttrSpec,
    }
  },

  parseHTML() {
    return [
      { tag: 'div[data-type="form-date-input"]' },
      { tag: 'div.rte-form-date' },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'form-date-input',
        class: 'rte-form rte-form-date',
      }),
    ]
  },

  addCommands() {
    return {
      insertFormDateInput:
        (attrs = {}) =>
        ({ chain }) => {
          const kind = attrs.kind === 'datetime' ? 'datetime' : 'date'
          return chain()
            .focus()
            .insertContent({
              type: this.name,
              attrs: {
                name: attrs.name || uid(kind === 'datetime' ? 'datetime' : 'date'),
                bindExpr: attrs.bindExpr ?? '',
                label: attrs.label ?? (kind === 'datetime' ? '日期时间' : '日期'),
                kind,
                dateFormat: attrs.dateFormat || defaultDateFormat(kind),
                value: attrs.value ?? '',
                required: attrs.required ?? true,
                readonly: attrs.readonly ?? false,
                disabled: attrs.disabled ?? false,
                helpText: attrs.helpText ?? '',
              },
            })
            .run()
        },
    }
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const root = document.createElement('div')
      root.className = 'rte-form rte-form-date'
      root.setAttribute('data-type', 'form-date-input')
      root.contentEditable = 'false'

      const labelEl = document.createElement('div')
      labelEl.className = 'rte-form-label'

      const helpEl = document.createElement('div')
      helpEl.className = 'rte-form-help'

      const input = document.createElement('input')
      input.className = 'rte-form-input'

      const commit = (validate = true) => {
        const pos = readPos(getPos)
        if (pos == null) return
        const nextValue = input.value
        editor
          .chain()
          .command(({ tr }) => {
            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              value: nextValue,
            })
            return true
          })
          .run()
        if (validate) validateRequiredEmpty(root, isRequired(node.attrs), nextValue)
      }

      const paint = () => {
        const kind = node.attrs.kind === 'datetime' ? 'datetime' : 'date'
        const defaultLabel = kind === 'datetime' ? '日期时间' : '日期'
        const fmt = node.attrs.dateFormat || defaultDateFormat(kind)
        root.setAttribute('data-name', node.attrs.name || '')
        root.setAttribute('data-bind-expr', node.attrs.bindExpr || '')
        root.setAttribute('data-kind', kind)
        root.setAttribute('data-date-format', fmt)
        root.setAttribute('data-value', node.attrs.value || '')
        root.setAttribute('data-required', node.attrs.required ? 'true' : 'false')
        syncRootEnterpriseFlags(root, node.attrs)
        applyRequiredMark(labelEl, node.attrs.label || defaultLabel, isRequired(node.attrs))
        applyHelpText(helpEl, node.attrs.helpText)
        // 格式仅在属性面板编辑，NodeView 不展示「格式：…」提示行
        input.type = kind === 'datetime' ? 'datetime-local' : 'date'
        input.name = node.attrs.name || ''
        input.required = isRequired(node.attrs)
        applyTextControlState(input, node.attrs)
        input.title = fmt ? `格式 ${fmt}` : ''
        if (document.activeElement !== input) input.value = node.attrs.value || ''
      }

      input.addEventListener('mousedown', stopNodeViewEvent)
      input.addEventListener('click', stopNodeViewEvent)
      input.addEventListener('keydown', stopNodeViewEvent)
      input.addEventListener('input', () => {
        root.setAttribute('data-value', input.value)
        if (isRequired(node.attrs) && !isEmptyValue(input.value)) setInvalidState(root, false)
      })
      input.addEventListener('change', () => commit(true))
      input.addEventListener('blur', () => commit(true))

      paint()
      root.append(labelEl, helpEl, input)

      return {
        dom: root,
        update: (updated) => {
          if (updated.type.name !== 'formDateInput') return false
          node = updated
          paint()
          return true
        },
        ignoreMutation: () => true,
        selectNode: () => root.classList.add('ProseMirror-selectednode'),
        deselectNode: () => root.classList.remove('ProseMirror-selectednode'),
      }
    }
  },
})

/** —— 开关 —— */
export const FormSwitch = Node.create({
  name: 'formSwitch',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      name: {
        default: '',
        parseHTML: (el: HTMLElement) => parseAttr(el, 'data-name') || uid('switch'),
        renderHTML: (attrs: FormSwitchAttrs) => ({ 'data-name': attrs.name || '' }),
      },
      ...bindExprAttrSpec,
      label: {
        default: '开关',
        parseHTML: (el: HTMLElement) => parseAttr(el, 'data-label', '开关'),
        renderHTML: (attrs: FormSwitchAttrs) => ({ 'data-label': attrs.label || '开关' }),
      },
      value: {
        default: false,
        parseHTML: (el: HTMLElement) => {
          const raw = el.getAttribute('data-value')
          if (raw != null) return parseBoolAttr(el, 'data-value', false)
          const input = el.querySelector('input[type="checkbox"]') as HTMLInputElement | null
          return Boolean(input?.checked)
        },
        renderHTML: (attrs: FormSwitchAttrs) => ({
          'data-value': attrs.value ? 'true' : 'false',
        }),
      },
      ...requiredAttrSpec,
      ...enterpriseFieldAttrSpec,
    }
  },

  parseHTML() {
    return [
      { tag: 'div[data-type="form-switch"]' },
      { tag: 'div.rte-form-switch' },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'form-switch',
        class: 'rte-form rte-form-switch',
      }),
    ]
  },

  addCommands() {
    return {
      insertFormSwitch:
        (attrs = {}) =>
        ({ chain }) =>
          chain()
            .focus()
            .insertContent({
              type: this.name,
              attrs: {
                name: attrs.name || uid('switch'),
                bindExpr: attrs.bindExpr ?? '',
                label: attrs.label ?? '开关',
                value: attrs.value ?? false,
                required: attrs.required ?? false,
                readonly: attrs.readonly ?? false,
                disabled: attrs.disabled ?? false,
                helpText: attrs.helpText ?? '',
              },
            })
            .run(),
    }
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const root = document.createElement('div')
      root.className = 'rte-form rte-form-switch'
      root.setAttribute('data-type', 'form-switch')
      root.contentEditable = 'false'

      const row = document.createElement('label')
      row.className = 'rte-form-switch-row'

      const labelEl = document.createElement('span')
      labelEl.className = 'rte-form-label rte-form-switch-label'

      const helpEl = document.createElement('div')
      helpEl.className = 'rte-form-help'

      const track = document.createElement('span')
      track.className = 'rte-form-switch-track'
      track.setAttribute('aria-hidden', 'true')
      const thumb = document.createElement('span')
      thumb.className = 'rte-form-switch-thumb'
      track.append(thumb)

      const input = document.createElement('input')
      input.type = 'checkbox'
      input.className = 'rte-form-switch-input'
      input.setAttribute('role', 'switch')

      const commit = (validate = true) => {
        const pos = readPos(getPos)
        if (pos == null) return
        // 只读/禁用时不提交交互变更
        if (isDisabled(node.attrs) || isReadonly(node.attrs)) return
        const nextValue = input.checked
        editor
          .chain()
          .command(({ tr }) => {
            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              value: nextValue,
            })
            return true
          })
          .run()
        // required switch: must be on
        if (validate) validateRequiredEmpty(root, isRequired(node.attrs), nextValue ? '1' : '')
      }

      const paint = () => {
        root.setAttribute('data-name', node.attrs.name || '')
        root.setAttribute('data-bind-expr', node.attrs.bindExpr || '')
        root.setAttribute('data-value', node.attrs.value ? 'true' : 'false')
        root.setAttribute('data-required', node.attrs.required ? 'true' : 'false')
        syncRootEnterpriseFlags(root, node.attrs)
        applyRequiredMark(labelEl, node.attrs.label || '开关', isRequired(node.attrs))
        applyHelpText(helpEl, node.attrs.helpText)
        input.name = node.attrs.name || ''
        input.checked = Boolean(node.attrs.value)
        input.setAttribute('aria-checked', input.checked ? 'true' : 'false')
        // 禁用或只读均不可切换（只读仍展示当前态）
        applyChoiceControlState(input, node.attrs)
        row.classList.toggle('is-locked', isDisabled(node.attrs) || isReadonly(node.attrs))
        root.classList.toggle('is-on', input.checked)
        track.classList.toggle('is-on', input.checked)
      }

      input.addEventListener('mousedown', stopNodeViewEvent)
      input.addEventListener('click', stopNodeViewEvent)
      row.addEventListener('mousedown', stopNodeViewEvent)
      row.addEventListener('click', (ev) => {
        stopNodeViewEvent(ev)
        if (isDisabled(node.attrs) || isReadonly(node.attrs)) {
          ev.preventDefault()
        }
      })
      input.addEventListener('change', () => {
        if (isDisabled(node.attrs) || isReadonly(node.attrs)) {
          input.checked = Boolean(node.attrs.value)
          return
        }
        root.setAttribute('data-value', input.checked ? 'true' : 'false')
        root.classList.toggle('is-on', input.checked)
        track.classList.toggle('is-on', input.checked)
        input.setAttribute('aria-checked', input.checked ? 'true' : 'false')
        commit(true)
      })
      input.addEventListener('blur', () => {
        validateRequiredEmpty(root, isRequired(node.attrs), input.checked ? '1' : '')
      })

      paint()
      row.append(input, track, labelEl)
      root.append(row, helpEl)

      return {
        dom: root,
        update: (updated) => {
          if (updated.type.name !== 'formSwitch') return false
          node = updated
          paint()
          return true
        },
        ignoreMutation: () => true,
        selectNode: () => root.classList.add('ProseMirror-selectednode'),
        deselectNode: () => root.classList.remove('ProseMirror-selectednode'),
      }
    }
  },
})

/** 一站式注册：文本 / 单选 / 多选 / 下拉 / 多行 / 数字 / 日期 / 开关 */

/** 全部表单原子节点名（与下方 FormExtensions 一一对应） */
export const FORM_NODE_NAMES = [
  'formTextInput',
  'formRadioGroup',
  'formCheckboxGroup',
  'formSelect',
  'formTextarea',
  'formNumberInput',
  'formDateInput',
  'formSwitch',
] as const

export type FormNodeName = (typeof FORM_NODE_NAMES)[number]

export const FORM_NODE_TYPE_LABELS: Record<FormNodeName, string> = {
  formTextInput: '文本输入',
  formRadioGroup: '单选组',
  formCheckboxGroup: '多选组',
  formSelect: '下拉选择',
  formTextarea: '多行文本',
  formNumberInput: '数字输入',
  formDateInput: '日期',
  formSwitch: '开关',
}

export function isFormNodeName(name: string): name is FormNodeName {
  return (FORM_NODE_NAMES as readonly string[]).includes(name)
}

/** 是否支持「选项」编辑（单选 / 多选 / 下拉） */
export function formNodeSupportsOptions(name: string): boolean {
  return (
    name === 'formRadioGroup' ||
    name === 'formCheckboxGroup' ||
    name === 'formSelect'
  )
}

/** 是否支持占位提示 */
export function formNodeSupportsPlaceholder(name: string): boolean {
  return (
    name === 'formTextInput' ||
    name === 'formTextarea' ||
    name === 'formNumberInput' ||
    name === 'formSelect'
  )
}

/** 是否支持字数上下限（单行 / 多行文本） */
export function formNodeSupportsLength(name: string): boolean {
  return name === 'formTextInput' || name === 'formTextarea'
}

/** 是否支持正则 pattern（单行 / 多行文本） */
export function formNodeSupportsPattern(name: string): boolean {
  return name === 'formTextInput' || name === 'formTextarea'
}

/** 是否支持行数（多行文本） */
export function formNodeSupportsRows(name: string): boolean {
  return name === 'formTextarea'
}

/** 是否支持数值范围（数字） */
export function formNodeSupportsNumberRange(name: string): boolean {
  return name === 'formNumberInput'
}

/** 是否支持日期格式 */
export function formNodeSupportsDateFormat(name: string): boolean {
  return name === 'formDateInput'
}

/** 是否支持选项布局（单选 / 多选组） */
export function formNodeSupportsChoiceLayout(name: string): boolean {
  return name === 'formRadioGroup' || name === 'formCheckboxGroup'
}


/** 从文档收集字段名 → 当前值（用于条件显示） */
export function collectFormValuesByName(doc: { descendants: (f: (node: any, pos: number) => boolean | void) => void }): Record<string, string> {
  const map: Record<string, string> = {}
  doc.descendants((node) => {
    if (!isFormNodeName(node.type.name)) return
    const name = String(node.attrs?.name ?? '').trim()
    if (!name) return
    map[name] = formValueToCompareString(node.attrs?.value)
  })
  return map
}

/**
 * 按编辑/预览态刷新所有表单节点的条件显示。
 * - 编辑态：始终显示；若条件当前不成立则加淡化 class
 * - 预览/填写态：条件不成立则 hidden
 */
export function applyFormShowIfVisibility(editor: Editor) {
  if (!editor || editor.isDestroyed) return
  const values = collectFormValuesByName(editor.state.doc)
  const editable = editor.isEditable
  editor.state.doc.descendants((node, pos) => {
    if (!isFormNodeName(node.type.name)) return
    const dom = editor.view.nodeDOM(pos) as HTMLElement | null
    if (!dom || !(dom instanceof HTMLElement)) return
    const field = String(node.attrs?.showIfField ?? '').trim()
    if (!field) {
      dom.classList.remove('rte-form-showif-hidden', 'rte-form-showif-would-hide')
      dom.removeAttribute('hidden')
      return
    }
    const visible = evalShowIf(node.attrs, values)
    if (editable) {
      dom.classList.remove('rte-form-showif-hidden')
      dom.removeAttribute('hidden')
      dom.classList.toggle('rte-form-showif-would-hide', !visible)
    } else {
      dom.classList.remove('rte-form-showif-would-hide')
      dom.classList.toggle('rte-form-showif-hidden', !visible)
      if (!visible) dom.setAttribute('hidden', '')
      else dom.removeAttribute('hidden')
    }
  })
}

/**
 * 条件显示插件：文档变更或强制 meta 时刷新可见性。
 * 预览切换时宿主应 dispatch meta `{ formShowIfForce: true }` 或直接调用 applyFormShowIfVisibility。
 */
export const FormShowIf = Extension.create({
  name: 'formShowIf',

  onCreate() {
    requestAnimationFrame(() => applyFormShowIfVisibility(this.editor))
  },

  onTransaction({ transaction }) {
    if (!transaction.docChanged && !transaction.getMeta('formShowIfForce')) return
    requestAnimationFrame(() => applyFormShowIfVisibility(this.editor))
  },
})

export const FormExtensions = [
  FormTextInput,
  FormRadioGroup,
  FormCheckboxGroup,
  FormSelect,
  FormTextarea,
  FormNumberInput,
  FormDateInput,
  FormSwitch,
]

export default FormExtensions
