<script setup lang="ts">
/**
 * 多维表格主视图（Base Engine）。
 *
 * 结构分层：
 *   View 层（本组件）——表 / 视图 / 查询状态的编排；
 *   Grid 层（BaseGrid）——网格渲染；
 *   Field 层（BaseFieldCell）——单元格渲染与编辑；
 *   服务端——筛选 / 排序 / 分组 / 公式 / 权限 / 审计的唯一事实来源。
 *
 * 与富文本编辑器的融合路径：
 *   1) 本表可一键导出为 Markdown 表格，粘贴进文档即完成「数据 → 文档」单向同步；
 *   2) 公式字段与文档内变量共用同一套命名，未来可扩展为双向引用。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  Calendar,
  CopyDocument,
  DataBoard,
  Delete,
  Document,
  Download,
  Filter,
  Clock,
  EditPen,
  Files,
  Grid,
  Histogram,
  DataLine,
  InfoFilled,
  Link,
  Lock,
  MagicStick,
  MoreFilled,
  Picture,
  Plus,
  Search,
  Setting,
  Sort,
  Tickets,
  Upload,
} from "@element-plus/icons-vue";
import BaseGrid from "./grid/BaseGrid.vue";
import { ensureUserNames, resolveUserName } from "./fields/userNames";
import BaseBoardViews from "./views/BaseBoardViews.vue";
import BaseFormView from "./views/BaseFormView.vue";
import BaseGanttView from "./views/BaseGanttView.vue";
import BaseBatchDialog from "./panels/BaseBatchDialog.vue";
import BaseFieldManager from "./panels/BaseFieldManager.vue";
import BaseFormulaDialog from "./panels/BaseFormulaDialog.vue";
import BaseImportDialog from "./panels/BaseImportDialog.vue";
import BaseTableConfigDialog from "./panels/BaseTableConfigDialog.vue";
import BaseQueryPanel from "./panels/BaseQueryPanel.vue";
import BaseAuditPanel from "./panels/BaseAuditPanel.vue";
import BaseOpsPanel from "./panels/BaseOpsPanel.vue";
import BaseRecordDrawer from "./panels/BaseRecordDrawer.vue";
import BaseViewSettings from "./panels/BaseViewSettings.vue";
import BaseViewCreateDialog from "./panels/BaseViewCreateDialog.vue";
import BaseSettingsDialog from "./panels/BaseSettingsDialog.vue";
import { BaseRealtime, type BaseEvent } from "./realtime";
import {
  normalizeFilters as normalizeFiltersPure,
  normalizeCombine,
  normalizeGroups,
  normalizeSorts,
  resolveFilters,
  resolveGroups,
  resolveSorts,
  type QueryCombine,
} from "./viewQuery";
import { useAuthStore } from "../../stores/auth";
import { getKnowledgeTree, getNodeData } from "../../api/knowledge";
import {
  migrateSheet,
  type SheetData,
} from "../../components/knowledge/sheetModel";
import {
  createRecord,
  createTable,
  createView,
  deleteRecord,
  ensureBase,
  listFieldTypes,
  listTables,
  reorderRecords,
  listViews,
  fetchView,
  queryByView,
  queryRecords,
  updateRecord,
  updateView,
  listBaseEmbedders,
  listLinkTargets,
  type BaseEmbedder,
} from "./api";
import type {
  BaseInfo,
  BaseTable,
  BaseView,
  FieldMeta,
  FieldTypeDefinition,
  FilterGroup,
  GroupRule,
  PersonalViewConfig,
  RecordRow,
  RecordVisibility,
  GrantSubject,
  SortRule,
  ViewConfig,
  ViewScope,
  ViewType,
} from "./types";
import "./base.css";
import "./feishu.css";
import { buildXlsxBlob } from "./export/xlsx";

const props = defineProps<{
  projectId: string;
  nodeId: string;
  title?: string;
}>();

const emit = defineEmits<{
  (e: "open-doc", nodeId: string): void;
}>();

const PAGE_SIZE = 200;

const base = ref<BaseInfo | null>(null);
const tables = ref<BaseTable[]>([]);
const activeTableId = ref("");
const views = ref<BaseView[]>([]);
/** 当前用户 ID：用于「个人偏好」分桶。 */
const authStore = useAuthStore();
const currentUserId = computed(() => authStore.currentUserId ?? "");
const activeViewId = ref("");
const fields = ref<FieldMeta[]>([]);
const rows = ref<RecordRow[]>([]);
const definitions = ref<FieldTypeDefinition[]>([]);
const total = ref(0);
const cursor = ref<string | undefined>(undefined);
const loading = ref(false);
const keyword = ref("");
const selectedIds = ref<string[]>([]);
const sideOpen = ref(true);

const filters = ref<FilterGroup>({
  logic: "AND",
  conditions: [],
  children: [],
});
const sorts = ref<SortRule[]>([]);
const groups = ref<GroupRule[]>([]);
/**
 * 查询条件（筛选 / 排序 / 分组）保存到哪里：
 * shared = 写进视图共享段（所有人看到的默认条件）；
 * personal = 写进我的个人偏好（只有我自己生效，不再覆盖别人的）。
 */
const queryScope = ref<"shared" | "personal">("shared");
/**
 * 「仅我」模式下，我的条件与共享条件的组合方式：
 * override = 覆盖共享条件；and = 共享 AND 我的（叠加口径）。
 */
const combineMode = ref<QueryCombine>("override");

const showFieldManager = ref(false);
/** 打开字段管理时高亮的字段（列头菜单「编辑字段」）。 */
const fieldManagerFocusId = ref<string | undefined>(undefined);
const showQueryPanel = ref(false);
const showFormula = ref(false);
const showExport = ref(false);
const showImport = ref(false);
const showTableConfig = ref(false);
/** Base 设置（名称 / 图标 / 描述 / 删除）。 */
const showBaseSettings = ref(false);
const showBatch = ref(false);
/** 内嵌了本 Base 的文档（反向索引）。 */
const embedders = ref<BaseEmbedder[]>([]);
const showEmbedders = ref(false);
/** 操作记录（审计）面板。 */
const showAudit = ref(false);
/** 运行监控面板（指标 / 死信 / 导入任务 / 通讯录分组）。 */
const showOps = ref(false);
const showViewSettings = ref(false);
const formulaField = ref<FieldMeta | undefined>(undefined);
const activeRecord = ref<RecordRow | undefined>(undefined);
const exportFormat = ref<"markdown" | "csv" | "xlsx">("markdown");
const exportText = ref("");

/** 关联文档字段的标题映射与可选项。 */
const docTitles = ref<Record<string, string>>({});
const docOptions = ref<Array<{ id: string; title: string }>>([]);
/** 关联记录字段：记录 ID → 标题；目标表 ID → 可选记录。 */
const linkTitles = ref<Record<string, string>>({});
const linkOptions = ref<Record<string, Array<{ id: string; title: string }>>>(
  {},
);
/** 迁移失败时的只读降级数据。 */
const legacy = ref<SheetData | null>(null);
const legacyReason = ref("");

const realtimeStatus = ref<"connecting" | "open" | "closed">("closed");
let realtime: BaseRealtime | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

const activeTable = computed(() =>
  tables.value.find((item) => item.id === activeTableId.value),
);
const activeView = computed(() =>
  views.value.find((item) => item.id === activeViewId.value),
);

/**
 * 视图的「有效配置」= 共享配置 + 我自己的个人偏好（个人偏好优先）。
 *
 * 这样共享视图里的列宽 / 字段显隐可以各改各的，不会互相覆盖
 * （技术方案风险表：共享视图与个人偏好混存 → 用户互相覆盖）。
 */
const effectiveViewConfig = computed<ViewConfig>(() => {
  const view = activeView.value;
  if (!view) return {};
  const config = view.config ?? {};
  const mine = currentUserId.value
    ? config.personal?.[currentUserId.value]
    : undefined;
  if (!mine) return config;
  return {
    ...config,
    fieldVisibility: {
      ...(config.fieldVisibility ?? {}),
      ...(mine.fieldVisibility ?? {}),
    },
    fieldWidths: { ...(config.fieldWidths ?? {}), ...(mine.fieldWidths ?? {}) },
    frozenFields: mine.frozenFields ?? config.frozenFields,
    // 列顺序：个人段优先（飞书：每个视图 / 每个人的列顺序可以不同）。
    fieldOrder: mine.fieldOrder ?? config.fieldOrder,
    layout: { ...(config.layout ?? {}), ...(mine.layout ?? {}) },
    // 个人查询条件覆盖共享条件（第十三轮）。
    filters: mine.query?.filters ?? config.filters,
    sorts: mine.query?.sorts ?? config.sorts,
    groups: mine.query?.groups ?? config.groups,
  };
});

