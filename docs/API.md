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
| POST | `/auth/register` | `{ email, password, displayName, captchaId, captchaCode }` |
| POST | `/auth/login` | 同注册字段中的邮箱和密码。超限返回 429 和 `Retry-After` |
| GET | `/auth/captcha` | 取一张图形验证码 → `{ captchaId, image, expiresAt }` |
| GET | `/auth/me` | 当前用户 |
| POST | `/auth/refresh` | 换新 token |
| POST | `/auth/password` | `{ currentPassword, newPassword }` |
| POST | `/auth/password-reset/request` | `{ email }`，发送六位数字验证码。冷却期内 429 |
| POST | `/auth/password-reset/verify` | `{ email, code }` → `{ status: "verified", sessionToken }` |
| POST | `/auth/password-reset/confirm` | `{ sessionToken, newPassword }`，用令牌改密码 |

### 图形验证码

登录和注册都必须带 `captchaId` 与 `captchaCode`。先 `GET /auth/captcha` 取图，
`image` 是可直接放进 `<img src>` 的 PNG data URI（服务端用自带的 5x7 点阵字库渲染，
图里没有能直接读出的明文答案）。验证码由服务端生成并校验，
一次性使用，答案错误返回 400 `captcha_invalid`，缺失返回 400 `captcha_required`，
过期返回 400 `captcha_expired`。

有效期默认 5 分钟（`CAPTCHA_TTL`）。同一张验证码连续答错 5 次即作废。
同一来源 1 分钟内最多取 60 张，超了返回 429 `rate_limited`（带 `Retry-After`）。

### 找回密码（邮件验证码）

三步，验证码只负责"证明这个邮箱归你"，不直接授权改密码：

1. `POST /auth/password-reset/request` `{ email }` → `{ status, message, cooldownSeconds }`。
   服务端发一封含 **6 位数字**验证码的邮件，有效期 10 分钟。
   默认是「显式模式」：邮箱没注册直接返回 404 `email_not_registered`，页面提示
   "这个邮箱还没有注册"。把 `RESET_UNKNOWN_EMAIL_MODE` 设成 `uniform` 则无论
   邮箱是否注册都返回完全一致的响应（防止探测账号）。
   超出发送频率返回 429 `rate_limited`，带 `Retry-After` 与 `retryAfterSeconds`。
2. `POST /auth/password-reset/verify` `{ email, code }` → `{ status: "verified", sessionToken }`。
   这一步不改密码。验证码一次性，校验通过即作废，换取 256 位随机令牌（10 分钟内有效）。
3. `POST /auth/password-reset/confirm` `{ sessionToken, newPassword }`。
   令牌一次性，改密成功后立即失效。

拆成两步的原因：6 位数字只有 100 万种组合，不足以充当写操作的凭证；
而且新密码不合规时（太短、和旧密码相同）可以直接重填，不用重新收一封邮件。

错误码：`invalid_email`（400）、`reset_code_invalid` / `reset_code_expired` /
`reset_code_used` / `reset_code_not_found`（400）、`reset_session_invalid`（400）、
`weak_password`、`password_too_long`、`password_unchanged`（400）、
`email_not_registered`（404，显式模式下为默认）、`rate_limited`（429）、
`mail_unavailable`（503，邮件通道不可用）。

`reset_code_not_found` 表示这个邮箱名下压根没有待验证的验证码（没点过发送、已过期
或被新码顶掉），只在显式模式下出现；统一模式下它与"验证码不正确"返回同一个错误码。

发送频率限制（四个维度同时生效，超了都返回 429）：同一邮箱 60 秒冷却、同一邮箱
每小时 5 次、同一邮箱每天 10 次、同一 IP 每小时 20 次。验证码连续答错 5 次即作废。

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
| POST | `/documents/:id/clone` | 克隆画布。正文不变、新 id、新建一条 `canvas_documents` 行；标题默认加「（副本）」，可传 `{ title, notes }` 覆盖；同时写入一条 `label=clone` 的初始版本，源文档不被修改 |
| DELETE | `/documents/:id` | 软删除（归档） |
| GET | `/documents/:id/ai-context` | 面板文本上下文 |
| POST | `/documents/:id/revisions` | 手动存版 |
| GET | `/documents/:id/revisions` | 最近版本 |
| GET | `/documents/:id/revisions/:rid/materialize` | 还原该版本正文 |
| GET | `/documents/:id/revisions/:rid/diff` | 与当前或 `against` 对比 |
| POST | `/documents/:id/restore` | `{ revisionId, expectedHeadRevisionId }` |

## 项目

项目是画布的容器：一个项目下有多张画布。画布内容（节点、连线）仍然存在
`canvas_documents.current_data`（JSONB），项目本身只有一行元数据。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/projects` | 本人项目列表，按最近更新排序。每项带 `canvasCount` |
| POST | `/projects` | `{ name }` 新建项目 |
| GET | `/projects/:id` | 单个项目 |
| PUT | `/projects/:id` | `{ name }` 重命名 |
| DELETE | `/projects/:id` | 删除项目**及其下的画布**（硬删除） |
| GET | `/projects/:id/refs` | 项目内的画布引用图：`{ refs: { <画布 id>: [<被引用的画布 id>] } }`，用于拦截自引用与循环引用 |

`GET /documents` 支持 `projectId=<项目 id>` 只列出某个项目下的画布；
`POST /documents` 支持 `projectId` 把新画布放进项目。`projectId` 可空：
为空表示画布不属于任何项目（历史画布行为不变）。

## 通讯录

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/directory/users` | 真人 @ 用的通讯录。`q`（模糊匹配用户名 / 昵称 / 邮箱，大小写不敏感）、`limit`（默认 50，上限 200）、`offset`（默认 0）。响应体是数组，元素为 `{ id, name, email, role?, department?, avatarUrl? }`，不含密码哈希等敏感字段 |

`name` 取显示名，显示名为空时退回账号（邮箱）。`users` 表没有软删除与启用状态字段，
所以当前不做状态过滤。

## 查询索引

- `idx_docs_owner_updated`：`(owner_user_id, updated_at DESC)`
- `idx_docs_owner_active_updated`：同一列，`WHERE deleted_at IS NULL`，给在用列表和统计
- `idx_docs_owner_archived`：`WHERE deleted_at IS NOT NULL`，给归档列表
- `idx_revisions_doc_created`：`(document_id, created_at DESC)`，给版本历史
- `idx_docs_content_tsv`、`idx_docs_content_trgm`：全文
- `idx_blocks_document_panel`：检索跳转到块

启动时 `ensureQueryIndexes` 会补这些索引。手写 SQL 在 `pros/api/migrations/003_query_indexes.sql`。
