<script setup lang="ts">
/**
 * 字段单元格：按类型渲染与编辑。
 *
 * 渲染与编辑分离：Grid 里展示用 renderer，编辑时用 editor；
 * 公式字段只读，值由服务端计算。
 */
import { computed, nextTick, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import {
  Check,
  Link as LinkIcon,
  Lock,
  Paperclip,
  Picture,
  View,
} from "@element-plus/icons-vue";
import { uploadMediaFile } from "../../../api/mediaUpload";
import { listLinkTargetsPage } from "../api";
import { fieldPlugin, isComputedField } from "./registry";
import {
  ensureUserNames,
  resolveUserName,
  resolveUserNames,
} from "./userNames";
import type { FieldMeta } from "../types";
import {
  applyCommand,
  matchCommands,
  parseSlashQuery,
  selectedText,
  type CellCommand,
} from "./slashCommands";

const props = defineProps<{
  field: FieldMeta;
  modelValue: unknown;
  editable?: boolean;
  /** 所在行 ID（键盘导航用）。 */
  rowId?: string;
  /** 是否是当前聚焦单元格。 */
  focused?: boolean;
  /** 编辑信号：序号变化且命中本单元格时进入编辑。 */
  editSignal?: { key: string; seq: number };
  /** 关联文档字段的标题映射（节点 ID → 标题）。 */
  docTitles?: Record<string, string>;
  /** 关联文档字段的可选文档。 */
  docOptions?: Array<{ id: string; title: string }>;
  /** 关联记录字段：记录 ID → 记录标题。 */
  linkTitles?: Record<string, string>;
  /** 关联记录字段：可选记录（目标表）。 */
  linkOptions?: Array<{ id: string; title: string }>;
  /** 关联记录字段：目标表 ID（远程搜索用）。 */
  linkTargetTableId?: string;
  /** 空间 ID：远程搜索目标表记录时用。 */
  projectId?: string;
  /** 该值因「条件可见」策略而对本行隐藏（服务端已剔除，界面显示占位符）。 */
  hiddenByCondition?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: unknown): void;
  (e: "request-detail"): void;
  (e: "open-doc", nodeId: string): void;
  (
    e: "open-record-ref",
    payload: { tableId: string; recordId: string; title: string },
  ): void;
}>();

const plugin = computed(() => fieldPlugin(props.field.type));

// 人员类字段需要姓名表：组件挂载时拉一次（内部幂等 + 缓存）。
if (["user", "created_by", "updated_by"].includes(props.field.type)) {
  void ensureUserNames();
}
const editing = ref(false);
const draft = ref<unknown>(props.modelValue);

watch(
  () => props.modelValue,
  (value) => {
    if (!editing.value) draft.value = value;
  },
);

const options = computed<string[]>(() => {
  const raw = props.field.config?.options;
  return Array.isArray(raw) ? raw.map((item) => String(item)) : [];
});

// —— 附件 ——

/** 附件值格式：`url#文件名`（文件名可缺省，缺省时回退到 URL 末段）。 */
const attachmentItems = computed(() =>
  (Array.isArray(props.modelValue)
    ? props.modelValue.map((item) => String(item))
    : []
  ).map((raw) => {
    const [url, namePart] = raw.split("#");
    const fallback = url.split("?")[0].split("#")[0].split("/").pop() || "附件";
    let name = fallback;
    if (namePart) {
      try {
        name = decodeURIComponent(namePart);
      } catch {
        name = namePart;
      }
    }
    return { raw, url, name };
  }),
);

const attachmentUrls = computed<string[]>(() =>
  attachmentItems.value.map((item) => item.raw),
);

