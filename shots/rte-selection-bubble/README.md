# 选区浮动工具条截图目录

本目录存放「多行选择 + 选区浮动工具条」的验收截图（1440×900）。

本轮（串行重开）明令禁止起 vite/dev server、禁止 Playwright/chromium、禁止 e2e，
因此**截图尚未产出**，由 CI 或有浏览器的环境执行下面的脚本生成：

```bash
cd pros/web
# 需要本地 vite dev：npx vite --host 127.0.0.1 --port 5175
RTE_WEB_URL=http://127.0.0.1:5175 \
RTE_BASELINE_DIR=../../shots/rte-selection-bubble \
node scripts/rte-selection-bubble-e2e.mjs
```

脚本（`pros/web/scripts/rte-selection-bubble-e2e.mjs`）在 1440×900 视口下断言并截图：

- `01-cross-paragraph-selection-bubble.png` —— 从第一段拖选到第二段：气泡工具条可见，
  且含「字体 / 字号 / 加粗 / 斜体 / 下划线 / 删除线 / 文字颜色 / 高亮颜色 / 清除格式 /
  插入链接 / 对齐」11 个按钮；
- `02-font-size-applied-to-both-paragraphs.png` —— 在气泡里改 20px 后：第一、二段字号
  都是 `20px`，未选中的第三段字号不变；
- `03-code-block-no-bubble.png` —— 代码块内不出现气泡；
- `04-chart-block-no-bubble.png` —— 图表块内不出现气泡；
- `05-bubble-flip-near-top.png` —— 选区贴近视口上边缘时，气泡自动翻转到选区下方。

断言逻辑的对应单测见 `pros/web/src/components/rte/RteSelectionBubble.test.ts`
（跨段落应用字号 / 字体 / 对齐，以及空选区、代码块、图表块、非编辑态的出现条件）。

预览页：`pros/web/selection-bubble-preview.html`（三段正文 + 代码块 + 图表块）。
