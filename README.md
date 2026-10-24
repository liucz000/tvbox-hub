# tvbox-hub

把多个 TVBox / 影视仓配置源聚合成**一份**可直接订阅的配置，同时输出聚合直播源，支持 **Cloudflare Worker** 与 **Docker / 本地 Node** 两种部署方式。

> 聚合思路参考了 [tvbox-ysc-config](https://github.com/Lightconer/tvbox-ysc-config)、[tvbox-hub](https://github.com/sylvan97/tvbox-hub)、[tvbox-feed](https://github.com/lajidePM/tvbox-feed)、[tvbox-source](https://github.com/fswws/tvbox-source)、[tvbox-source-aggregator](https://github.com/yao1987825/tvbox-source-aggregator) 等项目的优点，代码为独立实现。仅用于技术学习，配置内容均来自公开第三方源，请自行判断合规性。

## 特性

- **多源聚合**：内置 20 个配置源（37 条入口地址，含失效镜像自动回退）+ 18 个直播源；支持多仓配置（`urls`）递归展开（最多 2 层、15 个子源）
- **站点去重与改名**：同 `key` 不同 `api` 的站点自动改名为 `key_2`、`key_3`；解析按 `url|type`、直播按 `type|url` 去重
- **Spider 智能分配**：按引用次数投票选一个全局 `spider`，为自带不同 JAR 的 `type:3` 站点单独挂 `site.jar`，避免 JAR 冲突导致站点全部失效
- **JAR 反代**：配置里的 JAR 统一改写为 `${BASE}/jar/<key>`，由服务端代理拉取（内存 LRU + Cache API），客户端只需访问本服务
- **直播频道级合并**：抓取 M3U / DIYP TXT，按「分组 → 频道」合并多线路，输出 `/live.m3u`、`/live.txt`、`/live.json`
- **容错解析**：兼容 BOM、行/块注释、尾逗号、JSONP、裸 JSON 片段等常见「脏」配置
- **可选探活**：`off / shallow / deep` 三档，非 `off` 时对站点做轻量校验，存活率低于 10% 时自动放弃过滤（防误杀）
- **无状态两种后端**：Worker 用 KV，Node 用 JSON 文件（临时文件 + rename，串行落盘）
- **安全默认值**：管理接口 fail-closed（未配 `ADMIN_PASSWORD` / `ADMIN_TOKEN` 直接 503）、密码登录走签名 HttpOnly Cookie、Bearer token 常量时间比较、SSRF 内网拦截、严格 CSP，且**不提供**任意 URL 代理 / 图片代理端点

## 内置上游

把五个参考项目里公开使用的上游全部纳入（共 62 条地址：44 条配置 + 18 条直播），去重合并后为本项目的 20 个配置源（37 条地址）与 18 个直播源，完整清单见 [src/defaults.ts](./src/defaults.ts)。

| 来源项目 | 配置源（原始入口数） | 直播源 |
| --- | --- | --- |
| tvbox-ysc-config | 肥猫、饭太硬、王二小、老刘备、小马、讴歌、4K小盒子/小盒子单仓、拾光、挺好分享（18） | — |
| tvbox-source | 影视仓内置、饭太硬(fy)、菜妮丝、俊哥、二月红、潇洒、牛二、新接口、拾光(svip)、金鹰、sss（15） | 饭太硬 3 条、范明明 IPv6、iptv-org 8 个地区、okay 2 条（14） |
| tvbox-hub | 纯净电视精选、饭太硬、肥猫、Qist 整合仓、高天流云、运输车（7） | Guovin TXT + M3U（2） |
| tvbox-feed | 饭太硬原版直通、肥猫 4K 原版（2） | PG 优质网盘、ABC 综合（2） |
| tvbox-source-aggregator | 无内置上游（源由用户在后台自行添加） | — |

- 精确重复的入口（如「牛二」与王二小、「小盒子单仓」与 4K小盒子、老刘备与 ok线路）合并为同一源的备用地址
- 当前已失效的镜像（饭太硬 .top/.net、肥猫 live、讴歌、运输车、菜妮丝、新接口等）保留为备用地址或独立条目，不会阻塞聚合
- 自定义源可随时增删，内置源也可在管理后台停用 / 恢复，无需重新部署
- 本地实测（`PROBE=off`，并发 5）：18/20 个源可用，聚合 1100 个站点、83 个解析、48 个 JAR、2000 个直播频道，单次刷新约 17s

## 快速开始

### 方式一：Cloudflare Worker

```bash
npm install
npx wrangler login

# 1. 生成本地 wrangler 配置（含账号专属信息，已被 git 忽略）
cp wrangler.toml.example wrangler.toml
# 创建 KV，把输出的 id 填进 wrangler.toml
npx wrangler kv namespace create KV

# 2. 写入管理密码（后台登录用）和/或 Bearer 令牌（脚本调用用）
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put ADMIN_TOKEN

# 3. 部署
npm run deploy

# 4. 触发首次聚合
curl -X POST https://<你的-worker>.workers.dev/refresh \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

`wrangler.toml` 里的 `[triggers] crons = ["15 * * * *"]` 每小时唤醒一次，由 `REFRESH_INTERVAL_MINUTES`（默认 720 分钟）决定是否真正聚合。绑定自定义域名时取消 `routes` 注释并换成自己的域名。

> 本地调试：`npm run dev`（`wrangler dev`）。本地环境的出网请求走沙箱网络，若无外网权限可先用管理后台添加一个可访问的源验证流程。

### 方式二：Docker

```bash
cp .env.example .env      # 填 ADMIN_PASSWORD（或 ADMIN_TOKEN）和 BASE_URL
docker compose up -d --build
```

或直接：

```bash
docker build -t tvbox-hub .
docker run -d --name tvbox-hub -p 5678:5678 \
  -e ADMIN_PASSWORD=your-password \
  -e BASE_URL=http://192.168.1.10:5678 \
  -v $PWD/data:/app/data \
  tvbox-hub
```

容器以非 root 用户运行，内置 `HEALTHCHECK`（轮询 `/healthz`），数据落在 `./data/tvbox-hub.json`。

> **局域网 / VPS 部署请务必设置 `BASE_URL` 为客户端可访问的地址**，否则配置里的 `/jar/...` 与 `/live.m3u` 会使用请求的 Host，跨网络访问时可能不可达。

### 方式三：本地 Node

```bash
npm install
npm run build
ADMIN_PASSWORD=your-password BASE_URL=http://127.0.0.1:5678 npm start
```

## 订阅地址

| 路径 | 说明 |
| --- | --- |
| `/` 或 `/index.json` | 聚合后的完整 TVBox 配置（`/index.json` 带下载文件名） |
| `/live.m3u` | 聚合直播（M3U） |
| `/live.txt` | 聚合直播（DIYP TXT，`频道,#genre#` 格式） |
| `/live.json` | 仅含聚合直播的单条 `lives` 配置 |
| `/jar/:key` | JAR 代理（由聚合结果自动生成，无需手填） |
| `/healthz` `/version` `/status-data` | 健康检查、版本、聚合状态（公开只读） |
| `/admin` | 管理后台（密码登录） |
| `POST /admin/login` `/admin/logout` | 密码登录 / 退出（签名 Cookie，12 小时） |
| `GET/POST/DELETE /admin/sources` | 查看 / 添加 / 删除源，删除内置源即停用（需登录） |
| `POST /admin/sources/restore?url=` | 恢复已停用的内置源（需登录） |
| `GET /admin/status` | 聚合状态明细，含每个源的耗时与错误（需登录） |
| `POST /refresh` | 立即触发聚合（需登录，后台执行，返回 202） |

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `ADMIN_PASSWORD` | 空 | 管理后台密码；登录后签发 HttpOnly Cookie |
| `ADMIN_TOKEN` | 空 | Bearer 令牌，用于 curl / 脚本调用管理接口；与 `ADMIN_PASSWORD` 均留空 = 管理接口关闭（503） |
| `BASE_URL` | 空 | 对外地址，用于替换配置中的占位符；留空则用请求 Host |
| `REFRESH_INTERVAL_MINUTES` | `720` | 两次聚合的最小间隔（Worker 靠 cron 唤醒判断） |
| `PROBE` | `off` | 站点探活：`off` / `shallow` / `deep` |
| `MAX_SOURCES` | `30` | 最多参与聚合的源数量 |
| `PORT` | `5678` | Node 监听端口 |
| `DATA_DIR` | `./data` | Node 数据目录 |
| `CRON_SCHEDULE` | `0 */6 * * *` | Node 模式定时任务（cron 表达式） |

## 管理后台

浏览器打开 `/admin`，输入 `ADMIN_PASSWORD` 后可以：

- 查看聚合状态、各源成败与耗时
- 添加 / 删除自定义源，停用 / 恢复内置源（写入 KV 或数据文件，重启不丢失）
- 一键触发重新聚合

密码只用于换取 12 小时有效的 HttpOnly 签名 Cookie，页面不再保存任何凭据；页面使用 `textContent` 渲染，避免 XSS；响应头带 CSP、`nosniff`、`no-referrer`。

## 聚合流程

1. 读取内置源 + 自定义源，并发抓取（默认 5 并发、12s 超时、8MB 上限、双 UA 重试）
2. 展开多仓 `urls`，收集所有子配置
3. 规范化站点（相对路径补全、spider 规范化），剔除内网 / 非法地址站点
4. 合并 `sites` / `parses` / `lives` / `hosts` / `ads` / `flags` / `rules` / `doh`，去重、改名
5. 投票选出全局 `spider`，为 `type:3` 且自带 JAR 的站点单独挂 `site.jar`
6. 可选探活过滤
7. 抓取并合并直播源，写入 `/live.m3u`、`/live.txt`、`/live.json`
8. 把 JAR 改写为 `/jar/<key>` 并写入索引，最后写入配置与状态

## 安全说明

- 管理接口 fail-closed：`ADMIN_PASSWORD` 与 `ADMIN_TOKEN` 均为空时返回 503，而不是放行
- Token / 密码比较前先做 SHA-256，再做等长比较，避免长度/时序差异
- 会话 Cookie 使用 HMAC-SHA256 签名并带过期时间，`HttpOnly` + `SameSite=Strict`，HTTPS 下再加 `Secure`
- 抓取与 JAR 代理均校验目标为 http/https 且非内网地址（回环、私有网段、链路本地、CGNAT）
- 不提供通用 URL 代理或图片代理端点，避免被当作开放代理滥用
- 所有内容来自第三方公开源，本项目不存储、不转码、不分发视频内容

## 常见问题

**聚合失败，`/status-data` 显示 `sourcesOk: 0`？**
先看 `/admin/status` 里每个源的错误。常见原因是上游域名被墙、改域名或返回非 JSON；可在管理后台删掉失效源或补充备用地址。

**配置能打开，但点播全挂？**
多半是 `spider` 与站点 JAR 不匹配。本项目已按投票 + 站点级 jar 处理；若上游配置把 `spider` 写成纯 URL 缺失 md5，请优先使用管理后台里的可用源。

**Worker 上探活很慢？**
Worker 默认 `PROBE=off`，且探活并发与预算都比 Node 模式更保守。需要更强校验请部署到 Docker。

**Worker 上聚合失败 / 报子请求超限？**
内置源全量聚合一次约 45 个子请求，Cloudflare 免费版上限是 50 个/次。免费版请把 `MAX_SOURCES` 调到 10 左右，或在 `src/defaults.ts` 里减少直播源；付费版（1000 子请求）可全量跑。Docker / 本地 Node 无此限制。

**改完源需要重新部署吗？**
不需要。自定义源、内置源停用名单与聚合结果都存在 KV / 数据文件中。

## 开发

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest，14 个用例
npm run build       # esbuild 打包 Node 入口到 dist/server.js
```

CI（`.github/workflows/ci.yml`）会执行 `npm ci` → typecheck → test → `docker build`。

## 免责声明

本项目只做配置聚合与格式转换，不提供、不托管任何音视频内容。所有源均来自互联网公开信息，请勿用于商业用途；由此产生的任何法律与版权问题由使用者自行承担。若相关权利人认为内容侵权，请删除对应上游源或停止使用本项目。

## License

[MIT](./LICENSE)
