/** 多维表格 Base Engine 的前端类型定义（与后端 internal/base 保持一致）。 */

/** 字段类型标识。 */
export type FieldType =
  | "text"
  | "long_text"
  | "number"
  | "currency"
  | "percent"
  | "rating"
  | "date"
  | "datetime"
  | "checkbox"
  | "single_select"
  | "multi_select"
  | "email"
  | "phone"
  | "url"
  | "user"
  | "attachment"
  | "formula"
  | "link"
  | "doc"
  | "lookup"
  | "rollup"
  | "created_at"
  | "updated_at"
  | "created_by"
  | "updated_by";

/** 计算字段（引用 / 汇总）的配置。 */
export type ComputedFieldConfig = {
  /** 目标表 ID。 */
  targetTableId?: string;
  /** 目标字段 ID。 */
  targetFieldId?: string;
  /** 本表承载关联关系的字段 ID（省略则自动推断）。 */
  linkFieldId?: string;
  /** 汇总方式。 */
  rollupType?: "sum" | "avg" | "count" | "countUnique" | "min" | "max";
};

/** 字段能力：决定哪些视图操作可用。 */
export type FieldCapabilities = {
  editable: boolean;
  filterable: boolean;
  sortable: boolean;
  groupable: boolean;
  indexable: boolean;
  computed: boolean;
};

/** 字段类型定义（后端下发的注册表）。 */
export type FieldTypeDefinition = {
  type: FieldType;
  label: string;
  icon: string;
  version: number;
  color: string;
  description: string;
  configSchema: Record<string, unknown>;
  capabilities: FieldCapabilities;
};

/** 字段元信息。 */
export type FieldMeta = {
  id: string;
  name: string;
  type: FieldType;
  config: Record<string, unknown>;
  required: boolean;
  isPrimary: boolean;
  sortOrder: number;
  version: number;
  /** 当前用户对该字段只读（服务端按字段级权限策略计算）。 */
  readOnly?: boolean;
  /** 该字段配置了「条件可见」策略（只有满足条件的记录看得到它）。 */
  conditional?: boolean;
};

/** 字段级条件（条件可见 / 条件隐藏）。 */
export type FieldCondition = {
  fieldId: string;
  operator: string;
  value?: unknown;
};

/** 记录级可见范围。 */
export type RecordVisibility = "space" | "restricted" | "custom";

/** 记录（行）。 */
export type RecordRow = {
  id: string;
  version: number;
  fields: Record<string, unknown>;
  /** 因「条件可见」策略而对本行隐藏的字段 ID（值不过网）。 */
  conditionalHidden?: string[];
  updatedAt: string;
  /** 记录级可见范围：space = 空间内可见；restricted = 仅创建者与空间管理者可见；custom = 指定成员可见。 */
  visibility?: RecordVisibility;
  /** 记录创建者（受限记录只有他和管理者看得到）。 */
  createdBy?: string;
};

/** 表。 */
export type BaseTable = {
  id: string;
  baseId: string;
  name: string;
  description: string;
  primaryFieldId?: string;
  sortOrder: number;
  schemaVersion: number;
  settings: Record<string, unknown>;
  fields: FieldMeta[];
  recordCount: number;
  createdAt: string;
};

/** 视图。 */
export type ViewType =
  "grid" | "kanban" | "calendar" | "gallery" | "form" | "gantt";

/** 视图配置。 */
/** 个人偏好段：只影响自己，不改共享配置。 */
export type PersonalViewConfig = {
  fieldVisibility?: Record<string, boolean>;
  fieldWidths?: Record<string, number>;
  /**
   * 列顺序（字段 ID 数组，飞书：每个视图的列顺序可以不同）。
   *
   * 不在数组里的字段按原有顺序排在后面（新增字段不会消失）。
   */
  fieldOrder?: string[];
  /** 冻结列（字段 ID 列表，必须从左起连续）。 */
  frozenFields?: string[];
  layout?: Record<string, unknown>;
  /**
   * 个人查询偏好（第十三轮）。
   *
   * 筛选 / 排序 / 分组过去写在共享段里，A 改了就抹掉 B 的查询条件。
   * 现在可以把「我的查询条件」放进个人段：只有自己看得到自己的那份，
   * 共享段仍然是「视图给所有人看到的默认查询条件」。
   */
  query?: {
    filters?: FilterGroup;
    sorts?: SortRule[];
    groups?: GroupRule[];
    /**
     * 与共享条件的组合方式（第十四轮）：
     * override = 我的条件完全覆盖共享条件（历史行为）；
     * and = 共享条件 AND 我的条件（叠加口径）；
     * or = 共享条件 OR 我的条件（任一满足）。
     */
    combine?: "override" | "and" | "or";
  };
};

