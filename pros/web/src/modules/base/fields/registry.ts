/**
 * 前端字段注册表。
 *
 * 与后端 internal/base 的 Go 注册表一一对应：
 * 前端只负责展示与交互，值是否合法、能否筛选排序由服务端裁定。
 */
import type {
  FieldCapabilities,
  FieldType,
  FieldTypeDefinition,
} from "../types";

/** 字段插件：声明一个字段类型在前端的展示与编辑方式。 */
export type FieldPlugin = {
  type: FieldType;
  label: string;
  icon: string;
  color: string;
  description: string;
  /** 归一化用户输入，返回可提交的值。 */
  normalize: (value: unknown, config: Record<string, unknown>) => unknown;
  /** 是否为「多值」字段（多选、人员、附件）。 */
  multi?: boolean;
  /** 是否需要日期时间选择器。 */
  temporal?: boolean;
  /** 公式字段不可直接编辑。 */
  computed?: boolean;
};

/** 内置字段插件。 */
const plugins: FieldPlugin[] = [
  {
    type: "text",
    label: "文本",
    icon: "text",
    color: "#3390ec",
    description: "单行文本",
    normalize: (value) =>
      value === null || value === undefined ? "" : String(value).trim(),
  },
  {
    type: "long_text",
    label: "长文本",
    icon: "document",
    color: "#8b5cf6",
    description: "多行文本",
    normalize: (value) =>
      value === null || value === undefined ? "" : String(value),
  },
  {
    type: "number",
    label: "数字",
    icon: "number",
    color: "#3390ec",
    description: "数值",
    normalize: (value) => {
      if (value === "" || value === null || value === undefined) return 0;
      const num = Number(value);
      return Number.isNaN(num) ? 0 : num;
    },
  },
  {
    type: "currency",
    label: "金额",
    icon: "money",
    color: "#4fae4e",
    description: "金额",
    normalize: (value) => {
      if (value === "" || value === null || value === undefined) return 0;
      const num = Number(value);
      return Number.isNaN(num) ? 0 : num;
    },
  },
  {
    type: "percent",
    label: "百分比",
    icon: "percent",
    color: "#4fae4e",
    description: "百分比",
    normalize: (value) => {
      if (value === "" || value === null || value === undefined) return 0;
      const num = Number(value);
      return Number.isNaN(num) ? 0 : num;
    },
  },
  {
    type: "rating",
    label: "评分",
    icon: "star",
    color: "#f7bc2f",
    description: "0–5 星评分",
    normalize: (value) => {
      const num = Number(value);
      return Number.isNaN(num) ? 0 : Math.max(0, Math.min(5, num));
    },
  },
  {
    type: "date",
    label: "日期",
    icon: "calendar",
    color: "#0ea5a4",
    description: "日期",
    temporal: true,
    normalize: (value) => (value ? String(value).slice(0, 10) : ""),
  },
  {
    type: "datetime",
    label: "日期时间",
    icon: "clock",
    color: "#0ea5a4",
    description: "日期与时间",
    temporal: true,
    normalize: (value) =>
      value ? String(value).slice(0, 19).replace("T", " ") : "",
  },
  {
    type: "checkbox",
    label: "复选框",
    icon: "check",
    color: "#4fae4e",
    description: "是 / 否",
    normalize: (value) => Boolean(value),
  },
  {
    type: "single_select",
    label: "单选",
    icon: "select",
    color: "#e53935",
    description: "从选项中选择",
    normalize: (value) =>
      value === null || value === undefined ? "" : String(value),
  },
  {
    type: "multi_select",
    label: "多选",
    icon: "multi-select",
    color: "#e53935",
    description: "多值选项",
    multi: true,
    normalize: (value) =>
      Array.isArray(value) ? value.map((item) => String(item)) : [],
  },
  {
    type: "email",
    label: "邮箱",
    icon: "message",
    color: "#3390ec",
    description: "邮箱地址",
    normalize: (value) => (value ? String(value).trim() : ""),
  },
  {
    type: "phone",
    label: "电话",
    icon: "phone",
    color: "#3390ec",
    description: "电话号码",
    normalize: (value) => (value ? String(value).trim() : ""),
  },
  {
    type: "url",
    label: "链接",
    icon: "link",
    color: "#3390ec",
    description: "URL 地址",
    normalize: (value) => (value ? String(value).trim() : ""),
  },
  {
    type: "user",
    label: "人员",
    icon: "user",
    color: "#3390ec",
    description: "空间成员",
    multi: true,
    normalize: (value) =>
      Array.isArray(value)
        ? value.map((item) => String(item))
        : value
          ? [String(value)]
          : [],
  },
  {
    type: "attachment",
    label: "附件",
    icon: "paperclip",
    color: "#8b5cf6",
    description: "素材库文件",
    multi: true,
    normalize: (value) => (Array.isArray(value) ? value : []),
  },
  {
    type: "formula",
    label: "公式",
    icon: "function",
    color: "#8b5cf6",
    description: "服务端计算字段",
    computed: true,
    normalize: (value) => value,
  },
  {
    type: "link",
    label: "关联记录",
    icon: "relation",
    color: "#f7bc2f",
    description: "关联其他表的记录",
    multi: true,
    normalize: (value) =>
      Array.isArray(value) ? value : value ? [String(value)] : [],
  },
  {
    type: "lookup",
    label: "引用字段",
    icon: "lookup",
    color: "#0ea5e9",
    description: "把关联记录里的字段值引过来",
    computed: true,
    multi: true,
    normalize: (value) => (Array.isArray(value) ? value : value ? [value] : []),
  },
  {
    type: "rollup",
    label: "汇总字段",
    icon: "rollup",
    color: "#f97316",
    description: "对关联记录里的字段做聚合",
    computed: true,
    normalize: (value) => value,
  },
  {
    type: "created_at",
    label: "创建时间",
    icon: "clock",
    color: "#8b5cf6",
    description: "系统字段：记录创建时间，自动维护",
    computed: true,
    temporal: true,
    normalize: (value) => (value ? String(value) : ""),
  },
  {
    type: "updated_at",
    label: "更新时间",
    icon: "clock",
    color: "#8b5cf6",
    description: "系统字段：记录最后更新时间，自动维护",
    computed: true,
    temporal: true,
    normalize: (value) => (value ? String(value) : ""),
  },
  {
    type: "created_by",
    label: "创建人",
    icon: "user",
    color: "#3390ec",
    description: "系统字段：记录创建人，自动维护",
    computed: true,
    normalize: (value) => (value ? String(value) : ""),
  },
  {
    type: "updated_by",
    label: "更新人",
    icon: "user",
    color: "#3390ec",
    description: "系统字段：记录最后更新人，自动维护",
    computed: true,
    normalize: (value) => (value ? String(value) : ""),
  },
  {
    type: "doc",
    label: "关联文档",
    icon: "document",
    color: "#3390ec",
    description: "关联当前空间的文档，可直接跳转",
    multi: true,
    normalize: (value) =>
      Array.isArray(value)
        ? value.map((item) => String(item))
        : value
          ? [String(value)]
          : [],
  },
];

