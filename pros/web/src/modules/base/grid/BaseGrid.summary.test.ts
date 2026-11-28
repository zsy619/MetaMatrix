// @vitest-environment happy-dom
/**
 * 汇总行 / 分组小计（E-07）。
 *
 * 回归点：
 *   - 底部合计行必须按口径显示（合计 / 平均 / 计数）；
 *   - 分组小计行必须插在「该组最后一行」之后，而不是全部堆在末尾；
 *   - 小计行不能被当成普通记录（不可编辑、不可勾选）。
 */
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import BaseGrid from "./BaseGrid.vue";
import type { FieldMeta, RecordRow, SummaryResult } from "../types";

const FIELDS: FieldMeta[] = [
  {
    id: "f1",
    name: "客户",
    type: "text",
    config: {},
    required: false,
    isPrimary: true,
    sortOrder: 0,
    version: 1,
  },
  {
    id: "f2",
    name: "金额",
    type: "currency",
    config: {},
    required: false,
    isPrimary: false,
    sortOrder: 1,
    version: 1,
  },
];

const ROWS: RecordRow[] = [
  { id: "r1", version: 1, fields: { f1: "甲", f2: 100 }, group: "A", updatedAt: "" },
  { id: "r2", version: 1, fields: { f1: "乙", f2: 200 }, group: "A", updatedAt: "" },
  { id: "r3", version: 1, fields: { f1: "丙", f2: 50 }, group: "B", updatedAt: "" },
] as unknown as RecordRow[];

const SUMMARY: SummaryResult = {
  tableId: "t1",
  total: 3,
  values: [
    { fieldId: "f1", count: 3, filled: 3, empty: 0 },
    { fieldId: "f2", sum: 350, avg: 116.67, min: 50, max: 200, count: 3, filled: 3, empty: 0 },
  ],
  groups: [
    {
      key: "A",
      count: 2,
      values: [
        { fieldId: "f1", count: 2, filled: 2, empty: 0 },
        { fieldId: "f2", sum: 300, count: 2, filled: 2, empty: 0 },
      ],
    },
    {
      key: "B",
      count: 1,
      values: [
        { fieldId: "f1", count: 1, filled: 1, empty: 0 },
        { fieldId: "f2", sum: 50, count: 1, filled: 1, empty: 0 },
      ],
    },
  ],
};

/** 替身：把 footerMethod 的结果渲染出来，方便断言。 */
const stubs = {
  "vxe-grid": {
    props: ["columns", "data", "showFooter", "footerMethod"],
    template: `
      <div>
        <div v-for="(row, i) in data" :key="row.__id" class="row" :data-id="row.__id">
          <slot v-if="row.__summary" name="cell" :row="row" :column="columns[2]" />
        </div>
        <div v-if="showFooter" class="footer">
          <span v-for="(cell, i) in footerMethod()[0]" :key="i" class="footer-cell">{{ cell }}</span>
        </div>
      </div>
    `,
  },
  "el-icon": { template: "<i><slot /></i>" },
  "el-checkbox": { template: "<span />" },
  "el-button": { template: "<button><slot /></button>" },
  "el-tooltip": { template: "<div><slot /></div>" },
  "el-radio-group": { template: "<div><slot /></div>" },
  "el-radio-button": { template: "<button><slot /></button>" },
  BaseFieldCell: { template: "<span class=\"cell\" />" },
  BaseColumnMenu: { template: "<span />" },
};

function mountGrid(summary: SummaryResult | null) {
  return mount(BaseGrid, {
    props: {
      fields: FIELDS,
      rows: ROWS,
      summary,
      summaryGroupFieldId: "f1",
      summaryFunction: "sum" as const,
    },
    global: { stubs },
  });
}

describe("汇总行 / 分组小计", () => {
  it("底部合计行显示合计与总计条数", () => {
    const wrapper = mountGrid(SUMMARY);
    const text = wrapper.find(".footer").text();
    expect(text).toContain("合计");
    expect(text).toContain("共 3 条");
    // 金额列：350 → ¥350
    expect(text).toContain("¥350");
  });

  it("口径切到平均时显示平均值", () => {
    const wrapper = mount(BaseGrid, {
      props: {
        fields: FIELDS,
        rows: ROWS,
        summary: SUMMARY,
        summaryGroupFieldId: "f1",
        summaryFunction: "avg" as const,
      },
      global: { stubs },
    });
    expect(wrapper.find(".footer").text()).toContain("¥116.67");
  });

  it("分组小计行插在该组最后一行之后", () => {
    const wrapper = mountGrid(SUMMARY);
    const ids = wrapper.findAll(".row").map((row) => row.attributes("data-id"));
    // r1, r2, 小计A, r3, 小计B
    expect(ids).toEqual(["r1", "r2", "__summary__A", "r3", "__summary__B"]);
  });

  it("关闭汇总时不显示底部合计行", () => {
    const wrapper = mountGrid(null);
    expect(wrapper.find(".footer").exists()).toBe(false);
  });
});
