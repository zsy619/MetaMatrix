# 数据库表命名规范（core / kb / base / media）

> 生效日期：2026-11-26
> 适用范围：`pros/api/internal/model/**`（`TableName()`）、`pros/api/migrations/**`、`pros/api/internal/db/**`

## 一、为什么要统一

2026-11-26 之前，全库 39 张表里同时存在 6 套前缀（`doc_` / `document_` / `canvas_` / `knowledge_` /
`media_` / `base_`）外加 6 张无前缀表（`users`、`projects`、`activity_logs`、`backup_imports`、
`password_reset_tokens`、`page_references`），单复数也不统一（`media_asset` 单数、`doc_properties` 复数）。

这些前缀不是设计出来的，是不同时间、不同作者随手起的：`document_save_operations` 建于 2026-11-20
（`7551d07`），`doc_*` 家族建于 2026-11-21（`7b0e140`，知识库 2.0），两者互不知情，
而它们指向的其实是同一张实体表 `canvas_documents`。命名漂移让「哪些表属于同一域」无法从表名判断，
排查问题时只能全库翻。

## 二、规则

1. **表名 = 域前缀 + 实体名**，实体名用复数（`core_users` 而非 `core_user`）。
2. **域前缀只有 4 个**，新增表必须归入其中之一，不得再引入第 5 套前缀。
3. **前缀表示「业务域」，不表示「实体类型」**。同一实体在不同域下不重复建表；
   跨域引用一律用 `*_id` 外键列，不靠表名前缀暗示归属。
4. 表名变更必须走 `internal/db/db.go` 的 `ensure*Schema` 迁移 + 同步 SQLite 影子模型，
   不允许只改 `TableName()`（否则 GORM 会新建空表，旧数据留在旧表里）。

## 三、四个域

### core —— 平台域

账号、项目、审计、备份、密码重置、页面引用等与业务内容无关的表。

`core_users`、`core_projects`、`core_activity_logs`、`core_backup_imports`、
`core_password_reset_tokens`、`core_page_references`、`core_user_notifications`

### kb —— 知识库域

目录树、文档真源、版本、页面属性、评论、协同增量、检索切片、模板、标签。

`kb_nodes`、`kb_node_data`、`kb_documents`、`kb_revisions`、`kb_content_blocks`、
`kb_doc_properties`、`kb_comments`、`kb_comment_reads`、`kb_crdt_updates`、
`kb_save_operations`、`kb_doc_versions`、`kb_shares`、`kb_members`、`kb_presence`、
`kb_chunks`、`kb_events`、`kb_views`、`kb_templates`、`kb_tags`、
`kb_doc_operations`、`kb_doc_audit_events`、`kb_doc_blocks`、`kb_doc_block_revisions`、`kb_doc_block_refs`

### base —— 多维表格域

Base Engine 自成一套引擎，表前缀保持 `base_` 不变，本次只把单数改成复数。

`base_apps`、`base_tables`、`base_fields`、`base_records`、`base_record_values`、
`base_record_links`、`base_field_formulas`、`base_formula_dependencies`、`base_views`、
`base_operation_logs`、`base_event_outboxes`

### media —— 素材域

`media_categories`、`media_assets`、`media_references`

## 四、完整改名对照

