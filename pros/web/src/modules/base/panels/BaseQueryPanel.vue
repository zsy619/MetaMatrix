<script setup lang="ts">
/**
 * 筛选 / 排序 / 分组面板。
 *
 * 三者最终都编译成服务端的 QueryRequest，
 * 前端不执行任何数据运算，保证与后端口径一致。
 */
import { ref, watch } from "vue";
import { Delete, InfoFilled, Plus, Sort } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import type {
  Condition,
  FieldMeta,
  FilterGroup,
  GroupRule,
  SortRule,
} from "../types";
import {
  MAX_FILTERS,
  MAX_GROUPS,
  MAX_SORTS,
  normalizeGroups,
  normalizeSorts,
} from "../viewQuery";

const props = defineProps<{
  fields: FieldMeta[];
  filters?: FilterGroup;
  sorts?: SortRule[];
  groups?: GroupRule[];
  /** 当前查询条件的保存范围（第十三轮）：shared = 写进视图共享段；personal = 只写我的偏好。 */
  scope?: "shared" | "personal";
  /** 「仅我」模式下与共享条件的组合方式（第十四轮）。 */
  combine?: "override" | "and" | "or";
  /** 「关联文档」字段的候选（知识库节点），用于按标题筛选。 */
  docOptions?: Array<{ id: string; title: string }>;
  /**
   * 打开面板时要聚焦的字段（列头菜单「筛选此列」）。
   * 非空时自动切到「筛选」页签，并给该字段补一条空条件。
   */
  focusFieldId?: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (
    e: "apply",
    payload: { filters: FilterGroup; sorts: SortRule[]; groups: GroupRule[] },
  ): void;
}>();

const activeTab = ref<"filter" | "sort" | "group">("filter");

const conditions = ref<Condition[]>([]);
const sorts = ref<SortRule[]>([]);
const groups = ref<GroupRule[]>([]);
const logic = ref<"AND" | "OR">("AND");

watch(
  () => [props.filters, props.sorts, props.groups],
  () => {
    conditions.value = (props.filters?.conditions ?? []).map((item) => ({
      ...item,
    }));
    logic.value = props.filters?.logic ?? "AND";
    // 存量视图可能存着重复 / 超限规则，进来先归一化。
    sorts.value = normalizeSorts(props.sorts).map((item) => ({ ...item }));
    groups.value = normalizeGroups(props.groups).map((item) => ({ ...item }));
  },
  { immediate: true, deep: true },
);

const numericTypes = ["number", "currency", "percent", "rating"];
const temporalTypes = ["date", "datetime"];
const multiTypes = ["multi_select", "user", "attachment", "link"];

function fieldOf(fieldId?: string) {
  return props.fields.find((item) => item.id === fieldId);
}

function operatorsFor(type?: string) {
  if (!type) return [];
  if (numericTypes.includes(type) || temporalTypes.includes(type)) {
    return [
      { value: "eq", label: "等于" },
      { value: "ne", label: "不等于" },
      { value: "gt", label: "大于" },
      { value: "gte", label: "大于等于" },
      { value: "lt", label: "小于" },
      { value: "lte", label: "小于等于" },
      { value: "isempty", label: "为空" },
      { value: "isnotempty", label: "不为空" },
    ];
  }
  if (type === "checkbox") {
    return [
      { value: "eq", label: "是" },
      { value: "ne", label: "否" },
      { value: "isempty", label: "为空" },
      { value: "isnotempty", label: "不为空" },
    ];
  }
  if (type === "attachment") {
    return [
      { value: "contains", label: "文件名包含" },
      { value: "notcontains", label: "文件名不包含" },
      { value: "isempty", label: "为空" },
      { value: "isnotempty", label: "不为空" },
    ];
  }
  if (multiTypes.includes(type)) {
    return [
      { value: "contains", label: "包含" },
      { value: "notcontains", label: "不包含" },
      { value: "eq", label: "等于" },
      { value: "ne", label: "不等于" },
      { value: "isempty", label: "为空" },
      { value: "isnotempty", label: "不为空" },
    ];
  }
  return [
    { value: "contains", label: "包含" },
    { value: "notcontains", label: "不包含" },
    { value: "eq", label: "等于" },
    { value: "ne", label: "不等于" },
    { value: "startswith", label: "开头是" },
    { value: "endswith", label: "结尾是" },
    { value: "isempty", label: "为空" },
    { value: "isnotempty", label: "不为空" },
  ];
}

function needsValue(op: string) {
  return op !== "isempty" && op !== "isnotempty";
}

