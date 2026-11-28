<script setup lang="ts">
/**
 * Grid 视图：基于 VXE Table 的网格适配器。
 *
 * 业务层只依赖 GridAdapter 接口（setColumns/setRows/updateCell），
 * 换网格组件时不需要改 Field / Record / View 层逻辑。
 */
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import type { Component } from "vue";
import { VxeGrid } from "vxe-table";
import "vxe-table/dist/style.css";
import {
  CaretBottom,
  CaretTop,
  CopyDocument,
  Delete,
  Document,
  DocumentCopy,
  Filter,
  Grid,
  Hide,
  Lock,
  Plus,
  Tickets,
  Sort,
  Unlock,
  Operation,
  Rank,
  Setting, MagicStick,
} from "@element-plus/icons-vue";
import BaseFieldCell from "../fields/BaseFieldCell.vue";
import BaseColumnMenu from "./BaseColumnMenu.vue";
import { fieldTypeIcon } from "../fields/icons";
import { fieldPlugin } from "../fields/registry";
import { buildPasteCells, cellToText } from "../clipboard";
import type { FieldMeta, RecordRow, SortRule } from "../types";
import { isComputedField, isSnapshotField } from "../fields/registry";

const props = defineProps<{
  fields: FieldMeta[];
  rows: RecordRow[];
  loading?: boolean;
  fieldWidths?: Record<string, number>;
  /** 视图里隐藏的字段。 */
  hiddenFieldIds?: string[];
  /**
   * 列顺序（视图级个人偏好，存字段 ID 数组）。
   *
   * 不在数组里的字段按原有顺序排在后面（新增字段不会消失）。
   */
  fieldOrder?: string[];
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
  /** 列头菜单：重算引用 / 汇总（计算列的值可能是旧快照）。 */
  (e: "column-recalc", payload: { fieldId: string }): void;
  /** 拖拽表头调整列顺序（写视图个人偏好）。 */
  (
    e: "column-reorder",
    payload: {
      fieldId: string;
      targetFieldId: string;
      position: "before" | "after";
    },
  ): void;
  (e: "selection-change", ids: string[]): void;
  /**
   * 批量拖拽排序：把选中的若干行拖到目标行之前 / 之后。
   * ids 是被拖动的行 ID（保持它们当前的相对顺序），targetId + position 决定落点。
   */
  (e: "rows-reorder", payload: { ids: string[]; targetId: string; position: "before" | "after" }): void;
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

/**
 * Tab / Shift+Tab 线性移动（飞书 / Excel）。
 *
 * 到行尾自动回到下一行首格，回车到上一行末格；
 * 没有下一行 / 上一行时停在当前边界格，不丢焦点。
 */
function moveFocusLinear(direction: 1 | -1) {
  if (!visibleFields.value.length || !props.rows.length) return;
  const { row, col } = focusIndex();
  const colCount = visibleFields.value.length;
  const rowCount = props.rows.length;
  let nextRow = row;
  let nextCol = col + direction;
  if (nextCol >= colCount) {
    nextCol = 0;
    nextRow = row + 1;
    if (nextRow >= rowCount) return; // 最后一行末格：停住
  } else if (nextCol < 0) {
    nextCol = colCount - 1;
    nextRow = row - 1;
    if (nextRow < 0) return; // 第一行首格：停住
  }
  const nextField = visibleFields.value[nextCol];
  const nextRecord = props.rows[nextRow];
  if (!nextField || !nextRecord) return;
  focus.value = { rowId: nextRecord.id, fieldId: nextField.id };
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
    case "Tab": {
      // 飞书 / Excel：Tab 跳下一格，Shift+Tab 回上一格
      if (!focus.value) return;
      event.preventDefault();
      moveFocusLinear(event.shiftKey ? -1 : 1);
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
  const list = props.fields.filter((field) => !hidden.has(field.id));
  const order = props.fieldOrder ?? [];
  if (!order.length) return list;
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...list].sort((a, b) => {
    const ra = rank.get(a.id);
    const rb = rank.get(b.id);
    // 未出现在顺序表里的字段（新增字段）排到最后，保持相对顺序。
    if (ra === undefined && rb === undefined) return 0;
    if (ra === undefined) return 1;
    if (rb === undefined) return -1;
    return ra - rb;
  });
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

/**
 * 列宽来源：拖拽中的临时值 > 视图配置 > 默认值。
 *
 * 拖拽时先改本地值（保证跟手），松手再冒泡给上层写进视图配置。
 */
const dragWidths = ref<Record<string, number>>({});

function widthOf(fieldId: string, index: number): number {
  return (
    dragWidths.value[fieldId] ??
    props.fieldWidths?.[fieldId] ??
    (index === 0 ? 200 : 140)
  );
}

const MIN_COL_WIDTH = 80;
const MAX_COL_WIDTH = 600;

/** 列宽拖拽（自研把手）。 */
function startResize(event: MouseEvent, field: FieldMeta, index: number) {
  event.preventDefault();
  event.stopPropagation();
  const startX = event.clientX;
  const startWidth = widthOf(field.id, index);
  let next = startWidth;

  const onMove = (move: MouseEvent) => {
    next = Math.min(
      MAX_COL_WIDTH,
      Math.max(MIN_COL_WIDTH, Math.round(startWidth + (move.clientX - startX))),
    );
    dragWidths.value = { ...dragWidths.value, [field.id]: next };
  };
  const onUp = () => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    if (next !== startWidth) {
      emit("column-width", { fieldId: field.id, width: next });
    }
  };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}

/**
 * 自动适应列宽（双击列宽把手 / 表头右键「自动适应列宽」）。
 *
 * 按**当前列内容**的最长文本估算：中文按 13px、英文按 7px 折算，
 * 再加上单元格左右内边距，最后夹取到 [80, 600]。
 */
function autoFitWidth(fieldId: string) {
  const field = fieldOf(fieldId);
  if (!field) return;
  let longest = 0;
  for (const row of props.rows) {
    const text = cellText(row, fieldId);
    // 中文按 13px / 其它字符按 7px 估算显示宽度。
    const width = Array.from(text).reduce(
      (sum, ch) => sum + (/[\u4e00-\u9fa5]/.test(ch) ? 13 : 7),
      0,
    );
    if (width > longest) longest = width;
  }
  const nameWidth = Array.from(field.name).reduce(
    (sum, ch) => sum + (/[\u4e00-\u9fa5]/.test(ch) ? 13 : 8),
    0,
  );
  const width = Math.min(
    MAX_COL_WIDTH,
    Math.max(MIN_COL_WIDTH, Math.max(longest + 32, nameWidth + 88)),
  );
  dragWidths.value = { ...dragWidths.value, [fieldId]: width };
  emit("column-width", { fieldId, width });
}

/* —— 拖拽表头调整列顺序（飞书：视图级列顺序）—— */

/** 正在被拖动的字段。 */
const dragFieldId = ref<string | null>(null);
/** 拖拽落点：目标字段 + 插到它前面还是后面。 */
const dropTarget = ref<{
  fieldId: string;
  position: "before" | "after";
} | null>(null);

function onHeadDragStart(event: DragEvent, fieldId: string) {
  dragFieldId.value = fieldId;
  event.dataTransfer?.setData("text/plain", fieldId);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}

function onHeadDragOver(event: DragEvent, fieldId: string) {
  if (!dragFieldId.value || dragFieldId.value === fieldId) return;
  // 必须 preventDefault，否则浏览器不会派发 drop 事件。
  event.preventDefault();
  const el = event.currentTarget as HTMLElement | null;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const position =
    event.clientX - rect.left < rect.width / 2 ? "before" : "after";
  if (
    dropTarget.value?.fieldId !== fieldId ||
    dropTarget.value?.position !== position
  ) {
    dropTarget.value = { fieldId, position };
  }
}

function onHeadDrop(_event: DragEvent, _fieldId: string) {
  const from = dragFieldId.value;
  const target = dropTarget.value;
  if (from && target && from !== target.fieldId) {
    emit("column-reorder", {
      fieldId: from,
      targetFieldId: target.fieldId,
      position: target.position,
    });
  }
  onHeadDragEnd();
}

function onHeadDragEnd() {
  dragFieldId.value = null;
  dropTarget.value = null;
}

/** 拖拽中的插入指示：落在目标列的左半 / 右半。 */
function dropClassOf(fieldId: string) {
  const target = dropTarget.value;
  if (!target || target.fieldId !== fieldId) return "";
  return target.position === "before" ? "is-drop-before" : "is-drop-after";
}

/** 右对齐的字段类型。 */
const NUMERIC_TYPES = new Set(["number", "currency", "percent", "rating"]);

// —— 批量拖拽排序 ——

/** 正在拖动的行 ID 集合（保持当前相对顺序）。 */
const dragRowIds = ref<string[]>([]);
/** 当前拖动经过的行（用于高亮落点）。 */
const dragOverRow = ref<{ id: string; position: "before" | "after" } | null>(null);

/** 开始拖动：拖的是「选中集合」还是「当前行」。 */
function onRowDragStart(event: DragEvent, rowId: string) {
  const ids = selected.value.includes(rowId)
    ? selected.value.filter((id) => props.rows.some((row) => row.id === id))
    : [rowId];
  if (!ids.length) return;
  dragRowIds.value = ids;
  event.dataTransfer?.setData("text/plain", ids.join(","));
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}

/** 拖动经过某行：按鼠标在行内的上下半区决定「插到前面 / 后面」。 */
function onRowDragOver(event: DragEvent, rowId: string) {
  if (!dragRowIds.value.length) return;
  event.preventDefault();
  const el = event.currentTarget as HTMLElement | null;
  let position: "before" | "after" = "before";
  if (el) {
    const rect = el.getBoundingClientRect();
    position = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
  }
  dragOverRow.value = { id: rowId, position };
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
}

/** 放下：把拖动的行放到目标位置。 */
function onRowDrop(event: DragEvent, rowId: string) {
  event.preventDefault();
  const ids = dragRowIds.value;
  const position = (dragOverRow.value?.position ?? "before") as
    | "before"
    | "after";
  dragOverRow.value = null;
  dragRowIds.value = [];
  if (!ids.length) return;
  if (ids.includes(rowId)) return;
  emit("rows-reorder", { ids, targetId: rowId, position });
}

/** 结束拖动：清状态。 */
function onRowDragEnd() {
  dragRowIds.value = [];
  dragOverRow.value = null;
}

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
    width: widthOf(field.id, index),
    minWidth: widthOf(field.id, index),
    // 列宽由自研拖拽把手控制（拖完即存视图配置），
    // 关掉 vxe 自带把手，避免两套把手打架。
    resizable: false,
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

/* —— 单元格右键菜单（飞书多维表格同款）—— */

/** 右键菜单上下文；null 表示不显示。 */
const ctxMenu = ref<{
  x: number;
  y: number;
  /** cell = 单元格菜单；head = 表头菜单（飞书两套菜单项不同）。 */
  kind: "cell" | "head";
  fieldId: string;
  /** 单元格菜单才有记录 ID；表头菜单为空串。 */
  recordId: string;
  sortOrder?: "asc" | "desc" | null;
  frozen?: boolean;
} | null>(null);

/** 落位后按实际尺寸回夹，保证菜单完整可见。 */
async function placeCtxMenu(payload: NonNullable<typeof ctxMenu.value>) {
  ctxMenu.value = payload;
  await nextTick();
  const panel = document.querySelector(".be-ctxmenu__panel");
  if (!panel) return;
  const rect = panel.getBoundingClientRect();
  let x = payload.x;
  let y = payload.y;
  if (x + rect.width + 8 > window.innerWidth) {
    x = Math.max(8, window.innerWidth - rect.width - 8);
  }
  if (y + rect.height + 8 > window.innerHeight) {
    y = Math.max(8, window.innerHeight - rect.height - 8);
  }
  ctxMenu.value = { ...payload, x, y };
}

async function onCellContextMenu(
  event: MouseEvent,
  row: RecordRow,
  fieldId: string,
) {
  // 右键即把焦点移到该格，粘贴 / 清空都作用在右键的那一格。
  focusCell(row.id, fieldId);
  await placeCtxMenu({
    x: event.clientX,
    y: event.clientY,
    kind: "cell",
    fieldId,
    recordId: row.id,
  });
}

/** 表头右键菜单（飞书：与列头 ▾ 菜单同源，只是入口不同）。 */
async function onHeadContextMenu(event: MouseEvent, field: FieldMeta) {
  await placeCtxMenu({
    x: event.clientX,
    y: event.clientY,
    kind: "head",
    fieldId: field.id,
    recordId: "",
    sortOrder: sortOrderOf(field.id),
    frozen: props.frozenFieldIds?.includes(field.id) ?? false,
  });
}

function closeCtxMenu() {
  ctxMenu.value = null;
}

/** 右键菜单项（单元格 / 表头两套）。 */
interface CtxItem {
  key: string;
  label: string;
  icon: Component;
  /** 前面是否插入分隔线。 */
  sep?: boolean;
  run: () => void;
}

const ctxItems = computed<CtxItem[]>(() => {
  const m = ctxMenu.value;
  if (!m) return [];
  const fieldId = m.fieldId;
  if (m.kind === "head") {
    const items: CtxItem[] = [
      {
        key: "asc",
        label: "按此列升序",
        icon: CaretTop,
        run: () => emit("column-sort", { fieldId, order: "asc" }),
      },
      {
        key: "desc",
        label: "按此列降序",
        icon: CaretBottom,
        run: () => emit("column-sort", { fieldId, order: "desc" }),
      },
    ];
    if (m.sortOrder) {
      items.push({
        key: "clear",
        label: "清除本列排序",
        icon: Sort,
        run: () => emit("column-clear-sort", { fieldId }),
      });
    }
    items.push(
      {
        key: "filter",
        label: "筛选此列",
        icon: Filter,
        run: () => emit("column-filter", { fieldId }),
      },
      {
        key: "freeze",
        label: m.frozen ? "取消冻结此列" : "冻结此列",
        icon: m.frozen ? Unlock : Lock,
        sep: true,
        run: () => emit("column-freeze", { fieldId }),
      },
      {
        key: "hide",
        label: "隐藏此列",
        icon: Hide,
        run: () => emit("column-hide", { fieldId }),
      },
      {
        key: "fit",
        label: "自动适应列宽",
        icon: Operation,
        sep: true,
        run: () => autoFitWidth(fieldId),
      },
      {
        key: "settings",
        label: "编辑字段",
        icon: Setting,
        run: () => emit("column-settings", { fieldId }),
      },
    );
    return items;
  }
  return [
    {
      key: "copy",
      label: "复制单元格",
      icon: CopyDocument,
      run: () => ctxCopy(),
    },
    {
      key: "paste",
      label: "粘贴到此处",
      icon: DocumentCopy,
      run: () => ctxPaste(),
    },
    {
      key: "clear",
      label: "清空内容",
      icon: Delete,
      run: () => ctxClear(),
    },
    {
      key: "record",
      label: "打开记录详情",
      icon: Tickets,
      run: () => ctxOpenRecord(),
    },
    {
      key: "asc",
      label: "按此列升序",
      icon: CaretTop,
      sep: true,
      run: () => emit("column-sort", { fieldId, order: "asc" }),
    },
    {
      key: "desc",
      label: "按此列降序",
      icon: CaretBottom,
      run: () => emit("column-sort", { fieldId, order: "desc" }),
    },
    {
      key: "filter",
      label: "筛选此列",
      icon: Filter,
      run: () => emit("column-filter", { fieldId }),
    },
    {
      key: "freeze",
      label: "冻结此列",
      icon: Lock,
      sep: true,
      run: () => emit("column-freeze", { fieldId }),
    },
    {
      key: "hide",
      label: "隐藏此列",
      icon: Hide,
      run: () => emit("column-hide", { fieldId }),
    },
  ];
});

/** 点击菜单外部 / 按 Esc / 滚动 / 缩放时收起右键菜单（飞书行为）。 */
function onGlobalPointerDown(event: MouseEvent) {
  if (!ctxMenu.value) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest?.(".be-ctxmenu")) return;
  closeCtxMenu();
}

function onGlobalKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && ctxMenu.value) closeCtxMenu();
}

onMounted(() => {
  window.addEventListener("mousedown", onGlobalPointerDown, true);
  window.addEventListener("keydown", onGlobalKeydown);
  window.addEventListener("scroll", closeCtxMenu, true);
  window.addEventListener("resize", closeCtxMenu);
});

onBeforeUnmount(() => {
  window.removeEventListener("mousedown", onGlobalPointerDown, true);
  window.removeEventListener("keydown", onGlobalKeydown);
  window.removeEventListener("scroll", closeCtxMenu, true);
  window.removeEventListener("resize", closeCtxMenu);
});

/** 右键菜单动作：复制单元格。 */
function ctxCopy() {
  if (!ctxMenu.value) return;
  const row = props.rows.find((item) => item.id === ctxMenu.value?.recordId);
  if (!row) return;
  const text = cellText(row, ctxMenu.value.fieldId);
  void navigator.clipboard?.writeText(text).catch(() => undefined);
  closeCtxMenu();
}

/**
 * 右键菜单动作：粘贴到该单元格。
 *
 * 右键时已经把焦点移到目标格，所以直接复用键盘粘贴的同一套逻辑
 * （以焦点为起点按 TSV 展开），不会出现两套粘贴行为不一致。
 */
