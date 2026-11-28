// @vitest-environment node
/**
 * XLSX 读取器回归。
 *
 * 关注三点：
 *   1. 真实 Excel 的 ZIP 结构（中央目录 + DEFLATE 条目）能解析；
 *   2. sharedStrings / inlineStr / 数字 / 日期序列号都能拿到正确文本；
 *   3. 坏文件给出可读错误，而不是抛一堆栈。
 */
import { describe, expect, it } from "vitest";
import { readXlsx } from "./xlsx";

/* ---------------------- 测试用 ZIP 构造（STORE / DEFLATE） ---------------------- */

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

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const Ctor = (
    globalThis as unknown as {
      CompressionStream: new (format: string) => {
        readable: ReadableStream<Uint8Array>;
        writable: { getWriter: () => WritableStreamDefaultWriter<Uint8Array> };
      };
    }
  ).CompressionStream;
  const stream = new Ctor("deflate-raw");
  const writer = stream.writable.getWriter();
  void writer.write(data);
  void writer.close();
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** 构造一个 xlsx（字节级），method=0 用 STORE，method=8 用 DEFLATE。 */
const u16 = (v: number) => [v & 0xff, (v >>> 8) & 0xff];
const u32 = (v: number) => [
  v & 0xff,
  (v >>> 8) & 0xff,
  (v >>> 16) & 0xff,
  (v >>> 24) & 0xff,
];

export async function buildXlsx(
  files: Record<string, string>,
  method: 0 | 8 = 0,
): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const names = Object.keys(files);
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const name of names) {
    const nameBytes = encoder.encode(name);
    const raw = encoder.encode(files[name]);
    let payload: Uint8Array = raw;
    if (method === 8) payload = await deflateRaw(raw);
    const crc = crc32(raw);
    const size = raw.length;
    const compSize = payload.length;

    const local = new Uint8Array([
      0x50,
      0x4b,
      0x03,
      0x04,
      0x14,
      0x00,
      0x00,
      0x00,
      ...u16(method),
      0x00,
      0x00,
      0x21,
      0x00,
      ...u32(crc),
      ...u32(compSize),
      ...u32(size),
      ...u16(nameBytes.length),
      0x00,
      0x00,
    ]);
    locals.push(local, nameBytes, payload);

    centrals.push(
      new Uint8Array([
        0x50,
        0x4b,
        0x01,
        0x02,
        0x14,
        0x00,
        0x14,
        0x00,
        0x00,
        0x00,
        ...u16(method),
        0x00,
        0x00,
        0x21,
        0x00,
        ...u32(crc),
        ...u32(compSize),
        ...u32(size),
        ...u16(nameBytes.length),
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        ...u32(0),
        ...u32(offset),
      ]),
      nameBytes,
    );
    offset += local.length + nameBytes.length + payload.length;
  }

  const centralSize = centrals.reduce((sum, c) => sum + c.length, 0);

  const eocd = new Uint8Array([
    0x50,
    0x4b,
    0x05,
    0x06,
    0x00,
    0x00,
    0x00,
    0x00,
    ...u16(names.length),
    ...u16(names.length),
    ...u32(centralSize),
    ...u32(offset),
    0x00,
    0x00,
  ]);

  const all = [...locals, ...centrals, eocd];
  const total = all.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of all) {
    out.set(chunk, cursor);
    cursor += chunk.length;
  }
  return out.buffer;
}

export const BASE_FILES = {
  "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`,
  "_rels/.rels": `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="客户" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  "xl/sharedStrings.xml": `<?xml version="1.0" encoding="UTF-8"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="3" uniqueCount="3"><si><t>客户名称</t></si><si><t>华东智造集团</t></si><si><t>南山数科</t></si></sst>`,
  "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>`,
  "xl/worksheets/sheet1.xml": `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>金额</t></is></c><c r="C1" t="s"><v>1</v></c></row>
<row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>360000</v></c><c r="C2" s="1"><v>45000</v></c></row>
<row r="3"><c r="A3" t="s"><v>2</v></c><c r="B3"><v>200000</v></c></row>
</sheetData></worksheet>`,
};

describe("XLSX 读取", () => {
  it("解析 STORE 条目：sharedStrings / inlineStr / 数字 / 日期序列号", async () => {
    const sheets = await readXlsx(await buildXlsx(BASE_FILES, 0));
    expect(sheets.length).toBe(1);
    expect(sheets[0].name).toBe("客户");
    const rows = sheets[0].rows;
    expect(rows[0]).toEqual(["客户名称", "金额", "华东智造集团"]);
    expect(rows[1][0]).toBe("华东智造集团");
    expect(rows[1][1]).toBe("360000");
    // numFmtId=14 是内置日期格式 → 序列号 45000 转成日期文本
    expect(rows[1][2]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(rows[2][0]).toBe("南山数科");
  });

  it("解析 DEFLATE 条目（真实 Excel 的压缩方式）", async () => {
    const sheets = await readXlsx(await buildXlsx(BASE_FILES, 8));
    expect(sheets[0].rows[0][0]).toBe("客户名称");
    expect(sheets[0].rows[1][0]).toBe("华东智造集团");
  });

  it("坏文件给出可读错误", async () => {
    const junk = new Uint8Array([1, 2, 3, 4, 5]);
    await expect(readXlsx(junk.buffer)).rejects.toThrow(/有效的 xlsx/);
  });
});
