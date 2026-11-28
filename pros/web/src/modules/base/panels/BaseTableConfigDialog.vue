<script setup lang="ts">
/**
 * 表配置包：把一张表的「结构 + 策略 + 视图」整体导出 / 导入。
 *
 * 数据导出（CSV / Markdown）只导值；这里导的是配置：
 * 字段类型、选项、公式、字段级权限策略（含条件可见）、共享视图。
 *
 * 导入永远是「新建一张表」，不覆盖原表 —— 避免误操作把正在用的表冲掉。
 */
import { computed, onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { Download, Files, Upload } from "@element-plus/icons-vue";
import {
  exportTableConfig,
  importTableConfig,
  listBases,
  listTables,
  mergeTableConfig,
} from "../api";
import { listProjects } from "../../../api/projects";
import type { ProjectSummary } from "../../../types/project";
import type { BaseInfo, BaseTable, ConfigBundle } from "../types";

const props = defineProps<{
  projectId: string;
  baseId: string;
  tableId: string;
  tableName: string;
  /** 同一 Base 下的其它表（合并导入时选目标表）。 */
  tables?: BaseTable[];
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "imported", tableId: string): void;
}>();

type TabKey = "export" | "import";
const tab = ref<TabKey>("export");

const bundleText = ref("");
const bundle = ref<ConfigBundle | null>(null);
const exporting = ref(false);

const importText = ref("");
const importName = ref("");
const importing = ref(false);
/** 导入方式：新建表 / 合并到已有表。 */
const importMode = ref<"new" | "merge">("new");
const mergeTargetId = ref("");
/** 目标空间（跨空间导入）。默认当前空间。 */
const targetProjectId = ref("");
/** 目标 Base（跨空间/跨表导入）。默认当前 Base。 */
const targetBaseId = ref("");
/** 目标 Base 下的表（合并模式用）。 */
const targetTables = ref<BaseTable[]>([]);
const targetBases = ref<BaseInfo[]>([]);
const projects = ref<ProjectSummary[]>([]);
const loadingTargets = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const importedTableId = ref("");
const importedTableName = ref("");
const warnings = ref<string[]>([]);

const bundleSummary = computed(() => {
  if (!bundle.value) return null;
  const fields = bundle.value.fields?.length ?? 0;
  const views = bundle.value.views?.length ?? 0;
  const conditional = (bundle.value.fields ?? []).filter((f) => {
    const perms = f.config?.permissions as Record<string, unknown> | undefined;
    return Boolean(perms && (perms.visibleWhen || perms.hiddenWhen));
  }).length;
  const formulas = (bundle.value.fields ?? []).filter((f) =>
    Boolean(f.formula),
  ).length;
  return { fields, views, conditional, formulas };
});

const mergeTargets = computed(() =>
  targetTables.value.filter((t) => t.id !== props.tableId),
);

/** 目标空间里可选的 Base（当前 Base 也列出来，方便「同空间换表」）。 */
const selectableBases = computed(() => {
  const list = [...targetBases.value];
  if (
    props.baseId &&
    !list.some((b) => b.id === props.baseId)
  ) {
    list.unshift({
      id: props.baseId,
      projectId: props.projectId,
      name: "当前 Base",
      description: "",
      icon: "",
      ownerId: "",
      schemaVersion: 0,
      createdAt: "",
      updatedAt: "",
    });
  }
  return list;
});

/** 载入目标空间的可选列表。 */
async function loadTargets(projectId?: string) {
  const pid = projectId || targetProjectId.value || props.projectId;
  loadingTargets.value = true;
  try {
    if (!projects.value.length) {
      projects.value = await listProjects();
    }
    targetBases.value = await listBases(pid);
    if (!targetBases.value.some((b) => b.id === targetBaseId.value)) {
      targetBaseId.value = targetBases.value[0]?.id || props.baseId;
    }
    await loadTargetTables();
  } catch (error) {
    ElMessage.error((error as Error).message || "载入目标列表失败");
  } finally {
    loadingTargets.value = false;
  }
}

/** 载入目标 Base 下的表。 */
async function loadTargetTables() {
  const pid = targetProjectId.value || props.projectId;
  const bid = targetBaseId.value || props.baseId;
  if (!pid || !bid) {
    targetTables.value = [];
    return;
  }
  try {
    targetTables.value = await listTables(pid, bid);
  } catch {
    targetTables.value = [];
  }
}

/** 切换目标空间。 */
async function onTargetProjectChange() {
  targetBaseId.value = "";
  mergeTargetId.value = "";
  await loadTargets(targetProjectId.value);
}

/** 切换目标 Base。 */
async function onTargetBaseChange() {
  mergeTargetId.value = "";
  await loadTargetTables();
}

onMounted(() => {
  targetProjectId.value = props.projectId;
  targetBaseId.value = props.baseId;
  void loadTargets(props.projectId);
});

/** 警告很多时只展示前 5 条，其余折叠成一行。 */
const visibleWarnings = computed(() => warnings.value.slice(0, 5));
const restWarningCount = computed(() =>
  Math.max(0, warnings.value.length - visibleWarnings.value.length),
);