const registry = new Map<FieldType, FieldPlugin>(
  plugins.map((item) => [item.type, item]),
);

/** 取字段插件。 */
export function fieldPlugin(type: string): FieldPlugin | undefined {
  return registry.get(type as FieldType);
}

/**
 * 是否为只读计算字段（公式 / 引用 / 汇总 / 系统字段）。
 *
 * 这类字段的值由服务端维护，界面上不允许就地编辑，
 * 否则用户会以为改动了实际上被服务端丢弃。
 */
export function isComputedField(type: string): boolean {
  return registry.get(type as FieldType)?.computed === true;
}

/** 全部内置字段插件。 */
export function allFieldPlugins(): FieldPlugin[] {
  return plugins;
}

/** 后端下发的字段定义与本地插件合并（后端为准）。 */
export function mergeDefinitions(
  defs: FieldTypeDefinition[],
): FieldTypeDefinition[] {
  return defs.map((def) => {
    const local = registry.get(def.type);
    return local
      ? {
          ...def,
          label: def.label || local.label,
          icon: def.icon || local.icon,
        }
      : def;
  });
}

/** 默认能力：无后端定义时的兜底。 */
export const defaultCapabilities: FieldCapabilities = {
  editable: true,
  filterable: true,
  sortable: true,
  groupable: true,
  indexable: true,
  computed: false,
};

/** 字段类型的默认配置。 */
export function defaultConfig(type: string): Record<string, unknown> {
  switch (type) {
    case "single_select":
    case "multi_select":
      return { options: ["未开始", "进行中", "已完成"] };
    case "number":
    case "currency":
    case "percent":
      return { precision: 2 };
    case "text":
      return { maxLength: 200 };
    case "lookup":
    case "rollup":
      return { targetTableId: "", targetFieldId: "", linkFieldId: "" };
    default:
      return {};
  }
}
