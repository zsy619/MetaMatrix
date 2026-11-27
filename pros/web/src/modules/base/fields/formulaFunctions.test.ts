import { describe, expect, it } from "vitest";
import {
  ALL_FORMULA_FUNCTIONS,
  FORMULA_FUNCTION_MAP,
} from "./formulaFunctions";

describe("公式函数目录", () => {
  it("与后端注册表数量一致（44 个）", () => {
    expect(ALL_FORMULA_FUNCTIONS.length).toBe(44);
  });

  it("函数名不重复", () => {
    const names = ALL_FORMULA_FUNCTIONS.map((item) => item.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("第一批核心函数都在目录里", () => {
    for (const name of [
      "SUM",
      "AVERAGE",
      "ROUND",
      "IF",
      "TODAY",
      "CONCATENATE",
    ]) {
      expect(FORMULA_FUNCTION_MAP.has(name)).toBe(true);
    }
  });

  it("新增的第二批函数都在目录里", () => {
    for (const name of [
      "NOW",
      "YEAR",
      "MONTH",
      "DAY",
      "HOUR",
      "MINUTE",
      "SECOND",
      "WEEKDAY",
      "UPPER",
      "LOWER",
      "PROPER",
      "TRIM",
      "LEN",
      "LEFT",
      "RIGHT",
      "MID",
      "FIND",
      "SUBSTITUTE",
      "CONCAT",
      "FLOOR",
      "CEILING",
      "POWER",
      "MOD",
      "SQRT",
      "COALESCE",
      "IFERROR",
      "ISBLANK",
      "ISNUMBER",
      "ISTEXT",
      "SWITCH",
    ]) {
      expect(FORMULA_FUNCTION_MAP.has(name)).toBe(true);
    }
  });
});