const attachmentMax = computed(() => {
  const raw = Number(props.field.config?.maxCount ?? 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 10;
});

const isImageUrl = (url: string) =>
  /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(url.split("#")[0]);

const uploading = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

async function onPickFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  if (attachmentUrls.value.length >= attachmentMax.value) {
    ElMessage.warning(`最多上传 ${attachmentMax.value} 个附件`);
    return;
  }
  uploading.value = true;
  try {
    const stored = await uploadMediaFile(file, { mediaType: "file" });
    const url = stored.previewUrl || stored.insertedPath;
    draft.value = [
      ...attachmentUrls.value,
      `${url}#${encodeURIComponent(file.name || "附件")}`,
    ];
    commit();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "附件上传失败");
  } finally {
    uploading.value = false;
  }
}

function removeAttachment(index: number) {
  draft.value = attachmentUrls.value.filter((_, i) => i !== index);
  commit();
}

const docIds = computed<string[]>(() =>
  Array.isArray(props.modelValue)
    ? props.modelValue.map((item) => String(item))
    : [],
);

const docTitle = (id: string) => props.docTitles?.[id] ?? "未命名文档";

// —— 关联记录 ——

/** 关联记录值：记录 ID 数组。 */
const linkIds = computed<string[]>(() =>
  Array.isArray(props.modelValue)
    ? props.modelValue.map((item) => String(item))
    : [],
);

/** 关联记录标题：优先用服务端给的目标记录标题，缺省回退到 ID 前 8 位。 */
const linkTitle = (id: string) =>
  props.linkTitles?.[id] ?? `记录 ${id.slice(0, 8)}`;

/** 关联记录候选（未配置目标表时由上层给同表候选）。 */
const linkCandidates = computed(() => props.linkOptions ?? []);

/** 远程搜索结果（覆盖预置候选）。 */
const linkRemote = ref<Array<{ id: string; title: string }>>([]);
const linkSearching = ref(false);
/** 远程搜索的下一页游标（空表示没有更多）。 */
const linkCursor = ref("");
/** 远程搜索的当前关键字。 */
const linkKeyword = ref("");

/** 下拉候选：优先远程搜索结果，并补上已选中的记录（保证回显标题）。 */
const linkSelectOptions = computed(() => {
  const base = linkRemote.value.length
    ? linkRemote.value
    : linkCandidates.value;
  const picked = new Map(base.map((item) => [item.id, item]));
  for (const id of linkIds.value) {
    if (!picked.has(id)) picked.set(id, { id, title: linkTitle(id) });
  }
  return Array.from(picked.values());
});

/** 远程搜索目标表记录。 */
async function searchLinks(keyword: string) {
  if (!props.projectId || !props.linkTargetTableId) return;
  linkKeyword.value = keyword;
  linkCursor.value = "";
  linkSearching.value = true;
  try {
    const page = await listLinkTargetsPage(
      props.projectId,
      props.linkTargetTableId,
      { keyword, limit: 50 },
    );
    linkRemote.value = page.items.map((item) => ({
      id: item.id,
      title: item.title,
    }));
    linkCursor.value = page.nextCursor ?? "";
  } catch {
    linkRemote.value = [];
    linkCursor.value = "";
  } finally {
    linkSearching.value = false;
  }
}

/** 追加下一页候选（游标翻页）。 */
async function loadMoreLinks() {
  if (!props.projectId || !props.linkTargetTableId || !linkCursor.value) return;
  linkSearching.value = true;
  try {
    const page = await listLinkTargetsPage(props.projectId, props.linkTargetTableId, {
      keyword: linkKeyword.value,
      limit: 50,
      cursor: linkCursor.value,
    });
    const known = new Set(linkRemote.value.map((item) => item.id));
    for (const item of page.items) {
      if (known.has(item.id)) continue;
      linkRemote.value.push({ id: item.id, title: item.title });
    }
    linkCursor.value = page.nextCursor ?? "";
  } catch {
    linkCursor.value = "";
  } finally {
    linkSearching.value = false;
  }
}

