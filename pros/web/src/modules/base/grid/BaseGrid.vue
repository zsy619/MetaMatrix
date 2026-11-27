<script setup lang="ts">
/**
 * Grid 视图：基于 VXE Table 的网格适配器。
 *
 * 业务层只依赖 GridAdapter 接口（setColumns/setRows/updateCell），
 * 换网格组件时不需要改 Field / Record / View 层逻辑。
 */
import { computed, ref, watch } from "vue";
import { VxeGrid } from "vxe-table";
import "vxe-table/dist/style.css";
import {
  CaretBottom,
  CaretTop,
  Document,
  Grid,
  Lock,
  Plus,
} from "@element-plus/icons-vue";
import BaseFieldCell from "../fields/BaseFieldCell.vue";
import BaseColumnMenu from "./BaseColumnMenu.vue";
import { fieldTypeIcon } from "../fields/icons";
import { fieldPlugin } from "../fields/registry";
import { buildPasteCells, cellToText } from "../clipboard";
import type { FieldMeta, RecordRow, SortRule } from "../types";
import { isComputedField } from "../fields/registry";

const props = defineProps<{
  fields: FieldMeta[];
  rows: RecordRow[];
  loading?: boolean;
  fieldWidths?: Record<string, number>;
  /** 视图里隐藏的字段。 */
  hiddenFieldIds?: string[];
  /**
   * 冻结列（§6.3 ViewConfig.frozenFields）：
   * 存的是字段 ID 列表，必须是可见列里从左起连续的 N 列。
   */
  frozenFieldIds?: string[];
  editable?: boolean;
  docTitles?: Record<string, string>;
  docOptions?: Array<{ id: string; title: string }>;
  /** 关联记录字段：记录 ID → 标题。 */
  linkTitles?: Record<string, string>;
  /** 关联记录字段：按目标表分组的候选记录。 */
  linkOptions?: Record<string, Array<{ id: string; title: string }>>;
  /** 当前排序规则（列头菜单显示「已按此列排序」）。 */
  sorts?: SortRule[];
  /** 空间 ID：关联记录远程搜索用。 */
  projectId?: string;
}>();

/** 该字段是否因「条件可见」策略而对本行隐藏。 */
function isCondHidden(row: RecordRow, fieldId: string): boolean {
  return !!row.conditionalHidden?.includes(fieldId);
}

const emit = defineEmits<{
  (
    e: "update-cell",
    payload: { recordId: string; fieldId: string; value: unknown },
  ): void;
  (e: "open-record", recordId: string): void;
  (e: "add-row"): void;
  /** 列头菜单：排序 / 清除排序。 */
  (e: "column-sort", payload: { fieldId: string; order: "asc" | "desc" }): void;
  (e: "column-clear-sort", payload: { fieldId: string }): void;
  /** 列头菜单：筛选此列。 */
  (e: "column-filter", payload: { fieldId: string }): void;
  /** 列头菜单：冻结 / 隐藏 / 列宽 / 编辑字段。 */
  (e: "column-freeze", payload: { fieldId: string }): void;
  (e: "column-hide", payload: { fieldId: string }): void;
  (e: "column-width", payload: { fieldId: string; width: number }): void;
  (e: "column-settings", payload: { fieldId: string }): void;
  (e: "selection-change", ids: string[]): void;
  (e: "open-doc", nodeId: string): void;
  (
    e: "open-record-ref",
    payload: { tableId: string; recordId: string; title: string },
  ): void;
}>();

// —— 键盘导航与剪贴板（对标飞书多维表格 / Excel）——

/** 当前聚焦单元格。 */
const focus = ref<{ rowId: string; fieldId: string } | null>(null);
/** 编辑信号：{key, seq}，seq 变化时命中单元格进入编辑。 */
const editSignal = ref<{ key: string; seq: number }>({ key: "", seq: 0 });

function focusCell(rowId: string, fieldId: string) {
  focus.value = { rowId, fieldId };
}

function focusIndex(): { row: number; col: number } {
  const row = Math.max(
    0,
    props.rows.findIndex((item) => item.id === focus.value?.rowId),
  );
  const col = Math.max(
    0,
    visibleFields.value.findIndex((item) => item.id === focus.value?.fieldId),
  );
  return { row, col };
}

