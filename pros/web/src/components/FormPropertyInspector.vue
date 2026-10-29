<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  DATE_FORMAT_PRESETS,
  FORM_NODE_TYPE_LABELS,
  defaultDateFormat,
  formNodeSupportsChoiceLayout,
  formNodeSupportsLength,
  formNodeSupportsNumberRange,
  formNodeSupportsOptions,
  formNodeSupportsPlaceholder,
  formNodeSupportsRows,
  joinFormOptions,
  joinFormValues,
  normalizeChoiceLayout,
  normalizeLayoutColumns,
  splitFormOptions,
  splitFormValues,
  type FormChoiceLayout,
  type FormNodeName,
} from '../extensions/forms'

const props = defineProps<{
  type: FormNodeName
  attrs: Record<string, unknown>
}>()

const emit = defineEmits<{
  patch: [patch: Record<string, unknown>]
  close: []
}>()

const typeLabel = computed(
  () => FORM_NODE_TYPE_LABELS[props.type] || props.type,
)

const showOptions = computed(() => formNodeSupportsOptions(props.type))
const showPlaceholder = computed(() => formNodeSupportsPlaceholder(props.type))
const isSwitch = computed(() => props.type === 'formSwitch')
const isCheckbox = computed(() => props.type === 'formCheckboxGroup')
const isChoiceGroup = computed(() => formNodeSupportsChoiceLayout(props.type))
const isDate = computed(() => props.type === 'formDateInput')
const isNumber = computed(() => formNodeSupportsNumberRange(props.type))
const isText = computed(() => props.type === 'formTextInput')
const isTextarea = computed(() => formNodeSupportsRows(props.type))
const showLengthLimits = computed(() => formNodeSupportsLength(props.type))

const labelDraft = ref('')
const nameDraft = ref('')
const bindExprDraft = ref('')
const dateFormatDraft = ref('YYYY-MM-DD')
const requiredDraft = ref(true)
const placeholderDraft = ref('')
const minDraft = ref('')
const maxDraft = ref('')
const stepDraft = ref('1')
const defaultDraft = ref('')
const switchDefault = ref(false)
const optionDrafts = ref<string[]>([])
const checkboxDefaults = ref<string[]>([])
const layoutDraft = ref<FormChoiceLayout>('column')
const layoutColumnsDraft = ref(2)
const readonlyDraft = ref(false)
const disabledDraft = ref(false)
const helpTextDraft = ref('')
const minLengthDraft = ref('')
const maxLengthDraft = ref('')
const rowsDraft = ref(4)

const dateFormatPresets = DATE_FORMAT_PRESETS

let syncing = false

function syncFromAttrs() {
  syncing = true
  const a = props.attrs || {}
  labelDraft.value = String(a.label ?? '')
  nameDraft.value = String(a.name ?? '')
  bindExprDraft.value = String(a.bindExpr ?? '')
  const kind = a.kind === 'datetime' ? 'datetime' : 'date'
  dateFormatDraft.value = String(a.dateFormat || defaultDateFormat(kind))
  requiredDraft.value = a.required !== false && a.required !== 'false'
  placeholderDraft.value = String(a.placeholder ?? '')
  if (isNumber.value) {
    minDraft.value = String(a.min ?? '')
    maxDraft.value = String(a.max ?? '')
    stepDraft.value = String(a.step ?? '1')
  } else {
    minDraft.value = ''
    maxDraft.value = ''
    stepDraft.value = '1'
  }
  if (isSwitch.value) {
    switchDefault.value = a.value === true || a.value === 'true'
    defaultDraft.value = ''
  } else {
    defaultDraft.value = String(a.value ?? '')
  }
  if (showOptions.value) {
    const opts = splitFormOptions(a.options)
    optionDrafts.value = opts.length ? [...opts] : ['']
    if (isCheckbox.value) {
      checkboxDefaults.value = splitFormValues(a.value)
    }
  } else {
    optionDrafts.value = []
    checkboxDefaults.value = []
  }
  if (isChoiceGroup.value) {
    layoutDraft.value = normalizeChoiceLayout(a.layout)
    layoutColumnsDraft.value = normalizeLayoutColumns(a.layoutColumns)
  } else {
    layoutDraft.value = 'column'
    layoutColumnsDraft.value = 2
  }
  readonlyDraft.value = a.readonly === true || a.readonly === 'true'
  disabledDraft.value = a.disabled === true || a.disabled === 'true'
  helpTextDraft.value = String(a.helpText ?? '')
  if (showLengthLimits.value) {
    minLengthDraft.value = String(a.minLength ?? '')
    maxLengthDraft.value = String(a.maxLength ?? '')
  } else {
    minLengthDraft.value = ''
    maxLengthDraft.value = ''
  }
  if (isTextarea.value) {
    const n = Number(a.rows)
    rowsDraft.value = Number.isFinite(n) && n > 0 ? Math.floor(n) : 4
  } else {
    rowsDraft.value = 4
  }
  syncing = false
}

