# 元矩阵 MetaMatrix · pros

前后端可运行脚手架（MVP）。默认后端：**CloudWeGo Hertz + GORM + PostgreSQL**；前端 Vue3。

## 启动顺序

### 1) 数据库 + API

```bash
cd api
cp .env.example .env
docker compose up -d          # Postgres 宿主机 5433
go mod tidy
go run ./cmd/server           # http://localhost:3000
```

测试账号可自行注册，例如 `demo@metamatrix.local` / `demo123456`。

历史 NestJS+Prisma 后端已归档为 `api-nestjs-archive/`（仅参考，不再默认启动）。

### 2) Web

```bash
cd web
npm install
npm run dev                   # http://localhost:5173 （/api 代理到 :3000）
```

- Web: http://localhost:5173
- 登录: http://localhost:5173/login
- 注册: http://localhost:5173/register
- API: http://localhost:3000

健康检查是 `GET http://localhost:3000/health`（含数据库探测；失败为 503）。指标是 `GET http://localhost:3000/metrics`（Prometheus 文本，仅进程内计数）。生产配置和快捷键见 `docs/生产配置.md`。

产品文档在上级 `docs/`。