/**
 * 视图的「共享查询条件」（第十四轮）：共享段里的 filters / sorts / groups。
 * 它是「我的条件」的叠加底座，两者是分开的两个来源。
 */
const sharedQuery = computed(() => {
  const config = activeView.value?.config ?? {};
  return {
    filters: normalizeFilters(config.filters),
    // 存量视图里可能存着重复 / 超限的规则（历史数据），
    // 这里去重截断，避免整表查询被后端 422 拦下。
    sorts: normalizeSorts(config.sorts as SortRule[]),
    groups: normalizeGroups(config.groups as GroupRule[]),
  };
});

/** 我的个人查询条件（个人段里的 query），没有则为空。 */
const personalQuery = computed(() => {
  const uid = currentUserId.value;
  if (!uid) return undefined;
  const mine = activeView.value?.config?.personal?.[uid];
  return mine?.query;
});

/**
 * 生效口径（第十四轮）：
 * override —— 我的条件完全覆盖共享条件；
 * and      —— 共享条件 AND 我的条件（叠加）。
 */
const effectiveQuery = computed(() => {
  if (queryScope.value !== "personal" || !personalQuery.value) {
    return {
      filters: filters.value,
      sorts: normalizeSorts(sorts.value),
      groups: normalizeGroups(groups.value),
    };
  }
  return {
    filters: resolveFilters(
      sharedQuery.value.filters,
      filters.value,
      combineMode.value,
    ),
    sorts: resolveSorts(
      sharedQuery.value.sorts,
      sorts.value,
      combineMode.value,
    ),
    groups: resolveGroups(
      sharedQuery.value.groups,
      groups.value,
      combineMode.value,
    ),
  };
});
const viewType = computed<ViewType>(() => activeView.value?.type ?? "grid");
const boardType = computed<"kanban" | "calendar" | "gallery">(() =>
  viewType.value === "grid"
    ? "kanban"
    : (viewType.value as "kanban" | "calendar" | "gallery"),
);
const hasFilter = computed(() => filters.value.conditions.length > 0);
const hasSort = computed(() => sorts.value.length > 0);
const groupFieldId = computed(() => groups.value[0]?.fieldId);
const primaryField = computed(
  () => fields.value.find((item) => item.isPrimary) ?? fields.value[0],
);
const canEdit = computed(() => true);

const viewIcon = (type: ViewType) =>
  type === "grid"
    ? Grid
    : type === "kanban"
      ? DataBoard
      : type === "calendar"
        ? Calendar
        : type === "form"
          ? EditPen
          : type === "gantt"
            ? Histogram
            : Picture;

// —— 加载链路 ——

async function bootstrap() {
  loading.value = true;
  try {
    base.value = await ensureBase(props.projectId, props.nodeId, props.title);
    await loadDocIndex();
    // 迁移失败不挡门：回落到旧 JSONB 的只读模式。
    if (base.value.migrated?.startsWith("failed")) {
      legacyReason.value = base.value.migrated.slice("failed:".length);
      await loadLegacyFallback();
      return;
    }
    definitions.value = await listFieldTypes(props.projectId);
    tables.value = await listTables(props.projectId, base.value.id);
    if (
      !activeTableId.value ||
      !tables.value.some((item) => item.id === activeTableId.value)
    ) {
      activeTableId.value = tables.value[0]?.id ?? "";
    }
    if (activeTableId.value) await loadTable();
    await loadEmbedders();
  } catch (err) {
    ElMessage.error((err as Error).message || "多维表格加载失败");
  } finally {
    loading.value = false;
  }
}

/** 内嵌引用：哪些文档把本 Base 嵌进了正文。 */
async function loadEmbedders() {
  if (!base.value?.id) {
    embedders.value = [];
    return;
  }
  try {
    embedders.value = await listBaseEmbedders(props.projectId, base.value.id);
  } catch {
    embedders.value = [];
  }
}

function openEmbedder(item: BaseEmbedder) {
  showEmbedders.value = false;
  emit("open-doc", item.nodeId);
}

/** 关联文档字段：拉取知识库目录，得到节点 ID → 标题。 */
async function loadDocIndex() {
  try {
    const tree = await getKnowledgeTree(props.projectId);
    const titles: Record<string, string> = {};
    const options: Array<{ id: string; title: string }> = [];
    for (const node of tree ?? []) {
      titles[node.id] = node.title;
      if (node.nodeType === "doc" || node.nodeType === "canvas") {
        options.push({ id: node.id, title: node.title });
      }
    }
    docTitles.value = titles;
    docOptions.value = options;
  } catch {
    docTitles.value = {};
    docOptions.value = [];
  }
}

/** 只读降级：读取旧 JSONB 表格。 */
async function loadLegacyFallback() {
  try {
    const raw = await getNodeData(props.projectId, props.nodeId);
    legacy.value = migrateSheet(raw?.data ?? (raw as unknown));
  } catch (err) {
    ElMessage.error((err as Error).message || "旧版表格读取失败");
  }
}

/**
 * 关联记录字段：拉取目标表的记录候选，建立「记录 ID → 标题」映射。
 *
 * 目标表来自字段配置 `config.targetTableId`；没配置时用当前表（同表自关联）。
 */
async function loadLinkIndex() {
  const targets = new Set<string>();
  for (const field of fields.value) {
    if (field.type !== "link") continue;
    const target =
      typeof field.config?.targetTableId === "string"
        ? field.config.targetTableId
        : "";
    targets.add(target || activeTableId.value);
  }
  const titles: Record<string, string> = {};
  const options: Record<string, Array<{ id: string; title: string }>> = {};
  for (const tableId of targets) {
    if (!tableId) continue;
    try {
      const items = await listLinkTargets(props.projectId, tableId, "", 200);
      options[tableId] = items.map((item) => ({
        id: item.id,
        title: item.title,
      }));
      for (const item of items) titles[item.id] = item.title;
    } catch {
      options[tableId] = [];
    }
  }
  linkTitles.value = titles;
  linkOptions.value = options;
}

async function loadTable() {
  if (!activeTableId.value) return;
  views.value = await listViews(props.projectId, activeTableId.value);
  if (
    !activeViewId.value ||
    !views.value.some((item) => item.id === activeViewId.value)
  ) {
    const fallback =
      views.value.find((item) => item.isDefault) ?? views.value[0];
    activeViewId.value = fallback?.id ?? "";
  }
  applyViewConfig();
  await runQuery();
}

function applyViewConfig() {
  // 共享条件（视图给所有人看的默认口径）。
  const shared = sharedQuery.value;
  // 我的条件（个人段里的 query）。
  const mine = personalQuery.value;
  if (mine) {
    // 「仅我」模式：面板编辑的是**我的**条件；生效口径由 combine 决定。
    filters.value = normalizeFilters(mine.filters);
    sorts.value = normalizeSorts(mine.sorts);
    groups.value = normalizeGroups(mine.groups);
    queryScope.value = "personal";
    combineMode.value = normalizeCombine(mine.combine);
  } else {
    filters.value = shared.filters;
    sorts.value = shared.sorts;
    groups.value = shared.groups;
    queryScope.value = "shared";
    combineMode.value = "override";
  }
}

/**
 * 列顺序：主字段永远第一，其余按 sortOrder。
 *
 * sortOrder 相同（历史数据）时按**字段名**兜底排序，
 * 否则同值字段的相对次序取决于服务端返回顺序，刷新一次列顺序就变一次。
 */
function sortFields(list: FieldMeta[]): FieldMeta[] {
  return [...list].sort(
    (a, b) =>
      Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary)) ||
      a.sortOrder - b.sortOrder ||
      a.name.localeCompare(b.name, "zh-Hans-CN"),
  );
}

/** 兼容历史迁移数据：旧版把筛选存成条件数组。 */
function normalizeFilters(raw: unknown): FilterGroup {
  return normalizeFiltersPure(raw);
}

