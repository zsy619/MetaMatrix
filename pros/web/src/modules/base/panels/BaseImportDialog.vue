<script setup lang="ts">
/**
 * 表格导入：CSV / XLSX 解析 → 列映射 → 批量建行。
 *
 * 导入走服务端批量接口（整批成功或整批失败），
 * 不在前端直接写库，避免绕过必填校验与投影同步。
 *
 * XLSX 由 `import/xlsx.ts` 零依赖解析（真实 Excel 的 DEFLATE + sharedStrings 都支持），
 * 与导出用的 `export/xlsx.ts` 形成闭环。
 */
import { computed, onBeforeUnmount, ref } from "vue";
import { ElMessage } from "element-plus";
import { Refresh, Upload } from "@element-plus/icons-vue";
import {
  batchRecords,
  createImportJob,
  fetchImportJob,
  type ImportJobInfo,
} from "../api";
import { parseDelimited } from "../csv";
import { readXlsx } from "../import/xlsx";
import type { FieldMeta } from "../types";

const props = defineProps<{
  projectId: string;
  tableId: string;
  fields: FieldMeta[];
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "imported", count: number): void;
}>();

const fileInput = ref<HTMLInputElement | null>(null);
const fileName = ref("");
/** 文件类型：csv / xlsx。 */
const fileKind = ref<"csv" | "xlsx">("csv");
/** 多工作表时的当前表（xlsx）。 */
const sheets = ref<{ name: string; rows: string[][] }[]>([]);
const sheetIndex = ref(0);
const rows = ref<string[][]>([]);
/** 列索引 → 目标字段 ID（空串表示忽略该列）。 */
const mapping = ref<Record<number, string>>({});
/** 导入失败明细（行号 + 原因）。 */
const importFailures = ref<{ target: string; message: string }[]>([]);
const busy = ref(false);
const useHeader = ref(true);
/**
 * 异步导入模式。
 *
 * 大批量同步导入会长时间占用一个 HTTP 连接，网关断开就前功尽弃。
 * 异步模式把导入提交成后台任务（POST /import-jobs），前端轮询进度，
 * 中途可以关掉弹窗 —— 任务在服务端继续跑。
 */
const asyncMode = ref(false);
/** 超过这个行数就默认建议走异步。 */
const ASYNC_THRESHOLD = 500;
/** 当前异步任务。 */
const asyncJob = ref<ImportJobInfo | null>(null);
let pollTimer: number | undefined;

/** 是否建议走异步（行数超阈值）。 */
const suggestAsync = computed(
  () => dataRows.value.length >= ASYNC_THRESHOLD,
);

const headers = computed(() => (rows.value.length ? rows.value[0] : []));
const dataRows = computed(() =>
  useHeader.value ? rows.value.slice(1) : rows.value,
);

const preview = computed(() => dataRows.value.slice(0, 5));

function pickFile() {
  fileInput.value?.click();
}

/** 读取文件：按扩展名分派到 CSV / XLSX 解析器。 */
async function onFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  fileName.value = file.name;
  const isXlsx = /\.xlsx$/i.test(file.name);
  fileKind.value = isXlsx ? "xlsx" : "csv";
  try {
    if (isXlsx) {
      const buffer = await file.arrayBuffer();
      sheets.value = await readXlsx(buffer);
      sheetIndex.value = 0;
      rows.value = sheets.value[0]?.rows ?? [];
    } else {
      sheets.value = [];
      const text = await file.text();
      rows.value = parseDelimited(text);
    }
  } catch (err) {
    rows.value = [];
    sheets.value = [];
    ElMessage.error((err as Error).message || "文件解析失败");
    input.value = "";
    return;
  }
  autoMap();
  input.value = "";
}

/** 切换工作表（多表 xlsx）。 */
function onSheetChange(index: number) {
  sheetIndex.value = index;
  rows.value = sheets.value[index]?.rows ?? [];
  autoMap();
}

/** 按列名匹配字段名，匹配不到就按顺序兜底。 */
function autoMap() {
  const next: Record<number, string> = {};
  const used = new Set<string>();
  headers.value.forEach((header, index) => {
    const hit = props.fields.find((field) => field.name === header.trim());
    if (hit && !used.has(hit.id)) {
      next[index] = hit.id;
      used.add(hit.id);
    }
  });
  props.fields.forEach((field) => {
    if (used.has(field.id)) return;
    const free = Object.keys(next).length;
    if (free < props.fields.length) {
      const emptyIndex = headers.value.findIndex((_, index) => !next[index]);
      if (emptyIndex >= 0) next[emptyIndex] = field.id;
      used.add(field.id);
    }
  });
  mapping.value = next;
}

