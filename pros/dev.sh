#!/usr/bin/env bash
# ============================================================
# 元矩阵 MetaMatrix — 开发环境一键启动（后端 API + 前端 Web）
#
# 设计目标（第一性原理）：
#   开发者在本地唯一关心的是「改完代码立刻能看见效果」。
#   因此这个脚本只承担三件事，且顺序严格遵循依赖关系：
#     1) 数据库   —— API 启动即连库并 AutoMigrate，库不通则进程会直接退出
#     2) 后端 API —— 前端依赖它提供 /api 数据
#     3) 前端 Web —— 最后启动，Vite 把 /api 代理到后端
#   构建/交叉编译属于 pros/build.sh 的职责，这里不重复。
#
# 用法：
#   ./dev.sh            # 一键启动（自动确保数据库、API、Web）
#   ./dev.sh restart    # 一键重启：先停掉本项目占着端口的进程，再重新启动
#   ./dev.sh -h         # 查看帮助
#
# 退出方式：
#   Ctrl+C —— 同时停止本次脚本拉起的 API 与 Web（复用到的已有进程不会被杀）
#
# 说明：
#   - 端口均来自配置而非硬编码：API 端口读 api/.env 的 PORT，
#     前端端口取 vite.config.ts 中 server.port 的默认值 5173。
#   - 若端口已被占用，先确认占用者属于本项目、且该服务确实健康，才复用；
#     否则直接报错退出，避免出现「脚本说已启动、实际没人服务」的空跑状态。
#   - restart 会先结束「命令行里含本项目路径」的监听进程，
#     不会误杀其它程序；只有端口确认释放后才启动新实例，
#     否则旧实例收尾过程中会残留半套服务。
#   - API 编译到 api/bin/ 后直接运行二进制，而不是 go run：
#     go run 会额外产生一个编译子进程，Ctrl+C 时容易留下孤儿进程占住端口。
# ============================================================

# -e 命令失败即退出；-u 未定义变量报错；-o pipefail 管道任一环失败即失败。
# 三者共同保证「启动失败不会被静默忽略」。
set -euo pipefail

# 基于脚本自身位置解析绝对路径，使脚本可从任意工作目录调用。
PROS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$PROS_DIR/api"
WEB_DIR="$PROS_DIR/web"
ENV_FILE="$API_DIR/.env"

# API 编译产物与日志。bin/ 和 logs/ 均已被 .gitignore 忽略，不会污染仓库。
API_BIN="$API_DIR/bin/metamatrix-api"
API_LOG="$API_DIR/logs/dev-api.log"
WEB_LOG="$WEB_DIR/logs/dev-web.log"

# 前端端口：与 web/vite.config.ts 的 server.port 保持一致。
WEB_PORT=5173

# 运行时状态：记录本次脚本拉起的进程，cleanup 时只结束自己拉起的那些。
API_PID=""
WEB_PID=""
API_TAIL_PID=""
WEB_TAIL_PID=""

# 正在停止标记。
# 为什么需要它：收到 Ctrl+C 后 cleanup 会杀掉子进程，随后 shell 从 sleep 返回并
# 继续执行守护循环；若不置位，循环会把「我们刚杀掉的进程」误判成「进程崩溃」。
STOPPING=0

# 端口复用的记录：被复用的外部实例不属于本脚本，退出时不能杀，但要告知用户。
API_REUSED=0
WEB_REUSED=0

# ---------- 日志输出 ----------
info() { printf '\033[36m[INFO]\033[0m %s\n' "$*"; }
ok()   { printf '\033[32m[ OK ]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[WARN]\033[0m %s\n' "$*"; }
die()  { printf '\033[31m[FAIL]\033[0m %s\n' "$*" >&2; exit 1; }

# ---------- 基础探测 ----------

# 端口连通性探测。
# 为什么用 /dev/tcp 而不是 lsof/nc：
#   /dev/tcp 是 bash 内建能力，macOS 与 Linux 都有，不依赖外部工具是否安装。
# 放在子 shell 里执行：连接用的 fd 3 随着子 shell 退出自动关闭，不泄漏。
port_open() {
    local host="$1"
    local port="$2"
    ( exec 3<>"/dev/tcp/${host}/${port}" ) >/dev/null 2>&1
}