function moveFocus(deltaRow: number, deltaCol: number) {
  if (!visibleFields.value.length || !props.rows.length) return;
  const { row, col } = focusIndex();
  const nextRow = Math.min(props.rows.length - 1, Math.max(0, row + deltaRow));
  const nextCol = Math.min(
    visibleFields.value.length - 1,
    Math.max(0, col + deltaCol),
  );
  const nextField = visibleFields.value[nextCol];
  const nextRecord = props.rows[nextRow];
  if (!nextField || !nextRecord) return;
  focus.value = { rowId: nextRecord.id, fieldId: nextField.id };
}

/** 把单元格值转成复制用的纯文本。 */
function cellText(row: RecordRow, fieldId: string): string {
  return cellToText(row.fields?.[fieldId]);
}

const copyBuffer = ref("");

function onKeydown(event: KeyboardEvent) {
  const meta = event.metaKey || event.ctrlKey;
  if (meta && event.key.toLowerCase() === "c") {
    if (!focus.value) return;
    const row = props.rows.find((item) => item.id === focus.value?.rowId);
    if (!row) return;
    copyBuffer.value = cellText(row, focus.value.fieldId);
    event.preventDefault();
    void navigator.clipboard
      ?.writeText(copyBuffer.value)
      .catch(() => undefined);
    return;
  }
  if (meta && event.key.toLowerCase() === "v") {
    void navigator.clipboard
      ?.readText()
      .then((text) => {
        if (text) applyPaste(text);
      })
      .catch(() => undefined);
    return;
  }
  switch (event.key) {
    case "ArrowUp":
      event.preventDefault();
      moveFocus(-1, 0);
      break;
    case "ArrowDown":
      event.preventDefault();
      moveFocus(1, 0);
      break;
    case "ArrowLeft":
      event.preventDefault();
      moveFocus(0, -1);
      break;
    case "ArrowRight":
      event.preventDefault();
      moveFocus(0, 1);
      break;
    case "Enter":
    case "F2": {
      if (!focus.value) return;
      event.preventDefault();
      editSignal.value = {
        key: `${focus.value.rowId}:${focus.value.fieldId}`,
        seq: editSignal.value.seq + 1,
      };
      break;
    }
    case "Escape":
      focus.value = null;
      break;
    case "Delete":
    case "Backspace": {
      if (!focus.value) return;
      const row = props.rows.find((item) => item.id === focus.value?.rowId);
      if (!row) return;
      event.preventDefault();
      emit("update-cell", {
        recordId: row.id,
        fieldId: focus.value.fieldId,
        value: null,
      });
      break;
    }
    default:
      break;
  }
}

/** 粘贴：以聚焦单元格为起点，按行 × 列写入（TSV）。 */
function applyPaste(text: string) {
  if (!focus.value) return;
  const { row, col } = focusIndex();
  const cells = buildPasteCells({
    text,
    rows: props.rows,
    fields: visibleFields.value,
    startRow: row,
    startCol: col,
    isReadonly: (fieldId) => fieldOf(fieldId)?.type === "formula",
  });
  for (const cell of cells) {
    emit("update-cell", {
      recordId: cell.recordId,
      fieldId: cell.fieldId,
      value: cell.value,
    });
  }
}

function onCopy(event: ClipboardEvent) {
  if (!copyBuffer.value) return;
  event.clipboardData?.setData("text/plain", copyBuffer.value);
  event.preventDefault();
}

function onPaste(event: ClipboardEvent) {
  const text = event.clipboardData?.getData("text/plain") ?? "";
  if (!text) return;
  event.preventDefault();
  applyPaste(text);
}

const visibleFields = computed(() => {
  const hidden = new Set(props.hiddenFieldIds ?? []);
  return props.fields.filter((field) => !hidden.has(field.id));
});

/** 行选择：用自绘复选框，样式与项目其它列表保持一致。 */
const selected = ref<string[]>([]);

watch(
  () => props.rows.map((row) => row.id).join(","),
  () => {
    const ids = new Set(props.rows.map((row) => row.id));
    selected.value = selected.value.filter((id) => ids.has(id));
  },
);

function isSelected(recordId: string) {
  return selected.value.includes(recordId);
}

function toggleRow(recordId: string, checked: boolean) {
  selected.value = checked
    ? [...new Set([...selected.value, recordId])]
    : selected.value.filter((id) => id !== recordId);
  emit("selection-change", selected.value);
}

function toggleAll(checked: boolean) {
  selected.value = checked ? props.rows.map((row) => row.id) : [];
  emit("selection-change", selected.value);
}