const mappingFields = computed(() =>
  headers.value.map((_, index) => ({
    index,
    header: headers.value[index],
    fieldId: mapping.value[index] ?? "",
  })),
);

const mappedCount = computed(
  () => Object.values(mapping.value).filter(Boolean).length,
);

function convert(value: string, field?: FieldMeta): unknown {
  if (!field) return "";
  const text = (value ?? "").trim();
  switch (field.type) {
    case "number":
    case "currency":
    case "percent":
    case "rating": {
      const num = Number(text);
      return Number.isNaN(num) ? 0 : num;
    }
    case "checkbox":
      return /^(1|true|是|y|yes)$/i.test(text);
    case "multi_select":
    case "user":
    case "attachment":
    case "link":
    case "doc":
      return text
        ? text
            .split(/[、,;|]/)
            .map((item) => item.trim())
            .filter(Boolean)
        : [];
    default:
      return text;
  }
}

/** 最近一次导入的行数据：用于「重试失败行」。 */
const lastPayload = ref<Array<{ fields: Record<string, unknown> }>>([]);

/** 失败行明细：原始行号 + 原因 + 可编辑的草稿值。 */
const failureRows = ref<
  Array<{ index: number; target: string; message: string; draft: string[] }>
>([]);

/** 类型转换校验：返回「第 N 行 · 列名」的错误清单。 */
function validateConversion(): string[] {
  const errors: string[] = [];
  dataRows.value.forEach((row, rowIndex) => {
    for (const [indexStr, fieldId] of Object.entries(mapping.value)) {
      if (!fieldId) continue;
      const field = props.fields.find((item) => item.id === fieldId);
      if (!field) continue;
      const text = (row[Number(indexStr)] ?? "").trim();
      if (!text) continue;
      if (
        field.type === "number" ||
        field.type === "currency" ||
        field.type === "percent" ||
        field.type === "rating"
      ) {
        if (Number.isNaN(Number(text))) {
          errors.push(`第 ${rowIndex + 1} 行 · ${field.name}：不是有效数字`);
        }
      }
    }
  });
  return errors;
}

/** 把失败行整理成可编辑草稿（保留原始单元格文本）。 */
function buildFailureRows(
  failures: Array<{ target: string; message: string }>,
  source: string[][],
): Array<{ index: number; target: string; message: string; draft: string[] }> {
  const out: Array<{ index: number; target: string; message: string; draft: string[] }> = [];
  for (const item of failures) {
    const matched = /第\s*(\d+)\s*行/.exec(item.target);
    const index = matched ? Number(matched[1]) - 1 : -1;
    if (index < 0 || index >= source.length) continue;
    out.push({
      index,
      target: item.target,
      message: item.message,
      draft: [...source[index]],
    });
  }
  return out;
}

/** 按草稿构造导入行。 */
function payloadFromDrafts(): Array<{ fields: Record<string, unknown>; sourceIndex: number }> {
  return failureRows.value.map((item) => {
    const fields: Record<string, unknown> = {};
    for (const [indexStr, fieldId] of Object.entries(mapping.value)) {
      if (!fieldId) continue;
      const index = Number(indexStr);
      const field = props.fields.find((f) => f.id === fieldId);
      fields[fieldId] = convert(item.draft[index] ?? "", field);
    }
    return { fields, sourceIndex: item.index };
  });
}

/** 从失败明细里解析出失败的行号（后端 target 形如「第 3 行」）。 */
function failedRows(failures: { target: string }[]): number[] {
  const out: number[] = [];
  for (const item of failures) {
    const matched = /第\s*(\d+)\s*行/.exec(item.target);
    if (!matched) continue;
    const index = Number(matched[1]) - 1;
    if (Number.isFinite(index) && index >= 0) out.push(index);
  }
  return out;
}

