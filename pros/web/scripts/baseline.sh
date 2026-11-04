#!/usr/bin/env bash
# 本地「可验证环境」基线：按固定顺序跑单元测试 → 类型检查 → 生产构建。
# 三步都必须成功（任一步失败即以非 0 退出），用于「改完能不能声称已验证」。
#
#   cd pros/web && bash scripts/baseline.sh
#
# 不含需要后端/PostgreSQL 的 smoke-flow：那个脚本请单独用
#   SMOKE_API=http://127.0.0.1:3000 node scripts/smoke-flow.mjs
# 跑（需要 pros/api + PostgreSQL 已启动）。
set -euo pipefail

cd "$(dirname "$0")/.."

echo "== 1/3 vitest run =="
npx vitest run

echo "== 2/3 vue-tsc -b =="
npx vue-tsc -b --pretty false

echo "== 3/3 vite build =="
npx vite build

echo "baseline ok: vitest + vue-tsc + vite build"
