/**
 * 极简 XLSX 生成器（零依赖）。
 *
 * 为什么不用 SheetJS / ExcelJS：
 *   - `xlsx`（SheetJS 社区版）自 2023 年起已从 npm 主仓下架，npm 上的 0.18.5 有已知漏洞；
 *   - ExcelJS 体积大、依赖多，为一个「导出表格」引入一整套依赖不划算；
 *   - 本项目只需要「表头 + 数据行 + 冻结首行 + 列宽」，
 *     用 ZIP（存储模式）+ SpreadsheetML 就能生成合规的 xlsx。
 *
 * 实现要点：
 *   - ZIP 用 **STORE（不压缩）** 模式：xlsx 允许条目不压缩，少一个压缩库依赖；
 *   - CRC32 自查表实现；
 *   - 单元格用 inlineStr / number / boolean 三种内联类型，不引入 sharedStrings。
 *
 * 兼容性：Excel / WPS / LibreOffice / Numbers 均可正常打开。
 */

/** 单元格值类型。 */
export type XlsxCellValue = string | number | boolean | null | undefined;

/** 工作表定义。 */
export type XlsxSheet = {
  /** 工作表名（Excel 限制 31 字符且不能含 : \\ / ? * [ ]）。 */
  name: string;
  /** 行数据；第一行按表头渲染（加粗 + 冻结）。 */
  rows: XlsxCellValue[][];
  /** 列宽（字符数），可选。 */
  columnWidths?: number[];
};

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

/** 计算数据的 CRC32（IEEE）。 */
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** UTF-8 编码。 */
function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** ZIP 条目。 */
type ZipEntry = { name: string; data: Uint8Array };

/**
 * 把若干条目打成 ZIP（STORE 模式）。
 *
 * 只支持「非压缩」是刻意的：xlsx 规范允许任意压缩方式，
 * STORE 的兼容性反而最好（Excel / WPS / Numbers 都能读）。
 */
function zipStore(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  const u16 = (value: number) => [value & 0xff, (value >>> 8) & 0xff];
  const u32 = (value: number) => [
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ];

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local = new Uint8Array([
      0x50,
      0x4b,
      0x03,
      0x04, // 本地文件头签名
      0x14,
      0x00, // 解压所需版本 2.0
      0x08,
      0x00, // 通用标志位：第 11 位 = 文件名为 UTF-8
      0x00,
      0x00, // 压缩方法：0 = STORE
      0x00,
      0x00, // 修改时间
      0x21,
      0x00, // 修改日期
      ...u32(crc),
      ...u32(size),
      ...u32(size),
      ...u16(nameBytes.length),
      0x00,
      0x00, // 扩展字段长度
    ]);
    chunks.push(local, nameBytes, entry.data);

    const dir = new Uint8Array([
      0x50,
      0x4b,
      0x01,
      0x02, // 中央目录签名
      0x14,
      0x00, // 生成版本
      0x14,
      0x00, // 解压所需版本
      0x08,
      0x00, // 通用标志位
      0x00,
      0x00, // 压缩方法
      0x00,
      0x00, // 修改时间
      0x21,
      0x00, // 修改日期
      ...u32(crc),
      ...u32(size),
      ...u32(size),
      ...u16(nameBytes.length),
      0x00,
      0x00, // 扩展字段长度
      0x00,
      0x00, // 文件注释长度
      0x00,
      0x00, // 起始磁盘号
      0x00,
      0x00, // 内部文件属性
      0x00,
      0x00,
      0x00,
      0x00, // 外部文件属性
      ...u32(offset),
    ]);
    central.push(dir, nameBytes);

    offset += local.length + nameBytes.length + size;
  }

  const centralSize = central.reduce((sum, item) => sum + item.length, 0);
  const end = new Uint8Array([
    0x50,
    0x4b,
    0x05,
    0x06, // 中央目录结束记录签名
    0x00,
    0x00, // 当前磁盘号
    0x00,
    0x00, // 中央目录起始磁盘号
    ...u16(entries.length),
    ...u16(entries.length),
    ...u32(centralSize),
    ...u32(offset),
    0x00,
    0x00, // 文件注释长度
  ]);

  const all = [...chunks, ...central, end];
  const total = all.reduce((sum, item) => sum + item.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const item of all) {
    out.set(item, pos);
    pos += item.length;
  }
  return out;
}

