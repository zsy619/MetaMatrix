#!/usr/bin/env bash
# 元矩阵 MetaMatrix — 发布产物打包脚本
#
# 用法（在仓库根目录执行）：
#   bash scripts/build-release.sh
#
# 产物结构（全部位于仓库根的 output/）：
#   output/web/                 前端静态资源（vite 构建，VITE_API_BASE=/api）
#   output/api/<os>-<arch>/     后端二进制（darwin/linux/windows，均 64 位）
#   output/run.sh output/run.bat  启动脚本
#   output/Caddyfile            Caddy 配置（相对路径，可直接在 output/ 下 caddy run）
#
# 注意：本脚本只清理并重建 output/ 目录，不会触碰仓库其他目录（含 pros/api/data）。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/output"
WEB_DIR="$ROOT/pros/web"
API_DIR="$ROOT/pros/api"
TPL_DIR="$ROOT/scripts/release"

log() { printf '\033[1;34m[build-release]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[build-release] 错误：\033[0m %s\n' "$*" >&2; exit 1; }

# ---------- 0. 环境检查 ----------
command -v go >/dev/null 2>&1 || die "未找到 go，请先安装 Go（>=1.24）。"
command -v node >/dev/null 2>&1 || die "未找到 node，请先安装 Node.js（>=22）。"
command -v npm  >/dev/null 2>&1 || die "未找到 npm，请先安装 npm。"
[ -f "$WEB_DIR/package.json" ] || die "缺少 $WEB_DIR/package.json"
[ -f "$API_DIR/go.mod" ] || die "缺少 $API_DIR/go.mod"

# ---------- 1. 清理旧产物 ----------
case "$OUT" in
  */output) : ;;
  *) die "拒绝清理非预期路径：$OUT" ;;
esac
[ "$OUT" = "$ROOT/output" ] || die "output 目录不在仓库根内：$OUT"
rm -rf "$OUT"
mkdir -p "$OUT/api"

# ---------- 2. 前端构建 ----------
log "构建前端（pros/web）…"
cd "$WEB_DIR"
if [ ! -d node_modules ]; then
  log "安装前端依赖（npm ci）…"
  npm ci --no-audit --no-fund
fi
if [ "${SKIP_TYPECHECK:-0}" = "1" ]; then
  # 应急开关：仓库现存的历史类型错误会让 vue-tsc 失败，此时仅执行 vite build。
  # 正常打包请不要设置该变量。
  log "SKIP_TYPECHECK=1 —— 跳过 vue-tsc 类型检查，仅执行 vite build。"
  VITE_API_BASE=/api npx vite build
else
  VITE_API_BASE=/api npm run build
fi
[ -f "$WEB_DIR/dist/index.html" ] || die "前端构建产物缺失：$WEB_DIR/dist/index.html"
mkdir -p "$OUT/web"
cp -R "$WEB_DIR/dist/." "$OUT/web/"
log "前端产物已复制到 output/web/"

# ---------- 3. 后端交叉编译 ----------
# 目标：<os>-<arch> 目录，文件名统一 metamatrix-api（windows 带 .exe）
TARGETS="darwin/amd64 darwin/arm64 linux/amd64 linux/arm64 windows/amd64"
cd "$API_DIR"
for t in $TARGETS; do
  GOOS="${t%/*}"; GOARCH="${t#*/}"
  name="$GOOS-$GOARCH"
  case "$GOARCH" in
    amd64|arm64) : ;;
    *) die "只支持 64 位架构，收到：$GOARCH" ;;
  esac
  bin="metamatrix-api"
  [ "$GOOS" = "windows" ] && bin="metamatrix-api.exe"
  mkdir -p "$OUT/api/$name"
  log "编译后端 $name …"
  CGO_ENABLED=0 GOOS="$GOOS" GOARCH="$GOARCH" \
    go build -trimpath -ldflags "-s -w" -o "$OUT/api/$name/$bin" ./cmd/server
  [ -f "$OUT/api/$name/$bin" ] || die "编译产物缺失：$OUT/api/$name/$bin"
done

# ---------- 4. 启动脚本与 Caddy 配置 ----------
log "复制启动脚本与 Caddy 配置…"
cp "$TPL_DIR/run.sh"    "$OUT/run.sh"
cp "$TPL_DIR/run.bat"  "$OUT/run.bat"
cp "$TPL_DIR/Caddyfile" "$OUT/Caddyfile"
chmod +x "$OUT/run.sh"
# 附一份无密钥的环境变量模板，方便用户复制成 output/.env
[ -f "$API_DIR/.env.example" ] && cp "$API_DIR/.env.example" "$OUT/.env.example"

log "完成。产物目录：$OUT"
find "$OUT" -maxdepth 2 -mindepth 1 | sort | sed 's|^|  |'
