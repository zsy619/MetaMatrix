/**
 * 公式函数目录（与后端 internal/base/formula.go + formula_ext.go 一一对应）。
 *
 * 作用：
 *   - 公式编辑弹窗里给出「可点即插」的函数面板，避免用户去猜函数名；
 *   - 数量与后端注册表保持一致，由 xlsx.test.ts 同级的单测守护。
 */

export type FormulaFunctionItem = {
  /** 函数名（大写，与后端一致）。 */
  name: string;
  /** 参数签名，用于提示。 */
  signature: string;
  /** 一句话说明。 */
  desc: string;
};

export type FormulaFunctionGroup = {
  /** 分组名。 */
  group: string;
  /** 组内函数。 */
  items: FormulaFunctionItem[];
};

/** 全部函数分组。 */
export const FORMULA_FUNCTION_GROUPS: FormulaFunctionGroup[] = [
  {
    group: "数学与统计",
    items: [
      { name: "SUM", signature: "SUM(数值, …)", desc: "求和" },
      { name: "AVERAGE", signature: "AVERAGE(数值, …)", desc: "平均值" },
      { name: "COUNT", signature: "COUNT(值, …)", desc: "计数" },
      { name: "MIN", signature: "MIN(值, …)", desc: "最小值" },
      { name: "MAX", signature: "MAX(值, …)", desc: "最大值" },
      { name: "ROUND", signature: "ROUND(数值, 位数)", desc: "四舍五入" },
      { name: "ABS", signature: "ABS(数值)", desc: "绝对值" },
      { name: "FLOOR", signature: "FLOOR(数值, 步长)", desc: "向下取整" },
      { name: "CEILING", signature: "CEILING(数值, 步长)", desc: "向上取整" },
      { name: "POWER", signature: "POWER(底数, 指数)", desc: "幂运算" },
      { name: "MOD", signature: "MOD(数, 除数)", desc: "取余" },
      { name: "SQRT", signature: "SQRT(数值)", desc: "平方根" },
    ],
  },
  {
    group: "文本",
    items: [
      {
        name: "CONCATENATE",
        signature: "CONCATENATE(文本, …)",
        desc: "拼接文本",
      },
      {
        name: "CONCAT",
        signature: "CONCAT(文本, …)",
        desc: "拼接文本（别名）",
      },
      { name: "UPPER", signature: "UPPER(文本)", desc: "转大写" },
      { name: "LOWER", signature: "LOWER(文本)", desc: "转小写" },
      { name: "PROPER", signature: "PROPER(文本)", desc: "单词首字母大写" },
      { name: "TRIM", signature: "TRIM(文本)", desc: "去除首尾空格" },
      { name: "LEN", signature: "LEN(文本)", desc: "字符数" },
      { name: "LEFT", signature: "LEFT(文本, 长度)", desc: "取左侧字符" },
      { name: "RIGHT", signature: "RIGHT(文本, 长度)", desc: "取右侧字符" },
      { name: "MID", signature: "MID(文本, 起始, 长度)", desc: "截取中间字符" },
      {
        name: "FIND",
        signature: "FIND(查找, 文本)",
        desc: "查找位置（区分大小写）",
      },
      {
        name: "SUBSTITUTE",
        signature: "SUBSTITUTE(文本, 旧, 新)",
        desc: "替换文本",
      },
    ],
  },
  {
    group: "日期与时间",
    items: [
      { name: "TODAY", signature: "TODAY()", desc: "今天（按天重算）" },
      { name: "NOW", signature: "NOW()", desc: "当前时刻（按天重算）" },
      { name: "DATE", signature: "DATE(年, 月, 日, …)", desc: "拼装日期" },
      { name: "YEAR", signature: "YEAR(日期)", desc: "取年份" },
      { name: "MONTH", signature: "MONTH(日期)", desc: "取月份" },
      { name: "DAY", signature: "DAY(日期)", desc: "取日" },
      { name: "HOUR", signature: "HOUR(日期)", desc: "取小时" },
      { name: "MINUTE", signature: "MINUTE(日期)", desc: "取分钟" },
      { name: "SECOND", signature: "SECOND(日期)", desc: "取秒" },
      { name: "WEEKDAY", signature: "WEEKDAY(日期)", desc: "星期几（1=周一）" },
    ],
  },
  {
    group: "逻辑与容错",
    items: [
      { name: "IF", signature: "IF(条件, 真值, 假值)", desc: "条件分支" },
      { name: "AND", signature: "AND(条件, …)", desc: "全部为真" },
      { name: "OR", signature: "OR(条件, …)", desc: "任一为真" },
      { name: "NOT", signature: "NOT(条件)", desc: "取反" },
      {
        name: "SWITCH",
        signature: "SWITCH(值, 匹配, 结果, …, 默认)",
        desc: "多路分支",
      },
      {
        name: "COALESCE",
        signature: "COALESCE(值, …)",
        desc: "取第一个非空值",
      },
      {
        name: "IFERROR",
        signature: "IFERROR(表达式, 兜底)",
        desc: "出错时用兜底值",
      },
      { name: "ISBLANK", signature: "ISBLANK(值)", desc: "是否为空" },
      { name: "ISNUMBER", signature: "ISNUMBER(值)", desc: "是否为数字" },
      { name: "ISTEXT", signature: "ISTEXT(值)", desc: "是否为文本" },
    ],
  },
];

/** 全部函数（扁平）。 */
export const ALL_FORMULA_FUNCTIONS: FormulaFunctionItem[] =
  FORMULA_FUNCTION_GROUPS.flatMap((group) => group.items);

/** 按函数名索引。 */
export const FORMULA_FUNCTION_MAP = new Map(
  ALL_FORMULA_FUNCTIONS.map((item) => [item.name, item]),
);