/** 打开被关联的记录（跨表跳转由上层处理）。 */
function openLinked(id: string) {
  emit("open-record-ref", {
    tableId: props.linkTargetTableId ?? "",
    recordId: id,
    title: linkTitle(id),
  });
}

/**
 * 单选 / 多选字段的标签配色（飞书：柔和底色 + 同色系圆点）。
 *
 * 颜色由选项文本散列决定 —— 同一个选项在任何表、任何行都是同一个颜色，
 * 便于用户靠颜色记忆状态。
 */
const TAG_PALETTE = [
  { bg: "#eef3ff", fg: "#245bdb", dot: "#3370ff" },
  { bg: "#e8f8ef", fg: "#1f7a4d", dot: "#2ea56a" },
  { bg: "#fff3e8", fg: "#a85a15", dot: "#f08c3c" },
  { bg: "#fdeef3", fg: "#a63a5c", dot: "#e0517a" },
  { bg: "#f1ecfd", fg: "#5b46b8", dot: "#7b5cd6" },
  { bg: "#e9f4fb", fg: "#1f6a92", dot: "#2e94c7" },
  { bg: "#fdf0e6", fg: "#a2601f", dot: "#e58a3c" },
  { bg: "#eef1f5", fg: "#4d5969", dot: "#8f959e" },
];

/** 选项文本 → 配色（同一文本永远同一颜色）。 */
function tagColor(text: string) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return TAG_PALETTE[hash % TAG_PALETTE.length];
}

/** 当前单元格里要渲染的选项标签（单选 1 个，多选多个）。 */
const tagItems = computed<
  Array<{ text: string; bg: string; fg: string; dot: string }>
>(() => {
  const raw = props.modelValue;
  if (raw === null || raw === undefined || raw === "") return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .map((item) => String(item))
    .filter((item) => item !== "")
    .map((text) => {
      const c = tagColor(text);
      return { text, bg: c.bg, fg: c.fg, dot: c.dot };
    });
});

const display = computed(() => {
  const value = props.modelValue;
  if (value === null || value === undefined || value === "") return "";
  switch (props.field.type) {
    case "checkbox":
      return value ? "是" : "否";
    case "multi_select":
      return Array.isArray(value) ? value.join("、") : String(value);
    case "user":
      // 人员字段存的是用户 ID，界面上显示姓名（飞书多维表格同款）。
      return Array.isArray(value)
        ? resolveUserNames(value.map((item) => String(item))).join("、")
        : resolveUserName(String(value), String(value));
    case "created_by":
    case "updated_by":
      return resolveUserName(String(value), String(value));
    case "link":
      return linkIds.value.map((id) => linkTitle(id)).join("、");
    case "currency":
      return `¥${Number(value).toLocaleString("zh-CN")}`;
    case "percent":
      return `${Number(value)}%`;
    case "rating":
      return "★".repeat(Math.max(0, Math.min(5, Math.round(Number(value)))));
    case "formula":
      return String(value);
    default:
      return String(value);
  }
});

const isEmpty = computed(() => display.value === "");

function startEdit() {
  // 计算字段（公式 / 引用 / 汇总 / 系统字段）一律不可就地编辑。
  if (!props.editable || isComputedField(props.field.type)) return;
  // 条件可见隐藏的值不允许就地编辑（服务端也会拒绝写入）。
  if (props.hiddenByCondition) return;
  editing.value = true;
  draft.value = props.modelValue;
}

/** 双击：可编辑字段直接进入编辑；只读字段（公式）交由上层打开详情。 */
function onDoubleClick() {
  if (!props.editable || isComputedField(props.field.type)) {
    emit("request-detail");
    return;
  }
  startEdit();
}

function commit() {
  if (!editing.value) return;
  // 命令面板开着时回车是「选命令」，不是「提交单元格」。
  if (slashOpen.value) return;
  editing.value = false;
  const normalized =
    plugin.value?.normalize(draft.value, props.field.config ?? {}) ??
    draft.value;
  emit("update:modelValue", normalized);
}

