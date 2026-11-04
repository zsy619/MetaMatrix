#!/usr/bin/env bash
# 一键复现「本机起 PostgreSQL + Go 后端 + 前端，跑依赖后端的 e2e 基线」。
#
#   cd pros/web && bash scripts/e2e-backend-up.sh
#
# 做的事：
#   1. 找一个能用的 PostgreSQL（docker compose 起，或复用本机已在跑的实例）；
#   2. 编译并启动 Go API（pros/api），等 /health 变 ok；
#   3. 播种夹具：demo@metamatrix.local 账号 + 固定 id 的 Y 模型样例文档；
#   4. 启动前端 dev server（vite）；
#   5. 跑依赖后端的 e2e：smoke-routes / smoke-flow / rte-baseline /
#      rte-echarts-e2e / rte-chart-panel-e2e。
#
# 用法：
#   bash scripts/e2e-backend-up.sh              # 起服务 → 播种 → 跑 e2e
#   bash scripts/e2e-backend-up.sh --up-only    # 只起服务，不跑 e2e
#   bash scripts/e2e-backend-up.sh --keep       # 结束后保留服务（方便手工排查）
#
# 环境变量：
#   DATABASE_URL  指定就复用它；不指定则按 docker → 5434/5433/5432 依次探测
#   API_PORT      默认 3000
#   WEB_PORT      默认 5173
#   E2E_OUT       截图/日志目录，默认 /tmp/metamatrix-e2e
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
API_DIR="$(cd "$WEB_DIR/../api" && pwd)"
REPO_DIR="$(cd "$WEB_DIR/../.." && pwd)"

API_PORT="${API_PORT:-3000}"
WEB_PORT="${WEB_PORT:-5173}"
OUT_DIR="${E2E_OUT:-/tmp/metamatrix-e2e}"
UP_ONLY=0
KEEP=0
for arg in "$@"; do
  case "$arg" in
    --up-only) UP_ONLY=1 ;;
    --keep) KEEP=1 ;;
    -h|--help) sed -n '2,30p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

mkdir -p "$OUT_DIR"
API_LOG="$OUT_DIR/api.log"
WEB_LOG="$OUT_DIR/web.log"
API_PID=""
WEB_PID=""

log() { printf '\n== %s\n' "$*"; }

cleanup() {
  local code=$?
  if [ "$KEEP" = "1" ]; then
    echo "== --keep：保留服务（api pid=$API_PID web pid=$WEB_PID）"
    return
  fi
  [ -n "$API_PID" ] && kill "$API_PID" 2>/dev/null || true
  [ -n "$WEB_PID" ] && kill "$WEB_PID" 2>/dev/null || true
  exit $code
}
trap cleanup EXIT

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "缺少命令：$1" >&2; exit 1; }
}

need node
need npm
need psql
need go

# ---------------------------------------------------------------- PostgreSQL
pick_database_url() {
  if [ -n "${DATABASE_URL:-}" ]; then
    echo "$DATABASE_URL"
    return
  fi
  # 1) docker compose（仓库根目录的 compose 把 Postgres 映射到 5433）
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    log "docker compose 起 Postgres（5433）"
    (cd "$REPO_DIR" && docker compose up -d postgres) || true
    sleep 3
    echo "postgresql://metamatrix:metamatrix@127.0.0.1:5433/metamatrix"
    return
  fi
  # 2) 复用本机已在跑的实例（5434 / 5433 / 5432）
  local port
  for port in 5434 5433 5432; do
    if PGPASSWORD=metamatrix psql -h 127.0.0.1 -p "$port" -U metamatrix -d metamatrix -c 'select 1' >/dev/null 2>&1; then
      echo "postgresql://metamatrix:metamatrix@127.0.0.1:${port}/metamatrix"
      return
    fi
  done
  echo ""
}

log "找 PostgreSQL"
DATABASE_URL="$(pick_database_url)"
if [ -z "$DATABASE_URL" ]; then
  echo "找不到可用的 PostgreSQL：请先起一个（docker compose up -d postgres，或本地装 postgresql），" >&2
  echo "或者用 DATABASE_URL=postgresql://... 指定一个已存在的实例。" >&2
  exit 1
