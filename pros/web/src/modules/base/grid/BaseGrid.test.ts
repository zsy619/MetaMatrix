// @vitest-environment happy-dom
/**
 * 网格列头的字段类型图标。
 *
 * 回归点：列头原本只有字段名，看不出这一列是什么类型。
 */
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import BaseGrid from "./BaseGrid.vue";
import type { FieldMeta, RecordRow } from "../types";

const FIELDS: FieldMeta[] = [
  {
    id: "f1",
    name: "负责人",
    type: "user",
    config: {},
    required: false,
    isPrimary: true,
    sortOrder: 0,
    version: 1,
  },
  {
    id: "f2",
    name: "预算",
    type: "currency",
    config: {},
    required: false,
    isPrimary: false,
    sortOrder: 1,
    version: 1,
  },
];

const ROWS: RecordRow[] = [
  {
    id: "r1",
    tableId: "t1",
    fields: { f1: [], f2: 0 },
    version: 1,
    createdAt: "",
    updatedAt: "",
  } as unknown as RecordRow,
];

/** 用轻量替身渲染列头插槽，避开 vxe-grid 的 DOM 依赖。 */
const stubs = {
  "vxe-grid": {
    props: ["columns"],
    template: `
      <div>
        <div v-for="col in columns" :key="col.field">
          <slot v-if="col.slots && col.slots.header" :name="col.slots.header" :column="col" />
        </div>
      </div>
    `,
  },
  "el-icon": { template: '<i class="ic"><slot /></i>' },
  "el-checkbox": { template: "<span />" },
  "el-button": { template: "<button><slot /></button>" },
  // popover 在 happy-dom 下不渲染，替身把 reference 与内容都渲染出来
  "el-popover": {
    template: '<div><slot name="reference" /><slot /></div>',
  },
};

describe("网格列头", () => {
  it("每列都渲染出类型图标和字段名", () => {
    const wrapper = mount(BaseGrid, {
      props: { fields: FIELDS, rows: ROWS },
      global: { stubs, directives: { loading: {} } },
    });
    const heads = wrapper.findAll(".base-grid__head");
    expect(heads.length).toBe(FIELDS.length);
    for (const head of heads) {
      expect(head.find(".base-grid__head-icon svg").exists()).toBe(true);
      expect(head.find(".base-grid__head-title").text()).toBeTruthy();
    }
  });

  it("列头图标不再行内着色，改用类型提示（飞书：灰色图标）", () => {
    const wrapper = mount(BaseGrid, {
      props: { fields: FIELDS, rows: ROWS },
      global: { stubs, directives: { loading: {} } },
    });
    const icons = wrapper.findAll(".base-grid__head-icon");
    expect(icons.length).toBe(FIELDS.length);
    for (const icon of icons) {
      // 颜色改由 feishu.css 的 `--fs-text-3` 统一承担，不再写行内 color
      expect(icon.attributes("style")).toBeUndefined();
      expect(icon.attributes("title")).toMatch(/字段类型：/);
    }
  });

  it("列头带列操作入口（飞书：hover 出现的 ▾）", () => {
    const wrapper = mount(BaseGrid, {
      props: { fields: FIELDS, rows: ROWS },
      global: { stubs, directives: { loading: {} } },
    });
    expect(wrapper.findAll(".be-colmenu__trigger").length).toBe(FIELDS.length);
  });
});

/** 批次 H：键盘导航 / 单元格右键菜单 / 列宽拖拽（飞书表格效率最后一公里）。 */
const cellStubs = {
  "vxe-grid": {
    props: ["columns", "data"],
    template: `
      <div>
        <div v-for="col in columns" :key="col.field">
          <slot v-if="col.slots && col.slots.header" :name="col.slots.header" :column="col" />
        </div>
        <div v-for="row in data" :key="row.id">
          <template v-for="col in columns" :key="col.field">
            <slot
              v-if="col.slots && col.slots.default"
              :name="col.slots.default"
              :row="row"
              :column="col"
            />
          </template>
        </div>
      </div>
    `,
  },
  "el-icon": { template: '<i class="ic"><slot /></i>' },
  "el-checkbox": { template: "<span />" },
  "el-button": { template: "<button><slot /></button>" },
  "el-popover": { template: '<div><slot name="reference" /><slot /></div>' },
  BaseFieldCell: {
    props: ["field", "modelValue"],
    template: '<span class="cell-stub" />',
  },
};

function mountGrid() {
  return mount(BaseGrid, {
    props: { fields: FIELDS, rows: ROWS },
    global: {
      stubs: cellStubs,
      directives: { loading: {} },
    },
    attachTo: document.body,
  });
}