// —— 斜杠命令 / 浮动工具条（E-06）——

/** 文本类字段才支持命令（数字 / 日期用输入控件，命令没意义）。 */
const commandEnabled = computed(() =>
  ["text", "long_text", "email", "phone", "url"].includes(props.field.type),
);

/** 命令面板是否打开。 */
const slashOpen = ref(false);
/** 斜杠后输入的过滤词。 */
const slashQuery = ref("");
/** 当前高亮的命令下标。 */
const slashIndex = ref(0);
/** 过滤后的命令列表。 */
const slashItems = computed(() => matchCommands(slashQuery.value));

/** 浮动工具条（选中文本后出现）。 */
const bubbleOpen = ref(false);
/** 浮动工具条对应的选区。 */
const bubbleRange = ref<{ start: number; end: number } | null>(null);

/** 输入框组件（命令要改写光标位置）。 */
const textAreaRef = ref<{ textarea?: HTMLTextAreaElement } | null>(null);

/** 取到底层 textarea 元素。 */
function textareaEl(): HTMLTextAreaElement | null {
  return textAreaRef.value?.textarea ?? null;
}

/** 单元格文本（统一成字符串，命令逻辑只认字符串）。 */
function draftText(): string {
  return draft.value === null || draft.value === undefined
    ? ""
    : String(draft.value);
}

/** 当前选区。 */
function currentRange(): { start: number; end: number } {
  const el = textareaEl();
  if (!el) return { start: draftText().length, end: draftText().length };
  return { start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0 };
}

/** 输入变化时判断是不是在敲斜杠命令。 */
watch(draft, () => {
  if (!editing.value || !commandEnabled.value) {
    slashOpen.value = false;
    return;
  }
  const parsed = parseSlashQuery(draftText());
  if (!parsed) {
    slashOpen.value = false;
    slashQuery.value = "";
    return;
  }
  slashQuery.value = parsed.query;
  slashIndex.value = 0;
  slashOpen.value = true;
});

/** 执行一条命令并把结果写回草稿。 */
async function runCommand(cmd: CellCommand) {
  const range = currentRange();
  const result = applyCommand(cmd, {
    text: draftText(),
    selectionStart: range.start,
    selectionEnd: range.end,
  });
  draft.value = result.text;
  slashOpen.value = false;
  bubbleOpen.value = false;
  bubbleRange.value = null;
  await nextTick();
  const el = textareaEl();
  if (el) {
    el.focus();
    el.setSelectionRange(result.selectionStart, result.selectionEnd);
  }
}

/** 命令面板的键盘操作（上下选择 / 回车执行 / Esc 关闭）。 */
function onCommandKeydown(event: KeyboardEvent) {
  if (!slashOpen.value) return;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    slashIndex.value = (slashIndex.value + 1) % Math.max(1, slashItems.value.length);
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    slashIndex.value =
      (slashIndex.value - 1 + slashItems.value.length) %
      Math.max(1, slashItems.value.length);
    return;
  }
  if (event.key === "Enter" || event.key === "Tab") {
    const cmd = slashItems.value[slashIndex.value];
    if (!cmd) return;
    event.preventDefault();
    event.stopPropagation();
    void runCommand(cmd);
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    slashOpen.value = false;
  }
}

/** 选中文本后弹出浮动工具条（飞书 Bubble Menu 等价物）。 */
function onTextSelectionChange() {
  if (!editing.value || !commandEnabled.value) {
    bubbleOpen.value = false;
    return;
  }
  const range = currentRange();
  if (range.end <= range.start) {
    bubbleOpen.value = false;
    bubbleRange.value = null;
    return;
  }
  bubbleRange.value = range;
  bubbleOpen.value = true;
}

