#!/usr/bin/env bash
# ============================================================
# 元矩阵 MetaMatrix — 一键同步数据结构（本地 PostgreSQL -> 远程 PostgreSQL）
#
# 规则：只增不删。
#   - 远程缺什么就补什么：表 / 列 / 索引 / 序列 / 枚举 / 约束 / 注释 / 扩展
#   - 远程已有的数据、已有的对象一律不动（不 DELETE、不 TRUNCATE、不改列类型）
#
# 用法：
#   ./sync-schema.sh              # 执行同步（只增不删）
#   ./sync-schema.sh --dry-run    # 只看差异，不写远程
#
# 可覆盖的环境变量：
#   LOCAL_DATABASE_URL   本地连接串（默认读 api/.env 的 DATABASE_URL）
#   REMOTE_DATABASE_URL  远程连接串（默认 postgresql://metamatrix@101.132.237.173:5432/metamatrix）
#   REMOTE_DB_PASSWORD   远程密码（默认复用本地连接串里的密码）
# ============================================================
set -euo pipefail

PROS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$PROS_DIR/scripts/sync_schema.py" "$@"