watch(
  () => [props.type, JSON.stringify(props.attrs)] as const,
  () => syncFromAttrs(),
  { immediate: true },
)

function emitPatch(patch: Record<string, unknown>) {
  if (syncing) return
  emit('patch', patch)
}

function onLabelInput() {
  emitPatch({ label: labelDraft.value })
}

function onNameInput() {
  emitPatch({ name: nameDraft.value.trim() })
}

function onBindExprInput() {
  emitPatch({ bindExpr: bindExprDraft.value.trim() })
}

function onDateFormatInput() {
  const fmt = dateFormatDraft.value.trim() || defaultDateFormat(
    props.attrs.kind === 'datetime' ? 'datetime' : 'date',
  )
  dateFormatDraft.value = fmt
  emitPatch({ dateFormat: fmt })
}

function onRequiredChange() {
  emitPatch({ required: requiredDraft.value })
}

function onReadonlyChange() {
  emitPatch({ readonly: readonlyDraft.value })
}

function onDisabledChange() {
  emitPatch({ disabled: disabledDraft.value })
}

function onHelpTextInput() {
  emitPatch({ helpText: helpTextDraft.value })
}

function onMinLengthInput() {
  emitPatch({ minLength: minLengthDraft.value.trim() })
}

function onMaxLengthInput() {
  emitPatch({ maxLength: maxLengthDraft.value.trim() })
}

function onRowsInput() {
  const n = Number(rowsDraft.value)
  const rows = Number.isFinite(n) && n > 0 ? Math.min(40, Math.floor(n)) : 4
  rowsDraft.value = rows
  emitPatch({ rows })
}

function onPlaceholderInput() {
  emitPatch({ placeholder: placeholderDraft.value })
}

function onMinInput() {
  emitPatch({ min: minDraft.value.trim() })
}

function onMaxInput() {
  emitPatch({ max: maxDraft.value.trim() })
}

function onStepInput() {
  const s = stepDraft.value.trim() || '1'
  stepDraft.value = s
  emitPatch({ step: s })
}

function onDefaultInput() {
  emitPatch({ value: defaultDraft.value })
}

function onSwitchDefaultChange() {
  emitPatch({ value: switchDefault.value })
}

function commitOptions() {
  const cleaned = optionDrafts.value.map((s) => s.trim()).filter(Boolean)
  const joined = joinFormOptions(cleaned.length ? cleaned : ['选项一'])
  const patch: Record<string, unknown> = { options: joined }
  // 默认值若不在新选项中则清空（多选保留交集）
  if (isCheckbox.value) {
    const allowed = new Set(cleaned)
    const next = checkboxDefaults.value.filter((v) => allowed.has(v))
    checkboxDefaults.value = next
    patch.value = joinFormValues(next)
  } else if (showOptions.value) {
    const cur = defaultDraft.value.trim()
    if (cur && !cleaned.includes(cur)) {
      defaultDraft.value = ''
      patch.value = ''
    }
  }
  emitPatch(patch)
}