/** 浮动工具条：复制选中的文字。 */
async function bubbleCopy() {
  const range = bubbleRange.value;
  if (!range) return;
  const text = selectedText({
    text: draftText(),
    selectionStart: range.start,
    selectionEnd: range.end,
  });
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success("已复制选中的文字");
  } catch {
    ElMessage.warning("复制失败，请手动选择复制");
  }
  bubbleOpen.value = false;
}

/** 浮动工具条里的命令（转大写 / 转小写 / 加链接 / 清空）。 */
async function bubbleCommand(key: string) {
  const cmd = matchCommands(key)[0];
  if (!cmd) return;
  const range = bubbleRange.value ?? { start: 0, end: 0 };
  const result = applyCommand(cmd, {
    text: draftText(),
    selectionStart: range.start,
    selectionEnd: range.end,
  });
  draft.value = result.text;
  bubbleOpen.value = false;
  bubbleRange.value = null;
  await nextTick();
  const el = textareaEl();
  if (el) {
    el.focus();
    el.setSelectionRange(result.selectionStart, result.selectionEnd);
  }
}

/** 键盘导航：编辑信号命中本单元格时进入编辑态。 */
watch(
  () => props.editSignal?.seq,
  (seq) => {
    if (!seq) return;
    const key = `${props.rowId ?? ""}:${props.field.id}`;
    if (props.editSignal?.key === key) startEdit();
  },
);
</script>

