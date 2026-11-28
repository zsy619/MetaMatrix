import { describe, expect, it } from "vitest"
import {
  applyCommand,
  formatDate,
  matchCommands,
  parseSlashQuery,
  selectedText,
} from "./slashCommands"

describe("单元格斜杠命令", () => {
  it("按关键词过滤命令（中英文都能搜）", () => {
    expect(matchCommands("date").map((c) => c.key)).toContain("today")
    expect(matchCommands("日期").map((c) => c.key)).toContain("today")
    expect(matchCommands("link").map((c) => c.key)).toContain("link")
    expect(matchCommands("")).toHaveLength(8)
  })

  it("只认行首的斜杠", () => {
    expect(parseSlashQuery("/date")).toEqual({ query: "date", start: 0 })
    expect(parseSlashQuery("  /da")).toEqual({ query: "da", start: 2 })
    expect(parseSlashQuery("1/2 是分数")).toBeNull()
    expect(parseSlashQuery("hello")).toBeNull()
  })

  it("插入日期 / 时间", () => {
    const now = new Date(2026, 10, 28, 9, 5, 3)
    expect(formatDate(now)).toBe("2026-11-28")
    const cmd = matchCommands("today")[0]
    const out = applyCommand(cmd, { text: "", selectionStart: 0, selectionEnd: 0, now })
    expect(out.text).toBe("2026-11-28")
    expect(out.selectionStart).toBe(out.text.length)
  })

  it("有选区时只改选区，其余文本不动", () => {
    const cmd = matchCommands("upper")[0]
    const out = applyCommand(cmd, {
      text: "hello world",
      selectionStart: 0,
      selectionEnd: 5,
    })
    expect(out.text).toBe("HELLO world")
    expect(out.selectionStart).toBe(5)
  })

  it("清空与链接", () => {
    const clear = matchCommands("clear")[0]
    expect(applyCommand(clear, { text: "abc", selectionStart: 0, selectionEnd: 3 }).text).toBe("")
    const link = matchCommands("link")[0]
    expect(
      applyCommand(link, { text: "官网", selectionStart: 0, selectionEnd: 2 }).text,
    ).toBe("[官网](https://)")
  })

  it("取选中的文本", () => {
    expect(
      selectedText({ text: "abcdef", selectionStart: 1, selectionEnd: 3 }),
    ).toBe("bc")
    expect(
      selectedText({ text: "abcdef", selectionStart: 2, selectionEnd: 2 }),
    ).toBe("")
  })
})