/** 导出：拉配置包并展示。 */
async function doExport() {
  if (!props.tableId) return;
  exporting.value = true;
  try {
    const data = await exportTableConfig(props.projectId, props.tableId);
    bundle.value = data;
    bundleText.value = JSON.stringify(data, null, 2);
    ElMessage.success("配置包已生成");
  } catch (error) {
    ElMessage.error((error as Error).message || "导出失败");
  } finally {
    exporting.value = false;
  }
}

/** 下载配置包 JSON 文件。 */
function downloadBundle() {
  if (!bundleText.value) return;
  const blob = new Blob([bundleText.value], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${props.tableName || "table"}.config.json`;
  link.click();
  URL.revokeObjectURL(url);
}

/** 复制配置包内容。 */
async function copyBundle() {
  try {
    await navigator.clipboard.writeText(bundleText.value);
    ElMessage.success("已复制配置包 JSON");
  } catch {
    ElMessage.warning("复制失败，请手动选择文本");
  }
}

function pickFile() {
  fileInput.value?.click();
}

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  importText.value = await file.text();
  importName.value = file.name;
  input.value = "";
}

/** 导入：校验 JSON 并在当前 Base 下新建一张表。 */
async function doImport() {
  const raw = importText.value.trim();
  if (!raw) {
    ElMessage.warning("请先选择配置文件或粘贴配置包内容");
    return;
  }
  let parsed: ConfigBundle;
  try {
    parsed = JSON.parse(raw) as ConfigBundle;
  } catch (error) {
    ElMessage.error(`配置包不是合法 JSON：${(error as Error).message}`);
    return;
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !Array.isArray(parsed.fields) ||
    !parsed.fields.length
  ) {
    ElMessage.error("配置包里没有字段，无法导入");
    return;
  }
  importing.value = true;
  try {
    if (importMode.value === "merge") {
      if (!mergeTargetId.value) {
        ElMessage.warning("请先选择要合并进去的目标表");
        importing.value = false;
        return;
      }
      const res = await mergeTableConfig(
        targetProjectId.value || props.projectId,
        mergeTargetId.value,
        parsed,
      );
      importedTableId.value = res.tableId;
      importedTableName.value = res.table?.name || "";
      warnings.value = res.warnings ?? [];
      ElMessage.success(`已合并到「${importedTableName.value}」`);
    } else {
      const res = await importTableConfig(
        targetProjectId.value || props.projectId,
        targetBaseId.value || props.baseId,
        parsed,
      );
      importedTableId.value = res.tableId;
      importedTableName.value = res.table?.name || parsed.table?.name || "新表";
      warnings.value = res.warnings ?? [];
      if (warnings.value.length) {
        ElMessage.warning(
          `已导入为新表，但有 ${warnings.value.length} 项未完全还原`,
        );
      } else {
        ElMessage.success(`已导入为新表「${importedTableName.value}」`);
      }
    }
    emit("imported", importedTableId.value);
  } catch (error) {
    ElMessage.error((error as Error).message || "导入失败");
  } finally {
    importing.value = false;
  }
}
</script>

<template>
  <el-dialog
    :model-value="true"
    title="表配置（结构与策略）"
    width="720px"
    append-to-body
    modal-class="be-modal"
    destroy-on-close
    @close="emit('close')"
  >
    <div class="be-cfg">
      <el-radio-group v-model="tab" size="small">
        <el-radio-button value="export">导出</el-radio-button>
        <el-radio-button value="import">导入</el-radio-button>
      </el-radio-group>

      <template v-if="tab === 'export'">
        <div class="be-cfg__hint">
          配置包包含当前表的<strong>字段类型、选项、公式、字段级权限策略（含条件可见）与共享视图</strong>；
          数据本身不会包含（数据请用「导出」按钮单独导出）。
        </div>
        <div class="be-cfg__actions">
          <el-button
            type="primary"
            size="small"
            :icon="Download"
            :loading="exporting"
            @click="doExport"
          >
            生成配置包
          </el-button>
          <el-button
            size="small"
            :icon="Files"
            :disabled="!bundleText"
            @click="downloadBundle"
          >
            下载 JSON
          </el-button>
          <el-button size="small" :disabled="!bundleText" @click="copyBundle"
            >复制内容</el-button
          >
        </div>
        <div v-if="bundleSummary" class="be-cfg__summary">
          <span class="be-cfg__tag">字段 {{ bundleSummary.fields }}</span>
          <span class="be-cfg__tag">视图 {{ bundleSummary.views }}</span>
          <span v-if="bundleSummary.conditional" class="be-cfg__tag">
            条件可见字段 {{ bundleSummary.conditional }}
          </span>
          <span v-if="bundleSummary.formulas" class="be-cfg__tag">
            公式 {{ bundleSummary.formulas }}
          </span>
        </div>
        <el-input
          v-model="bundleText"
          type="textarea"
          :rows="12"
          readonly
          resize="none"
          placeholder="点击「生成配置包」后在此查看 JSON"
          class="be-cfg__code"
        />
      </template>

      <template v-else>
        <div class="be-cfg__hint">
          导入可<strong>新建一张表</strong>，也可<strong>合并进已有表</strong>（按字段名匹配，
          已存在的字段保留原样、只补缺失字段）；字段引用（如条件可见引用其它字段）会自动重映射。
        </div>
        <div class="be-cfg__modes">
          <el-radio-group v-model="importMode" size="small">
            <el-radio-button value="new">新建为新表</el-radio-button>
            <el-radio-button value="merge">合并到已有表</el-radio-button>
          </el-radio-group>
        </div>
        <div class="be-cfg__targets">
          <span class="be-cfg__targets-label">导入到</span>
          <el-select
            v-model="targetProjectId"
            size="small"
            placeholder="目标空间"
            class="be-cfg__target"
            :loading="loadingTargets"
            @change="onTargetProjectChange"
          >
            <el-option
              v-for="p in projects"
              :key="p.id"
              :label="p.emoji ? `${p.emoji} ${p.name}` : p.name"
              :value="p.id"
            />
          </el-select>
          <el-select
            v-model="targetBaseId"
            size="small"
            placeholder="目标多维表格"
            class="be-cfg__target"
            :loading="loadingTargets"
            @change="onTargetBaseChange"
          >
            <el-option
              v-for="b in selectableBases"
              :key="b.id"
              :label="b.name"
              :value="b.id"
            />
          </el-select>
          <el-select
            v-if="importMode === 'merge'"
            v-model="mergeTargetId"
            size="small"
            placeholder="选择目标表"
            class="be-cfg__target"
          >
            <el-option
              v-for="t in mergeTargets"
              :key="t.id"
              :label="t.name"
              :value="t.id"
            />
          </el-select>
        </div>
        <div class="be-cfg__actions">
          <el-button size="small" :icon="Upload" @click="pickFile"
            >选择配置文件</el-button
          >
          <span v-if="importName" class="be-cfg__file">{{ importName }}</span>
          <input
            ref="fileInput"
            type="file"
            accept=".json,application/json"
            class="be-cfg__input"
            @change="onFile"
          />
          <div style="flex: 1" />
          <el-button
            type="primary"
            size="small"
            :loading="importing"
            @click="doImport"
          >
            {{ importMode === "merge" ? "合并进去" : "导入为新表" }}
          </el-button>
        </div>
        <el-input
          v-model="importText"
          type="textarea"
          :rows="10"
          resize="none"
          placeholder="也可以直接把配置包 JSON 粘贴到这里"
          class="be-cfg__code"
        />
        <div v-if="importedTableId" class="be-cfg__done">
          {{
            importMode === "merge"
              ? `已合并到「${importedTableName}」`
              : `已导入为「${importedTableName}」`
          }}，当前视图已切换。
        </div>
        <ul v-if="warnings.length" class="be-cfg__warnings">
          <li v-for="(item, index) in visibleWarnings" :key="index">
            {{ item }}
          </li>
          <li v-if="restWarningCount" class="be-cfg__warnings-rest">
            还有 {{ restWarningCount }} 条…
          </li>
        </ul>
      </template>
    </div>

    <template #footer>
      <el-button @click="emit('close')">关闭</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.be-cfg {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.be-cfg__hint {
  font-size: 13px;
  line-height: 1.7;
  color: var(--tg-text-secondary, #64748b);
  background: var(--tg-surface-soft, #f8fafc);
  border: 1px solid var(--tg-border, #e2e8f0);
  border-radius: 12px;
  padding: 10px 12px;
}

.be-cfg__hint strong {
  color: var(--tg-text-primary, #0f172a);
  font-weight: 600;
}

.be-cfg__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.be-cfg__modes {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.be-cfg__targets {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 10px 12px;
  border: 1px solid var(--tg-border, #e2e8f0);
  border-radius: 12px;
  background: var(--tg-surface-soft, #f8fafc);
}

.be-cfg__targets-label {
  font-size: 13px;
  color: var(--tg-text-secondary, #64748b);
}

.be-cfg__target {
  width: 190px;
}

.be-cfg__file {
  font-size: 13px;
  color: var(--tg-text-secondary, #64748b);
}

.be-cfg__input {
  display: none;
}

.be-cfg__summary {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.be-cfg__tag {
  font-size: 12px;
  line-height: 20px;
  padding: 0 10px;
  border-radius: 10px;
  background: var(--tg-blue-soft, #eff6ff);
  color: var(--tg-blue, #3390ec);
}

.be-cfg__code :deep(.el-textarea__inner) {
  font-family: "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  border-radius: 12px;
}

.be-cfg__done {
  font-size: 13px;
  color: var(--tg-green, #16a34a);
}

.be-cfg__warnings {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.8;
  color: var(--tg-warning, #d97706);
}

.be-cfg__warnings-rest {
  opacity: 0.75;
}
</style>