| 旧表名 | 新表名 | 域 |
| --- | --- | --- |
| `users` | `core_users` | core |
| `projects` | `core_projects` | core |
| `activity_logs` | `core_activity_logs` | core |
| `backup_imports` | `core_backup_imports` | core |
| `password_reset_tokens` | `core_password_reset_tokens` | core |
| `page_references` | `core_page_references` | core |
| `knowledge_nodes` | `kb_nodes` | kb |
| `knowledge_node_data` | `kb_node_data` | kb |
| `knowledge_shares` | `kb_shares` | kb |
| `knowledge_doc_versions` | `kb_doc_versions` | kb |
| `knowledge_members` | `kb_members` | kb |
| `knowledge_presence` | `kb_presence` | kb |
| `knowledge_chunks` | `kb_chunks` | kb |
| `knowledge_events` | `kb_events` | kb |
| `knowledge_views` | `kb_views` | kb |
| `knowledge_templates` | `kb_templates` | kb |
| `knowledge_tag_dict` | `kb_tags` | kb |
| `canvas_documents` | `kb_documents` | kb |
| `canvas_revisions` | `kb_revisions` | kb |
| `canvas_content_blocks` | `kb_content_blocks` | kb |
| `doc_properties` | `kb_doc_properties` | kb |
| `doc_comments` | `kb_comments` | kb |
| `doc_comment_reads` | `kb_comment_reads` | kb |
| `doc_crdt_updates` | `kb_crdt_updates` | kb |
| `document_save_operations` | `kb_save_operations` | kb |
| `doc_operation` | `kb_doc_operations` | kb |
| `doc_audit_events` | `kb_doc_audit_events` | kb |
| `doc_blocks` | `kb_doc_blocks` | kb |
| `doc_block_revisions` | `kb_doc_block_revisions` | kb |
| `doc_block_refs` | `kb_doc_block_refs` | kb |
| `user_notifications` | `core_user_notifications` | core |
| `base_app` | `base_apps` | base |
| `base_table` | `base_tables` | base |
| `base_field` | `base_fields` | base |
| `base_record` | `base_records` | base |
| `base_record_value` | `base_record_values` | base |
| `base_record_link` | `base_record_links` | base |
| `base_field_formula` | `base_field_formulas` | base |
| `base_formula_dependency` | `base_formula_dependencies` | base |
| `base_view` | `base_views` | base |
| `base_operation_log` | `base_operation_logs` | base |
| `base_event_outbox` | `base_event_outboxes` | base |
| `media_category` | `media_categories` | media |
| `media_asset` | `media_assets` | media |
| `media_reference` | `media_references` | media |

Go 结构体名**不变**（`CanvasDocument`、`DocProperty`、`MediaAsset` …），
只改 `TableName()`：结构体名是代码概念，表名是存储概念，两者不必同名。

## 五、落地方式

- 改名清单：`pros/api/internal/db/table_naming.go` 的 `tableRenames`。
- 启动时自动执行：`db.AutoMigrate()` 的**第一步**调用 `ensureTableNamingSchema`。
  必须排在 GORM AutoMigrate 之前——AutoMigrate 见到不存在的表会直接建空表，
  先建后改会让旧数据留在旧表里，看起来像数据丢了。
- 全过程在一个事务里：要么全改成功，要么全不改，服务不会带着半套表名启动。
- 新旧表同时存在（手工改过 / 上一步只改了一半）时只打告警，不动数据。
- 手工执行版本：`pros/api/migrations/012_table_naming.sql`（幂等）。

## 六、对智能体 / 自动化代理的强制要求

本节是本规范的**执行条款**：任何 AI 智能体（Claude Code、Codex、Grok、DeepSeek Hermes 及其它
自动化代理）与人类贡献者一律同等对待。没有"上下文没提到就可以自己起名"这回事。

### 6.1 开工前必须做的三件事

1. 读 `docs/db-tables.json`（机器可读清单）：确认要建的表**不存在同义表**。
   历史教训：库里曾同时存在 `doc_properties` / `document_save_operations` / `knowledge_nodes` /
   `canvas_documents` 四套指向同一实体的前缀，排查时只能全库翻。
2. 读 `pros/api/internal/model/table_registry.go`：确认域归属（core / kb / base / media）。
3. 判断这是**新表**还是**改已有表**：改表要走 `ensure*Schema` 补丁 + 影子模型同步，不能只改 `TableName()`。

### 6.2 落地动作（缺一不可）

