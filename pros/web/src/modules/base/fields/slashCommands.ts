/**
 * 单元格「斜杠命令 / 浮动工具条」的纯逻辑（E-06）。
 *
 * 为什么要有这个：
 * 表格里改一个值，用户往往不是「改字」，而是「填一个今天 / 一个链接 / 转个大小写」。
 * 以前只能手动敲；现在敲「/」就能选命令，选中文本还会浮出一条快捷工具条
 * （对标飞书文档的 Bubble Menu / Notion 的 Slash Command）。
 *
 * 单独成文件是为了能直接跑单测 —— 命令匹配与文本改写是最容易写出
 * 「光标位置算错，把后半段文本吃掉」这种隐蔽 bug 的地方。
 */

/** 一条命令。 */
export type CellCommand = {
  /** 命令标识（斜杠后输入的关键词）。 */
  key: string;
  /** 中文名（菜单里显示）。 */
  label: string;
  /** 备选关键字（英文 / 简写）。 */
  keywords: string[];
  /** 无选择区时是否可用。 */
  needsSelection?: boolean;
};

/** 命令清单。 */
export const CELL_COMMANDS: CellCommand[] = [
  { key: "today", label: "插入今天日期", keywords: ["today", "date", "riqi", "日期"] },
  { key: "now", label: "插入当前时间", keywords: ["now", "time", "shijian", "时间"] },
  { key: "datetime", label: "插入日期时间", keywords: ["datetime", "now2", "日期时间"] },
  { key: "upper", label: "转为大写", keywords: ["upper", "uppercase", "daxie", "大写"] },
  { key: "lower", label: "转为小写", keywords: ["lower", "lowercase", "xiaoxie", "小写"] },
  { key: "trim", label: "去除首尾空格", keywords: ["trim", "space", "kongge", "空格"] },
  { key: "link", label: "插入链接", keywords: ["link", "url", "lianjie", "链接"] },
  { key: "clear", label: "清空内容", keywords: ["clear", "empty", "qingkong", "清空"] },
];

/** 命令执行上下文。 */
export type CommandContext = {
  /** 单元格当前文本。 */
  text: string;
  /** 选区起点 / 终点。 */
  selectionStart: number;
  selectionEnd: number;
  /** 当前时间（可注入，便于测试）。 */
  now?: Date;
};

/** 命令执行结果：改写后的文本 + 新的光标位置。 */
export type CommandResult = {
  text: string;
  selectionStart: number;
  selectionEnd: number;
};

/** 选中的文本。 */
export function selectedText(ctx: CommandContext): string {
  const start = Math.max(0, Math.min(ctx.selectionStart, ctx.text.length));
  const end = Math.max(0, Math.min(ctx.selectionEnd, ctx.text.length));
  if (end <= start) return "";
  return ctx.text.slice(start, end);
}

/**
 * 按「/ 后面输入的词」过滤命令。
 *
 * 中文也要能搜（用户习惯打「日期」而不是「date」），
 * 所以关键词表里同时放了拼音与中文。
 */
export function matchCommands(query: string): CellCommand[] {
  const q = (query ?? "").trim().toLowerCase();
  if (!q) return CELL_COMMANDS;
  return CELL_COMMANDS.filter((cmd) => {
    if (cmd.key.startsWith(q)) return true;
    return cmd.keywords.some((word) => word.startsWith(q));
  });
}

/** 命令是否在当前上下文可用（没选中文字时，「转大小写」这类需要选区）。 */
export function isCommandAvailable(cmd: CellCommand, ctx: CommandContext): boolean {
  if (!cmd.needsSelection) return true;
  return selectedText(ctx).length > 0;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** 本地日期 YYYY-MM-DD。 */
export function formatDate(now: Date): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** 本地时间 HH:mm:ss。 */
export function formatTime(now: Date): string {
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

/**
 * 执行命令。
 *
 * 约定：
 *   - 有选区 → 只改选区（插入类命令插到选区后面）；
 *   - 没选区 → 作用于整格文本（插入类命令追加到末尾）；
 *   - 返回新的光标位置，落在改写内容之后（用户可以接着打字）。
 */
export function applyCommand(
  cmd: CellCommand,
  ctx: CommandContext,
): CommandResult {
  const now = ctx.now ?? new Date();
  const start = Math.max(0, Math.min(ctx.selectionStart, ctx.text.length));
  const end = Math.max(0, Math.min(ctx.selectionEnd, ctx.text.length));
  const picked = ctx.text.slice(start, end);
  const replace = (replacement: string) => ({
    text: ctx.text.slice(0, start) + replacement + ctx.text.slice(end),
    selectionStart: start + replacement.length,
    selectionEnd: start + replacement.length,
  });

  switch (cmd.key) {
    case "today":
      return replace(picked ? `${picked}${formatDate(now)}` : formatDate(now));
    case "now":
      return replace(picked ? `${picked}${formatTime(now)}` : formatTime(now));
    case "datetime":
      return replace(
        picked
          ? `${picked}${formatDate(now)} ${formatTime(now)}`
          : `${formatDate(now)} ${formatTime(now)}`,
      );
    case "upper": {
      const target = picked || ctx.text;
      const replacement = target.toUpperCase();
      return picked ? replace(replacement) : replace(replacement);
    }
    case "lower": {
      const target = picked || ctx.text;
      return replace(target.toLowerCase());
    }
    case "trim": {
      const target = picked || ctx.text;
      return replace(target.trim());
    }
    case "link": {
      // 有选区 → Markdown 链接；没有 → 先放一个占位网址，选中即可替换。
      if (picked) return replace(`[${picked}](https://)`);
      return replace("https://");
    }
    case "clear":
      return replace("");
    default:
      return { text: ctx.text, selectionStart: start, selectionEnd: end };
  }
}

/**
 * 从文本里解析「斜杠命令」：
 * 返回命令关键字与斜杠在文本中的位置（没匹配返回 null）。
 *
 * 只认**行首**的斜杠：否则正文里写「1/2」会被误判成命令。
 */
export function parseSlashQuery(text: string): { query: string; start: number } | null {
  const trimmedStart = text.search(/\S/);
  if (trimmedStart < 0) return null;
  if (text[trimmedStart] !== "/") return null;
  const query = text.slice(trimmedStart + 1);
  // 斜杠后面只允许命令关键词（不含空格与换行），否则是正文。
  if (/[\s\n]/.test(query)) return null;
  return { query, start: trimmedStart };
}
