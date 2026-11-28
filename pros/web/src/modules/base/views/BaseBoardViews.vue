<script setup lang="ts">
/**
 * 看板 / 日历 / 画廊视图。
 *
 * 三种视图共用同一份记录数据，只是组织方式不同 —— 数据与视图分离。
 */
import { computed, ref } from "vue";
import { ArrowLeft, ArrowRight, Grid, Plus } from "@element-plus/icons-vue";
import BaseFieldCell from "../fields/BaseFieldCell.vue";
import type { FieldMeta, RecordRow, ViewConfig, ViewType } from "../types";
import { isComputedField } from "../fields/registry";

const props = defineProps<{
  type: Extract<ViewType, "kanban" | "calendar" | "gallery">;
  fields: FieldMeta[];
  rows: RecordRow[];
  groupFieldId?: string;
  editable?: boolean;
  /** 视图配置（画廊卡片字段从 layout.galleryFields 取）。 */
  viewConfig?: ViewConfig;
  /** 关联记录字段：记录 ID → 标题。 */
  linkTitles?: Record<string, string>;
  /** 关联记录字段：按目标表分组的候选记录。 */
  linkOptions?: Record<string, Array<{ id: string; title: string }>>;
  /** 空间 ID：关联记录远程搜索用。 */
  projectId?: string;
}>();

const emit = defineEmits<{
  (
    e: "update-cell",
    payload: { recordId: string; fieldId: string; value: unknown },
  ): void;
  (e: "open-record", recordId: string): void;
  (e: "add-row", groupKey?: string): void;
  /** 画廊手动排序：给出目标顺序的记录 ID 列表。 */
  (e: "reorder", ids: string[]): void;
  (
    e: "open-record-ref",
    payload: { tableId: string; recordId: string; title: string },
  ): void;
}>();

const monthOffset = ref(0);
/** 看板拖拽：正在拖动的记录、悬停的目标列。 */
const draggingId = ref("");
const dragOverKey = ref("");

const coverField = computed(() =>
  props.fields.find((f) => f.type === "attachment"),
);

/** 关联记录字段的目标表 ID（未配置时用当前表兜底）。 */
function linkTargetTableOf(fieldId: string): string {
  const field = props.fields.find((item) => item.id === fieldId);
  if (!field || field.type !== "link") return "";
  const target = field.config?.targetTableId;
  return typeof target === "string" ? target : "";
}

/** 画廊卡片展示的字段：优先用视图配置里勾选的字段，否则取前 2 个非主字段。 */
const galleryFields = computed<FieldMeta[]>(() => {
  const configured = (
    props.viewConfig?.layout as { galleryFields?: string[] } | undefined
  )?.galleryFields;
  if (Array.isArray(configured) && configured.length) {
    return configured
      .map((id) => props.fields.find((f) => f.id === id))
      .filter((f): f is FieldMeta => Boolean(f));
  }
  return props.fields
    .filter((f) => !f.isPrimary && f.type !== "formula")
    .slice(0, 2);
});
const titleField = computed(
  () => props.fields.find((f) => f.isPrimary) ?? props.fields[0],
);

function cellValue(row: RecordRow, fieldId?: string) {
  if (!fieldId) return undefined;
  return row.fields?.[fieldId];
}

function primaryText(row: RecordRow) {
  const field = titleField.value;
  if (!field) return "未命名";
  const value = cellValue(row, field.id);
  return value === undefined || value === null || value === ""
    ? "未命名"
    : String(value);
}

// —— 看板 ——

const groupField = computed(() =>
  props.fields.find((f) => f.id === props.groupFieldId),
);

