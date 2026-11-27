# 全局规则：数据库表命名（对所有智能体强制）

> **本文件是入口，完整规范见 [`../db-table-naming.md`](../db-table-naming.md)。**
> 适用对象：人类贡献者 + 任何 AI 智能体（Claude Code / Codex / Grok / DeepSeek Hermes / 其它自动化代理），
> 任何分支、任何环境。

## 速查

- 表名 = **域前缀 + 实体名（复数）**，域前缀**只有 4 个**：`core_` / `kb_` / `base_` / `media_`。
- `core_` 平台（账号/项目/审计/备份/密码重置/页面引用）· `kb_` 知识库（目录树/文档/版本/属性/评论/协同/检索/模板）·
  `base_` 多维表格 · `media_` 素材。**不得引入第 5 套前缀。**
- 实体名一律复数；确实不可数（`node_data`、`presence`）须在 `model.TableRegistry` 标注 `MassNoun: true`。
- 模型**必须显式写 `TableName()`**，不许依赖 GORM 推导。
- 改表结构：`internal/db/db.go` 加 `ensure*Schema` + 同步 SQLite 影子模型；
  改名迁移必须排在 `gdb.AutoMigrate` **之前**。

## 单一事实源

| 用途 | 位置 |
| --- | --- |
| 表清单（机器可读） | `docs/db-tables.json` |
| 登记表（代码） | `pros/api/internal/model/table_registry.go` |
| 守卫测试 | `pros/api/internal/model/table_naming_test.go`、`pros/api/internal/db/table_naming_test.go` |
| 生成器 | `cd pros/api && go run ./cmd/dbtables > ../../docs/db-tables.json` |
| 自检命令 | `cd pros/api && go test ./internal/model/... ./internal/db/...` |

## 新增表动作清单

1. 查 `docs/db-tables.json`，确认没有同义表；
2. 定义结构体 + 显式 `TableName()`；
3. `TableRegistry` 登记一行；
4. `internal/db/db.go` 的 `AutoMigrate` 注册；
5. 改已有表结构则补 `ensure*Schema` + 影子模型；
6. 重新生成 `docs/db-tables.json`；
7. 跑守卫测试（不合规会红，**不要绕过或注释守卫**）。