async function runQuery(append = false) {
  if (!activeTableId.value) return;
  loading.value = true;
  try {
    // 「视图即查询」：
    // 当生效口径**完全等于视图自带的配置**时，走 POST /views/:viewId/query，
    // 由服务端按视图配置执行（视图配置为默认，请求体可覆盖）；
    // 否则（叠加了个人条件 / 关键词搜索）走表级查询接口，
    // 因为表级接口才能表达「共享条件 AND/OR 我的条件」这种合并口径。
    const useViewQuery =
      !!activeViewId.value &&
      !keyword.value.trim() &&
      queryScope.value !== "personal";
    const result = useViewQuery
      ? await queryByView(props.projectId, activeViewId.value, {
          pageSize: PAGE_SIZE,
          cursor: append ? cursor.value : undefined,
        })
      : await queryRecords(props.projectId, {
          tableId: activeTableId.value,
          viewId: activeViewId.value || undefined,
          // 用「生效口径」（第十四轮：可能是共享 + 我的叠加）。
          filters: effectiveQuery.value.filters,
          sorts: effectiveQuery.value.sorts,
          groups: effectiveQuery.value.groups,
          pageSize: PAGE_SIZE,
          cursor: append ? cursor.value : undefined,
          keyword: keyword.value.trim() || undefined,
        });
    rows.value = append ? [...rows.value, ...result.records] : result.records;
    fields.value = result.fields?.length
      ? sortFields(result.fields)
      : fields.value;
    total.value = result.total;
    cursor.value = result.page?.nextCursor;
    await loadLinkIndex();
  } catch (err) {
    ElMessage.error((err as Error).message || "查询失败");
  } finally {
    loading.value = false;
  }
}

// —— 视图 / 表切换 ——

async function switchTable(tableId: string) {
  if (tableId === activeTableId.value) return;
  activeTableId.value = tableId;
  activeViewId.value = "";
  await loadTable();
}

async function switchView(view: BaseView) {
  activeViewId.value = view.id;
  // 先用列表里的视图配置立即生效（不等待网络），随后从服务端读最新配置覆盖。
  applyViewConfig();
  await runQuery();
  // 视图可能被其他人改过：走只读 GET（GET /base/views/:viewId）读最新一份。
  try {
    const fresh = await fetchView(props.projectId, view.id);
    if (fresh && fresh.id === activeViewId.value) {
      const idx = views.value.findIndex((item) => item.id === fresh.id);
      if (idx >= 0) views.value[idx] = { ...views.value[idx], ...fresh };
      applyViewConfig();
      await runQuery();
    }
  } catch {
    // 读不到就沿用列表里的配置，不打断切换。
  }
}

async function addTable() {
  try {
    const { value } = await ElMessageBox.prompt("新表名称", "新建数据表", {
      confirmButtonText: "创建",
      cancelButtonText: "取消",
      inputValidator: (input) => (input && input.trim() ? true : "请输入表名"),
    });
    const table = await createTable(
      props.projectId,
      base.value!.id,
      (value ?? "").trim(),
    );
    tables.value = await listTables(props.projectId, base.value!.id);
    activeTableId.value = table.id;
    activeViewId.value = "";
    await loadTable();
    ElMessage.success("数据表已创建");
  } catch {
    /* 取消 */
  }
}

/**
 * 确保存在一张可用的数据表。
 * 所有表级接口都依赖 tableId；Base 为空（刚创建、还没有表）时直接调接口会拼出
 * `/tables//fields` 这种空路径并拿到 404。这里统一兜底：没有就建一张默认表。
 */
async function ensureTable(): Promise<string> {
  if (activeTableId.value) return activeTableId.value;
  if (!base.value) return "";
  try {
    const table = await createTable(props.projectId, base.value.id, "数据表");
    // 补一张默认网格视图，否则「视图配置」等视图级入口没有落点。
    await createView(props.projectId, table.id, "表格视图", "grid", {}).catch(
      () => undefined,
    );
    tables.value = await listTables(props.projectId, base.value.id);
    activeTableId.value = table.id;
    activeViewId.value = "";
    await loadTable();
    ElMessage.success("已创建默认数据表");
    return table.id;
  } catch (err) {
    ElMessage.error((err as Error).message || "数据表创建失败");
    return "";
  }
}

/** 打开字段管理：先保证有表。 */
async function openFieldManager() {
  if (!(await ensureTable())) return;
  showFieldManager.value = true;
}

/** 打开公式面板：先保证有表。 */
async function openFormula() {
  if (!(await ensureTable())) return;
  formulaField.value = undefined;
  showFormula.value = true;
}

/** 打开导入面板：先保证有表。 */
async function openImport() {
  if (!(await ensureTable())) return;
  showImport.value = true;
}

/** 打开表配置面板：导出/导入表结构与策略。 */
async function openTableConfig() {
  if (!(await ensureTable())) return;
  showTableConfig.value = true;
}

/** Base 元信息保存后同步到本地状态。 */
function onBaseSaved(updated: BaseInfo) {
  base.value = updated;
}

/** Base 被删除：回到未加载状态，由外层路由处理回退。 */
async function onBaseDeleted() {
  ElMessage.info("Base 已删除，数据表与记录一并移除");
  // 绑定在知识库节点上的 Base 会在下次打开时重建为空表，这里直接重新走一遍加载链路。
  activeTableId.value = "";
  await bootstrap();
}

/** 导入配置包后切换到新建的表。 */
async function onTableConfigImported(tableId: string) {
  if (!base.value) return;
  tables.value = await listTables(props.projectId, base.value.id);
  if (tableId && tables.value.some((item) => item.id === tableId)) {
    activeTableId.value = tableId;
    activeViewId.value = "";
    await loadTable();
  }
}

/** 新建视图弹窗的开关与提交结果。 */
const showViewCreate = ref(false);

async function addView() {
  if (!activeTableId.value) return;
  showViewCreate.value = true;
}

/** 弹窗确认后真正建视图。 */
async function createViewWithScope(payload: {
  name: string;
  scope: ViewScope;
  type: ViewType;
}) {
  if (!activeTableId.value) return;
  try {
    const view = await createView(
      props.projectId,
      activeTableId.value,
      payload.name,
      payload.type ?? "grid",
      {
        filters: filters.value,
        sorts: sorts.value,
        groups: groups.value,
      },
      payload.scope,
    );
    views.value = await listViews(props.projectId, activeTableId.value);
    activeViewId.value = view.id;
    showViewCreate.value = false;
    await runQuery();
    ElMessage.success(
      payload.scope === "personal"
        ? "已创建个人视图（仅自己可见）"
        : "视图已创建",
    );
  } catch (err) {
    ElMessage.error((err as Error).message || "创建视图失败");
  }
}

// —— 单元格写入（乐观更新 + 乐观锁） ——

/** 画廊手动排序：写回服务端后重新取数（顺序是服务端权威）。 */
async function onReorderRows(ids: string[]) {
  if (!activeTableId.value) return;
  try {
    await reorderRecords(props.projectId, activeTableId.value, ids);
    await runQuery();
  } catch (err) {
    ElMessage.error((err as Error).message || "排序保存失败");
  }
}

/** 批量拖拽排序：把选中的行拖到目标行之前 / 之后。 */
async function onRowsReorder(payload: {
  ids: string[];
  targetId: string;
  position: "before" | "after";
}) {
  if (!activeTableId.value || !canEdit.value) return;
  const current = rows.value.map((row) => row.id);
  const moving = payload.ids.filter((id) => current.includes(id));
  if (!moving.length) return;
  const rest = current.filter((id) => !moving.includes(id));
  const targetIndex = rest.indexOf(payload.targetId);
  if (targetIndex < 0) return;
  const insertAt =
    payload.position === "before" ? targetIndex : targetIndex + 1;
  const next = [...rest.slice(0, insertAt), ...moving, ...rest.slice(insertAt)];
  try {
    await reorderRecords(props.projectId, activeTableId.value, next);
    await runQuery();
    ElMessage.success(
      moving.length > 1
        ? `已把 ${moving.length} 行移动到目标位置`
        : "已移动到目标位置",
    );
  } catch (err) {
    ElMessage.error((err as Error).message || "排序保存失败");
  }
}

/** 同一条记录的写入串行化：避免批量粘贴时版本号互相打架。 */
const writeQueue = new Map<string, Promise<void>>();

/** 修改记录的可见范围（记录级可见性）。 */
async function onVisibilityUpdate(payload: {
  visibility: RecordVisibility;
  grants?: string[];
  grantSubjects?: GrantSubject[];
}) {
  const row = activeRecord.value;
  if (!row) return;
  const previous = row.visibility ?? "space";
  row.visibility = payload.visibility;
  try {
    const saved = await updateRecord(
      props.projectId,
      row.id,
      {},
      row.version,
      payload.visibility,
      payload.grants,
      payload.grantSubjects,
    );
    Object.assign(row, saved);
    const label =
      payload.visibility === "restricted"
        ? "已设为仅自己可见"
        : payload.visibility === "custom"
          ? `已设为指定成员可见（${payload.grantSubjects?.length ?? payload.grants?.length ?? 0} 项）`
          : "已恢复空间可见";
    ElMessage.success(label);
    // 可见范围变了，列表内容也可能变（受限记录不再出现在别人的列表里）。
    await runQuery();
  } catch (err) {
    row.visibility = previous;
    ElMessage.error((err as Error).message || "修改可见范围失败");
  }
}