<template>
  <div
    class="base-cell"
    @dblclick.stop="onDoubleClick"
    :class="{
      'is-empty': isEmpty,
      'is-computed': field.type === 'formula',
      'is-focused': focused,
      'is-cond-hidden': hiddenByCondition,
    }"
  >
    <span
      v-if="hiddenByCondition"
      class="base-cell__cond"
      title="该字段按条件可见，当前记录不满足条件"
    >
      <el-icon><View /></el-icon>按条件隐藏
    </span>
    <template v-else>
      <template v-if="editing">
        <el-checkbox
          v-if="field.type === 'checkbox'"
          v-model="draft"
          @change="commit"
        />
        <el-select
          v-else-if="field.type === 'single_select'"
          v-model="draft"
          size="small"
          filterable
          @change="commit"
        >
          <el-option
            v-for="opt in options"
            :key="opt"
            :label="opt"
            :value="opt"
          />
        </el-select>
        <el-select
          v-else-if="field.type === 'multi_select'"
          v-model="draft"
          size="small"
          multiple
          filterable
          @change="commit"
        >
          <el-option
            v-for="opt in options"
            :key="opt"
            :label="opt"
            :value="opt"
          />
        </el-select>
        <el-input-number
          v-else-if="
            ['number', 'currency', 'percent', 'rating'].includes(field.type)
          "
          v-model="draft"
          size="small"
          controls-position="right"
          :min="field.type === 'rating' ? 0 : undefined"
          :max="field.type === 'rating' ? 5 : undefined"
          @change="commit"
        />
        <el-date-picker
          v-else-if="field.type === 'date'"
          v-model="draft"
          type="date"
          size="small"
          value-format="YYYY-MM-DD"
          @change="commit"
        />
        <el-date-picker
          v-else-if="field.type === 'datetime'"
          v-model="draft"
          type="datetime"
          size="small"
          value-format="YYYY-MM-DD HH:mm:ss"
          @change="commit"
        />
        <el-select
          v-else-if="field.type === 'doc'"
          v-model="draft"
          size="small"
          multiple
          filterable
          collapse-tags
          collapse-tags-tooltip
          placeholder="选择文档"
          @change="commit"
        >
          <el-option
            v-for="doc in docOptions ?? []"
            :key="doc.id"
            :label="doc.title"
            :value="doc.id"
          />
        </el-select>
        <div v-else-if="field.type === 'attachment'" class="base-cell__upload">
          <div v-if="attachmentItems.length" class="base-cell__files">
            <span
              v-for="(item, index) in attachmentItems"
              :key="item.raw"
              class="base-cell__file"
            >
              <el-icon class="base-cell__file-icon"><Paperclip /></el-icon>
              <a
                :href="item.url"
                target="_blank"
                rel="noreferrer"
                class="base-cell__file-name"
              >
                {{ item.name }}
              </a>
              <button
                type="button"
                class="base-cell__file-remove"
                title="移除附件"
                @click.stop="removeAttachment(index)"
              >
                ×
              </button>
            </span>
          </div>
          <el-button
            size="small"
            text
            :icon="Picture"
            :loading="uploading"
            @click="fileInput?.click()"
          >
            上传附件
          </el-button>
          <input
            ref="fileInput"
            type="file"
            class="base-cell__file-input"
            @change="onPickFile"
          />
        </div>
        <el-select
          v-else-if="field.type === 'link'"
          v-model="draft"
          size="small"
          multiple
          filterable
          remote
          :remote-method="searchLinks"
          :loading="linkSearching"
          collapse-tags
          collapse-tags-tooltip
          placeholder="选择关联记录"
          @change="commit"
        >
          <el-option
            v-for="item in linkSelectOptions"
            :key="item.id"
            :label="item.title"
            :value="item.id"
          />
          <template #footer>
            <el-button
              v-if="linkCursor"
              size="small"
              text
              :loading="linkSearching"
              @click.stop="loadMoreLinks"
            >
              加载更多
            </el-button>
          </template>
        </el-select>
        <el-input
          v-else
          ref="textAreaRef"
          v-model="draft"
          size="small"
          type="textarea"
          :rows="field.type === 'long_text' ? 3 : 1"
          :autosize="field.type !== 'long_text'"
          @blur="commit"
          @keyup.enter="commit"
          @keydown="onCommandKeydown"
          @mouseup="onTextSelectionChange"
          @keyup="onTextSelectionChange"
        />
        <!-- 斜杠命令面板（E-06）：敲「/」唤出 -->
        <div v-if="slashOpen" class="base-cell__slash">
          <button
            v-for="(cmd, index) in slashItems"
            :key="cmd.key"
            type="button"
            class="base-cell__slash-item"
            :class="{ 'is-active': index === slashIndex }"
            @mousedown.prevent="runCommand(cmd)"
            @mouseenter="slashIndex = index"
          >
            <span class="base-cell__slash-label">{{ cmd.label }}</span>
            <span class="base-cell__slash-key">/{{ cmd.key }}</span>
          </button>
          <div v-if="!slashItems.length" class="base-cell__slash-empty">
            没有匹配的命令
          </div>
        </div>
        <!-- 浮动工具条（E-06 Bubble Menu 等价物）：选中文本后出现 -->
        <div v-if="bubbleOpen" class="base-cell__bubble">
          <button
            type="button"
            class="base-cell__bubble-btn"
            title="复制选中的文字"
            @mousedown.prevent="bubbleCopy"
          >
            复制
          </button>
          <button
            type="button"
            class="base-cell__bubble-btn"
            title="转为大写"
            @mousedown.prevent="bubbleCommand('upper')"
          >
            Aa
          </button>
          <button
            type="button"
            class="base-cell__bubble-btn"
            title="转为小写"
            @mousedown.prevent="bubbleCommand('lower')"
          >
            aa
          </button>
          <button
            type="button"
            class="base-cell__bubble-btn"
            title="插入链接"
            @mousedown.prevent="bubbleCommand('link')"
          >
            <el-icon><LinkIcon /></el-icon>
          </button>
          <button
            type="button"
            class="base-cell__bubble-btn"
            title="清空内容"
            @mousedown.prevent="bubbleCommand('clear')"
          >
            清空
          </button>
        </div>
      </template>
      <span v-else-if="field.type === 'doc'" class="base-cell__doc">
        <template v-if="docIds.length">
          <a
            v-for="id in docIds"
            :key="id"
            class="base-cell__doc-link"
            role="link"
            @click.stop.prevent="emit('open-doc', id)"
            @dblclick.stop
          >
            {{ docTitle(id) }}
          </a>
        </template>
        <span v-else class="base-cell__text is-empty">—</span>
      </span>
      <div v-else-if="field.type === 'attachment'" class="base-cell__attach">
        <template v-if="attachmentItems.length">
          <span
            v-for="item in attachmentItems"
            :key="item.raw"
            class="base-cell__attach-item"
            :title="item.name"
          >
            <img
              v-if="isImageUrl(item.url)"
              :src="item.url"
              class="base-cell__attach-img"
              alt=""
            />
            <span v-else class="base-cell__attach-chip">
              <el-icon><Paperclip /></el-icon>{{ item.name }}
            </span>
          </span>
        </template>
        <span v-else class="base-cell__text is-empty">—</span>
      </div>
      <span v-else-if="field.type === 'link'" class="base-cell__link">
        <template v-if="linkIds.length">
          <a
            v-for="id in linkIds"
            :key="id"
            class="base-cell__link-chip"
            role="link"
            :title="linkTitle(id)"
            @click.stop.prevent="openLinked(id)"
            @dblclick.stop
          >
            {{ linkTitle(id) }}
          </a>
        </template>
        <span v-else class="base-cell__text is-empty">—</span>
      </span>
      <span
        v-else-if="
          field.type === 'single_select' || field.type === 'multi_select'
        "
        class="base-cell__tags"
      >
        <template v-if="tagItems.length">
          <span
            v-for="item in tagItems"
            :key="item.text"
            class="base-cell__tag"
            :style="{ background: item.bg, color: item.fg }"
          >
            <i class="base-cell__tag-dot" :style="{ background: item.dot }" />
            {{ item.text }}
          </span>
        </template>
        <span v-else class="base-cell__text is-empty">—</span>
      </span>
      <span
        v-else-if="field.type === 'checkbox'"
        class="base-cell__check"
        :class="{ 'is-checked': Boolean(modelValue) }"
      >
        <el-icon v-if="modelValue"><Check /></el-icon>
      </span>
      <span
        v-else
        class="base-cell__text"
        :title="display"
        :class="{
          'is-date': field.type === 'date' || field.type === 'datetime',
        }"
      >
        {{ display }}
      </span>
      <el-icon
        v-if="field.readOnly"
        class="base-cell__lock"
        title="当前角色只读"
      >
        <Lock />
      </el-icon>
    </template>
  </div>
