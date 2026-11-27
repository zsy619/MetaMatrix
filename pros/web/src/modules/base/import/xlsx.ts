/**
 * 极简 XLSX 读取器（零依赖，浏览器端）。
 *
 * 与 `export/xlsx.ts`（生成器）配套，解决「导出得到 XLSX，但导不回去」的闭环缺口。
 *
 * 为什么自己解析：
 *   - `xlsx`（SheetJS 社区版）已从 npm 主仓下架，0.18.5 有已知漏洞，不引入；
 *   - ExcelJS 体积大，为「读一张表」引入整套依赖不划算；
 *   - 浏览器自带 `DecompressionStream('deflate-raw')`，能解真实 Excel 的 DEFLATE 条目。
 *
 * 覆盖范围（够用即可）：
 *   - ZIP：STORE（0）与 DEFLATE（8）两种条目；
 *   - 单元格类型：sharedStrings（`t="s"`）、inlineStr（`t="inlineStr"`）、
 *     公式字符串（`t="str"`）、布尔（`t="b"`）、数字；
 *   - 日期：按 `styles.xml` 的 numFmtId 判定内置日期格式，序列号转 `yyyy-MM-dd` / `yyyy-MM-dd HH:mm:ss`；
 *   - 1900 / 1904 日期系统（`workbookPr@date1904`）。
 */

/** 解析出来的一张工作表。 */
export type XlsxSheetData = {
  name: string;
  /** 每行都是字符串数组；空单元格补空串，保证列对齐。 */
  rows: string[][];
};

const UTF8 = new TextDecoder("utf-8");

/* ------------------------------------------------------------------ ZIP */

/** ZIP 条目。 */
type ZipEntry = {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
};

function readU16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

/** 从尾部回扫定位 EOCD（End of Central Directory）。 */
function findEOCD(bytes: Uint8Array): number {
  const min = Math.max(0, bytes.length - 66000);
  for (let i = bytes.length - 22; i >= min; i -= 1) {
    if (
      bytes[i] === 0x50 &&
      bytes[i + 1] === 0x4b &&
      bytes[i + 2] === 0x05 &&
      bytes[i + 3] === 0x06
    ) {
      return i;
    }
  }
  return -1;
}

/** 解析中央目录，得到全部条目。 */
function readCentralDirectory(bytes: Uint8Array): ZipEntry[] {
  const eocd = findEOCD(bytes);
  if (eocd < 0) throw new Error("不是有效的 xlsx 文件（找不到 ZIP 目录）");
  const count = readU16(bytes, eocd + 10);
  let offset = readU32(bytes, eocd + 16);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i += 1) {
    if (
      offset + 46 > bytes.length ||
      bytes[offset] !== 0x50 ||
      bytes[offset + 1] !== 0x4b ||
      bytes[offset + 2] !== 0x01 ||
      bytes[offset + 3] !== 0x02
    ) {
      break;
    }
    const method = readU16(bytes, offset + 10);
    const compressedSize = readU32(bytes, offset + 20);
    const uncompressedSize = readU32(bytes, offset + 24);
    const nameLen = readU16(bytes, offset + 28);
    const extraLen = readU16(bytes, offset + 30);
    const commentLen = readU16(bytes, offset + 32);
    const localOffset = readU32(bytes, offset + 42);
    // eslint-disable-next-line no-console
    const name = UTF8.decode(
      bytes.subarray(offset + 46, offset + 46 + nameLen),
    );
    entries.push({
      name,
      method,
      compressedSize,
      uncompressedSize,
      localOffset,
    });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** 读取单个条目的内容（自动解压）。 */
async function readEntry(
  bytes: Uint8Array,
  entry: ZipEntry,
): Promise<Uint8Array> {
  const header = entry.localOffset;
  if (
    bytes[header] !== 0x50 ||
    bytes[header + 1] !== 0x4b ||
    bytes[header + 2] !== 0x03
  ) {
    throw new Error(`xlsx 条目损坏：${entry.name}`);
  }
  const nameLen = readU16(bytes, header + 26);
  const extraLen = readU16(bytes, header + 28);
  const start = header + 30 + nameLen + extraLen;
  const raw = bytes.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return raw;
  if (entry.method !== 8) {
    throw new Error(`不支持的压缩方式：${entry.method}（${entry.name}）`);
  }
  return inflateRaw(raw);
}

/** DEFLATE（raw）解压：优先用浏览器原生 DecompressionStream。 */
async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const Ctor = (
    globalThis as unknown as {
      DecompressionStream?: new (format: string) => {
        readable: ReadableStream<Uint8Array>;
        writable: {
          getWriter: () => {
            write: (chunk: Uint8Array) => void;
            close: () => void;
          };
        };
      };
    }
  ).DecompressionStream;
  if (!Ctor) {
    throw new Error("当前环境不支持解压 xlsx（缺少 DecompressionStream）");
  }
  const stream = new Ctor("deflate-raw");
  // 注意：写入走 writable，读取走 readable（ReadableStream 上没有 getWriter）。
  const writer = stream.writable.getWriter();
  void writer.write(data);
  void writer.close();
  const chunks: Uint8Array[] = [];
  const reader = stream.readable.getReader();
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  let total = 0;
  for (const chunk of chunks) total += chunk.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/* ------------------------------------------------------------------ XML */

function attr(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
  return match?.[1];
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&");
}

/** 取 XML 片段里的所有文本（拼接 `<t>` 节点）。 */
function textOf(fragment: string): string {
  const parts: string[] = [];
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(fragment))) parts.push(decodeEntities(match[1]));
  if (parts.length) return parts.join("");
  // 没有 <t>（例如 `<v>` 直接给值）时，去掉标签取纯文本。
  return decodeEntities(fragment.replace(/<[^>]*>/g, ""));
}

