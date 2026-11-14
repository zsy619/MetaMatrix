@echo off
rem 元矩阵 MetaMatrix — 发布包启动脚本（Windows）
rem
rem 用法：在 output\ 目录下双击或执行
rem   run.bat
rem
rem 流程：
rem   1. 读取 output\.env（可选）
rem   2. 选择 output\api\windows-amd64\metamatrix-api.exe
rem   3. 启动 API（默认 127.0.0.1:3000）
rem   4. 用 Caddy 在 8080 端口提供前端静态资源，并把 /api/ 反代到本地 API

setlocal EnableDelayedExpansion
cd /d "%~dp0"

set "WEB_PORT=8080"
set "API_PORT=%PORT%"
if "%API_PORT%"=="" set "API_PORT=3000"

rem ---------- 1. 环境变量（output\.env） ----------
if exist ".env" (
  for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
    set "KEY=%%A"
    set "VAL=%%B"
    if /i not "!KEY!"=="" (
      if not "!KEY:~0,1!"=="#" (
        if not "!VAL!"=="" set "!KEY!=!VAL!"
      )
    )
  )
  echo [run] 已加载 .\.env
) else (
  echo [run] 未找到 .\.env —— 若首次启动，请执行：copy .env.example .env 并按需修改（尤其 DATABASE_URL 与 JWT_SECRET）
)

rem ---------- 2. 合并 CORS_ORIGINS ----------
set "CORS_ORIGINS=%CORS_ORIGINS:,= %"
set "CORS_ORIGINS=%CORS_ORIGINS:,=%;"
if not defined CORS_ORIGINS set "CORS_ORIGINS="

echo %CORS_ORIGINS% | find /i "http://localhost:%WEB_PORT%" >nul || set "CORS_ORIGINS=!CORS_ORIGINS!http://localhost:%WEB_PORT%,"
echo %CORS_ORIGINS% | find /i "http://127.0.0.1:%WEB_PORT%" >nul || set "CORS_ORIGINS=!CORS_ORIGINS!http://127.0.0.1:%WEB_PORT%,"
if "!CORS_ORIGINS:~-1!"=="," set "CORS_ORIGINS=!CORS_ORIGINS:~0,-1!"
set "CORS_ORIGINS=%CORS_ORIGINS:,= %"
set "CORS_ORIGINS=%CORS_ORIGINS:,=%;"
set "PORT=%API_PORT%"

rem ---------- 3. 选择后端二进制 ----------
set "ARCH=amd64"
if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "ARCH=arm64"
set "API_BIN=api\windows-%ARCH%\metamatrix-api.exe"
if not exist "%API_BIN%" (
  echo [run] 错误：未找到 %API_BIN%
  echo [run] 当前包内可用的后端二进制：
  dir /b api 2>nul
  exit /b 1
)

rem ---------- 4. 检查 Caddy ----------
where caddy >nul 2>nul
if errorlevel 1 (
  echo [run] 错误：未找到 caddy 命令，无法提供前端静态服务与 /api 反代。
  echo [run] 安装提示：从 https://caddyserver.com/download 下载 Windows 版 caddy.exe，
  echo [run] 放入任意目录并把该目录加入 PATH，然后重新执行 run.bat。
  exit /b 1
)

if not exist "web\index.html" (
  echo [run] 错误：未找到 web\index.html，前端产物不完整，请重新运行 scripts\build-release.sh。
  exit /b 1
)

rem ---------- 5. 启动 API ----------
echo [run] 启动 API：%API_BIN%（监听 127.0.0.1:%API_PORT%）
start "metamatrix-api" /b "%API_BIN%"

rem 等待几秒让 API 完成数据库连接与迁移
timeout /t 5 /nobreak >nul

rem ---------- 6. 启动 Caddy ----------
echo [run] 启动 Caddy：访问 http://localhost:%WEB_PORT%（/api 反代到 127.0.0.1:%API_PORT%）
caddy run --config Caddyfile --adapter caddyfile

endlocal