</template>

<style scoped>
/* —— 飞书多维表格：单选 / 多选标签 —— */
.base-cell__tags {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
}

.base-cell__tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 20px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 12px;
  line-height: 20px;
  white-space: nowrap;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}

.base-cell__tag-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* —— 飞书多维表格：勾选框 —— */
.base-cell__check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 3px;
  border: 1px solid #bbbfc4;
  color: #fff;
}

/* 日期 / 日期时间：飞书用次级灰字，避免和正文抢视线。 */
.base-cell__text.is-date {
  color: #646a73;
}

.base-cell__check.is-checked {
  background: #3370ff;
  border-color: #3370ff;
}

.base-cell {
  position: relative;
  min-height: 24px;
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
}

.base-cell__text {
  cursor: default;
  word-break: break-word;
}

/* 条件可见隐藏的单元格占位（第十五轮）。 */
.base-cell__cond {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--tg-text-3, #94a3b8);
  font-style: italic;
}

.base-cell.is-cond-hidden {
  background: repeating-linear-gradient(
    135deg,
    rgba(148, 163, 184, 0.08),
    rgba(148, 163, 184, 0.08) 6px,
    transparent 6px,
    transparent 12px
  );
}

.base-cell.is-empty .base-cell__text::before {
  content: "";
  display: inline-block;
  min-width: 12px;
}