const allChecked = computed(
  () => props.rows.length > 0 && selected.value.length === props.rows.length,
);
const someChecked = computed(
  () => selected.value.length > 0 && !allChecked.value,
);

/** 右对齐的字段类型。 */
const NUMERIC_TYPES = new Set(["number", "currency", "percent", "rating"]);

const columns = computed(() => [
  {
    field: "__select",
    width: 44,
    fixed: "left" as const,
    resizable: true,
    slots: { default: "select", header: "selectHeader" },
  },
  {
    // 详情入口：任何字段都能打开记录详情抽屉（对标飞书多维表格的「展开行」）。
    field: "__detail",
    width: 46,
    fixed: "left" as const,
    resizable: false,
    slots: { default: "detail" },
  },
  ...visibleFields.value.map((field, index) => ({
    field: field.id,
    title: field.name,
    width: props.fieldWidths?.[field.id],
    minWidth: props.fieldWidths?.[field.id] ?? (index === 0 ? 200 : 140),
    resizable: true,
    sortable: false,
    // 数字 / 金额 / 百分比右对齐（与飞书多维表格一致，便于纵向比数）。
    align: NUMERIC_TYPES.has(field.type) ? ("right" as const) : undefined,
    // 冻结列：视图配置里声明的字段固定在左侧；首列默认冻结。
    fixed: isFrozen(index) ? ("left" as const) : undefined,
    slots: { default: "cell", header: "fieldHeader" },
  })),
]);

/**
 * 是否冻结该列。
 *
 * 规则：视图声明的冻结字段必须**从左起连续**（第 1、2 列冻结，第 2 列单独冻结无效），
 * 不连续时只保留连续的那一段，避免出现「中间列固定、左右滚动错位」。
 */
function isFrozen(index: number): boolean {
  const frozen = props.frozenFieldIds ?? [];
  if (!frozen.length) return index === 0;
  let count = 0;
  for (const item of visibleFields.value) {
    if (!frozen.includes(item.id)) break;
    count += 1;
  }
  if (count <= 0) return index === 0;
  return index < count;
}

/** 该列当前的排序方向（没有排序规则时为 null）。 */
function sortOrderOf(fieldId: string): "asc" | "desc" | null {
  const rule = (props.sorts ?? []).find((item) => item.fieldId === fieldId);
  if (!rule) return null;
  return rule.order === "desc" ? "desc" : "asc";
}

/** 字段类型中文名（列头 tooltip 用）。 */
function fieldTypeLabel(type: string): string {
  return fieldPlugin(type)?.label ?? "字段";
}

const gridData = computed(() =>
  props.rows.map((row) => ({
    ...row,
    __id: row.id,
  })),
);

function fieldOf(fieldId: string): FieldMeta | undefined {
  return props.fields.find((item) => item.id === fieldId);
}

const fallbackField: FieldMeta = {
  id: "",
  name: "",
  type: "text",
  config: {},
  required: false,
  isPrimary: false,
  sortOrder: 0,
  version: 1,
};

function fieldFor(fieldId: string): FieldMeta {
  return fieldOf(fieldId) ?? { ...fallbackField, id: fieldId, name: fieldId };
}

/**
 * 关联记录字段的目标表 ID。
 *
 * 字段配置里没写 targetTableId 时，用「当前表」兜底（同一张表内自关联）。
 */
function linkTargetTableOf(fieldId: string): string {
  const field = fieldOf(fieldId);
  if (!field || field.type !== "link") return "";
  const target = field.config?.targetTableId;
  return typeof target === "string" ? target : "";
}

function onCellUpdate(recordId: string, fieldId: string, value: unknown) {
  emit("update-cell", { recordId, fieldId, value });
}
</script>

