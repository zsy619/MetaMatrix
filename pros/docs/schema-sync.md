# 数据结构同步（本地 → 远程，只增不删）

## 一键执行

```bash
cd pros
./sync-schema.sh              # 执行同步
./sync-schema.sh --dry-run    # 只看差异，不写远程
```

脚本：`pros/scripts/sync_schema.py`

## 规则

| 行为 | 说明 |
| --- | --- |
| 只增不删 | 远程缺什么补什么：表 / 列 / 索引 / 序列 / 枚举 / 约束 / 注释 / 扩展 |
| 不动数据 | 不复制行数据，也不修改远程已有行；序列当前值（setval）同样不动 |
| 不改写 | 不生成 `DROP` / `DELETE` / `TRUNCATE` / `ALTER COLUMN TYPE` / `RENAME` / `GRANT` / `REVOKE` |
| 默认值例外 | `ALTER COLUMN ... SET DEFAULT` 允许（只影响以后写入的行，不触碰已有行） |
| 逐条执行 | 每条语句单独执行，单条失败只报告、不中断整体同步 |

## 连接串与密码

| 变量 | 默认值 |
| --- | --- |
| `LOCAL_DATABASE_URL` | 读 `pros/api/.env` 的 `DATABASE_URL`（`localhost:5433/metamatrix`） |
| `REMOTE_DATABASE_URL` | `postgresql://metamatrix@101.132.237.173:5432/metamatrix` |
| `REMOTE_DB_PASSWORD` | 未设置时依次回退到 `PGPASSWORD`、本地连接串中的密码 |

## 与代码侧迁移的关系

后端启动时 `internal/db/db.go` 的 `AutoMigrate` + `ensure*Schema` 会在**每个环境**自动补列 / 补索引。
本脚本解决的是「远程没有跑新二进制」或「补丁只写在本地库」的场景：把本地结构差异**增量**推到远程，
不依赖远程重启服务。改表结构的规范仍然是：在 `internal/db/db.go` 补 `ensure*Schema`，两边自动收敛。

## 复核

同步结束后脚本会做一次**对象级**复核（表 / 列 / 默认值 / 索引 / 约束 / 序列 / 扩展），
输出「远程缺少 xxx / 远程多出 xxx」，差异为 0 即表示结构已收敛。
