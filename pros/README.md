# 元矩阵 MetaMatrix · pros

前后端可运行脚手架（MVP）。默认后端：**CloudWeGo Hertz + GORM + PostgreSQL**；前端 Vue3。

## 启动顺序

一条命令启动前后端（自动确保数据库可用，Ctrl+C 一起停止）：

```bash
./dev.sh           # 仓库根目录的一键启动（等价于 cd pros && ./dev.sh）
cd pros
./dev.sh           # 启动
./dev.sh restart   # 重启（先停掉本项目已启动的进程，再重新拉起）
```

也可以交给 launchd 常驻（跨终端/跨会话不掉，进程挂了自动拉起）：

```bash
launchctl kickstart -k gui/$(id -u)/com.metamatrix.dev
```

- Web: http://localhost:5173
- API: http://localhost:3000/health
- 日志：`api/logs/dev-api.log`、`web/logs/dev-web.log`

需要单独排查时可手动分步启动：

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

## 项目与节点画布

引导页右上角「我的项目」进入。路由：

| 路由 | 说明 |
| --- | --- |
| `/projects` | 项目列表：新建 / 重命名 / 删除（二次确认） |
| `/projects/:projectId` | 项目内的画布列表：新建 / 重命名 / 删除（二次确认） |
| `/projects/:projectId/canvas/:canvasId` | 节点画布 |

节点画布支持两种节点（类型注册表在 `web/src/components/canvas/nodeGraph/nodeTypes.ts`，
新增类型只改这一个文件）：

- **富文本**：标题 + 正文，复用现有 `RichTextEditor`（`compact` + `page-sheet=false`）。
- **画布引用**：引用本项目里的另一张画布。不能引用自己、不能形成循环引用（A → B → A），
  选择时就会拦下并提示；被引用的画布删掉后节点显示「已失效」。

交互：点节点左上角图标在右侧面板编辑；空白拖拽框选、空格/中键/Alt 拖拽平移、滚轮缩放；
从节点连接点拖到另一个节点建立连线（可双击连线加标签）；Delete 删除选中节点与连线，
Cmd/Ctrl+Z 撤销。所有改动自动保存（800ms 防抖 + 本地草稿兜底）。

画布内容整体存在 `canvas_documents.current_data`（JSONB，类型 `node-graph`），
不单独建节点表；项目本身是 `projects` 表。见 `docs/API.md` 的「项目」一节。

产品文档在上级 `docs/`。
