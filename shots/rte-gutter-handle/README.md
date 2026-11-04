# 块手柄留白截图目录

本目录存放「块手柄落在正文左侧留白（gutter）里」的验收截图。

本轮（串行重开）禁止起 dev server / 装 chromium / 跑 e2e，因此**截图尚未产出**，
由 CI 或有浏览器的环境执行下面的脚本生成：

```bash
cd pros/web
# 需要本地 vite dev：pnpm dev（或 npx vite --host 127.0.0.1）
node scripts/rte-gutter-handle-e2e.mjs
```

脚本会在 1440×900 与 1280×800 两个视口下悬停段落，断言并截图：

- `rte-gutter-handle-1440x900.png`
- `rte-gutter-handle-1280x800.png`

断言项：手柄（含容器与按钮）右边界 ≤ 首字左边界、点击首字左边缘光标落在 offset 0、
块菜单可打开、拖拽排序仍可用。
