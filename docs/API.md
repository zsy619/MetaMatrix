# MetaMatrix API 清单

服务为 Hertz。除 `/health` 和 `/metrics` 外，文档接口都要求 `Authorization: Bearer <token>`。错误体为 `{ "error", "code", "requestId" }`。列表接口用 `X-Total-Count`、`X-Has-More`、`X-Limit`、`X-Offset`。没有按画布类型分表。

## 运维

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 数据库可连时 `status=ok`，否则 503 `degraded` |
| GET | `/metrics` | Prometheus 文本 |

## 认证

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/auth/register` | `{ email, password, displayName }` |
| POST | `/auth/login` | 同注册字段中的邮箱和密码。超限返回 429 和 `Retry-After` |
| GET | `/auth/me` | 当前用户 |
| POST | `/auth/refresh` | 换新 token |
| POST | `/auth/password` | `{ currentPassword, newPassword }` |

## 文档

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/documents` | 新建。正文在 `currentData` |
| GET | `/documents` | 本人列表。`templateId`、`archived=1`、`limit`、`offset`。`Cache-Control: private, no-store` |
| POST | `/documents/batch` | `{ action: archive\|restore, ids }` |
| GET | `/documents/search` | `q`、`templateId`、`limit`。命中块带 `panelId`，摘要用 `«»` 标出关键词 |
| GET | `/documents/stats` | 只统计当前用户未归档画布。`Cache-Control: private, max-age=20` |
| GET | `/documents/backup` | 本人未归档画布 JSON 包，最多 200 份。`private, no-store` |
| POST | `/documents/backup` | 把备份导入为新画布，单次最多 50 份，不覆盖原件 |
| GET | `/documents/ai-corpus` | 本人语料摘要 |
| GET | `/documents/:id` | 单份画布 |
| GET | `/documents/:id/export` | `format=json` 或 `md` |
| PUT | `/documents/:id` | 保存。`expectedHeadRevisionId` 不一致时 409，响应带云端最新正文 |
| PATCH | `/documents/:id/title` | `{ title }`，只改标题 |
| DELETE | `/documents/:id` | 软删除（归档） |
| GET | `/documents/:id/ai-context` | 面板文本上下文 |
| POST | `/documents/:id/revisions` | 手动存版 |
| GET | `/documents/:id/revisions` | 最近版本 |
| GET | `/documents/:id/revisions/:rid/materialize` | 还原该版本正文 |
| GET | `/documents/:id/revisions/:rid/diff` | 与当前或 `against` 对比 |
| POST | `/documents/:id/restore` | `{ revisionId, expectedHeadRevisionId }` |

## 查询索引

- `idx_docs_owner_updated`：`(owner_user_id, updated_at DESC)`
- `idx_docs_owner_active_updated`：同一列，`WHERE deleted_at IS NULL`，给在用列表和统计
- `idx_docs_owner_archived`：`WHERE deleted_at IS NOT NULL`，给归档列表
- `idx_revisions_doc_created`：`(document_id, created_at DESC)`，给版本历史
- `idx_docs_content_tsv`、`idx_docs_content_trgm`：全文
- `idx_blocks_document_panel`：检索跳转到块

启动时 `ensureQueryIndexes` 会补这些索引。手写 SQL 在 `pros/api/migrations/003_query_indexes.sql`。