<template>
  <div
    class="base-grid"
    v-loading="loading"
    element-loading-text="加载中"
    tabindex="0"
    @keydown="onKeydown"
    @copy="onCopy"
    @paste="onPaste"
  >
    <!-- 加载骨架（飞书：灰色块占位，不用转圈） -->
    <div v-if="loading && !rows.length" class="base-grid__skeleton">
      <div
        v-for="row in 8"
        :key="row"
        class="base-grid__skeleton-row"
        :style="{ animationDelay: `${row * 60}ms` }"
      >
        <span
          v-for="col in 6"
          :key="col"
          class="base-grid__skeleton-cell"
          :style="{ width: `${40 + ((row * 7 + col * 13) % 45)}%` }"
        />
      </div>
    </div>
    <vxe-grid
      :columns="columns"
      :data="gridData"
      border="none"
      size="small"
      :row-config="{ isHover: true, isCurrent: true }"
      :scroll-y="{ enabled: true, gt: 40 }"
      height="100%"
    >
      <!-- 空态（飞书：灰图标 + 文案 + 主行动按钮） -->
      <template #empty>
        <div class="base-grid__empty">
          <el-icon class="base-grid__empty-icon"><Grid /></el-icon>
          <span class="base-grid__empty-text">暂无记录</span>
          <button
            class="base-grid__empty-btn"
            type="button"
            @click="emit('add-row')"
          >
            新增第一条记录
          </button>
        </div>
      </template>
      <!-- 详情按钮：打开记录详情抽屉（受限记录带锁标记） -->
      <template #detail="{ row }">
        <span class="base-grid__detail-wrap">
          <button
            class="base-grid__detail"
            type="button"
            :title="
              row.visibility === 'restricted'
                ? '记录详情（仅自己可见）'
                : row.visibility === 'custom'
                  ? '记录详情（指定成员可见）'
                  : '记录详情'
            "
            @click.stop="emit('open-record', row.id)"
          >
            <el-icon><Document /></el-icon>
          </button>
          <el-icon
            v-if="
              row.visibility === 'restricted' || row.visibility === 'custom'
            "
            class="base-grid__detail-lock"
            title="仅自己可见"
          >
            <Lock />
          </el-icon>
        </span>
      </template>
      <template #selectHeader>
        <el-checkbox
          :model-value="allChecked"
          :indeterminate="someChecked"
          @change="(checked: boolean) => toggleAll(checked)"
        />
      </template>
      <!-- 列头：字段名 + 类型图标（飞书多维表格同款，一眼看出每列是什么类型） -->
      <template #fieldHeader="{ column }">
        <span class="base-grid__head">
          <el-icon
            class="base-grid__head-icon"
            :title="`字段类型：${fieldTypeLabel(fieldFor(column.field).type)}`"
          >
            <component :is="fieldTypeIcon(fieldFor(column.field).type)" />
          </el-icon>
          <span class="base-grid__head-title">{{
            column.title || "未命名字段"
          }}</span>
          <!-- 排序标记（飞书：字段名右侧的小箭头） -->
          <el-icon
            v-if="sortOrderOf(column.field)"
            class="base-grid__head-sort"
            :title="sortOrderOf(column.field) === 'asc' ? '升序' : '降序'"
          >
            <CaretTop v-if="sortOrderOf(column.field) === 'asc'" />
            <CaretBottom v-else />
          </el-icon>
          <el-icon
            v-if="fieldFor(column.field).readOnly"
            class="base-grid__head-lock"
            title="当前角色只读"
          >
            <Lock />
          </el-icon>
          <BaseColumnMenu
            :field="fieldFor(column.field)"
            :sort-order="sortOrderOf(column.field)"
            :frozen="frozenFieldIds?.includes(column.field) ?? false"
            @sort="emit('column-sort', $event)"
            @clear-sort="emit('column-clear-sort', $event)"
            @filter="emit('column-filter', $event)"
            @freeze="emit('column-freeze', $event)"
            @hide="emit('column-hide', $event)"
            @width="emit('column-width', $event)"
            @settings="emit('column-settings', $event)"
          />
        </span>
      </template>
      <template #select="{ row }">
        <el-checkbox
          :model-value="isSelected(row.id)"
          @change="(checked: boolean) => toggleRow(row.id, checked)"
        />
      </template>
      <template #cell="{ row, column }">
        <div
          class="base-grid__cell"
          @click.stop="focusCell(row.id, column.field)"
          @dblclick.stop="focusCell(row.id, column.field)"
        >
          <BaseFieldCell
            :field="fieldFor(column.field)"
            :model-value="row.fields?.[column.field]"
            :editable="
              editable &&
              !isComputedField(fieldFor(column.field).type) &&
              !fieldFor(column.field).readOnly &&
              !isCondHidden(row, column.field)
            "
            :hidden-by-condition="isCondHidden(row, column.field)"
            :row-id="row.id"
            :focused="
              focus?.rowId === row.id && focus?.fieldId === column.field
            "
            :edit-signal="editSignal"
            :doc-titles="docTitles"
            :doc-options="docOptions"
            :link-titles="linkTitles"
            :link-options="linkOptions?.[linkTargetTableOf(column.field)] ?? []"
            :link-target-table-id="linkTargetTableOf(column.field)"
            :project-id="projectId"
            @update:model-value="
              (value) => onCellUpdate(row.id, column.field, value)
            "
            @request-detail="emit('open-record', row.id)"
            @open-doc="(nodeId) => emit('open-doc', nodeId)"
            @open-record-ref="(payload) => emit('open-record-ref', payload)"
          />
        </div>
      </template>
    </vxe-grid>
    <div class="base-grid__footer">
      <el-button text size="small" @click="emit('add-row')">
        <el-icon><Plus /></el-icon>新增记录
      </el-button>
      <span class="base-grid__count">共 {{ rows.length }} 行</span>
    </div>
  </div>