export type ViewConfig = {
  fieldVisibility?: Record<string, boolean>;
  fieldWidths?: Record<string, number>;
  /** 列顺序（字段 ID 数组）；个人段的 fieldOrder 优先。 */
  fieldOrder?: string[];
  /** 冻结列（§6.3 ViewConfig.frozenFields）。 */
  frozenFields?: string[];
  filters?: FilterGroup;
  sorts?: SortRule[];
  groups?: GroupRule[];
  pagination?: { pageSize: number };
  layout?: Record<string, unknown>;
  /**
   * 个人偏好（按用户 ID 分桶）。
   *
   * 技术方案风险表：「共享视图与个人偏好混存 → 用户互相覆盖」。
   * 共享视图里的列宽 / 字段显隐写进这里，只有自己看得到自己的那份。
   */
  personal?: Record<string, PersonalViewConfig>;
};

/** 视图可见范围：shared = 空间共享；personal = 仅自己可见。 */
export type ViewScope = "shared" | "personal";

export type BaseView = {
  id: string;
  tableId: string;
  name: string;
  type: ViewType;
  config: ViewConfig;
  isDefault: boolean;
  /** 视图可见范围（后端缺省为 shared）。 */
  scope?: ViewScope;
  ownerId: string;
  version: number;
  createdAt: string;
};

/** 筛选条件与分组。 */
export type Condition = { fieldId: string; operator: string; value: unknown };
export type FilterGroup = {
  logic: "AND" | "OR";
  conditions: Condition[];
  children: FilterGroup[];
};
export type SortRule = { fieldId: string; order: "asc" | "desc" };
export type GroupRule = { fieldId: string; order: "asc" | "desc" };

/** 查询请求与结果。 */
export type QueryRequest = {
  tableId: string;
  viewId?: string;
  filters?: FilterGroup;
  sorts?: SortRule[];
  groups?: GroupRule[];
  pageSize?: number;
  cursor?: string;
  keyword?: string;
};

export type QueryResult = {
  tableId: string;
  viewId?: string;
  schemaVersion: number;
  records: RecordRow[];
  total: number;
  page: {
    nextCursor?: string;
    hasMore: boolean;
    pageSize: number;
    offset: number;
  };
  fields: FieldMeta[];
};

/** Base 概要。 */
export type BaseInfo = {
  id: string;
  projectId: string;
  nodeId?: string;
  name: string;
  description: string;
  icon: string;
  ownerId: string;
  schemaVersion: number;
  migrated?: string;
  createdAt: string;
  updatedAt: string;
};

/** 公式校验结果。 */
export type FormulaValidation = {
  valid: boolean;
  error?: string;
  errorCode?: string;
  dependencies?: string[];
  value?: unknown;
};

/** 记录级可见成员（授权名单里的一人）。 */
export type RecordGrant = {
  userId: string;
  name: string;
  email?: string;
  /** 授权对象类型：user（默认）/ department（按部门）。 */
  subjectType?: 'user' | 'department';
  /** 授权对象 ID：用户 ID 或部门名。 */
  subjectId?: string;
  /** 有效期截止时间；为空表示永久有效。 */
  expiresAt?: string;
};

/** 记录可见范围的授权对象（用户 / 部门 + 有效期）。 */
export type GrantSubject = {
  type: 'user' | 'department';
  /** 用户 ID 或部门名。 */
  id: string;
  /** 有效期截止时间（ISO 字符串）；为空表示永久。 */
  expiresAt?: string | null;
};

/** 配置包里的字段（key 为包内稳定引用键，导入时据此重映射条件引用）。 */
export type ConfigBundleField = {
  key: string;
  name: string;
  type: string;
  required?: boolean;
  isPrimary?: boolean;
  sortOrder: number;
  config?: Record<string, unknown>;
  /** 公式字段的表达式（公式存在独立表里，不在 config 中）。 */
  formula?: string;
};

/** 配置包里的视图（只含共享配置，个人偏好不导出）。 */
export type ConfigBundleView = {
  name: string;
  type: string;
  config?: Record<string, unknown>;
};

/** 表配置包：字段结构 + 策略 + 视图。 */
export type ConfigBundle = {
  formatVersion: number;
  exportedAt: string;
  table: { name: string; description?: string };
  fields: ConfigBundleField[];
  views: ConfigBundleView[];
};

/** 表结构快照（GET /tables/:tableId/schema）。 */
export type TableSchema = {
  table: BaseTable;
  fields: FieldMeta[];
  views: BaseView[];
  schemaVersion: number;
  formulas: Array<{ fieldId: string; fieldName: string; expression: string }>;
};

/** 引用 / 汇总字段摘要（GET /tables/:tableId/computed-fields）。 */
export type ComputedFieldSummary = {
  fieldId: string;
  fieldName: string;
  type: "lookup" | "rollup";
  targetTableId: string;
  targetFieldId: string;
  linkFieldId: string;
  rollupType: string;
};

/** 公式依赖方向。 */
export type FormulaDependency = {
  fieldId: string;
  fieldName: string;
  tableId: string;
  direction: "down" | "up";
};

/** 公式定义（GET /fields/:fieldId/formula）。 */
export type FieldFormulaDefinition = {
  fieldId: string;
  fieldName: string;
  tableId: string;
  expression: string;
  version: number;
  dependencies: FormulaDependency[];
};