# 轮询等待端口就绪，超时返回非 0。
# 之所以要「等」而不是「起完就算」：
#   进程拉起 ≠ 服务可用（go 服务要先连库再 AutoMigrate，Vite 要先预构建依赖），
#   提前打印「启动成功」会误导开发者。
wait_port() {
    local host="$1" port="$2" timeout="$3" label="$4"
    local i=0
    while [ "$i" -lt "$timeout" ]; do
        if port_open "$host" "$port"; then
            return 0
        fi
        sleep 1
        i=$((i + 1))
    done
    return 1
}

# 从 .env 读取某个键的值。
# 只匹配行首 KEY=（跳过被注释的示例），并去掉可能存在的引号与 Windows 换行符。
env_val() {
    local key="$1" file="$2" line
    line="$(grep -E "^${key}=" "$file" 2>/dev/null | head -n 1 || true)"
    [ -n "$line" ] || return 1
    printf '%s' "${line#*=}" | tr -d '\r' | sed "s/^[\"']//; s/[\"']$//"
}

# 解析 PostgreSQL 连接串中的主机与端口：
#   postgresql://user:pass@host:5433/db  →  "host 5433"
# 未写端口时按 PostgreSQL 默认 5432 处理。
parse_db_host_port() {
    local url="$1" hostport host port
    hostport="${url#*@}"        # 去掉 user:pass@ 前缀（无凭据时原样保留）
    hostport="${hostport%%/*}"  # 去掉 /dbname 及之后的内容
    host="${hostport%%:*}"
    if [ "$hostport" = "$host" ]; then
        port=5432
    else
        port="${hostport##*:}"
    fi
    printf '%s %s\n' "$host" "$port"
}

# ---------- 停止已有服务（restart 专用） ----------

# 列出监听指定端口的进程 PID。
# 用 lsof 而不是 /dev/tcp：这里需要的是「是谁占着端口」，/dev/tcp 只能回答「有没有人占」。
listeners_on() {
    lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | sort -u
}

# 取进程的工作目录。命令行可能是相对路径（在 api 目录手敲 ./bin/metamatrix-api），
# 此时只有工作目录能说明它属于哪个项目。
# LC_ALL=en_US.UTF-8 必须带上：locale 不是 UTF-8 时 lsof 会把非 ASCII 路径转义成
# \xNN 形式（launchd 默认没有 locale），转义后的路径和 $PROS_DIR 对不上，
# 本项目的进程会被误判成「别人的进程」。
process_cwd() {
    LC_ALL=en_US.UTF-8 lsof -a -p "$1" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1
}

