<script setup lang="ts">
/**
 * 列头操作菜单（对标飞书多维表格 Bitable）。
 *
 * 飞书里点字段名右侧的 ▾ 会弹出这一组操作：
 *   升序 / 降序 / 筛选此列 / 冻结到左侧 / 隐藏此列 / 列宽 / 字段设置。
 * 我们把它做成「列头右侧的 ▾ 按钮（hover 才出现）」+ 白色浮层面板。
 *
 * 样式统一走 `feishu.css` 的 `--fs-*` 令牌（模块内主题层），
 * 不动全局 `telegram.css`。
 */
import { ref } from "vue";
import {
  ArrowDown,
  ArrowUp,
  Filter,
  Hide,
  Lock,
  Setting,
  Sort,
  Unlock,
} from "@element-plus/icons-vue";
import { fieldTypeIcon, fieldTypeColor } from "../fields/icons";
import { fieldPlugin } from "../fields/registry";
import type { FieldMeta } from "../types";

const props = defineProps<{
  field: FieldMeta;
  /** 当前排序方向：asc / desc / null。 */
  sortOrder?: "asc" | "desc" | null;
  /** 该列是否已冻结在左侧。 */
  frozen?: boolean;
  /** 是否是计算字段（不可编辑，菜单里禁用相关项）。 */
  computed?: boolean;
}>();

const emit = defineEmits<{
  (e: "sort", payload: { fieldId: string; order: "asc" | "desc" }): void;
  (e: "clear-sort", payload: { fieldId: string }): void;
  (e: "filter", payload: { fieldId: string }): void;
  (e: "freeze", payload: { fieldId: string }): void;
  (e: "hide", payload: { fieldId: string }): void;
  (e: "width", payload: { fieldId: string; width: number }): void;
  (e: "settings", payload: { fieldId: string }): void;
}>();

const widthInput = ref<number>(160);
const widthOpen = ref(false);
/**
 * 弹层显隐**受控**。
 *
 * 不用默认的 trigger="click" 自动开关：表格排序 / 隐藏列会让列头重新渲染，
 * 自动模式下弹层的内部状态可能与实际显示不一致（第二次点击变成「关闭」而不是「打开」）。
 */
const visible = ref(false);

/** 触发一个动作并立即收起弹层。 */
function run(action: () => void) {
  visible.value = false;
  action();
}

function typeLabel() {
  return fieldPlugin(props.field.type)?.label ?? "字段";
}

function applyWidth() {
  const w = Math.min(600, Math.max(80, Math.round(widthInput.value || 160)));
  widthInput.value = w;
  emit("width", { fieldId: props.field.id, width: w });
  widthOpen.value = false;
}
</script>

<template>
  <el-popover
    v-model:visible="visible"
    class="be-colmenu"
    placement="bottom-end"
    :width="248"
    trigger="click"
    popper-class="be-colmenu__popper"
    :show-arrow="false"
    :offset="4"
  >
    <template #reference>
      <button class="be-colmenu__trigger" type="button" title="列操作">
        <el-icon><ArrowDown /></el-icon>
      </button>
    </template>

    <div class="be-colmenu__panel">
      <div class="be-colmenu__head">
        <el-icon
          class="be-colmenu__head-icon"
          :style="{ color: fieldTypeColor(field.type) }"
        >
          <component :is="fieldTypeIcon(field.type)" />
        </el-icon>
        <span class="be-colmenu__head-title">{{ field.name }}</span>
        <span class="be-colmenu__head-type">{{ typeLabel() }}</span>
      </div>

      <div class="be-colmenu__group">
        <button
          class="be-colmenu__item"
          type="button"
          @click="run(() => emit('sort', { fieldId: field.id, order: 'asc' }))"
        >
          <el-icon><ArrowUp /></el-icon>
          <span class="be-colmenu__label">升序排列</span>
          <el-icon v-if="sortOrder === 'asc'" class="be-colmenu__check">
            <Sort />
          </el-icon>
        </button>
        <button
          class="be-colmenu__item"
          type="button"
          @click="run(() => emit('sort', { fieldId: field.id, order: 'desc' }))"
        >
          <el-icon><ArrowDown /></el-icon>
          <span class="be-colmenu__label">降序排列</span>
          <el-icon v-if="sortOrder === 'desc'" class="be-colmenu__check">
            <Sort />
          </el-icon>
        </button>
        <button
          v-if="sortOrder"
          class="be-colmenu__item"
          type="button"
          @click="run(() => emit('clear-sort', { fieldId: field.id }))"
        >
          <el-icon><Sort /></el-icon>
          <span class="be-colmenu__label">清除本列排序</span>
        </button>
        <button
          class="be-colmenu__item"
          type="button"
          @click="run(() => emit('filter', { fieldId: field.id }))"
        >
          <el-icon><Filter /></el-icon>
          <span class="be-colmenu__label">筛选此列</span>
        </button>
      </div>

      <div class="be-colmenu__sep" />

      <div class="be-colmenu__group">
        <button
          class="be-colmenu__item"
          type="button"
          @click="run(() => emit('freeze', { fieldId: field.id }))"
        >
          <el-icon>
            <Unlock v-if="frozen" />
            <Lock v-else />
          </el-icon>
          <span class="be-colmenu__label">{{
            frozen ? "取消冻结此列" : "冻结到左侧"
          }}</span>
        </button>
        <button
          class="be-colmenu__item"
          type="button"
          @click="run(() => emit('hide', { fieldId: field.id }))"
        >
          <el-icon><Hide /></el-icon>
          <span class="be-colmenu__label">隐藏此列</span>
        </button>
        <button
          class="be-colmenu__item"
          type="button"
          @click="run(() => emit('settings', { fieldId: field.id }))"
        >
          <el-icon><Setting /></el-icon>
          <span class="be-colmenu__label">编辑字段</span>
        </button>
      </div>

      <div class="be-colmenu__sep" />

      <div class="be-colmenu__width">
        <span class="be-colmenu__width-label">列宽</span>
        <template v-if="widthOpen">
          <el-input-number
            v-model="widthInput"
            :min="80"
            :max="600"
            :step="10"
            size="small"
            controls-position="right"
            @keyup.enter="applyWidth"
          />
          <button
            class="be-colmenu__width-ok"
            type="button"
            @click="applyWidth"
          >
            确定
          </button>
        </template>
        <button
          v-else
          class="be-colmenu__item be-colmenu__item--inline"
          type="button"
          @click="widthOpen = true"
        >
          <span class="be-colmenu__label">列宽</span>
          <span class="be-colmenu__value">{{ widthInput }} px</span>
        </button>
      </div>
    </div>
  </el-popover>
</template>
