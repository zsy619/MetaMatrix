// @vitest-environment happy-dom
/**
 * 列操作菜单（飞书多维表格同款）。
 *
 * 回归点：列头操作能力（排序 / 筛选 / 冻结 / 隐藏 / 列宽 / 编辑字段）
 * 之前只能通过「视图配置」弹窗走，位置太深；现在要能在列头直接触发，
 * 且每个动作都能正确冒泡到上层。
 */
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import BaseColumnMenu from "./BaseColumnMenu.vue";
import type { FieldMeta } from "../types";

const FIELD: FieldMeta = {
  id: "f1",
  name: "客户名称",
  type: "text",
  config: {},
  required: false,
  isPrimary: true,
  sortOrder: 0,
  version: 1,
};

const stubs = {
  "el-popover": {
    props: ["visible"],
    template: `
      <div>
        <slot name="reference" />
        <slot />
      </div>
    `,
  },
  "el-icon": { template: "<i><slot /></i>" },
  "el-input-number": { template: "<input />" },
};

function mountMenu(props: Record<string, unknown> = {}) {
  return mount(BaseColumnMenu, {
    props: { field: FIELD, ...props },
    global: { stubs },
  });
}

describe("列操作菜单", () => {
  it("提供飞书同款的一组列操作", () => {
    const wrapper = mountMenu();
    const labels = wrapper.findAll(".be-colmenu__item").map((el) => el.text());
    expect(labels.join("|")).toContain("升序排列");
    expect(labels.join("|")).toContain("降序排列");
    expect(labels.join("|")).toContain("筛选此列");
    expect(labels.join("|")).toContain("冻结到左侧");
    expect(labels.join("|")).toContain("隐藏此列");
    expect(labels.join("|")).toContain("编辑字段");
  });

  it("已排序的列多出「清除本列排序」", () => {
    const wrapper = mountMenu({ sortOrder: "asc" });
    const labels = wrapper.findAll(".be-colmenu__item").map((el) => el.text());
    expect(labels.join("|")).toContain("清除本列排序");
  });

  it("点击动作冒泡到上层并带上字段 ID", async () => {
    const wrapper = mountMenu();
    await wrapper
      .findAll(".be-colmenu__item")
      .find((el) => el.text().includes("升序排列"))!
      .trigger("click");
    expect(wrapper.emitted("sort")?.[0]).toEqual([
      { fieldId: "f1", order: "asc" },
    ]);

    await wrapper
      .findAll(".be-colmenu__item")
      .find((el) => el.text().includes("隐藏此列"))!
      .trigger("click");
    expect(wrapper.emitted("hide")?.[0]).toEqual([{ fieldId: "f1" }]);
  });

  it("已冻结的列显示「取消冻结此列」", () => {
    const wrapper = mountMenu({ frozen: true });
    const labels = wrapper.findAll(".be-colmenu__item").map((el) => el.text());
    expect(labels.join("|")).toContain("取消冻结此列");
  });
});
