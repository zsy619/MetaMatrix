# 元矩阵 MetaMatrix

> 元数据驱动的通用矩阵 / 象限画布。结构与内容分离，画布即 JSON。

| 项 | 说明 |
| --- | --- |
| 中文名 | 元矩阵 |
| 英文名 | MetaMatrix |
| 仓库 | [github.com/zsy619/MetaMatrix](https://github.com/zsy619/MetaMatrix) |
| 目录约定 | `docs/` 文档 · `pros/` 程序（前后端） |
| 状态 | 可本地运行的多画布 MVP（持续迭代） |

---

## 项目定位

**MetaMatrix（元矩阵）** 是一套面向业务梳理与战略表达的**通用画布引擎**：用同一套渲染、存储与版本机制，承载四象限、双三角、Y 模型、需求三角等多种布局。

命名取「元（meta）」强调两点：

1. **元数据驱动**：画布类型、坐标轴、象限、图层、markers 均由 Schema / 模板 JSON 描述，前端按配置渲染。
2. **矩阵可扩展**：四象限是 `2×2` 特例；同一引擎可演进为更多结构化画布类型。

---

## 技术栈

| 层 | 选型 |
| --- | --- |
| 前端 | Vue 3 + TypeScript + Vite + Pinia + Element Plus + TipTap |
| 后端 | Go · CloudWeGo Hertz + GORM + PostgreSQL（JSONB 存画布） |
| 认证 | JWT 多用户；文档 CRUD / 修订 / 检索 / AI 上下文导出 |
| 历史归档 | `pros/api-nestjs-archive/`（旧 NestJS+Prisma，仅参考，默认不启动） |

本地启动步骤见 [`pros/README.md`](./pros/README.md)。

---

## 仓库结构

```
MetaMatrix/
├── README.md                 # 本文件（系统总览）
├── .gitignore
├── docs/                     # 产品与设计文档
│   ├── 技术选型.md
│   ├── GLOBAL_RULES/         # 全局交互规则（最大化、相关资料等）
│   ├── _sources/             # 原始材料归档
│   └── refs/
└── pros/                     # 程序
    ├── README.md             # 前后端启动说明
    ├── api/                  # Hertz + GORM + PostgreSQL
    └── web/                  # Vue3 画布 SPA
```

---

## 已落地画布（节选）

| 模板 ID | 说明 |
| --- | --- |
| `star-quadrant` | 探索–变革–提速–落地（STAR 四象限） |
| `dual-triangle` | 双三角 |
| `dual-triangle-human-ai` | 人类三角 × AI 三角（双三角实例，与 `dual-triangle` 并存） |
| `y-model` | Y 模型 |
| `demand-triangle` | 需求三角 |
| `deliberate-practice` | 刻意练习 |
| `product-content` | 产品内核 |
| `scientific-meeting` | 科学开会思考 |
| `annual-summary` | 个人年度工作总结 |
| `deep-review` | 深度复盘关键成果 |
| `incident-review` | 故障复盘 |
| … | 另有 IPO、奥斯卡、行业分析/预测、五步法、权衡类等 |

完整列表见 `pros/web/src/templates/`。

---

## 核心能力

- **结构化编辑**：轴标签、象限/区块标题、条目富文本、markers
- **面板最大化**：铺满整个文档窗口；全局同时仅一个最大化面板
- **相关资料**：面板底部附件（本地 / 外链）与在线预览
- **云端存储**：任务名称、创建/修订时间、备注；按模板列出已存文档
- **版本与 AI**：修订快照、与上一版对比、AI 上下文导出、全文检索接口
- **导出**：DOM 截图 PNG；JSON 导出

设计原则与 Schema / 版本细节见 [`docs/技术选型.md`](./docs/技术选型.md)。全局交互规则见 [`docs/GLOBAL_RULES/`](./docs/GLOBAL_RULES/)。

---

## 快速开始

```bash
# 1) 数据库 + API
cd pros/api
cp .env.example .env          # 按需改 DATABASE_URL / JWT_SECRET
docker compose up -d          # Postgres → 宿主机 5433
go run ./cmd/server           # http://localhost:3000

# 2) Web
cd ../web
npm install
npm run dev                   # http://localhost:5173 （/api 代理到 :3000）
```

- 引导页：http://localhost:5173/
- 登录 / 注册：`/login` · `/register`
- 可自建账号，或使用本地演示流程

---

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [README.md](./README.md) | 系统总览（本文） |
| [pros/README.md](./pros/README.md) | 前后端启动与接口入口 |
| [docs/技术选型.md](./docs/技术选型.md) | 栈决策、Schema、版本设计、开源对标 |
| [docs/GLOBAL_RULES/](./docs/GLOBAL_RULES/) | 面板最大化、相关资料等全局规则 |
| [docs/_sources/](./docs/_sources/) | 原始材料归档（追溯用，非主文档） |

---

## 非目标（仍适用）

- 不做 Miro / Excalidraw 级无限自由白板（受约束的 DOM 白板）。
- 不首期引入 Canvas / WebGL 渲染管线。
- 不做实时多人光标级协同（可预留乐观并发字段）。
- 不替代专业 BI / 图表库；本项目偏**结构化思维画布**。

---

## 来源说明

早期方案整合自 DeepSeek 分享对话并工程化落地（STAR 四象限、版本模型等）。本地归档：`docs/_sources/deepseek-share.md`。