fi
export DATABASE_URL
echo "DATABASE_URL=$DATABASE_URL"

# 库不存在就建一个
if ! psql "$DATABASE_URL" -c 'select 1' >/dev/null 2>&1; then
  log "建库 metamatrix"
  createdb "$DATABASE_URL" || true
fi
psql "$DATABASE_URL" -c 'select 1' >/dev/null

# --------------------------------------------------------------------- API
log "编译 Go API"
(cd "$API_DIR" && go build -o "$OUT_DIR/mm-api" ./cmd/server)

log "启动 API（:${API_PORT}）"
PORT="$API_PORT" \
  JWT_SECRET="${JWT_SECRET:-local-e2e-jwt-secret-metamatrix}" \
  CAPTCHA_DEBUG=true \
  CORS_ORIGINS="http://127.0.0.1:${WEB_PORT},http://localhost:${WEB_PORT}" \
  "$OUT_DIR/mm-api" >"$API_LOG" 2>&1 &
API_PID=$!

for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${API_PORT}/health" >/dev/null 2>&1; then break; fi
  sleep 1
done
if ! curl -fsS "http://127.0.0.1:${API_PORT}/health"; then
  echo "API 没起来，日志：$API_LOG" >&2
  tail -20 "$API_LOG" >&2
  exit 1
fi
echo

# ------------------------------------------------------------------ 夹具
log "播种夹具（demo 账号 + 固定 id 的 Y 模型文档）"
(cd "$WEB_DIR" && API="http://127.0.0.1:${API_PORT}" node scripts/seed-e2e-fixtures.mjs)

# ----------------------------------------------------------------- 前端
if [ ! -d "$WEB_DIR/node_modules" ]; then
  log "安装前端依赖"
  (cd "$WEB_DIR" && npm install)
fi

log "启动前端 dev server（:${WEB_PORT}）"
(cd "$WEB_DIR" && exec npx vite --host 127.0.0.1 --port "$WEB_PORT" >"$WEB_LOG" 2>&1) &
WEB_PID=$!
for _ in $(seq 1 90); do
  if curl -fsS "http://127.0.0.1:${WEB_PORT}/login" >/dev/null 2>&1; then break; fi
  sleep 1
done
if ! curl -fsS "http://127.0.0.1:${WEB_PORT}/login" >/dev/null; then
  echo "前端没起来，日志：$WEB_LOG" >&2
  tail -20 "$WEB_LOG" >&2
  exit 1
fi
echo "前端就绪：http://127.0.0.1:${WEB_PORT}"

if [ "$UP_ONLY" = "1" ]; then
  log "只起服务，跳过 e2e（--up-only）"
  exit 0
fi

# ------------------------------------------------------------------- e2e
export RTE_WEB_URL="http://127.0.0.1:${WEB_PORT}"
export RTE_BASELINE_DIR="$OUT_DIR/shots"
export SMOKE_API="http://127.0.0.1:${API_PORT}"
mkdir -p "$RTE_BASELINE_DIR"

FAILED=0
run_e2e() {
  local name="$1"; shift
  log "e2e：$name"
  if (cd "$WEB_DIR" && "$@"); then
    echo "PASS $name"
  else
    echo "FAIL $name"
    FAILED=1
  fi
}

run_e2e "smoke-routes" node scripts/smoke-routes.mjs
run_e2e "smoke-flow" node scripts/smoke-flow.mjs
run_e2e "rte-baseline" node scripts/rte-baseline.mjs
run_e2e "rte-echarts-e2e" node scripts/rte-echarts-e2e.mjs
run_e2e "rte-chart-panel-e2e" node scripts/rte-chart-panel-e2e.mjs

if [ "$FAILED" != "0" ]; then
  echo
  echo "e2e 有失败项，日志与截图在 $OUT_DIR" >&2
  exit 1
fi

echo
echo "e2e 全部通过（截图在 $RTE_BASELINE_DIR）"