/** 只重试失败的行（成功的行不会重复导入）。 */
async function retryFailedRows() {
  const rows = failedRows(importFailures.value);
  const payload = lastPayload.value;
  if (!rows.length || !payload.length) {
    ElMessage.info("没有可重试的失败行");
    return;
  }
  busy.value = true;
  try {
    const res = (await batchRecords(props.projectId, props.tableId, {
      action: "create",
      rows: rows.map((index) => payload[index]).filter(Boolean),
      partial: true,
    })) as {
      succeeded: number;
      failed: number;
      failures: { target: string; message: string }[];
    };
    if (!res.failed) {
      ElMessage.success(`重试成功 ${res.succeeded} 条`);
      importFailures.value = [];
      failureRows.value = [];
      emit("imported", res.succeeded);
    } else {
      importFailures.value = res.failures ?? [];
      failureRows.value = buildFailureRows(res.failures ?? [], dataRows.value);
      ElMessage.warning(`重试后仍失败 ${res.failed} 条`);
    }
  } catch (err) {
    ElMessage.error((err as Error).message || "重试失败");
  } finally {
    busy.value = false;
  }
}

/** 用行内修正后的草稿重试失败行。 */
async function retryWithDrafts() {
  if (!failureRows.value.length) {
    ElMessage.info("没有需要修正的失败行");
    return;
  }
  const drafts = payloadFromDrafts();
  busy.value = true;
  try {
    const res = (await batchRecords(props.projectId, props.tableId, {
      action: "create",
      rows: drafts.map((item) => item.fields),
      partial: true,
    })) as {
      succeeded: number;
      failed: number;
      failures: { target: string; message: string }[];
    };
    if (!res.failed) {
      ElMessage.success(`修正后导入成功 ${res.succeeded} 条`);
      importFailures.value = [];
      failureRows.value = [];
      emit("imported", res.succeeded);
      return;
    }
    // 把失败位置映射回原始行号，保留用户已修正的内容。
    const stillBad = new Set<number>();
    for (const item of res.failures ?? []) {
      const matched = /第\s*(\d+)\s*行/.exec(item.target);
      const idx = matched ? Number(matched[1]) - 1 : -1;
      if (idx >= 0 && idx < drafts.length) stillBad.add(drafts[idx].sourceIndex);
    }
    const next: typeof failureRows.value = [];
    for (const item of failureRows.value) {
      if (stillBad.has(item.index)) next.push(item);
    }
    failureRows.value = next;
    importFailures.value = (res.failures ?? []).map((item) => ({
      target: item.target,
      message: item.message,
    }));
    ElMessage.warning(`仍有 ${res.failed} 条失败，请继续修正`);
  } catch (err) {
    ElMessage.error((err as Error).message || "重试失败");
  } finally {
    busy.value = false;
  }
}

/** 轮询异步任务进度。 */
function startPolling(jobId: string) {
  if (pollTimer) window.clearInterval(pollTimer);
  pollTimer = window.setInterval(async () => {
    try {
      const job = await fetchImportJob(props.projectId, jobId);
      asyncJob.value = job;
      if (job.status !== "pending" && job.status !== "running") {
        if (pollTimer) window.clearInterval(pollTimer);
        pollTimer = undefined;
        if (job.status === "succeeded") {
          ElMessage.success(`导入完成：成功 ${job.succeeded} 条`);
          emit("imported", job.succeeded);
        } else if (job.status === "partial") {
          ElMessage.warning(
            `导入完成：成功 ${job.succeeded} 条，失败 ${job.failed} 条`,
          );
        } else if (job.status === "failed") {
          ElMessage.error(job.error || "导入失败");
        }
      }
    } catch {
      // 轮询失败不等于任务失败，下一轮继续。
    }
  }, 1200);
}

onBeforeUnmount(() => {
  if (pollTimer) window.clearInterval(pollTimer);
});