const groups = computed(() => {
  const field = groupField.value;
  if (!field) return [{ key: "全部", rows: props.rows }];
  const map = new Map<string, RecordRow[]>();
  // 预置字段的全部选项：空列也能作为拖拽目标。
  const presets = Array.isArray(field.config?.options)
    ? (field.config.options as unknown[]).map((item) => String(item))
    : [];
  for (const preset of presets) map.set(preset, []);
  for (const row of props.rows) {
    const raw = cellValue(row, field.id);
    const keys = Array.isArray(raw)
      ? raw.map(String)
      : raw === undefined || raw === null || raw === ""
        ? ["未分类"]
        : [String(raw)];
    for (const key of keys) {
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
  }
  return [...map.entries()].map(([key, rows]) => ({ key, rows }));
});

/** 拖拽落列：把记录的分组字段改成目标列的值。 */
function onDragStart(row: RecordRow, event?: DragEvent) {
  draggingId.value = row.id;
  // HTML5 拖拽必须写一次 data，否则部分浏览器不会触发 drop。
  if (event?.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", row.id);
  }
}

function onDragEnd() {
  draggingId.value = "";
  dragOverKey.value = "";
}

function onDragOver(key: string) {
  if (!draggingId.value) return;
  dragOverKey.value = key;
}

function onDrop(key: string) {
  const field = groupField.value;
  const recordId = draggingId.value;
  onDragEnd();
  if (!field || !recordId || key === "全部") return;
  const row = props.rows.find((item) => item.id === recordId);
  if (!row) return;
  const current = cellValue(row, field.id);
  if (field.type === "multi_select") {
    const list = Array.isArray(current) ? current.map(String) : [];
    if (!list.includes(key))
      emit("update-cell", {
        recordId,
        fieldId: field.id,
        value: [...list, key],
      });
    return;
  }
  if (String(current ?? "") === key) return;
  emit("update-cell", { recordId, fieldId: field.id, value: key });
}

// —— 画廊 ——

/** 画廊拖拽排序：正在拖动的卡片、悬停的目标卡片。 */
const dragOverTile = ref("");

function onTileDragStart(row: RecordRow, event?: DragEvent) {
  if (!props.editable) return;
  draggingId.value = row.id;
  if (event?.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", row.id);
  }
}

/** 把拖动的卡片放到目标卡片之前，产出新的顺序。 */
function onTileDrop(target: RecordRow) {
  const recordId = draggingId.value;
  dragOverTile.value = "";
  if (!recordId || recordId === target.id) {
    onDragEnd();
    return;
  }
  const ids = props.rows.map((item) => item.id);
  const from = ids.indexOf(recordId);
  const to = ids.indexOf(target.id);
  if (from < 0 || to < 0) {
    onDragEnd();
    return;
  }
  ids.splice(to, 0, ids.splice(from, 1)[0]);
  onDragEnd();
  emit("reorder", ids);
}

// —— 日历 ——

const baseDate = computed(() => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + monthOffset.value, 1);
});

const calendarDays = computed(() => {
  const year = baseDate.value.getFullYear();
  const month = baseDate.value.getMonth();
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  const days: { key: string; date: Date; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    days.push({ key, date, inMonth: date.getMonth() === month });
  }
  return days;
});

const dateField = computed(() =>
  props.fields.find((f) => f.type === "date" || f.type === "datetime"),
);

/** 日历拖拽：当前悬停的日期格。 */
const dragOverDay = ref("");

/** 把记录拖到某一天 = 改写它的日期字段。 */
function onDayDragOver(dayKey: string) {
  if (!draggingId.value) return;
  dragOverDay.value = dayKey;
}

function onDayDrop(dayKey: string) {
  const field = dateField.value;
  const recordId = draggingId.value;
  dragOverDay.value = "";
  if (!field || !recordId) return;
  const row = props.rows.find((item) => item.id === recordId);
  if (!row) return;
  const current = String(cellValue(row, field.id) ?? "").slice(0, 10);
  if (current === dayKey) return;
  emit("update-cell", { recordId, fieldId: field.id, value: dayKey });
  // 拖到相邻月的格子时自动切到目标月，否则记录会「消失」在别的月份。
  const [y, m] = dayKey.split("-").map(Number);
  const base = baseDate.value;
  if (y && m && (y !== base.getFullYear() || m !== base.getMonth() + 1)) {
    monthOffset.value =
      (y - base.getFullYear()) * 12 + (m - base.getMonth() - 1);
  }
}