/** 列头「筛选此列」：自动切到筛选页签并给该字段补一条空条件。 */
watch(
  () => props.focusFieldId,
  (fieldId) => {
    if (!fieldId) return;
    const field = props.fields.find((item) => item.id === fieldId);
    if (!field) return;
    activeTab.value = "filter";
    if (!conditions.value.some((item) => item.fieldId === fieldId)) {
      const operators = operatorsFor(field.type);
      conditions.value.push({
        fieldId,
        operator: operators[0]?.value ?? "contains",
        value: "",
      });
    }
  },
  { immediate: true },
);

function optionsOf(field?: FieldMeta) {
  const raw = field?.config?.options;
  return Array.isArray(raw) ? raw.map((item) => String(item)) : [];
}

function addCondition() {
  const field = props.fields[0];
  if (!field) return;
  if (conditions.value.length >= MAX_FILTERS) {
    ElMessage.warning(`筛选条件最多 ${MAX_FILTERS} 条`);
    return;
  }
  conditions.value.push({ fieldId: field.id, operator: "contains", value: "" });
}

function addSort() {
  if (sorts.value.length >= MAX_SORTS) {
    ElMessage.warning(`排序规则最多 ${MAX_SORTS} 条`);
    return;
  }
  const field = props.fields[0];
  if (!field) return;
  // 同一字段不重复排序：后端按列排序，重复列没有意义。
  const next = props.fields.find(
    (item) => !sorts.value.some((rule) => rule.fieldId === item.id),
  );
  if (!next) {
    ElMessage.warning("该字段已经排过序");
    return;
  }
  sorts.value.push({ fieldId: next.id, order: "asc" });
}

function addGroup() {
  if (groups.value.length >= MAX_GROUPS) {
    ElMessage.warning(`分组规则最多 ${MAX_GROUPS} 条`);
    return;
  }
  // 同一字段不重复分组；优先挑单选 / 多选字段。
  const unused = props.fields.filter(
    (item) => !groups.value.some((rule) => rule.fieldId === item.id),
  );
  const field =
    unused.find(
      (item) => item.type === "single_select" || item.type === "multi_select",
    ) ?? unused[0];
  if (!field) return;
  groups.value.push({ fieldId: field.id, order: "asc" });
}

function apply() {
  const valid = conditions.value.filter((item) => {
    if (!item.fieldId || !needsValue(item.operator)) return false;
    if (Array.isArray(item.value)) return item.value.length > 0;
    return item.value !== "";
  });
  emit("apply", {
    filters: { logic: logic.value, conditions: valid, children: [] },
    sorts: normalizeSorts(sorts.value),
    groups: normalizeGroups(groups.value),
  });
}
</script>

