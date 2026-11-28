#!/usr/bin/env bash
# 一键启动前后端：转发到 pros/dev.sh（数据库 → API → 前端，Ctrl+C 一起停）。
# 用法：./dev.sh            启动
#       ./dev.sh restart    重启（先停掉本项目占 3000/5173 的进程再拉起）
set -euo pipefail
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/pros/dev.sh" "$@"