const rowsByDay = computed(() => {
  const map = new Map<string, RecordRow[]>();
  if (!dateField.value) return map;
  for (const row of props.rows) {
    const raw = cellValue(row, dateField.value.id);
    if (!raw) continue;
    const key = String(raw).slice(0, 10);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }
  return map;
});

// —— 画廊 ——
</script>

<template>
  <div class="base-board" :class="`base-board--${type}`">
    <!-- 看板 -->
    <div v-if="type === 'kanban'" class="base-board__kanban">
      <div
        v-for="group in groups"
        :key="group.key"
        class="base-board__column"
        :class="{ 'is-drag-over': dragOverKey === group.key }"
        @dragover.prevent="onDragOver(group.key)"
        @dragleave="dragOverKey === group.key && (dragOverKey = '')"
        @drop.prevent="onDrop(group.key)"
      >
        <header class="base-board__column-head">
          <span class="base-board__column-title">{{ group.key }}</span>
          <span class="base-board__column-count">{{ group.rows.length }}</span>
        </header>
        <div class="base-board__cards">
          <article
            v-for="row in group.rows"
            :key="row.id"
            class="base-board__card"
            :class="{ 'is-dragging': draggingId === row.id }"
            :draggable="editable && !!groupField"
            @dragstart="onDragStart(row, $event)"
            @dragend="onDragEnd"
            @click="emit('open-record', row.id)"
          >
            <strong class="base-board__card-title">{{
              primaryText(row)
            }}</strong>
            <div
              v-for="field in fields
                .filter((f) => !f.isPrimary && f.type !== 'formula')
                .slice(0, 3)"
              :key="field.id"
              class="base-board__card-row"
            >
              <span class="base-board__card-label">{{ field.name }}</span>
              <BaseFieldCell
                :field="field"
                :model-value="cellValue(row, field.id)"
                :editable="
                  editable && !isComputedField(field.type) && !field.readOnly
                "
                :link-titles="linkTitles"
                :link-options="linkOptions?.[linkTargetTableOf(field.id)] ?? []"
                :link-target-table-id="linkTargetTableOf(field.id)"
                :project-id="projectId"
                @update:model-value="
                  (value) =>
                    emit('update-cell', {
                      recordId: row.id,
                      fieldId: field.id,
                      value,
                    })
                "
                @open-record-ref="(payload) => emit('open-record-ref', payload)"
              />
            </div>
          </article>
          <el-button
            text
            size="small"
            class="base-board__add"
            @click="emit('add-row', group.key)"
          >
            <el-icon><Plus /></el-icon>新增
          </el-button>
        </div>
      </div>
      <div v-if="groups.length === 0" class="base-board__empty">暂无数据</div>
    </div>

    <!-- 日历 -->
    <div v-else-if="type === 'calendar'" class="base-board__calendar">
      <header class="base-board__calendar-head">
        <el-button text size="small" @click="monthOffset -= 1">
          <el-icon><ArrowLeft /></el-icon>
        </el-button>
        <strong
          >{{ baseDate.getFullYear() }} 年
          {{ baseDate.getMonth() + 1 }} 月</strong
        >
        <el-button text size="small" @click="monthOffset += 1">
          <el-icon><ArrowRight /></el-icon>
        </el-button>
      </header>
      <div class="base-board__weekdays">
        <span
          v-for="day in ['日', '一', '二', '三', '四', '五', '六']"
          :key="day"
          >{{ day }}</span
        >
      </div>
      <div class="base-board__days">
        <div
          v-for="day in calendarDays"
          :key="day.key"
          class="base-board__day"
          :class="{
            'is-out': !day.inMonth,
            'is-drag-over': dragOverDay === day.key,
          }"
          @dragover.prevent="onDayDragOver(day.key)"
          @dragleave="dragOverDay === day.key && (dragOverDay = '')"
          @drop.prevent="onDayDrop(day.key)"
        >
          <span class="base-board__day-num">{{ day.date.getDate() }}</span>
          <button
            v-for="row in rowsByDay.get(day.key) ?? []"
            :key="row.id"
            class="base-board__event"
            :draggable="editable && !!dateField"
            :class="{ 'is-dragging': draggingId === row.id }"
            @dragstart="onDragStart(row, $event)"
            @dragend="onDragEnd"
            @click="emit('open-record', row.id)"
          >
            {{ primaryText(row) }}
          </button>
        </div>
      </div>
    </div>

    <!-- 画廊 -->
    <div v-else class="base-board__gallery">
      <article
        v-for="row in rows"
        :key="row.id"
        class="base-board__tile"
        :class="{
          'is-dragging': draggingId === row.id,
          'is-drag-over': dragOverTile === row.id,
        }"
        :draggable="editable"
        @click="emit('open-record', row.id)"
        @dragstart="onTileDragStart(row, $event)"
        @dragend="onDragEnd"
        @dragover.prevent="dragOverTile = row.id"
        @drop.prevent="onTileDrop(row)"
      >
        <div class="base-board__tile-cover">
          <template
            v-if="
              coverField &&
              Array.isArray(cellValue(row, coverField.id)) &&
              (cellValue(row, coverField.id) as string[]).length
            "
          >
            <img
              :src="String((cellValue(row, coverField.id) as string[])[0])"
              alt=""
            />
          </template>
          <span v-else class="base-board__tile-icon"
            ><el-icon><Grid /></el-icon
          ></span>
        </div>
        <strong class="base-board__tile-title">{{ primaryText(row) }}</strong>
        <div
          v-for="field in galleryFields"
          :key="field.id"
          class="base-board__tile-row"
        >
          <span class="base-board__card-label">{{ field.name }}</span>
          <BaseFieldCell
            :field="field"
            :model-value="cellValue(row, field.id)"
            :editable="
              editable && !isComputedField(field.type) && !field.readOnly
            "
            :link-titles="linkTitles"
            :link-options="linkOptions?.[linkTargetTableOf(field.id)] ?? []"
            :link-target-table-id="linkTargetTableOf(field.id)"
            :project-id="projectId"
            @update:model-value="
              (value) =>
                emit('update-cell', {
                  recordId: row.id,
                  fieldId: field.id,
                  value,
                })
            "
            @open-record-ref="(payload) => emit('open-record-ref', payload)"
          />
        </div>
      </article>
      <div v-if="rows.length === 0" class="base-board__empty">暂无数据</div>
    </div>
  </div>