| # | 动作 | 落点 |
| --- | --- | --- |
| 1 | 定义结构体，显式写 `TableName()` | `pros/api/internal/model/**` |
| 2 | 在登记表登记一行（name / domain / purpose / model） | `model/table_registry.go` → `TableRegistry` |
| 3 | 在自动迁移列表注册 | `internal/db/db.go` → `AutoMigrate` |
| 4 | 改已有表结构时补迁移 + 同步影子模型 | `internal/db/db.go` → `ensure*Schema`；各 `*_test.go` 的 `xxxSQLite` |
| 5 | 重新生成表清单 | `cd pros/api && go run ./cmd/dbtables > ../../docs/db-tables.json` |
| 6 | 跑守卫测试 | `cd pros/api && go test ./internal/model/... ./internal/db/...` |

### 6.3 机器守卫（CI 强制，不是建议）

守卫测试位于 `internal/model/table_naming_test.go` 与 `internal/db/table_naming_test.go`，
由 CI 的 `go test ./internal/...` 执行。以下情况**直接失败**：

- 表模型（带 `gorm` 主键的结构体）没有显式 `TableName()`；
- 表名域前缀不在白名单内（出现第 5 套前缀）；
- 表名实体名不是复数，且未在登记表标注 `MassNoun`；
- 表名未在 `TableRegistry` 登记，或登记表与模型不一致；
- `docs/db-tables.json` 与登记表不一致；
- 改名清单自身不自洽（目标名重复 / 不合规 / 未登记）；
- `migrations/*.sql` 里出现不合规的表名；
- 登记表里的表既没有 migration 建表、也没在 `AutoMigrate` 注册（新环境建不出来）。

**智能体不得绕过、注释或删改守卫测试**。规则若确需调整，改规则本体（登记表 + 文档 + 测试），
不要为了让自己那次改动过 CI 而放宽校验。

### 6.4 命名决策速查

| 你要建的东西 | 归属域 | 建议表名 |
| --- | --- | --- |
| 账号、登录态、会话 | core | `core_sessions` |
| 审计、埋点、操作留痕 | core | `core_xxx_logs` |
| 目录树节点 | kb | `kb_nodes` / `kb_node_xxx` |
| 文档正文与派生数据 | kb | `kb_documents` / `kb_xxx_blocks` |
| 评论、协作、presence | kb | `kb_comments` / `kb_xxx_presences` |
| 检索、向量、标签 | kb | `kb_chunks` / `kb_tags` |
| 多维表格的一切 | base | `base_xxx` |
| 素材库的一切 | media | `media_xxx` |

判断口诀：**与账号/项目/审计有关 → core；与知识库内容有关 → kb；与多维表格引擎有关 → base；
与文件素材有关 → media。**

## 七、新增表时怎么做

1. 在 `pros/api/internal/model/` 对应文件里定义结构体，显式写 `TableName()`，
   名字从上面四个域里挑（默认 `core_`，业务内容一律 `kb_`）。
2. 在 `internal/db/db.go` 的 `AutoMigrate` 列表里注册。
3. 需要改已有表结构时，在 `internal/db/db.go` 加 `ensure*Schema` 补丁函数；
   SQLite 影子模型（各 `*_test.go` 里的 `xxxSQLite`）必须同步增删字段，
   否则会报 `table X has no column named Y`。
4. 索引命名建议 `idx_<域>_<实体>_<列>`，唯一索引 `uniq_<域>_<实体>_<语义>`；
   现有旧索引名（如 `idx_docs_content_tsv`、`idx_dp_owner`）暂未重命名，
   后续新增索引按新规则走。

## 八、注意

- `pros/sync-schema.sh` 是「本地 → 远程只增不删」的同步工具，不做表改名；
  远程库改名靠服务端启动时的 `ensureTableNamingSchema`。
- 线上库改名期间如果服务同时在跑旧二进制，会出现「旧名表还在、新名表空着」的情况；
  部署顺序必须是：先替换二进制并重启，再看服务日志确认 39 条改名记录。