.base-cell.is-computed .base-cell__text {
  color: var(--tg-text-2, #64748b);
  font-variant-numeric: tabular-nums;
}

.base-cell__doc {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.base-cell__doc-link {
  color: var(--tg-blue);
  text-decoration: none;
  border-bottom: 1px solid transparent;
}

.base-cell__doc-link:hover {
  border-bottom-color: currentColor;
}

.base-cell__lock {
  margin-left: auto;
  flex: none;
  font-size: 12px;
  color: var(--tg-text-3, #94a3b8);
}

.base-cell__link {
  display: flex;
  /* 飞书：关联记录始终单行排列，超出省略，保证行高恒为 40px */
  flex-wrap: nowrap;
  gap: 4px;
  align-items: center;
  min-width: 0;
  overflow: hidden;
}

.base-cell__link-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 0 1 auto;
  height: 20px;
  max-width: 100%;
  padding: 0 6px;
  border-radius: 4px;
  background: rgba(51, 112, 255, 0.1);
  color: #3370ff;
  font-size: 12px;
  line-height: 20px;
  text-decoration: none;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.base-cell__link-chip:hover {
  background: rgba(51, 112, 255, 0.18);
}

/* 斜杠命令面板（E-06）。 */
.base-cell__slash {
  position: absolute;
  left: 0;
  top: 100%;
  z-index: 40;
  min-width: 180px;
  max-height: 220px;
  overflow: auto;
  padding: 4px;
  margin-top: 4px;
  background: #fff;
  border: 1px solid var(--tg-border, #e5e7eb);
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.14);
}

.base-cell__slash-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 6px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  font-size: 13px;
  color: var(--tg-text-1, #1f2937);
  cursor: pointer;
  text-align: left;
}

.base-cell__slash-item.is-active {
  background: var(--tg-surface-3, #f1f5f9);
  color: var(--tg-blue, #3390ec);
}

.base-cell__slash-key {
  font-size: 11px;
  color: var(--tg-text-3, #94a3b8);
}

.base-cell__slash-empty {
  padding: 8px 10px;
  font-size: 12px;
  color: var(--tg-text-3, #94a3b8);
}

/* 浮动工具条（E-06）。 */
.base-cell__bubble {
  position: absolute;
  left: 0;
  bottom: 100%;
  z-index: 40;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  margin-bottom: 4px;
  background: #1f2937;
  border-radius: 8px;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.24);
}

.base-cell__bubble-btn {
  min-width: 26px;
  height: 24px;
  padding: 0 6px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #f8fafc;
  font-size: 12px;
  cursor: pointer;
}

.base-cell__bubble-btn:hover {
  background: rgba(255, 255, 255, 0.16);
}

.base-cell.is-focused {
  /* 飞书：聚焦单元格是主色描边（不是 Telegram 蓝） */
  outline: 2px solid var(--fs-blue, #3370ff);
  outline-offset: -2px;
  border-radius: 6px;
}

.base-cell__upload {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.base-cell__files {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.base-cell__file {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  padding: 2px 6px;
  border-radius: 8px;
  background: var(--tg-surface-2, #f1f5f9);
  font-size: 12px;
}

.base-cell__file-icon {
  font-size: 12px;
  color: var(--tg-text-2, #64748b);
}

.base-cell__file-name {
  color: var(--tg-blue, #3390ec);
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 140px;
}

.base-cell__file-remove {
  border: none;
  background: transparent;
  color: var(--tg-text-2, #64748b);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0 2px;
}

.base-cell__file-remove:hover {
  color: var(--tg-danger, #ef4444);
}

.base-cell__file-input {
  display: none;
}

.base-cell__attach {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.base-cell__attach-img {
  width: 32px;
  height: 32px;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid var(--fs-border, #dee0e3);
}

.base-cell__attach-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 20px;
  padding: 0 6px;
  border-radius: 4px;
  background: var(--fs-bg-page, #f5f6f7);
  color: var(--fs-text-2, #646a73);
  font-size: 12px;
}
</style>