</template>

<style scoped>
.base-board {
  height: 100%;
  overflow: auto;
  min-height: 0;
}

.base-board__kanban {
  display: flex;
  gap: 12px;
  padding: 12px;
  align-items: flex-start;
  min-height: 100%;
}

.base-board__column {
  /* 飞书看板：分组列本身无卡片底，仅靠留白分隔 */
  flex: 0 0 280px;
  background: transparent;
  border-radius: 8px;
  padding: 8px;
  transition: background-color 160ms cubic-bezier(0.2, 0.8, 0.3, 1);
}

.base-board__column-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  height: 32px;
  padding: 0 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--fs-text-1, #1f2329);
}

.base-board__column-count {
  /* 飞书：分组计数是灰底徽标 */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 4px;
  background: var(--fs-bg-hover, #f2f3f5);
  color: var(--fs-text-2, #646a73);
  font-size: 12px;
  font-weight: 500;
}

.base-board__cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.base-board__card {
  /* 飞书看板卡片：白底 + 1px #DEE0E3 描边 + 6px 圆角 */
  background: #fff;
  border: 1px solid var(--fs-border, #dee0e3);
  border-radius: 6px;
  padding: 10px 12px;
  cursor: pointer;
  transition:
    box-shadow 160ms cubic-bezier(0.2, 0.8, 0.3, 1),
    border-color 160ms cubic-bezier(0.2, 0.8, 0.3, 1);
}

.base-board__card:hover {
  border-color: var(--fs-blue, #3370ff);
  box-shadow: 0 4px 12px rgba(31, 35, 41, 0.08);
}

.base-board__tile.is-dragging {
  opacity: 0.5;
}
.base-board__tile.is-drag-over {
  outline: 2px solid var(--tg-blue);
  outline-offset: -2px;
}
.base-board__card.is-dragging {
  opacity: 0.5;
  transform: rotate(-1deg);
}

.base-board__day.is-drag-over {
  outline: 2px solid var(--tg-blue);
  outline-offset: -2px;
  background: var(--tg-blue-soft);
}

.base-board__column.is-drag-over {
  outline: 2px dashed var(--tg-blue, #3390ec);
  outline-offset: -2px;
  background: rgba(51, 144, 236, 0.06);
}

.base-board__card-title {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: var(--fs-text-1, #1f2329);
  margin-bottom: 6px;
}

.base-board__card-row,
.base-board__tile-row {
  display: flex;
  gap: 8px;
  font-size: 13px;
  color: var(--fs-text-1, #1f2329);
  align-items: center;
  min-height: 22px;
}

.base-board__card-label {
  flex: 0 0 60px;
  color: var(--fs-text-3, #8f959e);
  font-size: 12px;
}

.base-board__add {
  align-self: flex-start;
}

.base-board__calendar {
  padding: 12px;
}

.base-board__calendar-head {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 8px;
}

.base-board__weekdays,
.base-board__days {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}

.base-board__weekdays span {
  text-align: center;
  font-size: 12px;
  color: var(--tg-text-3, #94a3b8);
  padding-bottom: 4px;
}

.base-board__day {
  min-height: 88px;
  border: 1px solid var(--fs-border-light, #eff0f1);
  border-radius: 6px;
  padding: 4px 6px;
  background: #fff;
}

.base-board__day.is-out {
  opacity: 0.45;
}

.base-board__day-num {
  font-size: 13px;
  color: var(--fs-text-2, #646a73);
}

.base-board__event {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  border-radius: 4px;
  background: var(--fs-blue-soft, #eef3ff);
  color: var(--fs-blue, #3370ff);
  font-size: 12px;
  padding: 2px 6px;
  margin-top: 3px;
  cursor: pointer;
  transition: background-color 160ms cubic-bezier(0.2, 0.8, 0.3, 1);
}

.base-board__event:hover {
  background: rgba(51, 112, 255, 0.16);
}

.base-board__gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
  padding: 12px;
}

.base-board__tile {
  border: 1px solid var(--fs-border, #dee0e3);
  border-radius: 8px;
  padding: 12px;
  background: #fff;
  cursor: pointer;
  transition:
    box-shadow 160ms cubic-bezier(0.2, 0.8, 0.3, 1),
    border-color 160ms cubic-bezier(0.2, 0.8, 0.3, 1);
}

.base-board__tile:hover {
  border-color: var(--fs-blue, #3370ff);
  box-shadow: 0 4px 12px rgba(31, 35, 41, 0.08);
}

.base-board__tile-cover {
  height: 92px;
  border-radius: 8px;
  background: var(--tg-surface-2, #f1f5f9);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
  overflow: hidden;
}

.base-board__tile-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.base-board__tile-icon {
  font-size: 24px;
  color: var(--tg-text-3, #94a3b8);
}

.base-board__tile-title {
  display: block;
  font-size: 13px;
  margin-bottom: 6px;
}

.base-board__empty {
  padding: 32px;
  text-align: center;
  color: var(--tg-text-3, #94a3b8);
  font-size: 13px;
}
</style>