describe("网格键盘与鼠标效率", () => {
  it("Tab 跳到下一格，Shift+Tab 回到上一格", async () => {
    const wrapper = mountGrid();
    const grid = wrapper.find(".base-grid");
    const focusState = () =>
      (
        wrapper.vm.$ as unknown as {
          setupState: { focus: { rowId: string; fieldId: string } | null };
        }
      ).setupState.focus;
    // 点击第一格聚焦
    await wrapper.findAll(".base-grid__cell")[0].trigger("click");
    expect(focusState()).toEqual({ rowId: "r1", fieldId: "f1" });
    // Tab 走到第二格
    await grid.trigger("keydown", { key: "Tab" });
    expect(focusState()).toEqual({ rowId: "r1", fieldId: "f2" });
    // Shift+Tab 退回第一格
    await grid.trigger("keydown", { key: "Tab", shiftKey: true });
    expect(focusState()).toEqual({ rowId: "r1", fieldId: "f1" });
  });

  it("单元格右键弹出飞书同款菜单，菜单项齐备", async () => {
    const wrapper = mountGrid();
    const cell = wrapper.find(".base-grid__cell");
    expect(cell.exists()).toBe(true);
    await cell.trigger("contextmenu", { clientX: 200, clientY: 300 });
    const menu = document.querySelector(".be-ctxmenu__panel");
    expect(menu).toBeTruthy();
    const labels = Array.from(
      document.querySelectorAll(".be-ctxmenu__item"),
    ).map((n) => n.textContent?.trim());
    expect(labels).toContain("复制单元格");
    expect(labels).toContain("粘贴到此处");
    expect(labels).toContain("清空内容");
    expect(labels).toContain("按此列升序");
    expect(labels).toContain("筛选此列");
    expect(labels).toContain("隐藏此列");
    // 点击菜单外部应收起（飞书行为）
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(document.querySelector(".be-ctxmenu__panel")).toBeFalsy();
  });

  it("拖拽列头把手改变列宽并冒泡 column-width", async () => {
    const wrapper = mountGrid();
    const handle = wrapper.findAll(".base-grid__resize")[0];
    expect(handle.exists()).toBe(true);
    await handle.trigger("mousedown", { clientX: 100 });
    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 260 }));
    window.dispatchEvent(new MouseEvent("mouseup"));
    const emitted = wrapper.emitted("column-width");
    expect(emitted).toBeTruthy();
    const payload = emitted![0][0] as { fieldId: string; width: number };
    expect(payload.fieldId).toBe("f1");
    // 默认首列 200px，拖 +160 → 360，且落在 [80, 600] 区间
    expect(payload.width).toBe(360);
  });
});

/** 批次 I：列顺序拖拽 / 表头右键菜单 / 双击列宽自适应。 */
describe("网格列顺序与表头菜单", () => {
  it("按 fieldOrder 排序列（个人视图级列顺序）", () => {
    const wrapper = mount(BaseGrid, {
      props: { fields: FIELDS, rows: ROWS, fieldOrder: ["f2", "f1"] },
      global: { stubs: cellStubs, directives: { loading: {} } },
    });
    const titles = wrapper
      .findAll(".base-grid__head-title")
      .map((n) => n.text());
    expect(titles).toEqual(["预算", "负责人"]);
  });

  it("表头右键弹出列操作菜单（飞书同款）", async () => {
    const wrapper = mount(BaseGrid, {
      props: { fields: FIELDS, rows: ROWS },
      global: { stubs: cellStubs, directives: { loading: {} } },
      attachTo: document.body,
    });
    await wrapper.findAll(".base-grid__head")[0].trigger("contextmenu");
    await wrapper.vm.$nextTick();
    const labels = Array.from(
      document.querySelectorAll(".be-ctxmenu__item"),
    ).map((n) => n.textContent?.trim());
    expect(labels).toContain("按此列升序");
    expect(labels).toContain("筛选此列");
    expect(labels).toContain("自动适应列宽");
    expect(labels).toContain("编辑字段");
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(document.querySelector(".be-ctxmenu__panel")).toBeFalsy();
  });

  it("双击列宽把手按内容自动适应宽度", async () => {
    const wrapper = mount(BaseGrid, {
      props: { fields: FIELDS, rows: ROWS },
      global: { stubs: cellStubs, directives: { loading: {} } },
    });
    await wrapper.findAll(".base-grid__resize")[0].trigger("dblclick");
    const emitted = wrapper.emitted("column-width");
    expect(emitted).toBeTruthy();
    const payload = emitted![0][0] as { fieldId: string; width: number };
    expect(payload.fieldId).toBe("f1");
    expect(payload.width).toBeGreaterThanOrEqual(80);
    expect(payload.width).toBeLessThanOrEqual(600);
  });
});