function ctxPaste() {
  if (!ctxMenu.value) return;
  void navigator.clipboard
    ?.readText()
    .then((text) => {
      if (text) applyPaste(text);
    })
    .catch(() => undefined);
  closeCtxMenu();
}

/** 右键菜单动作：清空该单元格。 */
function ctxClear() {
  if (!ctxMenu.value) return;
  emit("update-cell", {
    recordId: ctxMenu.value.recordId,
    fieldId: ctxMenu.value.fieldId,
    value: null,
  });
  closeCtxMenu();
}

/** 右键菜单动作：打开记录详情。 */
function ctxOpenRecord() {
  if (!ctxMenu.value) return;
  emit("open-record", ctxMenu.value.recordId);
  closeCtxMenu();
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
        <span
          class="base-grid__head"
          :class="[
            dropClassOf(column.field),
            { 'is-dragging': dragFieldId === column.field },
          ]"
          draggable="true"
          title="拖动可调整列顺序"
          @dragstart="onHeadDragStart($event, column.field)"
          @dragover="onHeadDragOver($event, column.field)"
          @drop="onHeadDrop($event, column.field)"
          @dragend="onHeadDragEnd"
          @contextmenu.prevent="
            onHeadContextMenu($event, fieldFor(column.field))
          "
        >
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
          <!-- 计算列（引用 / 汇总）的值是「最近一次重算的结果」，
               不是实时值 —— 给个标识 + 说明，别让用户把它当成实时数据。 -->
          <el-icon
            v-if="isSnapshotField(fieldFor(column.field).type)"
            class="base-grid__head-computed"
            title="计算字段：值为最近一次重算的结果。改动关联表后会自动重算，也可以从列菜单里手动重算。"
          >
            <MagicStick />
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
            @recalc="emit('column-recalc', $event)"
          />
          <!-- 列宽拖拽把手（飞书：列头右侧竖线，拖完即存视图配置；双击自动适应） -->
          <span
            class="base-grid__resize"
            title="拖动调整列宽，双击自动适应"
            @mousedown.stop="
              startResize(
                $event,
                fieldFor(column.field),
                visibleFields.indexOf(fieldFor(column.field)),
              )
            "
            @dblclick.stop="autoFitWidth(column.field)"
          />
        </span>
      </template>
      <template #select="{ row }">
        <div
          class="base-grid__select"
          :class="{
            'is-dragging': dragRowIds.includes(row.id),
            'is-drop-before':
              dragOverRow?.id === row.id &&
              dragOverRow?.position === 'before',
            'is-drop-after':
              dragOverRow?.id === row.id &&
              dragOverRow?.position === 'after',
          }"
          @dragover="onRowDragOver($event, row.id)"
          @drop="onRowDrop($event, row.id)"
        >
          <el-checkbox
            :model-value="isSelected(row.id)"
            @change="(checked: boolean) => toggleRow(row.id, checked)"
          />
          <span
            class="base-grid__drag-handle"
            draggable="true"
            title="拖动可调整行顺序（多选时可整批拖动）"
            @dragstart="onRowDragStart($event, row.id)"
            @dragend="onRowDragEnd"
            @click.stop
          >
            <el-icon><Rank /></el-icon>
          </span>
        </div>
      </template>
      <template #cell="{ row, column }">
        <div
          class="base-grid__cell"
          @click.stop="focusCell(row.id, column.field)"
          @dblclick.stop="focusCell(row.id, column.field)"
          @contextmenu.prevent="onCellContextMenu($event, row, column.field)"
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
    <!-- 单元格右键菜单（飞书多维表格同款） -->
    <Teleport to="body">
      <div
        v-if="ctxMenu"
        class="be-ctxmenu"
        :style="{ left: `${ctxMenu.x}px`, top: `${ctxMenu.y}px` }"
        @click="closeCtxMenu"
      >
        <div class="be-ctxmenu__panel" @click.stop>
          <template v-for="item in ctxItems" :key="item.key">
            <div v-if="item.sep" class="be-ctxmenu__sep" />
            <button
              class="be-ctxmenu__item"
              type="button"
              @click="
                item.run();
                closeCtxMenu();
              "
            >
              <el-icon><component :is="item.icon" /></el-icon>
              <span>{{ item.label }}</span>
            </button>
          </template>
        </div>
      </div>
    </Teleport>

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

/* 计算列（引用 / 汇总）标识：淡紫，和「只读锁」区分开。 */
.base-grid__head-computed {
  font-size: 12px;
  color: #7c5cff;
  flex: none;
  cursor: help;
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

<style scoped>
.base-grid__select {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.base-grid__drag-handle {
  position: absolute;
  left: 2px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 20px;
  color: var(--tg-text-3);
  cursor: grab;
  opacity: 0;
  transition: opacity 0.16s cubic-bezier(0.2, 0.8, 0.3, 1);
}

.vxe-body--row:hover .base-grid__drag-handle,
.base-grid__drag-handle:focus-visible,
.base-grid__drag-handle:hover {
  opacity: 1;
}

.base-grid__drag-handle:active {
  cursor: grabbing;
}

.base-grid__select.is-dragging {
  opacity: 0.5;
}

.base-grid__select.is-drop-before::before,
.base-grid__select.is-drop-after::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--tg-blue, #3390ec);
  border-radius: 1px;
}

.base-grid__select.is-drop-before::before {
  top: -1px;
}

.base-grid__select.is-drop-after::after {
  bottom: -1px;
}
</style>
