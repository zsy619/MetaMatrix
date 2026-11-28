#!/usr/bin/env bash
# 元矩阵 MetaMatrix — 发布包启动脚本（macOS / Linux）
#
# 用法：在 output/ 目录下执行
#   bash run.sh
#
# 流程：
#   1. 读取 output/.env（可选）作为环境变量来源；缺省时提示从 .env.example 复制
#   2. 按当前系统/架构选择 output/api/<os>-<arch>/ 下的后端二进制
#   3. 启动 API（默认 127.0.0.1:3000）
#   4. 用 Caddy 在 8080 端口提供前端静态资源，并把 /api/ 反代到本地 API
#
# 退出时会自动结束它启动的 API 进程；不会修改或删除任何用户数据。

set -euo pipefail

cd "$(dirname "$0")"

WEB_PORT="${WEB_PORT:-8080}"
API_PORT="${PORT:-3000}"
API_HOST="127.0.0.1"

die() { printf '\033[1;31m[run] 错误：\033[0m %s\n' "$*" >&2; exit 1; }
log() { printf '\033[1;34m[run]\033[0m %s\n' "$*"; }

# ---------- 1. 环境变量（output/.env） ----------
if [ -f ".env" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ''|'#'*) continue ;;
    esac
    key="${line%%=*}"
    value="${line#*=}"
    # 去掉可能的 export 前缀与首尾空白
    key="${key#export }"
    key="$(printf '%s' "$key" | tr -d ' \t')"
    case "$key" in
      ''|*[!A-Za-z0-9_]*) continue ;;
    esac
    value="$(printf '%s' "$value" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")"
    export "$key=$value"
  done < .env
  log "已加载 ./.env"
else
  log "未找到 ./.env —— 若首次启动，请执行：cp .env.example .env 并按需修改（尤其 DATABASE_URL 与 JWT_SECRET）"
fi

# ---------- 2. 合并 CORS_ORIGINS ----------
cors_merge() {
  local current="$1" add="$2" out=""
  for item in ${current//,/ }; do
    [ -z "$item" ] && continue
    if [[ "$out" == *"$item"* ]]; then continue; fi
    out="${out:+$out,}$item"
  done
  for item in ${add//,/ }; do
    [ -z "$item" ] && continue
    if [[ "$out" != *"$item"* ]]; then out="${out:+$out,}$item"; fi
  done
  printf '%s' "$out"
}
CORS_ORIGINS="$(cors_merge "${CORS_ORIGINS:-}" "http://localhost:${WEB_PORT},http://127.0.0.1:${WEB_PORT}")"
export CORS_ORIGINS
export PORT="$API_PORT"

# ---------- 3. 选择后端二进制 ----------
os="$(uname -s)"
case "$os" in
  Darwin) os_key="darwin" ;;
  Linux)  os_key="linux" ;;
  *) die "不支持的操作系统：$os（本脚本支持 macOS 与 Linux，Windows 请用 run.bat）" ;;
esac
arch="$(uname -m)"
case "$arch" in
  arm64|aarch64) arch_key="arm64" ;;
  x86_64|amd64)  arch_key="amd64" ;;
  *) die "不支持的 CPU 架构：$arch（本发布包仅提供 64 位版本）" ;;
esac
BIN_DIR="api/${os_key}-${arch_key}"
API_BIN="${BIN_DIR}/metamatrix-api"
[ -x "$API_BIN" ] || die "未找到可执行文件 $API_BIN。当前包内可用的后端二进制：
$(ls -1 api 2>/dev/null || true)"

# ---------- 4. 检查 Caddy ----------
command -v caddy >/dev/null 2>&1 || die "未找到 caddy 命令，无法提供前端静态服务与 /api 反代。
安装提示：
  macOS : brew install caddy
  Debian/Ubuntu : sudo apt install caddy（或从 https://caddyserver.com/download 下载）
  其余平台：从 https://caddyserver.com/download 下载对应安装包并加入 PATH
安装后重新执行 bash run.sh。"

[ -f "web/index.html" ] || die "未找到 web/index.html，前端产物不完整，请重新运行 bash scripts/build-release.sh。"

# ---------- 5. 启动 API ----------
API_PID=""
cleanup() {
  if [ -n "$API_PID" ] && kill -0 "$API_PID" 2>/dev/null; then
    log "停止 API 进程（pid $API_PID）…"
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

log "启动 API：$API_BIN（监听 ${API_HOST}:${API_PORT}）"
"$API_BIN" &
API_PID=$!

log "等待 API 就绪…"
ready=0
for _ in $(seq 1 60); do
  if ! kill -0 "$API_PID" 2>/dev/null; then
    die "API 进程已退出，请检查上方的错误日志（常见原因：.env 中 DATABASE_URL 不可用）。"
  fi
  if command -v curl >/dev/null 2>&1; then
    if curl -fsS "http://${API_HOST}:${API_PORT}/health" >/dev/null 2>&1; then ready=1; break; fi
  else
    sleep 1
    if kill -0 "$API_PID" 2>/dev/null; then ready=1; break; fi
  fi
  sleep 1
done
if [ "$ready" = "1" ]; then
  log "API 已就绪。"
else
  log "未在超时内确认 /health，仍将启动 Caddy（请留意 API 日志）。"
fi

# ---------- 6. 启动 Caddy ----------
log "启动 Caddy：访问 http://localhost:${WEB_PORT}（/api 反代到 ${API_HOST}:${API_PORT}）"
exec caddy run --config ./Caddyfile --adapter caddyfile