async function onCellUpdate(payload: {
  recordId: string;
  fieldId: string;
  value: unknown;
}) {
  const previous = writeQueue.get(payload.recordId) ?? Promise.resolve();
  const next = previous.then(() => writeCell(payload)).catch(() => undefined);
  writeQueue.set(payload.recordId, next);
  await next;
}

async function writeCell(payload: {
  recordId: string;
  fieldId: string;
  value: unknown;
}) {
  const row = rows.value.find((item) => item.id === payload.recordId);
  if (!row) return;
  const previous = row.fields[payload.fieldId];
  const version = row.version;
  row.fields = { ...row.fields, [payload.fieldId]: payload.value };
  try {
    const saved = await updateRecord(
      props.projectId,
      payload.recordId,
      { [payload.fieldId]: payload.value },
      version,
    );
    Object.assign(row, saved);
  } catch (err) {
    row.fields[payload.fieldId] = previous;
    const status = (err as { status?: number }).status;
    if (status === 409) {
      try {
        await ElMessageBox.confirm(
          "这条记录已被他人修改，重新载入最新值？",
          "版本冲突",
          {
            confirmButtonText: "重新载入",
            cancelButtonText: "保留我的输入",
            type: "warning",
          },
        );
        await runQuery();
      } catch {
        /* 保留输入 */
      }
    } else {
      ElMessage.error((err as Error).message || "保存失败");
    }
  }
}

async function onAddRow() {
  if (!(await ensureTable())) return;
  try {
    const row = await createRecord(props.projectId, activeTableId.value, {});
    rows.value = [row, ...rows.value];
    total.value += 1;
    ElMessage.success("已新增记录");
  } catch (err) {
    ElMessage.error((err as Error).message || "新增失败");
  }
}

/** 表单视图提交：新建一条记录。 */
async function onFormSubmit(payload: { fields: Record<string, unknown> }) {
  if (!(await ensureTable())) return;
  try {
    const row = await createRecord(
      props.projectId,
      activeTableId.value,
      payload.fields,
    );
    rows.value = [row, ...rows.value];
    total.value += 1;
  } catch (err) {
    ElMessage.error((err as Error).message || "提交失败");
  }
}

function onOpenRecord(recordId: string) {
  activeRecord.value = rows.value.find((item) => item.id === recordId);
}

/**
 * 打开被关联的记录（跨表）。
 *
 * 目标表与当前表不同则先切表；目标记录不在当前筛选结果里时，
 * 再按标题检索一次，避免「点了没反应」。
 */
async function onOpenRecordRef(payload: {
  tableId: string;
  recordId: string;
  title: string;
}) {
  if (payload.tableId && payload.tableId !== activeTableId.value) {
    await switchTable(payload.tableId);
  }
  const found = rows.value.find((item) => item.id === payload.recordId);
  if (found) {
    activeRecord.value = found;
    return;
  }
  try {
    const result = await queryRecords(props.projectId, {
      tableId: activeTableId.value,
      keyword: payload.title || undefined,
      pageSize: 20,
    });
    const hit = result.records.find((item) => item.id === payload.recordId);
    if (hit) {
      activeRecord.value = hit;
    } else {
      ElMessage.info("未在当前空间找到该记录");
    }
  } catch (err) {
    ElMessage.error((err as Error).message || "跳转记录失败");
  }
}

/**
 * 抽屉里点了「刷新最新值」：把服务端返回的最新行同步回列表。
 *
 * 这样「只读 GET 单条记录」不只是个接口，而是真的让用户看到别人的最新改动。
 */
function onRecordRefreshed(fresh: RecordRow) {
  activeRecord.value = fresh;
  const idx = rows.value.findIndex((item) => item.id === fresh.id);
  if (idx >= 0) rows.value[idx] = fresh;
  ElMessage.success("已同步服务端最新值");
}

async function onDeleteRecord(recordId: string) {
  try {
    await ElMessageBox.confirm(
      "删除后不可恢复，确认删除这条记录？",
      "删除记录",
      {
        confirmButtonText: "删除",
        cancelButtonText: "取消",
        type: "warning",
      },
    );
  } catch {
    return;
  }
  try {
    await deleteRecord(props.projectId, recordId);
    rows.value = rows.value.filter((item) => item.id !== recordId);
    total.value = Math.max(0, total.value - 1);
    activeRecord.value = undefined;
    ElMessage.success("记录已删除");
  } catch (err) {
    ElMessage.error((err as Error).message || "删除失败");
  }
}

// —— 筛选 / 排序 ——

async function applyQuery(payload: {
  filters: FilterGroup;
  sorts: SortRule[];
  groups: GroupRule[];
}) {
  filters.value = payload.filters;
  sorts.value = normalizeSorts(payload.sorts);
  groups.value = normalizeGroups(payload.groups);
  showQueryPanel.value = false;
  await runQuery();
  await persistViewConfig();
}

async function persistViewConfig() {
  const view = activeView.value;
  if (!view) return;
  try {
    const current = view.config ?? {};
    // 共享段：整体替换前先保留共享的查询条件（个人模式下不动它）。
    const sharedPart: BaseView["config"] = { ...current };
    delete sharedPart.personal;
    const personalMap: Record<string, PersonalViewConfig> = {
      ...(current.personal ?? {}),
    };
    if (currentUserId.value) {
      const mine: PersonalViewConfig = {
        ...(personalMap[currentUserId.value] ?? {}),
      };
      if (queryScope.value === "personal") {
        // 只存「我的」条件；叠加口径由 combine 表达（第十四轮）。
        mine.query = {
          filters: filters.value,
          sorts: sorts.value,
          groups: groups.value,
          combine:
            combineMode.value === "and"
              ? "and"
              : combineMode.value === "or"
                ? "or"
                : "override",
        };
      } else {
        // 共享模式：写共享段，并丢掉我自己的查询覆盖。
        sharedPart.filters = filters.value;
        sharedPart.sorts = sorts.value;
        sharedPart.groups = groups.value;
        delete mine.query;
      }
      if (Object.keys(mine).length) {
        personalMap[currentUserId.value] = mine;
      } else {
        delete personalMap[currentUserId.value];
      }
    } else {
      // 识别不出当前用户时只能写共享段，绝不能静默当成「个人偏好」。
      sharedPart.filters = filters.value;
      sharedPart.sorts = sorts.value;
      sharedPart.groups = groups.value;
    }
    await updateView(props.projectId, view.id, {
      config: { ...sharedPart, personal: personalMap },
      version: view.version,
    });
    views.value = await listViews(props.projectId, activeTableId.value);
  } catch {
    /* 视图配置保存失败不打断查询 */
  }
}

/**
 * 切换查询条件的保存范围。
 *
 * 切到「仅我」：把当前条件收进我的个人偏好（首次切换以当前条件为种子）。
 * 切到「共享」：回到视图的共享条件，并清掉我的覆盖。
 */
async function onQueryScopeChange(kind: string | number | boolean | undefined) {
  const next = kind === "personal" ? "personal" : "shared";
  const view = activeView.value;
  queryScope.value = next;
  if (!view) return;
  if (next === "personal") {
    // 以当前条件为种子写入个人偏好，再落库。
    // 若视图本来就有共享条件、个人模式默认「覆盖」，
    // 这里给用户一个选择：叠加（共享 AND 我的）还是只看我的。
    await persistViewConfig();
    ElMessage.success("筛选与排序已保存为「仅我」生效");
    return;
  }
  // 回到共享条件。
  filters.value = sharedQuery.value.filters;
  sorts.value = sharedQuery.value.sorts;
  groups.value = sharedQuery.value.groups;
  await runQuery();
  await persistViewConfig();
  ElMessage.success("已恢复视图的共享筛选与排序");
}

/** 切换条件组合口径：只用我的 / 与共享同时满足 / 与共享任一满足。 */
function onCombineChange(value: string | number | boolean | undefined) {
  combineMode.value = value === "or" ? "or" : value === "and" ? "and" : "override";
  void (async () => {
    await runQuery();
    await persistViewConfig();
    ElMessage.success(
      combineMode.value === "and"
        ? "已切换为「共享条件 AND 我的条件」"
        : combineMode.value === "or"
          ? "已切换为「共享条件 OR 我的条件」"
          : "已切换为「只用我的条件」",
    );
  })();
}

