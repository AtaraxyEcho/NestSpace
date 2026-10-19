# NestSpace · 开源项目标本馆

把仓库当标本陈列的静态站点：每件"标本"记录它做了什么、怎么装的、以及为什么能活下来。
单个 Cloudflare Worker 同时提供公开只读 API、管理端 API 与静态资产；项目正文与站点文案存在 D1，
按天聚合的访问台账也落在同一个库里。

| 层 | 选型 |
|---|---|
| 前端 | React 19 + Vite 8 + Tailwind v4，构建为纯静态资产（`frontend/dist`） |
| 后端 | Cloudflare Workers + Hono（`frontend/worker/index.ts`） |
| 数据 | D1（边缘 SQLite）：`projects` 每件一行 + `site_settings` 全站文案一行 + 按天聚合的 `visit_*` 访问台账 |
| 管理端 | 与前台同源代码的 `/admin` 路径（旧 `#admin` 仍兼容）；生产部署在 `admin.<主域>`，由 Zero Trust Access 拦截 |
| 度量 | D1 访问台账（管理端「访问统计」：累计 PV/UV、来源、设备、语言、地域、时段、事件）；Analytics Engine 可选 |

---

## 三分钟本地跑起来

前置：**Node ≥ 22.18**（`.mise.toml` 钉 22；闸门测试直接 import `.ts` 源码，靠 Node 原生类型剥离，
22.6–22.17 不带 flag 会在 import 阶段报错）、**pnpm 10.34.3**、**全局 wrangler**。
仓库里只有 `frontend/pnpm-lock.yaml`，用 `npm install` / `npm ci` 会直接 ENOLOCK 失败。

```bash
cd frontend
pnpm install --frozen-lockfile
cp .dev.vars.example .dev.vars
# 编辑 .dev.vars：ADMIN_SECRET_KEY 填 `openssl rand -base64 32` 的输出。
# 留空 = 管理端 fail-closed：无凭据 401、凭据无效 403；公开站不受影响。
```

回到仓库根目录：

```bash
bash scripts/d1-migrate.sh local    # 首次执行会自建本地库，按序跑 0001–0016（含 4 件演示标本）
cd frontend
pnpm run build                      # Worker 的资产目录指向 dist，必须先构建才取得到首页
npx wrangler dev                    # http://localhost:8787
```

- 公开站：<http://localhost:8787/>
- 管理端：<http://localhost:8787/admin>（旧的 `#admin` 也认），口令就是 `.dev.vars` 里的 `ADMIN_SECRET_KEY`
  （生产环境 `/admin` 与旧的 `#admin` 都会被重定向到 `admin.<主域>`）
- 想要前端热更：另开一个终端跑 `pnpm run dev`（Vite 固定 8443，`/api` 代理到并行起的 8787，
  可用 `WRANGLER_DEV_URL` 覆盖目标）

> `scripts/d1-migrate.sh` 内部调用的是**裸 `wrangler`**，需要它在 PATH 上（`npm i -g wrangler` 或 `pnpm add -g wrangler`），
> 脚本外面的 `npx` 前缀帮不到它；`scripts/usage-probe.sh` 走的是 `npx wrangler dev`，首次运行会联网取 wrangler。

---

## 想改什么，去哪里改

**站点文案与展示偏好全部在管理端，改完即时生效、不需要重新构建部署。** 侧栏按页面归栏：

| 栏 | 管的东西 |
|---|---|
| 01 馆藏总览 | 最近更新、馆藏状态计数 |
| 02 标头与导航 | 导航项的顺序 / 名称 / 显示、Logo 图文与显示模式 |
| 03 首页栏目 | 首屏叙事、统计（指标 / 年鉴 / 描述行与开关）、馆长手记、目录描述、GitHub 地址与联系方式 |
| 04 详情页文案 | 详情页的预览区 / 特征区 / 相邻标本三处标题，以及挑战·方案两段正文小标题 |
| 05 底部栏文案 | 页脚各栏与版权行，支持 `{name}` `{since}` `{year}` 模板变量 |
| 06 项目管理 | 每件标本的增删改与排序 |
| 07 GitHub 同步 | 按编号选择范围拉取仓库指标与文档（勾选后连同 README 里的图一起提取预览图） |
| 08 站点设置 | 站点信息、展示偏好（语言 / 主题 / 开关）、SEO 标题与描述、ICP 备案号、域名只读信息 |
| 09 访问统计 | 累计/近 7·30·90 天 PV·UV、热门页面、来源/设备/语言/地域、时段分布、行为事件与本设备排除开关 |

两条容易踩的规则：

- **栏目大标题跟随导航名称**，后台没有"单独覆盖标题"的字段——把导航里的 `Statistics` 改名，
  首页那一栏的大标题、导航、页脚入口会一起变（同一个 `navLabel()` 读出）。
- **留空 = 用内置默认，且默认绝不写进库**。所以改 `defaultSiteSettings.ts` 里的默认文案能传到
  所有没填过的部署上；一旦把默认当值保存进库，以后改默认就再也传不下去。

---

## 改过代码之后

```bash
cd frontend
pnpm run typecheck    # 前端 + Worker 两套 tsconfig
pnpm test             # 17 个闸门：纯函数、不联网、不起服务
pnpm run build
```