async function runImport() {
  if (!props.tableId) {
    ElMessage.warning("当前多维表格还没有数据表，请先新建数据表");
    return;
  }
  if (!dataRows.value.length) {
    ElMessage.warning("没有可导入的数据");
    return;
  }
  const payload = dataRows.value.map((row) => {
    const fields: Record<string, unknown> = {};
    for (const [indexStr, fieldId] of Object.entries(mapping.value)) {
      if (!fieldId) continue;
      const index = Number(indexStr);
      const field = props.fields.find((item) => item.id === fieldId);
      fields[fieldId] = convert(row[index] ?? "", field);
    }
    return { fields };
  });
  // 类型转换预检：数字列里出现非数字时先拦下来，避免整批被服务端拒掉。
  const conversionErrors = validateConversion();
  if (conversionErrors.length) {
    ElMessage.warning(
      `有 ${conversionErrors.length} 处类型问题，请先修正：${conversionErrors[0]}`,
    );
    return;
  }
  busy.value = true;
  try {
    // 异步模式：提交后台任务，不占用长连接。
    if (asyncMode.value) {
      const job = await createImportJob(props.projectId, props.tableId, {
        rows: payload,
        mode: "partial",
      });
      asyncJob.value = job;
      ElMessage.success(
        `已提交导入任务（${payload.length} 行），可在「运行监控 · 导入任务」查看进度`,
      );
      startPolling(job.id);
      return;
    }
    const res = (await batchRecords(props.projectId, props.tableId, {
      action: "create",
      rows: payload,
      partial: true,
    })) as {
      succeeded: number;
      failed: number;
      failures: { target: string; message: string }[];
    };
    const failures = res.failures ?? [];
    lastPayload.value = payload;
    if (!res.failed) {
      ElMessage.success(`已导入 ${res.succeeded} 条记录`);
      importFailures.value = [];
      failureRows.value = [];
      emit("imported", res.succeeded);
    } else {
      ElMessage.warning(
        `导入完成：成功 ${res.succeeded} 条，失败 ${res.failed} 条`,
      );
      importFailures.value = failures;
      failureRows.value = buildFailureRows(failures, dataRows.value);
    }
  } catch (err) {
    ElMessage.error((err as Error).message || "导入失败");
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <el-dialog
    :model-value="true"
    :title="`导入数据（${fileKind === 'xlsx' ? 'XLSX' : 'CSV'}）`"
    width="860px"
    append-to-body
    modal-class="be-modal"
    destroy-on-close
    @close="emit('close')"
  >
    <div class="be-panel">
      <div class="be-panel__row">
        <el-button :icon="Upload" @click="pickFile">
          选择 {{ fileKind === "xlsx" ? "XLSX" : "CSV" }} 文件
        </el-button>
        <span v-if="fileName" class="be-panel__hint">{{ fileName }}</span>
        <input
          ref="fileInput"
          type="file"
          accept=".csv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          class="be-import__input"
          @change="onFile"
        />
        <div style="flex: 1" />
        <el-checkbox v-model="useHeader">首行是表头</el-checkbox>
      </div>

      <template v-if="rows.length">
        <div v-if="sheets.length > 1" class="be-panel__row">
          <span class="be-panel__hint">工作表</span>
          <el-select
            :model-value="sheetIndex"
            size="small"
            style="width: 180px"
            @update:model-value="onSheetChange(Number($event))"
          >
            <el-option
              v-for="(sheet, index) in sheets"
              :key="sheet.name"
              :label="sheet.name"
              :value="index"
            />
          </el-select>
        </div>
        <div class="be-panel__hint">
          共解析 {{ dataRows.length }} 行 · 已映射 {{ mappedCount }} 列 ·
          未映射的列会被忽略
        </div>

        <div class="be-panel__row">
          <el-switch
            v-model="asyncMode"
            :active-text="`异步导入${suggestAsync ? '（建议开启）' : ''}`"
            inline-prompt
          />
          <span class="be-panel__hint">
            {{
              asyncMode
                ? "异步模式：提交后台任务执行，可关闭本窗口，进度在「运行监控 · 导入任务」查看"
                : "同步模式：立即执行，适合小批量数据"
            }}
          </span>
        </div>

        <div v-if="asyncJob" class="be-import__async">
          <el-progress
            :percentage="
              asyncJob.total
                ? Math.round((asyncJob.processed / asyncJob.total) * 100)
                : 0
            "
            :status="
              asyncJob.status === 'failed'
                ? 'exception'
                : asyncJob.status === 'succeeded'
                  ? 'success'
                  : undefined
            "
            :stroke-width="10"
          />
          <span class="be-panel__hint">
            任务 {{ asyncJob.id }} · 状态 {{ asyncJob.status }} · 成功
            {{ asyncJob.succeeded }} / 共 {{ asyncJob.total }}
          </span>
        </div>

        <div class="be-import__mapping">
          <div
            v-for="item in mappingFields"
            :key="item.index"
            class="be-import__map"
          >
            <span class="be-import__map-header">{{
              item.header || `第 ${item.index + 1} 列`
            }}</span>
            <el-select
              v-model="mapping[item.index]"
              size="small"
              placeholder="不导入"
            >
              <el-option value="" label="不导入" />
              <el-option
                v-for="field in fields"
                :key="field.id"
                :label="field.name"
                :value="field.id"
              />
            </el-select>
          </div>
        </div>

        <div class="be-import__preview">
          <table>
            <thead>
              <tr>
                <th v-for="(item, index) in mappingFields" :key="index">
                  {{ item.header || `列 ${index + 1}` }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, rowIndex) in preview" :key="rowIndex">
                <td v-for="(cell, cellIndex) in row" :key="cellIndex">
                  {{ cell }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
      <el-empty
        v-else
        description="选择 CSV / XLSX 文件开始导入"
        :image-size="80"
      />

      <div v-if="importFailures.length" class="be-import__failures">
        <div class="be-import__failures-head">
          <span>失败明细（{{ importFailures.length }}）</span>
          <el-button
            size="small"
            text
            :icon="Refresh"
            :loading="busy"
            @click="retryFailedRows"
          >
            重试失败行
          </el-button>
        </div>
        <ul>
          <li v-for="(item, index) in importFailures" :key="index">
            <span class="be-import__failures-target">{{ item.target }}</span>
            <span class="be-import__failures-msg">{{ item.message }}</span>
          </li>
        </ul>
        <!-- 行内修正：直接改失败行的单元格，再重试 -->
        <div v-if="failureRows.length" class="be-import__fix">
          <div class="be-import__fix-head">
            <span>行内修正（{{ failureRows.length }} 行）</span>
            <el-button
              size="small"
              type="primary"
              text
              :loading="busy"
              @click="retryWithDrafts"
            >
              修正后重试
            </el-button>
          </div>
          <div class="be-import__fix-table">
            <table>
              <thead>
                <tr>
                  <th v-for="(item, index) in mappingFields" :key="index">
                    {{ item.header || `列 ${index + 1}` }}
                  </th>
                  <th>失败原因</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in failureRows" :key="item.index">
                  <td v-for="(col, colIndex) in mappingFields" :key="colIndex">
                    <el-input
                      v-model="item.draft[col.index]"
                      size="small"
                      placeholder="—"
                    />
                  </td>
                  <td class="be-import__fix-msg">{{ item.message }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <el-button @click="emit('close')">取消</el-button>
      <el-button
        type="primary"
        :loading="busy"
        :disabled="!dataRows.length"
        @click="runImport"
      >
        {{ asyncMode ? "提交导入任务" : "导入" }} {{ dataRows.length }} 行
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.be-import__input {
  display: none;
}

.be-import__async {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--fs-border, #e5e7eb);
  border-radius: 10px;
  background: var(--fs-surface, #fff);
}

.be-import__mapping {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 8px;
}

.be-import__map {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.be-import__map-header {
  font-size: 12px;
  color: var(--tg-text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.be-import__preview {
  max-height: 260px;
  overflow: auto;
  border: 1px solid var(--tg-border);
  border-radius: var(--tg-radius-md);
}

.be-import__preview table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.be-import__preview th,
.be-import__preview td {
  border-bottom: 1px solid var(--tg-border);
  padding: 6px 10px;
  text-align: left;
  white-space: nowrap;
}

.be-import__preview th {
  background: var(--tg-surface-2);
  color: var(--tg-text-2);
  font-weight: 600;
}
</style>

<style scoped>
.be-import__failures {
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid var(--tg-border);
  border-radius: var(--tg-radius-md);
  background: var(--tg-surface-2);
}
.be-import__failures-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 600;
  color: var(--tg-text-2);
  margin-bottom: 6px;
}
.be-import__failures ul {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 160px;
  overflow: auto;
}
.be-import__failures li {
  display: flex;
  gap: 8px;
  font-size: 12px;
  padding: 3px 0;
  border-top: 1px solid var(--tg-border);
}
.be-import__failures-target {
  flex: none;
  color: var(--tg-text-2);
}
.be-import__failures-msg {
  color: var(--tg-red);
  word-break: break-all;
}
</style>

<style scoped>
.be-import__fix {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px dashed var(--tg-border);
}

.be-import__fix-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 600;
  color: var(--tg-text-2);
  margin-bottom: 6px;
}

.be-import__fix-table {
  max-height: 220px;
  overflow: auto;
  border: 1px solid var(--tg-border);
  border-radius: var(--tg-radius-sm);
}

.be-import__fix-table table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.be-import__fix-table th {
  position: sticky;
  top: 0;
  background: var(--tg-surface-2);
  color: var(--tg-text-2);
  font-weight: 600;
  text-align: left;
  padding: 6px 8px;
  white-space: nowrap;
}

.be-import__fix-table td {
  border-top: 1px solid var(--tg-border);
  padding: 4px 6px;
  vertical-align: middle;
}

.be-import__fix-msg {
  color: var(--tg-red);
  word-break: break-all;
}
</style>