# 判断某个进程是否属于本项目。
# 两条判据任一成立即可：
#   1) 命令行里含本项目绝对路径（由本脚本或带绝对路径的命令启动）
#   2) 工作目录位于本项目内（用户手动 cd 到 api/web 再跑起来的情况）
# 这样既不会漏掉手动启动的实例，也不会误杀用户其它程序占用的 3000/5173。
pid_belongs_to_project() {
    local pid="$1" cmd cwd
    cmd="$(ps -o command= -p "$pid" 2>/dev/null || true)"
    case "$cmd" in
        *"$PROS_DIR"*) return 0 ;;
    esac

    cwd="$(process_cwd "$pid")"
    case "$cwd" in
        "$PROS_DIR"|"$PROS_DIR"/*) return 0 ;;
    esac
    return 1
}

# 端口被占时，判断能否复用占用者。
# 只有两条都满足才复用：占用者属于本项目、且该端口上确实是健康的服务。
# 否则一律报错退出——否则会出现「脚本说已启动、实际没人服务」的空跑状态。
assert_reusable() {
    local port="$1" label="$2" probe="$3"
    local pid cmd
    for pid in $(listeners_on "$port"); do
        if ! pid_belongs_to_project "$pid"; then
            cmd="$(ps -o command= -p "$pid" 2>/dev/null | head -c 80 || true)"
            die "${label} 端口 ${port} 被非本项目进程占用（PID ${pid}）：${cmd}；请先停掉它再启动"
        fi
    done
    if ! curl -fsS -o /dev/null "$probe"; then
        die "${label} 端口 ${port} 被占用，但该实例不健康（探测 ${probe} 失败）；请先停掉它再启动"
    fi
}

# 停止本项目占用端口的进程，并等待端口真正释放。
# 为什么要「等端口释放」而不是 kill 完就直接启动：
#   旧实例的父脚本在收到子进程退出后还要执行自己的清理（停另一侧、回收日志跟随），
#   这期间端口可能仍处于监听状态；若新实例此时探测到「端口被占」就会走复用分支，
#   结果等旧实例收尾完成，新启动的这半套服务就没了。
stop_services() {
    local api_port="$1"

    if ! command -v lsof >/dev/null 2>&1; then
        warn "未找到 lsof，无法定位占用端口的进程，请手动停止后重试"
        return 0
    fi

    local port pid stopped=0
    for port in "$api_port" "$WEB_PORT"; do
        for pid in $(listeners_on "$port"); do
            if ! pid_belongs_to_project "$pid"; then
                warn "端口 ${port} 被其它程序占用（PID ${pid}），跳过，不会结束它"
                continue
            fi
            info "停止端口 ${port} 上的进程（PID ${pid}）"
            kill -TERM "$pid" 2>/dev/null || true
            stopped=1
        done
    done

    if [ "$stopped" = "0" ]; then
        return 0
    fi

    # 轮询等待两个端口都释放，给进程留出释放连接/清理缓存的时间。
    local i=0
    while [ "$i" -lt 10 ]; do
        if ! port_open 127.0.0.1 "$api_port" && ! port_open 127.0.0.1 "$WEB_PORT"; then
            ok "原有服务已停止"
            return 0
        fi
        sleep 1
        i=$((i + 1))
    done

    # 优雅退出超时：只对本项目进程做 KILL 兜底，其它程序一律不碰。
    for port in "$api_port" "$WEB_PORT"; do
        for pid in $(listeners_on "$port"); do
            if pid_belongs_to_project "$pid"; then
                warn "端口 ${port} 的进程未响应 TERM，强制结束（PID ${pid}）"
                kill -KILL "$pid" 2>/dev/null || true
            fi
        done
    done
    sleep 1
}

# ---------- 数据库 ----------

# 确保 PostgreSQL 可用。
# 数据库是 API 的硬依赖：main.go 里 db.Connect 失败会 log.Fatalf 直接退出，
# 所以必须在启动 API 之前把库准备好，而不是等 API 报错再让开发者去猜。
ensure_database() {
    local host="$1" port="$2"

    if port_open "$host" "$port"; then
        ok "PostgreSQL 已就绪（${host}:${port}）"
        return 0
    fi

    # 只有「本机数据库」才可能由本地的 docker compose 拉起。
    if [ "$host" != "localhost" ] && [ "$host" != "127.0.0.1" ]; then
        die "数据库 ${host}:${port} 不可达，请先启动远端数据库后重试"
    fi

    info "PostgreSQL 未监听 ${host}:${port}，尝试用 docker compose 启动"
    command -v docker >/dev/null 2>&1 || die "未找到 docker，请先启动 PostgreSQL 或安装 Docker"
    docker compose version >/dev/null 2>&1 || die "docker compose 不可用，请先启动 PostgreSQL"

    # api/docker-compose.yml 只定义 postgres 服务，宿主机端口映射为 5433。
    ( cd "$API_DIR" && docker compose up -d postgres )

    # 容器启动到真正接受连接之间有间隔，健康检查最长等 90 秒。
    if wait_port "$host" "$port" 90 "PostgreSQL"; then
        ok "PostgreSQL 启动完成（${host}:${port}）"
    else
        die "PostgreSQL 启动超时，请执行 docker compose -f api/docker-compose.yml logs postgres 排查"
    fi
}

# ---------- 后端 API ----------

start_api() {
    local port="$1"

    if port_open 127.0.0.1 "$port"; then
        # 端口被占：先确认占用者属于本项目、且服务确实健康，再决定复用。
        assert_reusable "$port" "API" "http://127.0.0.1:${port}/health"
        warn "API 端口 ${port} 已被本项目的健康实例占用，复用（本次不再启动）"
        API_REUSED=1
        return 0
    fi

    info "编译 API（./cmd/server → bin/metamatrix-api）"
    # 在 api 模块根目录编译，输出到 bin/。
    ( cd "$API_DIR" && go build -o "$API_BIN" ./cmd/server )

    mkdir -p "$(dirname "$API_LOG")"
    # 每次启动清空日志，避免历史内容干扰本次排查。
    : > "$API_LOG"

    # 子 shell 内先 cd 再 exec：
    #   - cd 是为了让 API 的 godotenv 读到 api/.env（它读「当前工作目录」）
    #   - exec 用二进制替换子 shell 进程，使 $! 就是二进制自身 PID，
    #     这样 Ctrl+C 时能精确结束它，不会像 go run 那样留下编译子进程
    ( cd "$API_DIR" && exec "$API_BIN" >>"$API_LOG" 2>&1 ) &
    API_PID=$!

    # 日志旁路：进程输出进文件，tail 跟随文件并加 [api] 前缀送到终端，
    # 避免前后端日志交错时无法分辨来源。
    ( tail -n +1 -f "$API_LOG" 2>/dev/null | sed 's/^/[api] /' ) &
    API_TAIL_PID=$!

    # 等待健康检查通过（含数据库探测）。首次编译已完成，这里主要等连库与迁移。
    local i=0
    while [ "$i" -lt 60 ]; do
        # 进程提前退出说明配置有误（如 DATABASE_URL 错、端口冲突），立刻失败并给出日志线索。
        if ! kill -0 "$API_PID" 2>/dev/null; then
            echo "----- API 日志 -----" >&2
            tail -n 40 "$API_LOG" >&2 || true
            die "API 启动失败，完整日志：$API_LOG"
        fi
        if curl -fsS "http://127.0.0.1:${port}/health" >/dev/null 2>&1; then
            ok "API 已就绪 → http://localhost:${port}"
            return 0
        fi
        sleep 1
        i=$((i + 1))
    done
    die "API 健康检查超时，请查看日志：$API_LOG"
}

# ---------- 前端 Web ----------

# 安装前端依赖：按锁文件选择包管理器，保证依赖版本可复现。
# 优先 pnpm —— 现有 node_modules 就是 pnpm 布局，用 npm ci 会破坏该布局。
install_web_deps() {
    info "安装前端依赖"
    if [ -f "$WEB_DIR/pnpm-lock.yaml" ] && command -v pnpm >/dev/null 2>&1; then
        ( cd "$WEB_DIR" && pnpm install --frozen-lockfile )
    elif [ -f "$WEB_DIR/yarn.lock" ] && command -v yarn >/dev/null 2>&1; then
        ( cd "$WEB_DIR" && yarn install --frozen-lockfile )
    elif [ -f "$WEB_DIR/package-lock.json" ]; then
        ( cd "$WEB_DIR" && npm ci )
    else
        ( cd "$WEB_DIR" && npm install )
    fi
}

start_web() {
    if port_open 127.0.0.1 "$WEB_PORT"; then
        assert_reusable "$WEB_PORT" "前端" "http://127.0.0.1:${WEB_PORT}/"
        warn "前端端口 ${WEB_PORT} 已被本项目的健康实例占用，复用（本次不再启动）"
        WEB_REUSED=1
        return 0
    fi

    [ -d "$WEB_DIR/node_modules" ] || install_web_deps
    # 直接调用本地已安装的 vite：PID 即 node 进程，便于精确停止；
    # 同时避免 npx 在缺依赖时回落到联网下载。
    [ -x "$WEB_DIR/node_modules/.bin/vite" ] || die "未找到 vite，请先在 web 目录执行 pnpm install"

    mkdir -p "$(dirname "$WEB_LOG")"
    : > "$WEB_LOG"

    # --strictPort：端口被占时直接失败，而不是静默漂移到 5174
    # （漂移会让脚本里的地址、后端的 CORS 配置全部对不上）。
    ( cd "$WEB_DIR" && exec ./node_modules/.bin/vite --port "$WEB_PORT" --strictPort >>"$WEB_LOG" 2>&1 ) &
    WEB_PID=$!

    ( tail -n +1 -f "$WEB_LOG" 2>/dev/null | sed 's/^/[web] /' ) &
    WEB_TAIL_PID=$!

    if wait_port 127.0.0.1 "$WEB_PORT" 60 "Vite"; then
        ok "前端已就绪 → http://localhost:${WEB_PORT}"
    else
        echo "----- Web 日志 -----" >&2
        tail -n 40 "$WEB_LOG" >&2 || true
        die "前端启动超时，完整日志：$WEB_LOG"
    fi
}

# ---------- 退出清理 ----------

# 只结束本次脚本拉起的进程；复用到的外部实例保持不动。
cleanup() {
    # 置位停止标记：让守护循环知道「进程消失」是清理造成的，而不是异常退出。
    STOPPING=1

    # 先解除 trap，避免清理过程中再次触发（INT 之后还会走 EXIT）。
    trap - EXIT INT TERM

    # 本次什么都没拉起（例如只看 -h 帮助、或参数非法直接退出）时静默收尾，
    # 不打印"开发服务已停止"，以免让人以为刚才有服务被关掉。
    if [ -z "$API_PID" ] && [ -z "$WEB_PID" ] && [ -z "$API_TAIL_PID" ] && [ -z "$WEB_TAIL_PID" ] \
        && [ "$API_REUSED" = "0" ] && [ "$WEB_REUSED" = "0" ]; then
        return 0
    fi

    # 先停日志跟随，否则关闭阶段终端仍会被日志刷屏。
    # 关键点：kill 之后立刻 wait 回收。
    #   后台作业退出时 bash 会打印 "Terminated: 15 ( tail ... )" 作业通知，
    #   如果等到几秒后才 wait，通知就已经先打到终端上了，看起来很像是报错。
    if [ -n "$API_TAIL_PID" ]; then
        kill "$API_TAIL_PID" 2>/dev/null || true
        wait "$API_TAIL_PID" 2>/dev/null || true
    fi
    if [ -n "$WEB_TAIL_PID" ]; then
        kill "$WEB_TAIL_PID" 2>/dev/null || true
        wait "$WEB_TAIL_PID" 2>/dev/null || true
    fi

    # 先 TERM 给进程释放连接/清理缓存的机会，超时再 KILL 兜底。
    if [ -n "$WEB_PID" ] && kill -0 "$WEB_PID" 2>/dev/null; then
        kill -TERM "$WEB_PID" 2>/dev/null || true
    fi
    if [ -n "$API_PID" ] && kill -0 "$API_PID" 2>/dev/null; then
        kill -TERM "$API_PID" 2>/dev/null || true
    fi

    local i
    for i in 1 2 3 4 5; do
        local alive=0
        if [ -n "$WEB_PID" ] && kill -0 "$WEB_PID" 2>/dev/null; then alive=1; fi
        if [ -n "$API_PID" ] && kill -0 "$API_PID" 2>/dev/null; then alive=1; fi
        [ "$alive" = "1" ] || break
        sleep 1
    done

    if [ -n "$WEB_PID" ] && kill -0 "$WEB_PID" 2>/dev/null; then
        kill -KILL "$WEB_PID" 2>/dev/null || true
    fi
    if [ -n "$API_PID" ] && kill -0 "$API_PID" 2>/dev/null; then
        kill -KILL "$API_PID" 2>/dev/null || true
    fi

    # 回收后台作业。不回收的话 bash 会在脚本退出时打印
    # "Terminated: 15 ( tail ... )" 这类作业通知，干扰用户对结果的判断。
    local pid
    for pid in "$API_TAIL_PID" "$WEB_TAIL_PID" "$WEB_PID" "$API_PID"; do
        if [ -n "$pid" ]; then wait "$pid" 2>/dev/null || true; fi
    done

    echo
    info "开发服务已停止"
    # 复用的实例不是本脚本拉起的，明确告知「它还活着」，避免用户以为没停干净。
    if [ "$API_REUSED" = "1" ] || [ "$WEB_REUSED" = "1" ]; then
        warn "端口被复用的服务仍在运行；如需停止请结束占用该端口的进程"
    fi
}

# ---------- 帮助 ----------
# 直接从文件头部的注释块生成帮助，避免「注释改了、帮助里的行号没改」导致内容缺失。
# 规则：从第 2 行开始输出以 # 开头的行，遇到第一个非注释行（set ...）即停止。
usage() {
    awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "${BASH_SOURCE[0]}"
}

# ---------- 入口 ----------
main() {
    # RESTART=1 时先停掉已有实例再启动；默认只启动。
    local RESTART=0
    case "${1:-}" in
        -h|--help|help) usage; exit 0 ;;
        "") ;;
        restart|--restart) RESTART=1 ;;
        *) die "未知参数：${1}（可用：restart|-h）" ;;
    esac

    # ---- 前置检查 ----
    command -v go >/dev/null 2>&1 || die "未找到 go，请先安装 Go 工具链"
    command -v node >/dev/null 2>&1 || die "未找到 node，请先安装 Node.js"
    command -v curl >/dev/null 2>&1 || die "未找到 curl，无法做健康检查"
    [ -f "$ENV_FILE" ] || die "缺少 $ENV_FILE，请先执行：cp api/.env.example api/.env 并按需填写 DATABASE_URL"

    # ---- 读取配置（端口与数据库地址都以配置文件为唯一事实来源）----
    local db_url api_port
    db_url="$(env_val DATABASE_URL "$ENV_FILE" || true)"
    [ -n "$db_url" ] || die "$ENV_FILE 中缺少 DATABASE_URL"

    api_port="$(env_val PORT "$ENV_FILE" || true)"
    api_port="${api_port:-3000}"
    if [ "$api_port" != "3000" ]; then
        warn "API 端口为 ${api_port}，但 web/vite.config.ts 的 /api 代理写死到 3000，代理会失效"
    fi

    local db_host db_port
    read -r db_host db_port <<EOF
$(parse_db_host_port "$db_url")
EOF

    # ---- 依次启动 ----
    # restart 模式先清掉本项目占着端口的进程，并等端口真正释放后再开始启动，
    # 否则会命中「端口被占 → 复用旧实例」分支，等于没有重启。
    if [ "$RESTART" = "1" ]; then
        info "重启模式：先停止现有服务"
        stop_services "$api_port"
    fi

    ensure_database "$db_host" "$db_port"

    # 开发时前端通过 Vite 代理访问后端（同源），不依赖 CORS；
    # 这里显式提示一下代理是否指向正确端口。
    start_api "$api_port"
    start_web

    # ---- 汇总 ----
    echo
    ok "开发环境已启动"
    printf '   前端：http://localhost:%s\n' "$WEB_PORT"
    printf '   后端：http://localhost:%s/health\n' "$api_port"
    printf '   日志：%s\n' "$API_LOG"
    printf '         %s\n' "$WEB_LOG"
    echo
    info "按 Ctrl+C 停止本次启动的服务"

    # ---- 守护：任一进程意外退出则一起收尾，避免只留半套服务 ----
    # 不用 wait -n（macOS 自带 bash 3.2 不支持），用轮询兼容旧 bash。
    while :; do
        # 清理流程已经接手时直接退出，否则会把「刚被我们杀掉」误报成「进程崩溃」。
        [ "$STOPPING" = "1" ] && break
        # 复用的实例不在我们手里：它一挂就退出，让外层守护（launchd）重新拉起整套，
        # 否则会一直空转在「端口有人占着、其实没人服务」的状态里。
        if [ "$API_REUSED" = "1" ] && ! port_open 127.0.0.1 "$api_port"; then
            warn "被复用的 API 实例已退出，退出以便重新启动"
            break
        fi
        if [ "$WEB_REUSED" = "1" ] && ! port_open 127.0.0.1 "$WEB_PORT"; then
            warn "被复用的 Web 实例已退出，退出以便重新启动"
            break
        fi
        if [ -n "$API_PID" ] && ! kill -0 "$API_PID" 2>/dev/null; then
            warn "API 进程已退出，日志：$API_LOG"
            break
        fi
        if [ -n "$WEB_PID" ] && ! kill -0 "$WEB_PID" 2>/dev/null; then
            warn "Web 进程已退出，日志：$WEB_LOG"
            break
        fi
        sleep 1
    done
}

# Ctrl+C / 终止信号与正常退出都走同一套清理逻辑。
trap cleanup EXIT INT TERM

main "$@"