/** XML 转义。 */
function escapeXml(text: string): string {
  return (
    text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;")
      // 控制字符在 XML 1.0 里非法，直接剔除。
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")
  );
}

/** 列号 → 列名（A / B / … / AA / AB）。 */
export function columnLetter(index: number): string {
  let n = index;
  let letters = "";
  while (n >= 0) {
    letters = String.fromCharCode(65 + (n % 26)) + letters;
    n = Math.floor(n / 26) - 1;
  }
  return letters;
}

/** 工作表名清洗：去掉 Excel 不允许的字符，并截断到 31 字符。 */
function safeSheetName(name: string, fallback: string): string {
  const cleaned = (name || fallback).replace(/[\\/?*[\]:]/g, " ").trim();
  return (cleaned || fallback).slice(0, 31);
}

/** 生成单张工作表的 XML。 */
function buildSheetXml(sheet: XlsxSheet): string {
  const rows = sheet.rows ?? [];
  const parts: string[] = [];
  parts.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  parts.push(
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
  );
  parts.push('<sheetViews><sheetView workbookViewId="0" tabSelected="1">');
  parts.push(
    '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>',
  );
  parts.push("</sheetView></sheetViews>");

  if (sheet.columnWidths?.length) {
    parts.push("<cols>");
    sheet.columnWidths.forEach((width, i) => {
      if (!width || width <= 0) return;
      parts.push(
        `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`,
      );
    });
    parts.push("</cols>");
  }

  parts.push("<sheetData>");
  rows.forEach((row, rowIndex) => {
    const cells: string[] = [];
    row.forEach((value, colIndex) => {
      const ref = `${columnLetter(colIndex)}${rowIndex + 1}`;
      const style = rowIndex === 0 ? ' s="1"' : "";
      if (value === null || value === undefined || value === "") {
        cells.push(`<c r="${ref}"${style}/>`);
        return;
      }
      if (typeof value === "number" && Number.isFinite(value)) {
        cells.push(`<c r="${ref}"${style}><v>${value}</v></c>`);
        return;
      }
      if (typeof value === "boolean") {
        cells.push(`<c r="${ref}"${style} t="b"><v>${value ? 1 : 0}</v></c>`);
        return;
      }
      cells.push(
        `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`,
      );
    });
    parts.push(`<row r="${rowIndex + 1}">${cells.join("")}</row>`);
  });
  parts.push("</sheetData>");
  parts.push("</worksheet>");
  return parts.join("");
}

/** 最小样式表：0 = 常规，1 = 表头（加粗 + 浅灰底）。 */
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>
</styleSheet>`;

/**
 * 生成 xlsx 文件的二进制内容。
 *
 * @param sheets 工作表列表（至少一张）
 * @returns 文件字节
 */
export function buildXlsx(sheets: XlsxSheet[]): Uint8Array {
  const list = sheets.length ? sheets : [{ name: "Sheet1", rows: [] }];
  const entries: ZipEntry[] = [];

  const contentTypes = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    ...list.map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    ),
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
    "</Types>",
  ].join("");

  const rels = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>',
    "</Relationships>",
  ].join("");

  const workbook = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    "<sheets>",
    ...list.map(
      (sheet, i) =>
        `<sheet name="${escapeXml(safeSheetName(sheet.name, `Sheet${i + 1}`))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
    ),
    "</sheets>",
    "</workbook>",
  ].join("");

  const workbookRels = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    ...list.map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
    ),
    `<Relationship Id="rId${list.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
    "</Relationships>",
  ].join("");

  entries.push({ name: "[Content_Types].xml", data: utf8(contentTypes) });
  entries.push({ name: "_rels/.rels", data: utf8(rels) });
  entries.push({ name: "xl/workbook.xml", data: utf8(workbook) });
  entries.push({
    name: "xl/_rels/workbook.xml.rels",
    data: utf8(workbookRels),
  });
  entries.push({ name: "xl/styles.xml", data: utf8(STYLES_XML) });
  list.forEach((sheet, i) => {
    entries.push({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: utf8(buildSheetXml(sheet)),
    });
  });

  return zipStore(entries);
}

/** 生成可下载的 Blob。 */
export function buildXlsxBlob(sheets: XlsxSheet[]): Blob {
  return new Blob([buildXlsx(sheets) as unknown as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