/** 解析 sharedStrings.xml。 */
function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const re = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml))) out.push(textOf(match[1]));
  return out;
}

/** 解析 styles.xml：返回每个 cellXf 的 numFmtId。 */
function parseStyleFormats(xml: string): number[] {
  const cellXfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)?.[1] ?? "";
  const formats: number[] = [];
  const re = /<xf\b[^>]*>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(cellXfs))) {
    formats.push(Number(attr(match[0], "numFmtId") ?? "0"));
  }
  return formats;
}

/** 内置日期格式的 numFmtId（自定义格式 ≥164 视为普通文本）。 */
function isDateFormat(numFmtId: number): boolean {
  return (
    (numFmtId >= 14 && numFmtId <= 22) ||
    (numFmtId >= 27 && numFmtId <= 36) ||
    (numFmtId >= 45 && numFmtId <= 47) ||
    (numFmtId >= 50 && numFmtId <= 58)
  );
}

/** Excel 序列号 → 日期字符串。 */
function serialToDate(serial: number, date1904: boolean): string {
  // 1900 系统用 1899-12-30 作为基准（兼容 Excel 的 1900 闰年 bug）。
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const ms = epoch + Math.round(serial * 86400 * 1000);
  const date = new Date(ms);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  if (hh === "00" && mm === "00" && ss === "00") return `${y}-${m}-${d}`;
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

/** 列字母 → 0 基列号（A→0，AA→26）。 */
function columnIndex(ref: string): number {
  let index = 0;
  for (const ch of ref) {
    const code = ch.charCodeAt(0);
    if (code < 65 || code > 90) break;
    index = index * 26 + (code - 64);
  }
  return Math.max(0, index - 1);
}

/** 解析一张工作表 XML 为二维字符串数组。 */
function parseSheet(
  xml: string,
  shared: string[],
  formats: number[],
  date1904: boolean,
): string[][] {
  const rows: string[][] = [];
  const rowRe = /<row\b([^>]*)>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(xml))) {
    const body = rowMatch[2];
    const cells: string[] = [];
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRe.exec(body))) {
      const tag = cellMatch[1];
      const inner = cellMatch[2] ?? "";
      const ref = attr(tag, "r");
      const type = attr(tag, "t");
      const styleId = Number(attr(tag, "s") ?? "-1");
      const index = ref ? columnIndex(ref) : cells.length;
      let value = "";
      if (type === "inlineStr") {
        value = textOf(inner);
      } else {
        const vMatch = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner);
        const raw = vMatch ? decodeEntities(vMatch[1]) : "";
        if (type === "s") {
          value = shared[Number(raw)] ?? "";
        } else if (type === "b") {
          value = raw === "1" ? "TRUE" : "FALSE";
        } else if (type === "str" || type === "e") {
          value = raw;
        } else if (raw !== "") {
          const num = Number(raw);
          if (
            styleId >= 0 &&
            formats[styleId] !== undefined &&
            isDateFormat(formats[styleId]) &&
            Number.isFinite(num)
          ) {
            value = serialToDate(num, date1904);
          } else {
            value = raw;
          }
        }
      }
      while (cells.length < index) cells.push("");
      cells[index] = value;
    }
    rows.push(cells);
  }
  return rows;
}