function clearQuery() {
  filters.value = { logic: "AND", conditions: [], children: [] };
  sorts.value = [];
  groups.value = [];
  void runQuery();
  void persistViewConfig();
}

// —— 列头菜单（飞书多维表格同款）——

/** 打开查询面板时要聚焦的字段（列头「筛选此列」）。 */
const queryFocusFieldId = ref<string | undefined>(undefined);

/** 当前视图里可见字段的顺序（与表格列一致）。 */
function visibleFieldOrder(): string[] {
  const hidden = new Set(hiddenFieldIds.value);
  return fields.value
    .filter((item) => !hidden.has(item.id))
    .map((item) => item.id);
}

/** 按本列升序 / 降序（与飞书一致：选一列排序即成为主排序）。 */
async function onColumnSort(payload: {
  fieldId: string;
  order: "asc" | "desc";
}) {
  sorts.value = [{ fieldId: payload.fieldId, order: payload.order }];
  await runQuery();
  await persistViewConfig();
  ElMessage.success("已按该列排序");
}

/** 清除本列排序。 */
async function onColumnClearSort(payload: { fieldId: string }) {
  sorts.value = sorts.value.filter((item) => item.fieldId !== payload.fieldId);
  await runQuery();
  await persistViewConfig();
}

/** 筛选此列：打开查询面板并聚焦该字段。 */
function onColumnFilter(payload: { fieldId: string }) {
  queryFocusFieldId.value = payload.fieldId;
  showQueryPanel.value = true;
}

/**
 * 写入「字段级」视图配置（显隐 / 列宽 / 冻结）。
 *
 * 口径与「视图配置」弹窗一致：
 *   能识别当前用户 → 写进个人偏好段（只有自己看到，不影响别人）；
 *   识别不出用户 → 拒绝静默写成共享段（那等于替所有人改了视图）。
 */
async function applyFieldConfig(
  mutate: (cfg: {
    fieldVisibility?: Record<string, boolean>;
    fieldWidths?: Record<string, number>;
    frozenFields?: string[];
    fieldOrder?: string[];
  }) => void,
) {
  const view = activeView.value;
  if (!view) return;
  if (!currentUserId.value) {
    ElMessage.warning("未能识别当前用户，个人偏好未保存；请刷新页面后重试");
    return;
  }
  try {
    const config: BaseView["config"] = { ...(view.config ?? {}) };
    const mine: PersonalViewConfig = {
      ...(config.personal?.[currentUserId.value] ?? {}),
    };
    mutate(mine);
    config.personal = {
      ...(config.personal ?? {}),
      [currentUserId.value]: mine,
    };
    await updateView(props.projectId, view.id, {
      config,
      version: view.version,
    });
    views.value = await listViews(props.projectId, activeTableId.value);
  } catch (err) {
    ElMessage.error((err as Error).message || "视图配置保存失败");
  }
}

/** 冻结 / 取消冻结某列（冻结的是「从左到右直到该列」的连续段）。 */
async function onColumnFreeze(payload: { fieldId: string }) {
  const order = visibleFieldOrder();
  const index = order.indexOf(payload.fieldId);
  if (index < 0) return;
  const current = effectiveViewConfig.value.frozenFields ?? [];
  const next = current.includes(payload.fieldId)
    ? order.slice(0, index)
    : order.slice(0, index + 1);
  await applyFieldConfig((cfg) => {
    cfg.frozenFields = next;
  });
  ElMessage.success(
    current.includes(payload.fieldId) ? "已取消冻结" : "已冻结到左侧",
  );
}

/** 隐藏某列。 */
async function onColumnHide(payload: { fieldId: string }) {
  await applyFieldConfig((cfg) => {
    cfg.fieldVisibility = {
      ...(cfg.fieldVisibility ?? {}),
      [payload.fieldId]: false,
    };
  });
  ElMessage.success("已隐藏该列");
}

/** 调整列宽。 */
async function onColumnWidth(payload: { fieldId: string; width: number }) {
  await applyFieldConfig((cfg) => {
    cfg.fieldWidths = {
      ...(cfg.fieldWidths ?? {}),
      [payload.fieldId]: payload.width,
    };
  });
}

/**
 * 拖拽表头调整列顺序。
 *
 * 口径与列宽 / 显隐一致：写**个人偏好段**（每个视图的列顺序可以各看各的）。
 */
async function onColumnReorder(payload: {
  fieldId: string;
  targetFieldId: string;
  position: "before" | "after";
}) {
  const current = effectiveViewConfig.value.fieldOrder?.length
    ? [...effectiveViewConfig.value.fieldOrder]
    : visibleFieldOrder();
  const from = current.indexOf(payload.fieldId);
  if (from < 0) return;
  // 冻结列必须保持「从左起连续」，所以冻结段内不允许调整顺序。
  const frozen = effectiveViewConfig.value.frozenFields ?? [];
  const targetAt = current.indexOf(payload.targetFieldId);
  if (
    frozen.includes(payload.fieldId) ||
    (targetAt >= 0 && frozen.includes(payload.targetFieldId))
  ) {
    ElMessage.warning("冻结列已固定在左侧，不能调整顺序");
    return;
  }
  const next = current.filter((id) => id !== payload.fieldId);
  const targetIndex = next.indexOf(payload.targetFieldId);
  if (targetIndex < 0) return;
  next.splice(
    payload.position === "before" ? targetIndex : targetIndex + 1,
    0,
    payload.fieldId,
  );
  await applyFieldConfig((cfg) => {
    cfg.fieldOrder = next;
  });
}

/** 打开字段管理（编辑该字段）。 */
function onColumnSettings(payload: { fieldId: string }) {
  showFieldManager.value = true;
  fieldManagerFocusId.value = payload.fieldId;
}

// —— 视图配置 ——

const hiddenFieldIds = computed(() => {
  const visibility = effectiveViewConfig.value.fieldVisibility ?? {};
  return Object.entries(visibility)
    .filter(([, visible]) => visible === false)
    .map(([id]) => id);
});

/** 这个视图上是否有一份「我的」查询条件（第十四轮：视图标签上打标）。 */
function hasPersonalQuery(view: BaseView): boolean {
  const uid = currentUserId.value;
  if (!uid) return false;
  return !!view.config?.personal?.[uid]?.query;
}

async function saveViewSettings(payload: {
  name: string;
  personal: boolean;
  edited: BaseView["config"];
  shared: BaseView["config"];
}) {
  const view = activeView.value;
  if (!view) return;
  // 个人偏好按用户分桶；识别不出当前用户时不能静默把配置写成共享的
  // （那等于「我以为存的是私人的，结果所有人都被改了」）。
  if (payload.personal && !currentUserId.value) {
    ElMessage.warning("未能识别当前用户，个人偏好未保存；请刷新页面后重试");
    return;
  }
  try {
    const config: BaseView["config"] = { ...(view.config ?? {}) };
    if (payload.personal && currentUserId.value) {
      // 个人偏好：只把「显隐 / 列宽 / 布局」写进 personal 段，
      // 共享段保持原值，别人打开这个视图不受影响。
      const mine: PersonalViewConfig = {
        ...(config.personal?.[currentUserId.value] ?? {}),
      };
      config.personal = {
        ...(config.personal ?? {}),
        [currentUserId.value]: {
          ...mine,
          fieldVisibility: payload.edited.fieldVisibility,
          fieldWidths: payload.edited.fieldWidths,
          frozenFields: payload.edited.frozenFields,
          layout: payload.edited.layout,
        },
      };
      config.fieldVisibility = payload.shared.fieldVisibility;
      config.fieldWidths = payload.shared.fieldWidths;
      config.frozenFields = payload.shared.frozenFields;
      config.layout = payload.shared.layout;
    } else {
      // 共享模式：编辑结果写进共享段，并清掉自己的偏好段。
      config.fieldVisibility = payload.edited.fieldVisibility;
      config.fieldWidths = payload.edited.fieldWidths;
      config.frozenFields = payload.edited.frozenFields;
      config.layout = payload.edited.layout;
      if (currentUserId.value && config.personal) {
        const next = { ...config.personal };
        // 只清掉「字段级」偏好，我的查询条件（personal.query）要保留。
        const mine = { ...(next[currentUserId.value] ?? {}) };
        delete mine.fieldVisibility;
        delete mine.fieldWidths;
        delete mine.frozenFields;
        delete mine.layout;
        if (Object.keys(mine).length) {
          next[currentUserId.value] = mine;
        } else {
          delete next[currentUserId.value];
        }
        // 注意：这里必须是空对象而不是 undefined ——
        // 服务端靠「personal 段存在但没有我的键」判断「删除我的个人偏好」；
        // 一旦整个键被 undefined 掉（JSON 序列化后消失），服务端就分不清
        // 「没动」和「要删」，我的旧偏好会一直留着。
        config.personal = next;
      }
    }
    await updateView(props.projectId, view.id, {
      name: payload.name,
      config,
      version: view.version,
    });
    views.value = await listViews(props.projectId, activeTableId.value);
    showViewSettings.value = false;
    ElMessage.success(payload.personal ? "已保存为我的偏好" : "视图配置已保存");
  } catch (err) {
    ElMessage.error((err as Error).message || "视图配置保存失败");
  }
}

