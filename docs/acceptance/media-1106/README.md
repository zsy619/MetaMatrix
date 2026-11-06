# 素材库验收（2026-11-06）

对照提交 `12092be`（`main` 在 #105 合入后的 HEAD）。该提交的 GitHub CI [run 42149338691](https://github.com/zsy619/MetaMatrix/actions/runs/42149338691) 已结束：`api`、`web`、`flow` 都是 success。

本目录是在此之后补的 PostgreSQL 集成测试、分片请求体缺陷修复，以及登录后的 Chromium 记录。飞书没有凭证，不把本地假服务器当成飞书验收。

## 怎么复现

PostgreSQL 16，库名必须包含 `media_test`：

```bash
sudo -u postgres psql -c "CREATE ROLE metamatrix LOGIN PASSWORD 'metamatrix';"
sudo -u postgres psql -c "CREATE DATABASE metamatrix_media_test OWNER metamatrix;"
cd pros/api
MEDIA_TEST_DATABASE_URL='postgresql://metamatrix:metamatrix@127.0.0.1:5432/metamatrix_media_test?sslmode=disable' \
  go test ./internal/handler/ -count=1 -run TestPostgresMediaMigrationAndAPI -timeout 180s
MEDIA_TEST_DATABASE_URL="$MEDIA_TEST_DATABASE_URL" \
  go test ./internal/media/ -count=1 -run TestFeishuMultipartUsesPreparePartFinishOnLocalFake
```

浏览器（另开一个业务库，不要和上面的测试库混用）：

```bash
cd pros/api && go build -o /tmp/metamatrix-api ./cmd/server
DATABASE_URL='postgresql://metamatrix:metamatrix@127.0.0.1:5432/metamatrix?sslmode=disable' \
  MEDIA_ROOT=/tmp/metamatrix-media-root \
  MEDIA_SIGN_SECRET=acceptance-sign-secret \
  JWT_SECRET=acceptance-jwt-secret \
  CAPTCHA_DEBUG_LOOPBACK=true \
  PORT=3000 /tmp/metamatrix-api
cd pros/web && npx vite --host 127.0.0.1 --port 5173
node pros/web/scripts/media-acceptance-browser.mjs
```

脚本会自己注册两个账号，用登录页的图形验证码（调试答案在 `data-debug-answer`）登录，再打开一堂 Y 模型。粘贴和拖拽是页面里构造的 `DataTransfer`，不是操作系统剪贴板。

## 七项

| # | 项 | 结论 | 证据 |
| --- | --- | --- | --- |
| 1 | 去重：磁盘 1 份、表 1 行、返回已有 id、唯一索引在 | 通过 | PostgreSQL 上执行 `migrations/005_media.sql`。`pg_indexes.uniq_media_user_sha` 含 `user_id, sha256`。同一用户第二次上传 HTTP 200 且 `created=false`、id 相同、`COUNT(*)=1`。浏览器里再次粘贴和拖拽同一 PNG 只有 `POST /api/media/check`，没有第二次 `/upload`。 |
| 2 | 用户隔离 | 通过 | 另一用户相同字节得到另一个 id。用对方 token 读元数据是 404。浏览器用户 B 读用户 A：元数据 404，拿着 A 的签名 URL 去读是 403。见 `media-user-b.png`。 |
| 3 | 无签名或过期签名 403，合法请求可取，支持 Range | 通过 | 浏览器对刚签发的预览地址加 `Range: bytes=0-3`，返回 206，`content-range: bytes 0-3/78`，正文 4 字节。把 `exp` 设成过去时间并用同一密钥算出 HMAC（签名本身能对上，只是过期），浏览器收到 403 `invalid or expired media signature`。别人重放该 URL 也是 403。 |
| 4 | `inserted_path` 没有磁盘路径 | 通过 | 响应和引用记录都是 `/media/{id}`。库里的 `storage_path` 是相对路径，不含测试用的存储根。客户端即使提交 `insertedPath=/var/secret/a.mp3` 和别人的 `userId`，服务端仍写成 `/media/{id}`，`user_id` 取登录用户。 |
| 5 | 飞书 token 可回溯、失败可标记、有补偿 | 未验证 | 没有飞书 App、Secret、block id。补偿入口 `POST /media/{id}/feishu/sync` 在 PostgreSQL 上返回 `feishuSyncStatus=not_configured`，本地行还在。大于 20MB 的适配代码会走 `upload_prepare` / `upload_part` / `upload_finish`，这项只在本机假 HTTP 服务上看到路径，**不是飞书租户**。 |
| 6 | 音频和视频同一套存储 | 通过 | PostgreSQL 集成测试分别上传 `audio/mpeg` 与 `video/mp4`。两行的 `storage_disk=local`，`storage_path` 都以该用户 id 开头，都不是绝对路径。 |
| 7 | 大于 20MB 可分片，断点能续，哈希一致 | 通过 | 20MB+1 字节、每片 4MB。先不传第 1 片，`finish` 为 409，状态里 `missing=[1]`。补上该片后 `finish` 为 201，SHA-256 与原文一致，`insertedPath` 为 `/media/{id}`。浏览器登录后同样走了一遍。PostgreSQL 测试和浏览器结果一致。 |

## 这次修的缺陷

分片接口在 Hertz 默认把正文放进 `Body()` 时，`BodyStream()` 会返回一个非空但没有数据的 reader。HTTP 分片因此被当成空片，返回 409。直接调用服务函数的单测看不出来。`requestBody` 改为只有真正的流才读 `BodyStream()`。

`sha256` 从 `CHAR(64)` 改成 `VARCHAR(64)`。PostgreSQL 的 `CHAR` 会补空格，读出来的哈希会变长。

## 截图

- `media-login.png`：登录后的模板首页，右下角是本次测试账号。
- `media-editor.png` / `media-paste.png` / `media-drag.png`：一堂 Y 模型里的正文。粘贴时网络记录到 Worker `mediaHash.worker.ts`，以及 check 和 upload。
- `media-browser-results.png`：同一页左下角是 Range 206、过期 403、引用删除 409、分片 409 后续传 201 且哈希一致。
- `media-user-b.png`：第二个账号的登录后页面。
- `media-browser-evidence.json`：请求列表和返回体。

## 不要合的 PR

[#103](https://github.com/zsy619/MetaMatrix/pull/103) 仍开着，基线是旧的 `cursor/media-model-sign-4734`。不要把它合进 `main`，也不要删它的分支。对应的分片改动已经在 #105。
