# 跨文档同步块：刷新与失效态

- **日期**：2026-11-04
- **范围**：`pros/web/src/extensions/syncBlock.ts`、`pros/web/src/utils/rteSyncBlock.ts`、`pros/web/src/api/documents.ts`、`pros/web/src/components/rte/composables/useCrossDoc.ts`
- **对应缺口**：`rte-deep-optimize-gap-2026-11-03.md` 的 P1-1「跨文档同步块：刷新与失效态」

## 做了什么

同步块（`syncBlock` 节点）此前只有「插入时抓一次快照」的静态展示：源文档改了不会更新，源被删或没权限时块里还是旧快照甚至空白，用户没有任何提示和补救入口。本轮补上：

1. **手动刷新**：块右上角有「刷新」按钮，点一下重新抓来源正文并覆盖快照，同时刷新「同步于 …」时间。
2. **加载态**：刷新过程中块显示「正在刷新同步内容…」，并临时隐藏操作按钮，避免重复点击。
3. **失效态**：来源被删除（404）、没有权限（403）、网络失败 / 服务异常（其它错误）时进入失效态：
   - 块内明确写出失效原因（不再静默空白、不再抛未捕获错误）；
   - 旧快照仍保留在块里并置灰，方便用户判断内容；
   - 提供「重试」「解除同步」「移除」三个可操作入口。
4. **解除同步 / 移除**：「解除同步」把同步块换成普通段落并保留快照文字；「移除」直接删掉这个块。两者都走 ProseMirror 事务，可撤销。

## 状态机

状态存在节点属性上，导出 / 打印 / 重新打开文档都会带着：

| 属性 | 取值 | 含义 |
| --- | --- | --- |
| `data-sync-status` | `synced` | 已同步，快照有效 |
| | `loading` | 正在刷新 |
| | `missing` | 来源被删除或不存在（404） |
| | `forbidden` | 没有访问来源的权限（403） |
| | `error` | 网络失败 / 服务异常 / 其它错误 |
| `data-sync-error` | 文本 | 失效原因文案 |

旧文档没有 `data-sync-status` 时按 `synced` 处理，不会被误判成失效。

## 代码结构

- `src/utils/rteSyncBlock.ts`：纯逻辑。
  - `normalizeSyncBlockStatus`：状态归一化。
  - `syncBlockFailureState`：把接口错误映射成状态 + 中文原因（404 → 源删除，403 → 无权限，`TypeError` → 网络中断，5xx → 服务不可用）。
  - `syncBlockView`：状态 → 界面文案与可用操作。
  - `refreshSyncBlock`：刷新流程，fetcher 由调用方注入，成功返回新快照与同步时间，失败返回失效态与原因。
  - `renderSyncBlockInto` / `buildSyncBlockElement`：构建界面 DOM（正常 / 加载中 / 失效三态）。
- `src/extensions/syncBlock.ts`：`syncBlock` 节点新增 `status`、`errorMessage` 属性；用 ProseMirror 节点视图（`addNodeView`）承载按钮交互，静态 `renderHTML` 同步输出状态类名与失效提示，保证导出 / 打印一致。
- `src/api/documents.ts`：`fetchDocumentTextSnapshot(id, panelId?)` 抓来源正文快照（走 `GET /documents/:id/ai-context`，指定面板时取该面板，否则取第一个有正文的面板，正文截断 4000 字）。
- `src/components/rte/composables/useCrossDoc.ts`：插入同步块时写入 `status: 'synced'`，并复用同一个快照抓取函数。

## 测试

- `src/utils/rteSyncBlock.test.ts`（13 例）：状态归一化、错误映射（404 / 403 / 网络 / 5xx）、刷新成功与失败、正常 / 加载中 / 源删除 / 无权限 / 网络失败五种状态的渲染与按钮回调。
- `src/extensions/syncBlock.view.test.ts`（6 例）：在真实 TipTap 编辑器里跑节点视图——刷新成功更新快照、刷新中显示加载态、404 / 403 / 网络失败进入失效态并可重试、解除同步把块换成普通段落。

命令（`pros/web`）：

```bash
npx vitest run                     # 全量单测
npx vitest run src/utils/rteSyncBlock.test.ts src/extensions/syncBlock.view.test.ts
npx vue-tsc -b                     # 类型检查
npx vite build                     # 构建
```

## 未验证 / 已知边界

- 真实后端联调未跑：仓库的 e2e 脚本需要 PostgreSQL + 登录态，本轮环境没有起后端，`pros/web/scripts/rte-baseline.mjs` 等未执行。失效态的 404 / 403 由单测按接口状态码模拟。
- 后端 `GET /documents/:id` 走的是 owner 校验，非属主拿到的是 404 而不是 403，所以「无权限」在真实链路上更常表现为「来源文档已删除」；前端两种状态都已实现并可区分。
- 同步块仍不引用来源的具体块级锚点（`data-sync-block` 只是占位属性），块级锚点定位属于后续轮次。
- 没有后台定时同步 / 推送，刷新仍然是用户手动触发。