function onOptionInput(index: number, event: Event) {
  const v = (event.target as HTMLInputElement).value
  optionDrafts.value[index] = v
  commitOptions()
}

function addOption() {
  optionDrafts.value = [...optionDrafts.value, `选项${optionDrafts.value.length + 1}`]
  commitOptions()
}

function removeOption(index: number) {
  if (optionDrafts.value.length <= 1) {
    optionDrafts.value = ['']
  } else {
    optionDrafts.value = optionDrafts.value.filter((_, i) => i !== index)
  }
  commitOptions()
}

function onSelectDefaultChange() {
  emitPatch({ value: defaultDraft.value })
}

function onCheckboxDefaultToggle(opt: string, checked: boolean) {
  const set = new Set(checkboxDefaults.value)
  if (checked) set.add(opt)
  else set.delete(opt)
  checkboxDefaults.value = [...set]
  emitPatch({ value: joinFormValues(checkboxDefaults.value) })
}

function onKindChange(event: Event) {
  const kind = (event.target as HTMLSelectElement).value === 'datetime' ? 'datetime' : 'date'
  const prevKind = props.attrs.kind === 'datetime' ? 'datetime' : 'date'
  const patch: Record<string, unknown> = {
    kind,
    label:
      labelDraft.value ||
      (kind === 'datetime' ? '日期时间' : '日期'),
  }
  const curFmt = dateFormatDraft.value.trim()
  if (!curFmt || curFmt === defaultDateFormat(prevKind)) {
    const nextFmt = defaultDateFormat(kind)
    dateFormatDraft.value = nextFmt
    patch.dateFormat = nextFmt
  }
  emitPatch(patch)
}

function onLayoutChange(event: Event) {
  const layout = normalizeChoiceLayout((event.target as HTMLSelectElement).value)
  layoutDraft.value = layout
  const patch: Record<string, unknown> = { layout }
  if (layout === 'grid' && !layoutColumnsDraft.value) {
    layoutColumnsDraft.value = 2
    patch.layoutColumns = 2
  }
  emitPatch(patch)
}

function onLayoutColumnsInput(event: Event) {
  const cols = normalizeLayoutColumns((event.target as HTMLInputElement).value)
  layoutColumnsDraft.value = cols
  emitPatch({ layoutColumns: cols })
}
</script>

