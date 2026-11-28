<script setup lang="ts">
/**
 * 新建视图弹窗：视图名 + 可见范围。
 *
 * 可见范围对应技术方案风险表里的「共享视图与个人偏好混存」：
 *   shared   —— 空间内共享，筛选 / 列宽对所有成员生效；
 *   personal —— 仅创建者可见与编辑（只有自己的一套视图）。
 */
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { ViewScope, ViewType } from '../types'

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'create', payload: { name: string; scope: ViewScope; type: ViewType }): void
}>()

const name = ref('')
const scope = ref<ViewScope>('shared')
const type = ref<ViewType>('grid')
const saving = ref(false)

// 视图类型：与后端 ValidViewTypes 白名单保持一致（grid / kanban / calendar /
// gallery / form / gantt），别只列前端已渲染的几个 —— 否则日历与画廊只能靠
// 「已有视图」才用得上，用户永远新建不出来。
const TYPE_OPTIONS: Array<{ value: ViewType; label: string; hint: string }> = [
  { value: 'grid', label: '表格视图', hint: '一行一条记录，适合批量编辑' },
  { value: 'kanban', label: '看板视图', hint: '按状态分组，适合流程推进' },
  { value: 'calendar', label: '日历视图', hint: '按日期字段排成日历' },
  { value: 'gallery', label: '画廊视图', hint: '卡片式浏览，适合看图看附件' },
  { value: 'form', label: '表单视图', hint: '一次填一条记录，适合信息收集' },
  { value: 'gantt', label: '甘特视图', hint: '按开始 / 结束日期排布，看排期' },
]

const SCOPE_OPTIONS: Array<{ value: ViewScope; label: string; hint: string }> = [
  {
    value: 'shared',
    label: '共享给空间成员',
    hint: '所有人看到同一套筛选、排序与列宽；任何人都能改',
  },
  {
    value: 'personal',
    label: '仅自己可见',
    hint: '只有你能看到这个视图并编辑它，不会出现在别人的视图列表里',
  },
]

function submit() {
  const trimmed = name.value.trim()
  if (!trimmed) {
    ElMessage.warning('请输入视图名称')
    return
  }
  saving.value = true
  emit('create', { name: trimmed, scope: scope.value, type: type.value })
}
</script>

<template>
  <el-dialog
    :model-value="true"
    title="新建视图"
    width="440px"
    append-to-body
    modal-class="be-modal"
    destroy-on-close
    @close="emit('close')"
  >
    <div class="be-vc">
      <el-input
        v-model="name"
        placeholder="视图名称"
        maxlength="40"
        show-word-limit
        autofocus
        @keyup.enter="submit"
      />
      <div class="be-vc__label">视图类型</div>
      <el-radio-group v-model="type" class="be-vc__group">
        <el-radio v-for="opt in TYPE_OPTIONS" :key="opt.value" :value="opt.value" class="be-vc__radio">
          <span class="be-vc__radio-label">{{ opt.label }}</span>
          <span class="be-vc__radio-hint">{{ opt.hint }}</span>
        </el-radio>
      </el-radio-group>

      <div class="be-vc__label">可见范围</div>
      <el-radio-group v-model="scope" class="be-vc__group">
        <el-radio v-for="opt in SCOPE_OPTIONS" :key="opt.value" :value="opt.value" class="be-vc__radio">
          <span class="be-vc__radio-label">{{ opt.label }}</span>
          <span class="be-vc__radio-hint">{{ opt.hint }}</span>
        </el-radio>
      </el-radio-group>
    </div>
    <template #footer>
      <el-button @click="emit('close')">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submit">创建</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.be-vc {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.be-vc__label {
  font-size: 13px;
  font-weight: 600;
  color: var(--tg-text-1, #0f172a);
}

.be-vc__group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-start;
}

.be-vc__radio {
  display: flex;
  align-items: flex-start;
  height: auto;
  margin-right: 0;
  white-space: normal;
}

.be-vc__radio :deep(.el-radio__label) {
  display: flex;
  flex-direction: column;
  line-height: 1.45;
  white-space: normal;
}

.be-vc__radio-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--tg-text-1, #0f172a);
}

.be-vc__radio-hint {
  font-size: 12px;
  color: var(--tg-text-3, #94a3b8);
}
</style>