<template>
  <el-dialog
    :model-value="true"
    title="筛选与排序"
    width="760px"
    append-to-body
    modal-class="be-modal"
    destroy-on-close
    @close="emit('close')"
  >
    <div class="be-panel__hint be-query__scope-hint">
      <el-icon><InfoFilled /></el-icon>
      <span v-if="props.scope === 'personal'">
        这些条件只保存到<b>我的偏好</b>，其他人打开这个视图不受影响<template
          v-if="props.combine === 'and'"
          >； 当前为<b>同时满足</b>口径，最终筛选 = 视图共享条件 AND
          我的条件</template
        ><template v-else-if="props.combine === 'or'"
          >； 当前为<b>任一满足</b>口径，最终筛选 = 视图共享条件 OR
          我的条件</template
        >。
      </span>
      <span v-else>
        这些条件会保存到<b>视图共享配置</b>，所有人打开这个视图都会看到（可在工具栏切到「仅我」）。
      </span>
    </div>
    <el-tabs v-model="activeTab" class="be-panel">
      <el-tab-pane label="筛选" name="filter">
        <div class="be-panel">
          <div class="be-panel__row">
            <el-radio-group v-model="logic" size="small">
              <el-radio-button value="AND">同时满足</el-radio-button>
              <el-radio-button value="OR">任一满足</el-radio-button>
            </el-radio-group>
            <div style="flex: 1" />
            <el-button
              size="small"
              :icon="Plus"
              :disabled="conditions.length >= MAX_FILTERS"
              @click="addCondition"
              >添加条件</el-button
            >
          </div>
          <div
            v-for="(cond, index) in conditions"
            :key="index"
            class="be-panel__row"
          >
            <el-select v-model="cond.fieldId" style="width: 160px">
              <el-option
                v-for="field in fields"
                :key="field.id"
                :label="field.name"
                :value="field.id"
              />
            </el-select>
            <el-select v-model="cond.operator" style="width: 130px">
              <el-option
                v-for="op in operatorsFor(fieldOf(cond.fieldId)?.type)"
                :key="op.value"
                :label="op.label"
                :value="op.value"
              />
            </el-select>
            <template v-if="needsValue(cond.operator)">
              <el-select
                v-if="fieldOf(cond.fieldId)?.type === 'single_select'"
                v-model="cond.value"
                style="flex: 1"
              >
                <el-option
                  v-for="opt in optionsOf(fieldOf(cond.fieldId))"
                  :key="opt"
                  :label="opt"
                  :value="opt"
                />
              </el-select>
              <el-select
                v-else-if="fieldOf(cond.fieldId)?.type === 'multi_select'"
                v-model="cond.value"
                multiple
                style="flex: 1"
              >
                <el-option
                  v-for="opt in optionsOf(fieldOf(cond.fieldId))"
                  :key="opt"
                  :label="opt"
                  :value="opt"
                />
              </el-select>
              <el-select
                v-else-if="fieldOf(cond.fieldId)?.type === 'doc'"
                v-model="cond.value"
                multiple
                filterable
                collapse-tags
                collapse-tags-tooltip
                style="flex: 1"
                placeholder="按文档标题筛选"
              >
                <el-option
                  v-for="doc in props.docOptions ?? []"
                  :key="doc.id"
                  :label="doc.title"
                  :value="doc.id"
                />
              </el-select>
              <el-switch
                v-else-if="fieldOf(cond.fieldId)?.type === 'checkbox'"
                v-model="cond.value"
                active-value="true"
                inactive-value="false"
              />
              <el-input-number
                v-else-if="
                  numericTypes.includes(fieldOf(cond.fieldId)?.type ?? '')
                "
                v-model="cond.value"
                style="flex: 1"
                :controls="false"
              />
              <el-date-picker
                v-else-if="fieldOf(cond.fieldId)?.type === 'datetime'"
                v-model="cond.value"
                type="datetime"
                value-format="YYYY-MM-DD HH:mm:ss"
                style="flex: 1"
              />
              <el-date-picker
                v-else-if="fieldOf(cond.fieldId)?.type === 'date'"
                v-model="cond.value"
                type="date"
                value-format="YYYY-MM-DD"
                style="flex: 1"
              />
              <el-input
                v-else
                v-model="cond.value"
                style="flex: 1"
                placeholder="筛选值"
              />
            </template>
            <div v-else style="flex: 1" />
            <el-button
              :icon="Delete"
              text
              @click="conditions.splice(index, 1)"
            />
          </div>
          <el-empty
            v-if="!conditions.length"
            description="暂无筛选条件"
            :image-size="64"
          />
        </div>
      </el-tab-pane>

      <el-tab-pane label="排序" name="sort">
        <div class="be-panel">
          <div class="be-panel__row">
            <div style="flex: 1" />
            <el-button
              size="small"
              :icon="Sort"
              :disabled="sorts.length >= MAX_SORTS"
              @click="addSort"
              >添加排序</el-button
            >
          </div>
          <div
            v-for="(rule, index) in sorts"
            :key="index"
            class="be-panel__row"
          >
            <span class="be-panel__hint">{{ index + 1 }}</span>
            <el-select v-model="rule.fieldId" style="flex: 1">
              <el-option
                v-for="field in fields"
                :key="field.id"
                :label="field.name"
                :value="field.id"
              />
            </el-select>
            <el-radio-group v-model="rule.order" size="small">
              <el-radio-button value="asc">升序</el-radio-button>
              <el-radio-button value="desc">降序</el-radio-button>
            </el-radio-group>
            <el-button :icon="Delete" text @click="sorts.splice(index, 1)" />
          </div>
          <el-empty
            v-if="!sorts.length"
            description="暂无排序规则"
            :image-size="64"
          />
        </div>
      </el-tab-pane>

      <el-tab-pane label="分组" name="group">
        <div class="be-panel">
          <div class="be-panel__row">
            <div style="flex: 1" />
            <el-button
              size="small"
              :icon="Plus"
              :disabled="groups.length >= MAX_GROUPS"
              @click="addGroup"
              >添加分组</el-button
            >
          </div>
          <div
            v-for="(rule, index) in groups"
            :key="index"
            class="be-panel__row"
          >
            <el-select v-model="rule.fieldId" style="flex: 1">
              <el-option
                v-for="field in fields"
                :key="field.id"
                :label="field.name"
                :value="field.id"
              />
            </el-select>
            <el-radio-group v-model="rule.order" size="small">
              <el-radio-button value="asc">升序</el-radio-button>
              <el-radio-button value="desc">降序</el-radio-button>
            </el-radio-group>
            <el-button :icon="Delete" text @click="groups.splice(index, 1)" />
          </div>
          <el-empty
            v-if="!groups.length"
            description="暂无分组规则"
            :image-size="64"
          />
        </div>
      </el-tab-pane>
    </el-tabs>

    <template #footer>
      <el-button @click="emit('close')">取消</el-button>
      <el-button type="primary" @click="apply">应用</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.be-query__scope-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
  font-size: 12px;
  color: var(--tg-text-2);
}

.be-query__scope-hint b {
  color: var(--tg-text);
  font-weight: 600;
}
</style>
