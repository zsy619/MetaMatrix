# JSONB 真源 + 抽取层（检索 / 对比 / AI）

## 原则

- **不按画布类型建业务表**。18 种画布统一落在 `canvas_documents.current_data`（JSONB）。
- JSONB 是**唯一真源**；检索与 AI 使用旁路抽取层，保存时同步重写。
- 抽取层通用：递归 walker 收集常见文本键（`text` / `title` / `prompt` / `label` / `name` / `content` / `description` / `items[].text`），跳过 `dataUrl`、base64、超长 URL。

## 表

| 对象 | 作用 |
| --- | --- |
| `canvas_documents.content_text` | 从 `current_data` 抽出的纯文本，保存时同步 |
| `canvas_documents.content_tsv` | `to_tsvector('simple', content_text)` GENERATED；中文靠 simple + `ILIKE` 兜底 / `pg_trgm` |
| `canvas_content_blocks` | 按 panel/path 切块，便于按面板检索与塞进 prompt |
| `canvas_revisions.content_hash` | snapshot 的 sha256（canonical JSON），供快速判断是否变化 |

## API

- `GET /documents/search` — 当前用户文档检索
- `GET /documents/:id/revisions/:rid/diff?against=` — 文本行 diff + RFC6902 jsonPatch
- `GET /documents/:id/ai-context` — 稳定结构导出（summary / panels / plainText / attachmentsMeta）
- `GET /documents/ai-corpus` — 多文档精简打包（RAG 原型）

## 前端最小入口

- 引导页：登录后「搜索我的画布」
- 画布顶栏 / 页面设置：复制 AI 上下文、与上一版对比

迁移文档：`pros/api/migrations/002_search_ai.sql`。