async function onImported() {
  showImport.value = false;
  await runQuery();
}

async function onBatchDone() {
  showBatch.value = false;
  selectedIds.value = [];
  await runQuery();
}

// —— 导出（与富文本融合的关键路径） ——

/**
 * 右侧记录列表的副标题（飞书记录卡片同款）。
 *
 * 取主字段之外的前两个有值字段，拼成「字段名 值」的短摘要，
 * 让人在列表里就能区分同名记录。
 */
function recordMeta(row: RecordRow): string {
  const parts: string[] = [];
  for (const field of fields.value) {
    if (parts.length >= 2) break;
    if (field.id === primaryField.value?.id) continue;
    const raw = row.fields?.[field.id];
    // 关联记录字段存的是记录 ID，摘要里要显示记录标题而不是 UUID。
    const text =
      field.type === "link"
        ? (Array.isArray(raw) ? raw : [raw])
            .map((id) => linkTitles.value[String(id)] ?? "")
            .filter(Boolean)
            .join("、")
        : cellText(row, field);
    if (!text) continue;
    parts.push(
      `${field.name} ${
        field.type === "user" ||
        field.type === "created_by" ||
        field.type === "updated_by"
          ? resolveUserName(text, text)
          : text
      }`,
    );
  }
  return parts.join(" · ") || `v${row.version}`;
}

function cellText(row: RecordRow, field: FieldMeta) {
  const value = row.fields?.[field.id];
  if (value === null || value === undefined || value === "") return "";
  if (Array.isArray(value)) return value.join("、");
  return String(value);
}

function buildExportText(format: "markdown" | "csv") {
  const cols = fields.value;
  if (format === "markdown") {
    const head = `| ${cols.map((f) => f.name).join(" | ")} |`;
    const sep = `| ${cols.map(() => "---").join(" | ")} |`;
    const body = rows.value.map(
      (row) =>
        `| ${cols.map((f) => cellText(row, f).replace(/\|/g, "\\|")).join(" | ")} |`,
    );
    return [head, sep, ...body].join("\n");
  }
  const escape = (text: string) => `"${text.replace(/"/g, '""')}"`;
  const head = cols.map((f) => escape(f.name)).join(",");
  const body = rows.value.map((row) =>
    cols.map((f) => escape(cellText(row, f))).join(","),
  );
  return [head, ...body].join("\n");
}

function openExport() {
  exportFormat.value = "markdown";
  exportText.value = buildExportText("markdown");
  showExport.value = true;
}

function refreshExportText() {
  exportFormat.value === "xlsx"
    ? (exportText.value = `XLSX 文件：${rows.value.length} 行 × ${fields.value.length} 列（含表头），点击「下载文件」导出。`)
    : (exportText.value = buildExportText(exportFormat.value));
}

/** 导出为 xlsx（零依赖生成器，Excel / WPS / Numbers 均可打开）。 */
function buildExportXlsx() {
  const cols = fields.value;
  const header = cols.map((f) => f.name);
  const body = rows.value.map((row) =>
    cols.map((f) => {
      const raw = row.fields?.[f.id];
      if (raw === null || raw === undefined || raw === "") return "";
      if (Array.isArray(raw)) return raw.join("、");
      if (typeof raw === "number" || typeof raw === "boolean") return raw;
      return String(raw);
    }),
  );
  return buildXlsxBlob([
    {
      name: activeTable.value?.name ?? "Sheet1",
      rows: [header, ...body],
      columnWidths: cols.map((f) =>
        Math.min(40, Math.max(12, f.name.length * 2 + 6)),
      ),
    },
  ]);
}

async function copyExport() {
  try {
    await navigator.clipboard.writeText(exportText.value);
    ElMessage.success("已复制，可直接粘贴到文档中");
  } catch {
    ElMessage.warning("复制失败，请手动选择文本");
  }
}