/** 解析 workbook.xml + rels，得到「工作表名 → 部件路径」。 */
function parseWorkbook(
  workbookXml: string,
  relsXml: string,
): { name: string; path: string }[] {
  const rels: Record<string, string> = {};
  const relRe = /<Relationship\b([^>]*)\/>/g;
  let relMatch: RegExpExecArray | null;
  while ((relMatch = relRe.exec(relsXml))) {
    const id = attr(relMatch[1], "Id");
    const target = attr(relMatch[1], "Target");
    if (id && target) {
      rels[id] = target.replace(/^\/?xl\//, "").replace(/^\.\//, "");
    }
  }
  const sheets: { name: string; path: string }[] = [];
  const sheetRe = /<sheet\b([^>]*)\/>/g;
  let sheetMatch: RegExpExecArray | null;
  while ((sheetMatch = sheetRe.exec(workbookXml))) {
    const name = attr(sheetMatch[1], "name") ?? "Sheet";
    const rid = attr(sheetMatch[1], "r:id") ?? attr(sheetMatch[1], "id");
    const target = rid ? rels[rid] : undefined;
    sheets.push({
      name,
      path: target ? `xl/${target}` : "",
    });
  }
  return sheets;
}

/**
 * 读取 xlsx（ArrayBuffer），返回全部工作表。
 *
 * 解析失败会抛错，调用方需要给出可读提示。
 */
export async function readXlsx(buffer: ArrayBuffer): Promise<XlsxSheetData[]> {
  const bytes = new Uint8Array(buffer);
  const entries = readCentralDirectory(bytes);
  const byName = new Map(entries.map((entry) => [entry.name, entry]));

  const textOf_ = async (name: string): Promise<string> => {
    const entry = byName.get(name);
    if (!entry) return "";
    const data = await readEntry(bytes, entry);
    return UTF8.decode(data);
  };

  const workbookXml = await textOf_("xl/workbook.xml");
  const relsXml = await textOf_("xl/_rels/workbook.xml.rels");
  const sharedXml = await textOf_("xl/sharedStrings.xml");
  const stylesXml = await textOf_("xl/styles.xml");
  const shared = parseSharedStrings(sharedXml);
  const formats = parseStyleFormats(stylesXml);
  const date1904 = /<workbookPr\b[^>]*date1904="1"/.test(workbookXml);

  let sheets = parseWorkbook(workbookXml, relsXml);
  if (!sheets.length) {
    // 兜底：没有 workbook.xml 时按 worksheets 目录顺序取。
    sheets = entries
      .filter((entry) => /^xl\/worksheets\/sheet\d+\.xml$/.test(entry.name))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((entry) => ({ name: entry.name, path: entry.name }));
  }

  const out: XlsxSheetData[] = [];
  for (const sheet of sheets) {
    if (!sheet.path) continue;
    const xml = await textOf_(sheet.path);
    if (!xml) continue;
    out.push({
      name: sheet.name,
      rows: parseSheet(xml, shared, formats, date1904),
    });
  }
  if (!out.length) throw new Error("xlsx 里没有可读的工作表");
  return out;
}