</template>

<style scoped>
.base-grid__detail-wrap {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.base-grid__detail-lock {
  font-size: 12px;
  color: var(--tg-warning, #f59e0b);
}

.base-grid__detail {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--tg-radius-xs);
  background: transparent;
  color: var(--tg-text-3);
  cursor: pointer;
  transition:
    background var(--tg-dur) var(--tg-ease),
    color var(--tg-dur) var(--tg-ease);
}
.base-grid__detail:hover {
  background: var(--tg-surface-3);
  color: var(--tg-blue);
}
.base-grid {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  outline: none;
  position: relative;
}

/*
 * 网格占满剩余高度，底部「+ 新增记录 / 共 N 行」条始终贴底可见
 * （原来靠 height:100% 会把底部条挤出可视区）。
 */
.base-grid > .vxe-grid {
  flex: 1;
  min-height: 0;
}

.base-grid__cell {
  min-height: 24px;
  width: 100%;
}

/* 列头：类型图标 + 字段名 */
.base-grid__head {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}
.base-grid__head-icon {
  font-size: 13px;
  flex-shrink: 0;
}
.base-grid__head-sort {
  font-size: 12px;
  color: var(--fs-blue, #3370ff);
  flex: none;
}

.base-grid__head-lock {
  font-size: 12px;
  color: var(--tg-text-3, #94a3b8);
}

.base-grid__head-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.base-grid__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  height: 40px;
  border-top: 1px solid var(--fs-border-light, #eff0f1);
  font-size: 12px;
  color: var(--fs-text-3, #8f959e);
  background: #fff;
}

.base-grid__footer .el-button {
  color: var(--fs-blue, #3370ff);
  font-size: 13px;
  padding: 0;
  height: 28px;
}

.base-grid__footer .el-button:hover {
  background: var(--fs-bg-hover, #f2f3f5);
  color: var(--fs-blue-hover, #245bdb);
}
/* —— 加载骨架（飞书：灰色块渐次呼吸）—— */
.base-grid__skeleton {
  position: absolute;
  inset: 0;
  z-index: 5;
  padding: 40px 12px 0;
  background: #fff;
  overflow: hidden;
}

.base-grid__skeleton-row {
  display: flex;
  align-items: center;
  gap: 24px;
  height: 40px;
  border-bottom: 1px solid var(--fs-border-light, #eff0f1);
}

.base-grid__skeleton-cell {
  height: 10px;
  border-radius: 4px;
  background: linear-gradient(90deg, #f2f3f5 25%, #e9eaec 37%, #f2f3f5 63%);
  background-size: 400% 100%;
  animation: base-skeleton 1.4s ease infinite;
}

@keyframes base-skeleton {
  0% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0 50%;
  }
}

/* —— 空态 —— */
.base-grid__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 48px 0;
}

.base-grid__empty-icon {
  font-size: 40px;
  color: var(--fs-text-disabled, #bbbfc4);
}

.base-grid__empty-text {
  font-size: 13px;
  color: var(--fs-text-3, #8f959e);
}

.base-grid__empty-btn {
  height: 30px;
  padding: 0 14px;
  border: 1px solid var(--fs-border, #dee0e3);
  border-radius: var(--fs-radius, 6px);
  background: #fff;
  color: var(--fs-blue, #3370ff);
  font-size: 13px;
  cursor: pointer;
  transition:
    border-color 160ms cubic-bezier(0.2, 0.8, 0.3, 1),
    background-color 160ms cubic-bezier(0.2, 0.8, 0.3, 1);
}

.base-grid__empty-btn:hover {
  border-color: var(--fs-blue, #3370ff);
  background: var(--fs-blue-soft, #eef3ff);
}
</style>