function downloadExport() {
  const isXlsx = exportFormat.value === "xlsx";
  const ext = isXlsx
    ? "xlsx"
    : exportFormat.value === "markdown"
      ? "md"
      : "csv";
  const mime = isXlsx
    ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    : exportFormat.value === "markdown"
      ? "text/markdown"
      : "text/csv";
  const blob = isXlsx
    ? buildExportXlsx()
    : new Blob([exportText.value], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${activeTable.value?.name ?? "base"}.${ext}`;
  link.click();
  URL.revokeObjectURL(url);
}

// —— 实时协同 ——

function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => void runQuery(), 400);
}

function onRealtimeEvent(event: BaseEvent) {
  // 权限变更（字段策略 / 记录可见范围）会影响「能不能看见哪些列、哪些行」，
  // 必须连字段元信息一起重新拉，否则页面会停留在旧权限下的视图里
  // （技术方案第 8 章：权限变更后失效订阅）。
  if (event.eventType === "permission.changed") {
    if (event.tableId && event.tableId !== activeTableId.value) return;
    // runQuery 会同时带回最新的字段元信息（权限变化会改变可见列）。
    scheduleRefresh();
    return;
  }
  if (event.tableId && event.tableId !== activeTableId.value) return;
  scheduleRefresh();
}

function startRealtime() {
  realtime?.stop();
  realtime = new BaseRealtime({
    projectId: props.projectId,
    onEvent: onRealtimeEvent,
    // 断线重连后做一次全量刷新：补拉只保证不漏事件，不保证本地是最新的。
    onResync: () => scheduleRefresh(),
    onStatus: (status) => {
      realtimeStatus.value = status;
    },
  });
  realtime.start();
}

watch(
  () => props.nodeId,
  () => {
    activeTableId.value = "";
    activeViewId.value = "";
    void bootstrap();
  },
);

watch(keyword, () => {
  void runQuery();
});

/*
 * 工具栏横向滚动提示。
 * 宽度不够时按钮组会横向滚动（而不是换行被裁），
 * 这里给右边缘加一层渐隐，提示「右边还有内容」。
 */
const toolbarScroll = ref<HTMLElement | null>(null);
const toolbarOverflow = ref(false);

function syncToolbarOverflow() {
  const el = toolbarScroll.value;
  toolbarOverflow.value = !!el && el.scrollWidth > el.clientWidth + 2;
}

onMounted(() => {
  void bootstrap();
  // 人员 / 创建人 / 更新人字段显示人名（右侧记录列表摘要也要用）。
  void ensureUserNames();
  startRealtime();
  window.addEventListener("resize", syncToolbarOverflow);
  syncToolbarOverflow();
});

onBeforeUnmount(() => {
  realtime?.stop();
  realtime = null;
  if (refreshTimer) clearTimeout(refreshTimer);
  window.removeEventListener("resize", syncToolbarOverflow);
});
</script>

<template>
  <div class="be-shell" :class="{ 'is-loading': loading }">
    <header class="be-header">
      <div class="be-header__title">
        <el-icon><Tickets /></el-icon>
        <span class="be-header__name">{{
          activeTable?.name || base?.name || title || "多维表格"
        }}</span>
        <span
          v-if="base?.migrated?.startsWith('legacy_sheet')"
          class="be-header__sub"
          >已从旧版表格迁移</span
        >
      </div>
      <el-select
        v-if="tables.length > 1"
        :model-value="activeTableId"
        size="small"
        style="width: 160px"
        @change="switchTable"
      >
        <el-option
          v-for="table in tables"
          :key="table.id"
          :label="table.name"
          :value="table.id"
        />
      </el-select>
      <div class="be-header__spacer" />
      <span class="be-status" :class="`is-${realtimeStatus}`">
        <span class="be-status__dot" />
        {{
          realtimeStatus === "open"
            ? "实时同步中"
            : realtimeStatus === "connecting"
              ? "连接中"
              : "离线"
        }}
      </span>
      <el-dropdown trigger="click">
        <el-button :icon="MoreFilled" circle size="small" />
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item :icon="Plus" @click="addTable"
              >新建数据表</el-dropdown-item
            >
            <el-dropdown-item :icon="Tickets" @click="addView"
              >新建视图</el-dropdown-item
            >
            <el-dropdown-item :icon="Download" divided @click="openExport"
              >导出数据</el-dropdown-item
            >
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-tooltip content="显示 / 隐藏信息面板" placement="bottom">
        <el-button
          :icon="InfoFilled"
          circle
          size="small"
          @click="sideOpen = !sideOpen"
        />
      </el-tooltip>
    </header>

    <div class="be-toolbar">
      <div
        ref="toolbarScroll"
        class="be-toolbar__scroll"
        :class="{ 'is-overflowing': toolbarOverflow }"
      >
        <el-input
          v-model="keyword"
          class="be-toolbar__search"
          size="small"
          placeholder="搜索记录"
          clearable
        >
          <template #prefix
            ><el-icon><Search /></el-icon
          ></template>
        </el-input>
        <!-- 查询组 -->
        <div class="be-btngroup">
          <el-button
            size="small"
            :icon="Filter"
            :class="{ 'is-active': hasFilter }"
            @click="showQueryPanel = true"
          >
            筛选
          </el-button>
          <el-button
            size="small"
            :icon="Sort"
            :class="{ 'is-active': hasSort }"
            @click="showQueryPanel = true"
          >
            排序
          </el-button>
          <el-button
            size="small"
            :icon="Delete"
            :disabled="!hasFilter && !hasSort"
            @click="clearQuery"
          >
            重置
          </el-button>
          <el-tooltip
            :content="
              queryScope === 'personal'
                ? '当前筛选与排序只对你生效（视图的共享条件保持不变）'
                : '当前筛选与排序会写进视图共享段，所有人打开这个视图都会看到'
            "
            placement="bottom"
          >
            <el-radio-group
              v-model="queryScope"
              size="small"
              class="be-query-scope"
              @change="onQueryScopeChange"
            >
              <el-radio-button value="shared">共享</el-radio-button>
              <el-radio-button value="personal">仅我</el-radio-button>
            </el-radio-group>
          </el-tooltip>
          <el-radio-group
            v-if="queryScope === 'personal'"
            :model-value="combineMode"
            size="small"
            class="be-query-combine-group"
            @change="onCombineChange"
          >
            <el-radio-button value="override">只用我的</el-radio-button>
            <el-radio-button value="and">同时满足</el-radio-button>
            <el-radio-button value="or">任一满足</el-radio-button>
          </el-radio-group>
        </div>
        <!-- 结构组 -->
        <div class="be-btngroup">
          <el-button size="small" :icon="Grid" @click="openFieldManager"
            >字段</el-button
          >
          <el-button size="small" :icon="MagicStick" @click="openFormula">
            公式
          </el-button>
          <el-button
            size="small"
            :icon="Setting"
            :disabled="!activeView"
            @click="showViewSettings = true"
          >
            视图配置
          </el-button>
        </div>
        <!-- 数据组 -->
        <div class="be-btngroup">
          <el-button size="small" :icon="Download" @click="openExport"
            >导出</el-button
          >
          <el-button size="small" :icon="Upload" @click="openImport"
            >导入</el-button
          >
          <el-tooltip
            content="导出/导入表结构与策略（字段类型、权限、条件可见、视图）"
            placement="bottom"
          >
            <el-button size="small" :icon="Files" @click="openTableConfig"
              >表配置</el-button
            >
          </el-tooltip>
          <el-tooltip content="哪些文档内嵌了这张表" placement="bottom">
            <el-button
              size="small"
              :icon="Link"
              :class="{ 'is-active': embedders.length }"
              @click="showEmbedders = true"
            >
              内嵌{{ embedders.length ? ` ${embedders.length}` : "" }}
            </el-button>
          </el-tooltip>
          <el-tooltip content="谁在什么时候改了什么" placement="bottom">
            <el-button size="small" :icon="Clock" @click="showAudit = true"
              >操作记录</el-button
            >
          </el-tooltip>
          <el-tooltip content="运行指标 / 事件死信 / 导入任务 / 通讯录分组" placement="bottom">
            <el-button size="small" :icon="DataLine" @click="showOps = true"
              >运行监控</el-button
            >
          </el-tooltip>
          <el-tooltip
            content="Base 名称 / 图标 / 描述，或删除整个 Base"
            placement="bottom"
          >
            <el-button
              size="small"
              :icon="Setting"
              @click="showBaseSettings = true"
              >Base 设置</el-button
            >
          </el-tooltip>
        </div>
      </div>
      <el-button size="small" type="primary" :icon="Plus" @click="onAddRow"
        >新增记录</el-button
      >
      <span class="be-toolbar__count">共 {{ total }} 条</span>
    </div>

    <div v-if="views.length" class="be-views">
      <button
        v-for="view in views"
        :key="view.id"
        class="be-views__item"
        :class="{ 'is-active': view.id === activeViewId }"
        @click="switchView(view)"
      >
        <el-icon><component :is="viewIcon(view.type)" /></el-icon>
        {{ view.name }}
        <el-icon
          v-if="view.scope === 'personal'"
          class="be-views__lock"
          title="仅自己可见"
        >
          <Lock />
        </el-icon>
        <span
          v-if="hasPersonalQuery(view)"
          class="be-views__mine"
          title="这个视图上你有一份自己的筛选 / 排序条件"
        >
          我的条件
        </span>
      </button>
    </div>

    <div class="be-body">
      <div class="be-body__main">
        <div v-if="legacy" class="be-legacy">
          <el-alert
            type="warning"
            :closable="false"
            show-icon
            :title="`迁移到新版表格失败，已进入只读模式：${legacyReason}`"
            description="旧版数据仍完整保留。请联系管理员修复后重新打开；在此之前可以导出旧数据。"
          />
          <div class="be-legacy__table">
            <table>
              <thead>
                <tr>
                  <th v-for="field in legacy.fields" :key="field.id">
                    {{ field.name }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in legacy.rows" :key="row.id">
                  <td v-for="field in legacy.fields" :key="field.id">
                    {{ row.cells?.[field.id] ?? "" }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <BaseGrid
          v-else-if="viewType === 'grid'"
          class="be-grid"
          :fields="fields"
          :rows="rows"
          :loading="loading"
          :editable="canEdit"
          :field-widths="effectiveViewConfig.fieldWidths"
          :field-order="effectiveViewConfig.fieldOrder"
          :frozen-field-ids="effectiveViewConfig.frozenFields"
          :hidden-field-ids="hiddenFieldIds"
          :doc-titles="docTitles"
          :doc-options="docOptions"
          :link-titles="linkTitles"
          :link-options="linkOptions"
          :sorts="effectiveQuery.sorts"
          :project-id="projectId"
          @update-cell="onCellUpdate"
          @open-record="onOpenRecord"
          @add-row="onAddRow"
          @selection-change="(ids) => (selectedIds = ids)"
          @rows-reorder="onRowsReorder"
          @open-doc="(nodeId) => emit('open-doc', nodeId)"
          @open-record-ref="onOpenRecordRef"
          @column-sort="onColumnSort"
          @column-clear-sort="onColumnClearSort"
          @column-filter="onColumnFilter"
          @column-freeze="onColumnFreeze"
          @column-hide="onColumnHide"
          @column-width="onColumnWidth"
          @column-reorder="onColumnReorder"
          @column-settings="onColumnSettings"
        />
        <BaseFormView
          v-else-if="viewType === 'form' && !legacy"
          :fields="fields"
          :rows="rows"
          :editable="canEdit"
          :view-config="activeView?.config"
          :link-titles="linkTitles"
          :link-options="linkOptions"
          :project-id="projectId"
          @update-cell="onCellUpdate"
          @create-record="onFormSubmit"
          @open-record="onOpenRecord"
          @open-record-ref="onOpenRecordRef"
        />
        <BaseGanttView
          v-else-if="viewType === 'gantt' && !legacy"
          :fields="fields"
          :rows="rows"
          :editable="canEdit"
          :view-config="activeView?.config"
          :link-titles="linkTitles"
          :link-options="linkOptions"
          :project-id="projectId"
          @update-cell="onCellUpdate"
          @open-record="onOpenRecord"
          @open-record-ref="onOpenRecordRef"
        />
        <BaseBoardViews
          v-else-if="!legacy"
          :type="boardType"
          :fields="fields"
          :rows="rows"
          :group-field-id="groupFieldId"
          :editable="canEdit"
          :view-config="activeView?.config"
          :link-titles="linkTitles"
          :link-options="linkOptions"
          :project-id="projectId"
          @update-cell="onCellUpdate"
          @open-record="onOpenRecord"
          @add-row="onAddRow"
          @reorder="onReorderRows"
          @open-record-ref="onOpenRecordRef"
        />
        <!--
          表格视图由 vxe-grid 自带空态（网格内居中），
          这里只在看板 / 日历 / 画廊 / 表单视图下兜底，避免出现两个空态。
        -->
        <div
          v-if="!rows.length && !loading && viewType !== 'grid'"
          class="be-empty"
        >
          <div class="be-empty__icon">
            <el-icon><Tickets /></el-icon>
          </div>
          <div>还没有记录</div>
          <el-button type="primary" size="small" :icon="Plus" @click="onAddRow"
            >新增记录</el-button
          >
        </div>
      </div>
      <aside v-if="primaryField && sideOpen" class="be-body__side">
        <div class="be-panel__row">
          <span class="be-panel__hint"
            >记录（{{ rows.length }} / {{ total }}）</span
          >
        </div>
        <div class="be-record-list">
          <button
            v-for="row in rows"
            :key="row.id"
            class="be-record-list__item"
            :class="{ 'is-active': activeRecord?.id === row.id }"
            @click="onOpenRecord(row.id)"
          >
            <span class="be-record-list__title">{{
              row.fields?.[primaryField.id] ?? "未命名"
            }}</span>
            <span class="be-record-list__meta">{{ recordMeta(row) }}</span>
          </button>
        </div>
        <div class="be-panel__hint">
          双击单元格可直接编辑；公式字段由服务端实时计算。
        </div>
      </aside>
    </div>

    <transition name="be-fade">
      <div v-if="selectedIds.length && !legacy" class="be-batch-bar">
        <span class="be-batch-bar__count"
          >已选 {{ selectedIds.length }} 条</span
        >
        <el-button size="small" type="primary" @click="showBatch = true"
          >批量操作</el-button
        >
        <el-button size="small" text @click="selectedIds = []"
          >取消选择</el-button
        >
      </div>
    </transition>

    <BaseFieldManager
      v-if="showFieldManager"
      :project-id="projectId"
      :base-id="base?.id ?? ''"
      :table-id="activeTableId"
      :fields="fields"
      :definitions="definitions"
      :focus-field-id="fieldManagerFocusId"
      @close="
        showFieldManager = false;
        fieldManagerFocusId = undefined;
      "
      @changed="runQuery()"
      @edit-formula="
        (field) => {
          formulaField = field;
          showFieldManager = false;
          showFormula = true;
        }
      "
    />

    <BaseQueryPanel
      v-if="showQueryPanel"
      :fields="fields"
      :filters="filters"
      :sorts="sorts"
      :groups="groups"
      :doc-options="docOptions"
      :scope="queryScope"
      :combine="combineMode"
      :focus-field-id="queryFocusFieldId"
      @close="
        showQueryPanel = false;
        queryFocusFieldId = undefined;
      "
      @apply="applyQuery"
    />

    <BaseFormulaDialog
      v-if="showFormula"
      :project-id="projectId"
      :table-id="activeTableId"
      :fields="fields"
      :field="formulaField"
      :sample="rows[0]?.fields"
      @close="showFormula = false"
      @saved="
        () => {
          showFormula = false;
          runQuery();
        }
      "
    />

    <BaseRecordDrawer
      v-if="activeRecord"
      :row="activeRecord"
      :fields="fields"
      :editable="canEdit"
      :project-id="projectId"
      :link-titles="linkTitles"
      :link-options="linkOptions"
      @close="activeRecord = undefined"
      @update="onCellUpdate({ recordId: activeRecord!.id, ...$event })"
      @update-visibility="onVisibilityUpdate"
      @delete="onDeleteRecord"
      @open-node="(nodeId) => emit('open-doc', nodeId)"
      @open-record-ref="onOpenRecordRef"
      @refreshed="onRecordRefreshed"
    />

    <BaseViewCreateDialog
      v-if="showViewCreate"
      @close="showViewCreate = false"
      @create="createViewWithScope"
    />

    <BaseTableConfigDialog
      v-if="showTableConfig"
      :project-id="projectId"
      :base-id="base ? base.id : ''"
      :table-id="activeTableId"
      :table-name="activeTable?.name || ''"
      :tables="tables"
      @close="showTableConfig = false"
      @imported="onTableConfigImported"
    />

    <BaseSettingsDialog
      v-if="showBaseSettings"
      :model-value="showBaseSettings"
      :project-id="projectId"
      :base="base"
      @update:model-value="showBaseSettings = $event"
      @saved="onBaseSaved"
      @deleted="onBaseDeleted"
    />

    <BaseImportDialog
      v-if="showImport"
      :project-id="projectId"
      :table-id="activeTableId"
      :fields="fields"
      @close="showImport = false"
      @imported="onImported"
    />

    <BaseBatchDialog
      v-if="showBatch"
      :project-id="projectId"
      :table-id="activeTableId"
      :fields="fields"
      :record-ids="selectedIds"
      @close="showBatch = false"
      @done="onBatchDone"
    />

    <BaseViewSettings
      v-if="showViewSettings && activeView"
      :view="activeView"
      :fields="fields"
      :user-id="currentUserId"
      @close="showViewSettings = false"
      @save="saveViewSettings"
    />

    <el-dialog
      v-if="showEmbedders"
      :model-value="true"
      title="内嵌引用"
      width="520px"
      append-to-body
      modal-class="be-modal"
      destroy-on-close
      @close="showEmbedders = false"
    >
      <div class="be-panel">
        <div class="be-panel__hint">
          下面这些文档把这张多维表格嵌进了正文（数据实时同步，不是快照）。
        </div>
        <ul v-if="embedders.length" class="be-embedders">
          <li
            v-for="item in embedders"
            :key="item.nodeId"
            @click="openEmbedder(item)"
          >
            <el-icon><Document /></el-icon>
            <span class="be-embedders__title">{{ item.title }}</span>
            <span class="be-embedders__hint">点击打开</span>
          </li>
        </ul>
        <el-empty v-else description="还没有文档内嵌这张表" :image-size="72" />
      </div>
      <template #footer>
        <el-button @click="showEmbedders = false">关闭</el-button>
      </template>
    </el-dialog>

    <BaseAuditPanel
      v-if="showAudit && base"
      :project-id="projectId"
      :base-id="base.id"
      :fields="fields"
      @close="showAudit = false"
    />

    <BaseOpsPanel
      v-if="showOps"
      :project-id="projectId"
      :table-id="activeTableId"
      @close="showOps = false"
    />

    <el-dialog
      v-if="showExport"
      :model-value="true"
      title="导出数据"
      width="720px"
      append-to-body
      modal-class="be-modal"
      destroy-on-close
      @close="showExport = false"
    >
      <div class="be-panel">
        <el-radio-group
          v-model="exportFormat"
          size="small"
          @change="refreshExportText"
        >
          <el-radio-button value="markdown">Markdown 表格</el-radio-button>
          <el-radio-button value="csv">CSV</el-radio-button>
          <el-radio-button value="xlsx">Excel（XLSX）</el-radio-button>
        </el-radio-group>
        <div class="be-panel__hint">
          Markdown 表格可直接粘贴进知识库文档，实现「多维表格 →
          富文本文档」的内容沉淀； Excel（XLSX）保留列宽与表头样式，适合交付财务
          / 业务同事。
        </div>
        <div class="be-export__preview">{{ exportText }}</div>
      </div>
      <template #footer>
        <el-button :icon="CopyDocument" @click="copyExport">复制</el-button>
        <el-button :icon="Download" @click="downloadExport">下载文件</el-button>
        <el-button type="primary" @click="showExport = false">完成</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.be-embedders {
  list-style: none;
  margin: 0;
  padding: 0;
}
.be-embedders li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--tg-radius-sm);
  cursor: pointer;
  transition: background var(--tg-dur) var(--tg-ease);
}
.be-embedders li:hover {
  background: var(--tg-surface-2);
}
.be-embedders__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--tg-text);
  font-size: 13px;
}
.be-embedders__hint {
  flex: none;
  font-size: 12px;
  color: var(--tg-text-3);
}
</style>