<template>
  <aside class="fpi" aria-label="表单属性" @mousedown.stop>
    <header class="fpi-head">
      <div class="fpi-head-text">
        <div class="fpi-title">表单属性</div>
        <div class="fpi-sub">{{ typeLabel }}</div>
      </div>
      <button
        type="button"
        class="fpi-close"
        title="关闭"
        aria-label="关闭属性面板"
        @click="emit('close')"
      >
        ×
      </button>
    </header>

    <div class="fpi-body">
      <div class="fpi-section">
        <div class="fpi-section-title">基础</div>
        <label class="fpi-field">
          <span class="fpi-label">标签</span>
          <input
            v-model="labelDraft"
            class="fpi-input"
            type="text"
            maxlength="80"
            placeholder="显示名称"
            @input="onLabelInput"
          />
        </label>

        <label class="fpi-field">
          <span class="fpi-label">字段名</span>
          <input
            v-model="nameDraft"
            class="fpi-input"
            type="text"
            maxlength="80"
            placeholder="字段 key，如 title"
            spellcheck="false"
            @input="onNameInput"
          />
        </label>

        <label class="fpi-field">
          <span class="fpi-label">绑定表达式</span>
          <input
            v-model="bindExprDraft"
            class="fpi-input"
            type="text"
            maxlength="120"
            placeholder="如 form.xxx / values.xxx"
            spellcheck="false"
            @input="onBindExprInput"
          />
          <p class="fpi-tip">Vue: v-model / React: value+onChange</p>
        </label>
      </div>

      <div class="fpi-section">
        <div class="fpi-section-title">状态</div>
        <label class="fpi-field fpi-field-row">
          <span class="fpi-label">必填</span>
          <input
            v-model="requiredDraft"
            class="fpi-check"
            type="checkbox"
            @change="onRequiredChange"
          />
          <span class="fpi-hint">{{ requiredDraft ? '是' : '否' }}</span>
        </label>

        <label class="fpi-field fpi-field-row">
          <span class="fpi-label">只读</span>
          <input
            v-model="readonlyDraft"
            class="fpi-check"
            type="checkbox"
            @change="onReadonlyChange"
          />
          <span class="fpi-hint">{{ readonlyDraft ? '是' : '否' }}</span>
        </label>

        <label class="fpi-field fpi-field-row">
          <span class="fpi-label">禁用</span>
          <input
            v-model="disabledDraft"
            class="fpi-check"
            type="checkbox"
            @change="onDisabledChange"
          />
          <span class="fpi-hint">{{ disabledDraft ? '是' : '否' }}</span>
        </label>
        <p class="fpi-tip">只读可复制；禁用不可操作且通常不提交。</p>
      </div>

      <div class="fpi-section">
        <div class="fpi-section-title">说明</div>
        <label class="fpi-field">
          <span class="fpi-label">帮助文案</span>
          <input
            v-model="helpTextDraft"
            class="fpi-input"
            type="text"
            maxlength="200"
            placeholder="显示在标签下方的说明"
            @input="onHelpTextInput"
          />
        </label>

        <label v-if="showPlaceholder" class="fpi-field">
          <span class="fpi-label">占位提示</span>
          <input
            v-model="placeholderDraft"
            class="fpi-input"
            type="text"
            maxlength="120"
            placeholder="未填写时的提示文字"
            @input="onPlaceholderInput"
          />
        </label>
      </div>

      <div v-if="showLengthLimits || isTextarea || isDate || isNumber || isChoiceGroup" class="fpi-section">
        <div class="fpi-section-title">类型设置</div>

        <label v-if="showLengthLimits" class="fpi-field">
          <span class="fpi-label">最少字数</span>
          <input
            v-model="minLengthDraft"
            class="fpi-input"
            type="number"
            min="0"
            step="1"
            placeholder="可选"
            @input="onMinLengthInput"
          />
        </label>

        <label v-if="showLengthLimits" class="fpi-field">
          <span class="fpi-label">最多字数</span>
          <input
            v-model="maxLengthDraft"
            class="fpi-input"
            type="number"
            min="0"
            step="1"
            placeholder="可选"
            @input="onMaxLengthInput"
          />
        </label>

        <label v-if="isTextarea" class="fpi-field">
          <span class="fpi-label">行数</span>
          <input
            v-model.number="rowsDraft"
            class="fpi-input"
            type="number"
            min="1"
            max="40"
            step="1"
            placeholder="4"
            @change="onRowsInput"
            @blur="onRowsInput"
          />
          <p class="fpi-tip">多行文本框可见行数，默认 4</p>
        </label>

        <label v-if="isDate" class="fpi-field">
          <span class="fpi-label">类型</span>
          <select
            class="fpi-input"
            :value="attrs.kind === 'datetime' ? 'datetime' : 'date'"
            @change="onKindChange"
          >
            <option value="date">日期</option>
            <option value="datetime">日期时间</option>
          </select>
        </label>

        <label v-if="isDate" class="fpi-field">
          <span class="fpi-label">日期格式</span>
          <input
            v-model="dateFormatDraft"
            class="fpi-input"
            type="text"
            list="fpi-date-format-presets"
            maxlength="40"
            placeholder="如 YYYY-MM-DD"
            spellcheck="false"
            @change="onDateFormatInput"
            @blur="onDateFormatInput"
          />
          <datalist id="fpi-date-format-presets">
            <option v-for="p in dateFormatPresets" :key="p" :value="p" />
          </datalist>
          <p class="fpi-tip">可下拉选预设，也可手写；默认日期 YYYY-MM-DD，日期时间 YYYY-MM-DD HH:mm</p>
        </label>

        <label v-if="isNumber" class="fpi-field">
          <span class="fpi-label">最小值</span>
          <input
            v-model="minDraft"
            class="fpi-input"
            type="number"
            placeholder="可选"
            @input="onMinInput"
          />
        </label>

        <label v-if="isNumber" class="fpi-field">
          <span class="fpi-label">最大值</span>
          <input
            v-model="maxDraft"
            class="fpi-input"
            type="number"
            placeholder="可选"
            @input="onMaxInput"
          />
        </label>

        <label v-if="isNumber" class="fpi-field">
          <span class="fpi-label">步长</span>
          <input
            v-model="stepDraft"
            class="fpi-input"
            type="number"
            step="any"
            placeholder="1"
            @input="onStepInput"
          />
        </label>

        <label v-if="isChoiceGroup" class="fpi-field">
          <span class="fpi-label">布局</span>
          <select
            class="fpi-input"
            :value="layoutDraft"
            @change="onLayoutChange"
          >
            <option value="row">只有一行</option>
            <option value="column">只有一列</option>
            <option value="grid">一行多列</option>
          </select>
        </label>

        <label v-if="isChoiceGroup && layoutDraft === 'grid'" class="fpi-field">
          <span class="fpi-label">列数</span>
          <input
            class="fpi-input"
            type="number"
            min="1"
            max="12"
            step="1"
            :value="layoutColumnsDraft"
            @change="onLayoutColumnsInput"
            @blur="onLayoutColumnsInput"
          />
          <p class="fpi-tip">一行多列时的列数，默认 2</p>
        </label>
      </div>

      <div v-if="showOptions" class="fpi-section">
        <div class="fpi-section-title">选项</div>
        <div class="fpi-field">
          <div class="fpi-label-row">
            <span class="fpi-label">选项列表</span>
            <button type="button" class="fpi-link" @click="addOption">+ 添加</button>
          </div>
          <div class="fpi-options">
            <div
              v-for="(opt, idx) in optionDrafts"
              :key="idx"
              class="fpi-option-row"
            >
              <input
                class="fpi-input"
                type="text"
                :value="opt"
                :placeholder="`选项 ${idx + 1}`"
                maxlength="80"
                @input="onOptionInput(idx, $event)"
              />
              <button
                type="button"
                class="fpi-icon-btn"
                title="删除选项"
                @click="removeOption(idx)"
              >
                −
              </button>
            </div>
          </div>
          <p class="fpi-tip">选项以竖线分隔存储；空项保存时会自动去掉。</p>
        </div>
      </div>

      <div class="fpi-section">
        <div class="fpi-section-title">默认值</div>
        <label v-if="isSwitch" class="fpi-field fpi-field-row">
          <span class="fpi-label">默认开关</span>
          <input
            v-model="switchDefault"
            class="fpi-check"
            type="checkbox"
            @change="onSwitchDefaultChange"
          />
          <span class="fpi-hint">{{ switchDefault ? '开' : '关' }}</span>
        </label>

        <div v-else-if="isCheckbox" class="fpi-field">
          <span class="fpi-label">默认勾选</span>
          <div class="fpi-default-checks">
            <label
              v-for="opt in optionDrafts.filter((x) => x.trim())"
              :key="opt"
              class="fpi-default-check"
            >
              <input
                type="checkbox"
                :checked="checkboxDefaults.includes(opt)"
                @change="
                  onCheckboxDefaultToggle(
                    opt,
                    ($event.target as HTMLInputElement).checked,
                  )
                "
              />
              <span>{{ opt }}</span>
            </label>
            <p v-if="!optionDrafts.some((x) => x.trim())" class="fpi-tip">
              请先添加选项
            </p>
          </div>
        </div>

        <label v-else-if="showOptions" class="fpi-field">
          <span class="fpi-label">默认选项</span>
          <select
            v-model="defaultDraft"
            class="fpi-input"
            @change="onSelectDefaultChange"
          >
            <option value="">（无）</option>
            <option
              v-for="opt in optionDrafts.filter((x) => x.trim())"
              :key="opt"
              :value="opt"
            >
              {{ opt }}
            </option>
          </select>
        </label>

        <label v-else-if="isDate" class="fpi-field">
          <span class="fpi-label">默认日期</span>
          <input
            v-model="defaultDraft"
            class="fpi-input"
            :type="attrs.kind === 'datetime' ? 'datetime-local' : 'date'"
            @change="onDefaultInput"
          />
        </label>

        <label v-else class="fpi-field">
          <span class="fpi-label">默认内容</span>
          <input
            v-model="defaultDraft"
            class="fpi-input"
            :type="type === 'formNumberInput' ? 'number' : 'text'"
            placeholder="初始内容"
            @input="onDefaultInput"
          />
        </label>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.fpi {
  display: flex;
  flex-direction: column;
  width: 280px;
  max-width: 100%;
  height: 100%;
  min-height: 0;
  background: #fafbfc;
  border-left: 1px solid #e8eaed;
  box-sizing: border-box;
  flex-shrink: 0;
}