CI（`.github/workflows/ci.yml`）跑的就是这三条。闸门里三条最值得留意：
**代码引用的列必须存在于 `migrations/`**、**站点设置的三份清单（内置默认 / Worker 白名单 / 迁移列）
必须双向对齐**、**`pnpm test` 的注册链与 `test/` 目录一一对应**（漏登记的闸门会在 CI 里静默不跑）。
前两条对应的错在本地全是运行时问题（保存 500，或"保存成功但字段被丢弃"）。
接口级探针（埋点接受与拒绝、`/api/img` 是否真返回 webp、相册 400 话术）在仓库根目录：

```bash
bash scripts/usage-probe.sh     # 自己起 8898 的 dev、自己收尾，只杀自己起的进程
```

---

## 上线顺序（顺序错了会炸）

1. **先迁移，再部署**。新增或改过 `migrations/*.sql` 时，必须先
   `bash scripts/d1-migrate.sh remote`，然后才 `npx wrangler deploy`。
   列不存在时 Worker 照样能部署成功，但公开列表接口会整片 500，而首页会静默退回内置数据——
   看起来"只是没读到配置"，实际整站已坏。脚本用 `_migrations` 表登记，可反复执行、只跑没跑过的。
2. **换成你自己的 D1**：`npx wrangler d1 create <名字>`，把输出的 `database_id` 填进
   `frontend/wrangler.toml`（全仓库唯一的 Worker 配置，Git 构建与本地 dev 都读它）。
3. **密钥与变量**：`npx wrangler secret put ADMIN_SECRET_KEY`；要启用第二防线再配
   `ACCESS_TEAM_NAME` / `ACCESS_AUD_TAG`（可选的收紧项 `ACCESS_ALLOWED_EMAILS`，不填 = 只认 Access 策略）。
4. **管理端子域**：给主域加 `admin` CNAME（Proxied）→ Worker 绑定 `admin.<主域>` 自定义域名 →
   建 Zero Trust Access 应用。前后台互跳的地址按当前 hostname 推导（`admin.X ↔ X`），
   代码与构建产物里都不写死域名，换主域不必重新构建。
5. **Git 自动构建**（可选）：Cloudflare Workers Builds 导入仓库，Root directory 填 `frontend`。

`workers_dev = false` 与 `preview_urls = false` 是刻意的：不留一条能绕过域名级边缘策略的备用入口。
代价是自定义域名绑定生效之前，你没有可访问的 URL——本地 `wrangler dev` 不受影响。

---

## 度量（D1 访问台账）

`POST /api/usage` 接受六个事件（`pageview` / `deck` / `specimen_open` / `outbound` / `imgfail` / `dirimport`），
只收白名单内的名字与形态，其余一律拒绝。

落点是 **D1 访问台账**（迁移 `0016_add_visit_ledger.sql`）：按天聚合、永久保留，不存单次访问行。

- **累计访问次数** = `visit_day.pv` 求和；**累计独立访客** = `visit_identity` 行数。
- 每日 UV 由浏览器端一个随机匿名 ID（localStorage）去重，服务端用 HMAC 派生后才落库；
  不存 IP/UA/来源 URL。清缓存、隐私模式、多设备会各算一个新访客——这是 UV 的固有误差。
- 另存每日来源类别 / 设备档 / 语言 / 国家 / 24 小时分布，以及 `deck`、`specimen_open`、
  `outbound`、`imgfail`、`dirimport` 的计数。
- 管理端左侧「访问统计」查看；页底有 **「本设备不计入访问」** 开关
  （localStorage；生产环境用一枚跨子域的功能性偏好 cookie 同步到公开站，不含任何标识）。
- `/admin` 的浏览单独计，不进受众口径；会跑 JS 的爬虫按 UA 剔除。

Analytics Engine 绑定仍是**可选的第二通道**（默认注释；未启用 AE 的账号部署会 `code 10089`）。
不开也不影响 D1 台账。`/api/usage` 的限流走免费代码路径：isolate 内存 +
Cloudflare Cache API 的分钟/日桶（同 colo 共享、不占 D1/KV 配额），不依赖 WAF。

**部署顺序**：先 `bash scripts/d1-migrate.sh`（本地）→ `bash scripts/d1-migrate.sh remote` → 再部署新 Worker。
顺序反了不会 500，但 `/api/admin/visits` 会明确返回 503「表尚未迁移」，不会把 0 当成"没有访问"。

转化率 = `outbound ÷ specimen_open`；按访客口径也可以看 `outbound ÷ 窗口 UV`。

---

## 目录

```text
frontend/            # 唯一的工作区：src/ 前端 · worker/ 后端 · test/ 闸门 · public/ 静态资产（含 _headers）
migrations/          # D1 建表与种子，按文件名顺序执行（0001–0016）
scripts/             # d1-migrate.sh · usage-probe.sh · probe-visit-ledger.mjs · probe-bilingual-payload.mjs · make-brand-logos.py
docs/                # DEPLOYMENT_GUIDE.md（部署与安全运营手册）· ARCHITECTURE_PLAN.md · plans/
```

配置项、字段归属、双语回退规则、缓存与 CSP 的完整说明都在
**[docs/DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md)**；模块级的设计取舍记录在 `docs/plans/`。

---

## 许可

仓库里**没有 LICENSE 文件**，因此默认保留所有权利——阅读和自行部署可以，任何部分都不构成再分发授权。
管理端「项目管理」里填写的开源协议是**每件标本自己的**协议（同步时只填空白，不覆盖作者声明），
与本网站的许可无关。