.fpi-head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 12px 10px;
  border-bottom: 1px solid #eef0f3;
  flex-shrink: 0;
}

.fpi-head-text {
  flex: 1;
  min-width: 0;
}

.fpi-title {
  font-size: 13px;
  font-weight: 700;
  color: #202124;
  letter-spacing: 0.02em;
}

.fpi-sub {
  margin-top: 2px;
  font-size: 11px;
  color: #80868b;
}

.fpi-close {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #5f6368;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
}

.fpi-close:hover {
  background: #e8eaed;
  color: #202124;
}

.fpi-body {
  flex: 1;
  min-height: 0;
  overflow-x: visible;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.fpi-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.fpi-field-row {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.fpi-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.fpi-label {
  font-size: 12px;
  font-weight: 600;
  color: #3c4043;
}

.fpi-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #dadce0;
  border-radius: 6px;
  padding: 7px 9px;
  font-size: 13px;
  color: #202124;
  background: #fff;
  outline: none;
}

.fpi-input:focus {
  border-color: #1a73e8;
  box-shadow: 0 0 0 2px rgba(26, 115, 232, 0.18);
}

.fpi-check {
  width: 16px;
  height: 16px;
  accent-color: #1a73e8;
  cursor: pointer;
}

.fpi-hint {
  font-size: 12px;
  color: #5f6368;
}

.fpi-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.fpi-option-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.fpi-icon-btn {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border: 1px solid #dadce0;
  border-radius: 6px;
  background: #fff;
  color: #5f6368;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 0;
}

.fpi-icon-btn:hover {
  background: #fce8e6;
  border-color: #f28b82;
  color: #d93025;
}

.fpi-link {
  border: none;
  background: transparent;
  color: #1a73e8;
  font-size: 12px;
  cursor: pointer;
  padding: 0;
}

.fpi-link:hover {
  text-decoration: underline;
}

.fpi-tip {
  margin: 0;
  font-size: 11px;
  color: #9aa0a6;
  line-height: 1.4;
}

.fpi-default-checks {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 1px solid #e8eaed;
  border-radius: 6px;
  background: #fff;
}

.fpi-default-check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #202124;
  cursor: pointer;
}

.fpi-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 12px;
  border-bottom: 1px solid #eef0f3;
}
.fpi-section:last-child {
  border-bottom: none;
  padding-bottom: 0;
}
.fpi-section-title {
  font-size: 11px;
  font-weight: 700;
  color: #86909c;
  letter-spacing: 0.04em;
  text-transform: none;
  user-select: none;
}
/* 避免原生 select 下拉被面板 overflow 裁切观感：面板本身可溢出 */
.fpi {
  overflow: visible;
}
</style>
