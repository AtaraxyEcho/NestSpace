# NestSpace 生产部署与安全运营手册

> 本地跑起来看 [README.md](../README.md)；本文只管**部署、安全与运维**。
> 文中出现的 `nestspace.online` / `admin.nestspace.online` / `github.com/AtaraxyEcho/NestSpace`
> 是本项目的实际取值，用作逐步演示；换成你自己的域名与仓库即可，代码与构建产物里都不写死域名
> （前后台互跳按 hostname 推导，`canonical` / `og:url` 按请求 origin 注入）。

形态：一个 Worker（Hono）+ 静态资产 + D1，没有常驻服务器。安全响应头由 `frontend/public/_headers`
下发（严格 CSP、HSTS、`X-Frame-Options: DENY` 等）；管理 API 有三层防线——边缘 Zero Trust 拦截、
代码层 Bearer 密钥常量时间比较、Access JWT 签名校验（未配置 Access 变量时只认 Bearer，默认 fail-closed）。

---

## 一、 项目工程概览

```text
NestSpace/
├── README.md                     # 三分钟上手：本地跑起来、后台能改什么、检查项与上线顺序
├── AGENTS.md                     # 给编码 agent 的事实清单（单一来源；frontend/AGENTS.md 与两处 CLAUDE.md 都只是指针）
├── CLAUDE.md                     # @AGENTS.md
├── frontend/
│   ├── dist/                     # vite 构建产物（含 _headers，作为 Worker 静态资产目录）
│   ├── worker/                   # Cloudflare Worker（后端边缘 API）
│   │   ├── index.ts              # Hono 入口（公开脱敏接口 + 管理接口 + 鉴权中间件）
│   │   └── tsconfig.json
│   ├── public/
│   │   ├── _headers              # 严格 CSP 策略、防 iframe 钓鱼、防运营商劫持 HSTS、静态资产缓存
│   │   ├── brand/                # 站点 logo（make-brand-logos.py 生成；直出、刻意不走 LFS）
│   │   └── robots.txt            # 搜索引擎收录规则（允许全站，屏蔽 /api/）
│   ├── design/                   # 品牌原件（logo 源图，make-brand-logos.py 的输入；走 LFS、不参与构建）
│   ├── src/
│   │   ├── api/                  # 前端客户端 API (client.ts & adminClient.ts)
│   │   ├── data/                 # 内置默认值与回退数据 (fallbackProjects / defaultSiteSettings)
│   │   ├── types/                # 数据类型定义 (project.ts / siteSettings.ts)
│   │   ├── utils/                # 可独立测试的纯逻辑：markdown.tsx 渲染、markdownLines.ts 正文折行、
│   │   │                         #   stats.ts 统计、previewFrames.ts 观察台在场牌与牌面文字、
│   │   │                         #   previewRules.ts 相册判据（与 Worker 写侧同一份）、projectDiff.ts 抽屉改动列判定、
│   │   │                         #   usage.ts 匿名埋点、navOrder.ts 首页栏目顺序、bilingual.ts 双语读侧规则、
│   │   │                         #   safeStorage.ts 浏览器存储的安全读写（存储被禁时不白屏）、
│   │   │                         #   siteHost.ts 前后台互跳地址推导（admin.X ↔ X，代码里不写死域名）、
│   │   │                         #   sectionCopy.ts 栏目标题与页面文案的读侧判据（四处消费者同源）、
│   │   │                         #   siteRoute.ts 路径↔路由的判据（前端渲染与 Worker 的 canonical 同一份）、
│   │   │                         #   visitStats.ts 访问统计分类判据（+8 切日/设备/语言/来源/国家）、
│   │   │                         #   markdownUrls.ts Markdown 链接协议判据（拒绝 javascript/协议相对/反斜杠变体）
│   │   ├── App.tsx               # 动态数据渲染与安全管理端
│   │   ├── main.tsx              # React 入口（挂载 #root，引入 index.css）
│   │   └── index.css             # 全局样式与设计 token（Tailwind v4 导入 + 主题变量）
│   ├── .dev.vars.example         # 本地开发环境变量模板（复制为 .dev.vars 使用，不入 Git）
│   ├── index.html                # Vite HTML 壳（figma 插件在构建期注入 title / description / og；canonical 与 og:url 只留 `<!-- seo:origin-tags -->` 标记，由 Worker 按请求 origin 注入绝对地址）
│   ├── vite.config.ts            # Vite + Tailwind v4 + Figma Make 插件；dev 下把 /api 代理到本地 wrangler
│   ├── tsconfig.json             # 前端 TS 配置（浏览器环境；不含 Node 全局）
│   ├── tsconfig.node.json        # 只给 vite.config.ts 用（process.env 需要 Node 类型）
│   ├── .figma/make/site.json     # 站点标题 / 描述 / 收录开关（构建期注入 HTML 头部）
│   ├── test/                     # 18 个纯函数闸门（pnpm test 依次跑；test_chain.test.mjs 核对
│   │                             #   「注册链 = test/ 目录」，漏登记的闸门会在 CI 里静默不跑）
│   │                             # 鉴权与地址：jwt_verify · site_host（admin.X ↔ X、canonical 按 origin）
│   │                             # 列与清单对齐：sync_update（17f 代码列 ⊆ 迁移列 / 18 三份站点设置清单）
│   │                             # 前后端同一判据：preview_rules · preview_frames · preview_dir · image_proxy
│   │                             # 文案与版面：section_copy · nav_order · bilingual · markdown · demo_url
│   │                             # 运行时兜底：shell_guards（深色两份取值一致、存储被禁不白屏）· route_path
│   │                             # 台账与同步：visit_stats（+8 切日/设备语言分档/来源归类）· sync_scope
│   │                             # 客户端与限流层：usage_stats（退出统计两层契约与回滚 / 会话级入口来源 /
│   │                             #   访客 ID 形态 / 条形高度只由权重派生 / Cache API 限流三分支 / 名单单一来源）
│   ├── wrangler.toml             # Worker 配置：入口 + 静态资产 + D1 绑定（Analytics Engine 数据集可选、默认注释）
│   └── package.json
│
├── migrations/                   # Cloudflare D1 边缘数据库建表与种子数据
│   ├── 0001_create_projects.sql  # 表结构定义（字段脱敏、草稿状态、版本时间戳）
│   ├── 0002_seed_initial_data.sql # 初始 4 个标本数据（Aperture, Lumen, Fjord, Meridian）
│   ├── 0003_create_site_settings.sql # 站点文案与备案号配置表（管理端可编辑）
│   ├── 0004_add_nav_and_logo_settings.sql # 顶部导航顺序、Logo 与统计指标扩展表结构
│   ├── 0005_add_footer_settings.sql # 公开站点底部栏中英文案（管理端「底部栏」视图）
│   ├── 0006_add_display_preferences.sql # 展示偏好：默认语言/主题、首页统计与两个切换开关
│   ├── 0007_add_project_docs.sql # 标本文档：README 中英文与 dev/prod Compose 编排内容
│   ├── 0008_add_demo_fields.sql  # 项目演示入口：演示地址与演示开关
│   ├── 0009_add_curator_copy.sql # 馆长手记栏目文案（标签 / 标题 / 引言 / 属性值）
│   ├── 0010_add_preview_image.sql# 详情页标本托板预览图：项目图片 + 相册（同步从 README 提取，管理端可覆盖）
│   ├── 0011_add_bilingual_narrative.sql
│   │                             # 挑战 / 解决方案双语列（challenge_json / solution_json，旧单列只读兜底）
│   ├── 0012_add_project_license.sql
│   │                             # 标本开源协议列（管理端填写；同步只填空白，不覆盖手工值）
│   ├── 0013_add_detail_headlines.sql
│   │                             # 详情页「挑战 / 方案」两段小标题（管理端可配，中英各一份）
│   ├── 0014_add_section_copy.sql
│   │                             # 栏目与页面文案槽位（section_copy_json：首页描述行 + 详情页三处标题）
│   ├── 0015_fill_seed_narrative.sql
│   │                             # 纯数据：给种子的「挑战 / 方案」补上双语 JSON（只在列为空、且是种子行时）
│   ├── 0016_add_visit_ledger.sql
│   │                             # 访问台账（按天聚合 + 永久身份 + 90 天去重索引 + 哈希盐）
│   └── 0017_add_curator_name.sql
│                                 # 首页「馆长手记」的姓名槽位（curator_name，留空回退内置默认）
│
├── .github/workflows/ci.yml      # CI：pnpm 装依赖 + typecheck + 十八个闸门 + 构建（见第四节末）
│
├── scripts/                      # 运维脚本
│   ├── d1-migrate.sh             # 一键按序执行全部 D1 迁移（local / remote，可反复执行）
│   ├── d1-backup.sh              # 导出 D1 到 backups/，并做一次真恢复演练（行数比对；--no-verify 跳过）
│   ├── usage-probe.sh            # 接口探针：起 8898 的本地 Worker，自收进程（埋点 / 图片 / 品牌资产 / 相册写侧 /
│   │                             #   新建落列 / 双语写读 / 同步范围 / 访问台账 / 深链注入）
│   ├── visual-check.sh           # 页面级核对：起 8899 + 无头 Chrome，断言顶栏图标 / 姓名行 / 标题，截图到 .tmp-visual/
│   ├── verify-production.sh      # 生产只读烟测：首页标题 / 公开接口 / 管理端 401 / 品牌资产（可带 ADMIN_TOKEN）
│   ├── probe-visit-ledger.mjs    # 访问台账实测：PV/UV 去重、爬虫与管理端排除、跨站拒绝、事件计数（探针第 6 节）
│   ├── probe-bilingual-payload.mjs # 生成双语写读往返的请求载荷（供探针第 4 节 --data-binary 用）
│   └── make-brand-logos.py       # 由 frontend/design/ 原件派生 frontend/public/brand/ 的 logo 与浏览器图标
│
└── docs/                         # 文档
    ├── DEPLOYMENT_GUIDE.md       # 本文件：部署与运维手册
    ├── ARCHITECTURE_PLAN.md      # 架构方案与审查设计文档
    └── plans/                    # 历史规划记录（已完成的迭代过程，留作备查）
        ├── DEMO_ENTRY_PLAN_001.md
        ├── DEMO_ENTRY_PLAN_002.md
        ├── SECTION_CONFIG_PLAN_001.md
        ├── SECTION_CONFIG_PLAN_002.md
        └── SECTION_CONFIG_PLAN_003.md
```

---

## 二、 部署到 Cloudflare Workers（步骤指引）

本项目为 **Workers 形态**：单一 Worker（`worker/index.ts`，Hono）+ 静态资产（`dist/`）+ D1。
`/api/*`、`/`、`/index.html`、`/project`、`/project/*`、`/admin` 与 `/admin/*` 由配置中的
`run_worker_first` 优先进入 Worker（深链与尾部斜杠的变体都要进来，canonical / og:url / 主题标记
都在 Worker 的注入里，HTML 那条 240/分钟的兜底也挂在它身上）；其余未知路径走静态资产并回退
`index.html`（SPA 兜底）。`[assets]` 里的 `binding = "ASSETS"` **不可删除**——Worker 依赖它取回首页
HTML 做 SEO 注入（见第六节）；删掉会导致首页 503。

**先选部署形态**——两种都只用免费额度，代码不用改：

| | 无域名 · `workers.dev` | 自定义域名（默认推荐） |
|---|---|---|
| 前提 | 一个 Cloudflare 账号 | 账号 + 已托管在 Cloudflare 的主域 |
| 开启 | `workers_dev = true` | 绑主域，再绑 `admin.<主域>` |
| 访问地址 | `https://<worker>.<账号子域>.workers.dev` | 主域与 `admin.<主域>` |
| 后台入口 | `/admin` **就地渲染** | `/admin` 会跳到 `admin.<主域>`，该子域必须绑定 |
| 退出统计偏好 | 退回 localStorage（没有共享父域） | 跨子域 `Domain=<主域>` 的功能性 cookie |
| 边缘身份 | 只能另配 Worker 级 Access（见第三节关于 workers.dev 的那条），否则只剩口令 | Access 应用整站拦截（第三节） |
| 主要代价 | 后台与公开站**同源**：公开页一旦 XSS，sessionStorage 里的口令可被读走；地址是共享后缀 | 多一层 DNS 与 Access 配置 |

无域名模式只改 `frontend/wrangler.toml` 的 `workers_dev = false → true`（`preview_urls` 继续关）。
**以后绑定自定义域名时记得改回 false**，否则那条 workers.dev 地址会一直保留，成为绕过域名级策略的入口。
下文第 1–4 步两种模式通用；第三节的「自定义域名 + Access」只针对自定义域名模式，无域名模式跳过它，
改用强随机口令（`openssl rand -base64 32`）并在怀疑泄露时轮换。

**为什么选这个形态，以及它的边界**：前后端在代码里是分开的，省掉的只是"一台一直开着的机器"
（容器 / Nginx / 进程守护 / 系统补丁 / 备份作业），`git push` 即部署，整套跑在免费额度内。
免费版的硬额度是这些，本站所有批量上限都从它们算出来：

| 额度（Workers 免费版） | 数值 | 本站对应 |
|---|---|---|
| Worker 请求 | 10 万次/天（**静态资产不计入**） | 每次 API 调用与深链 HTML 注入各算一次 |
| CPU | 10 ms/次调用 | 重活必须切小批次；解析大 README 也算 CPU |
| 子请求 | 50 个/次调用 | GitHub 同步上限：不开文档 10 件、抓文档 2 件（见第八节） |
| D1 查询 | 50 次/次调用 | 一次 pageview 落 7–9 条聚合语句 |
| D1 读写 | 500 万行读 / 10 万行写 每天 | ≈1.1 万 PV/天 触及写入顶 |
| D1 存储 | 单库 500 MB（账号合计 5 GB） | 台账只存按天聚合，远未接近 |
| Cron Triggers | 5 条/Worker | 用掉 1 条：每日清理 90 天前的访客去重索引 |

超出额度的表现是**请求失败**（`1027` 超日请求数、`1102` 超 CPU、子请求超限则调用被平台掐断），不是扣费。
因此取向一直是"压低放大倍数"：公开端点代码限流（写入侧 `/api/usage` 是 isolate + Cache API 两层，读侧只有
isolate 一层；不依赖付费 WAF）、
台账不存单次访问行、文档抓取一次只处理两个仓库、图片转码借免费第三方服务且失败 302 回原图。
什么时候这套不合适：长跑任务、大文件读写（该用 R2）、多页服务端渲染、需要自己控制的关系型数据库。

### 1. 创建 Cloudflare D1 数据库（免费）
在终端运行：
```bash
npx wrangler d1 create nestspace-prod
```
控制台将输出类似以下信息：
```text
[[d1_databases]]
binding = "DB"
database_name = "nestspace-prod"
database_id = "xxxx-xxxx-xxxx-xxxx"
```
将该 `database_id` 填入 `frontend/wrangler.toml` 中的 `database_id` 字段并提交。
（`frontend/wrangler.toml` 是全仓库唯一的 Worker 配置——Git 构建与本地 `wrangler dev`
都读取它；D1 绑定写在配置里即可，**无需**再到控制台手动添加绑定。）
仓库里这一行现在是站长自己的生产库 id，接手前先换成自己的：`database_id` 不是凭据（没有账号权限
谁也读不到那个库），但留着它，`d1-migrate.sh remote` 会先去打别人的库、以权限错误收场。

---

### 2. 执行数据库初始化迁移
将建表语句与初始数据推送到远程 D1 数据库：
```bash
# 在仓库根目录一次性按序执行 migrations/ 下的全部迁移（生产）
bash scripts/d1-migrate.sh remote
```

脚本会按 `0001 → 0017` 的文件名顺序逐条执行、打印每条的 `✓ 已执行 / · 已记录，跳过 / ✗ 失败`，
并在结尾给出汇总；**已经应用过的迁移（重复的 ADD COLUMN、已存在的表）会被识别为跳过而不是报错，
因此可以反复执行**。只有真正的错误（SQL 语法、约束冲突等）才会以非 0 退出并点名失败文件。
需要指定库名时：`bash scripts/d1-migrate.sh remote nestspace-prod`。

两条使用前提：

- **wrangler 是仓库依赖，不再是"机器上装没装"的问题**：`frontend/devDependencies` 钉了 4.148.0，
  `pnpm install` 后脚本会优先用 `frontend/node_modules/.bin/wrangler`；只有还没 install 时才回落到 PATH 上的全局版本。
  手册里手动命令写成 `npx wrangler …` 也会优先命中本地那份。
- **老库（此前手工逐条迁移过、`_migrations` 表是空的）首跑会被拒绝**：脚本检测到 `projects` 表已存在却没有任何
  登记记录就会退出，避免把 17 个文件在生产库上从头跑一遍。核对结构确实已是最新后，
  登记一次基线即可：`bash scripts/d1-migrate.sh remote --baseline`（只登记、不执行；遇到结构未落地的文件会
  明确拒绝登记并 exit 1）。

**不要压扁迁移历史**：`_migrations` 按**文件名**记账，把 `0001–0017` 合并成一个新文件后，生产库里这个名字
从没被登记过 ⇒ 脚本会当成未执行真的跑一遍。而且不会有任何东西挡下来：建表全是 `CREATE TABLE IF NOT EXISTS`，
`ALTER TABLE ADD COLUMN` 撞已存在的列会被脚本认成"结构已在"放过——于是这一趟变成一次没人监督的生产库实验。
只有在**全新数据库**上才应该用单份 schema 快照替代历史。

**顺序要求**：迁移必须先于 Worker 代码生效。新版 Worker 引用了这几批新列，任何一批没先落到生产库就部署代码都会失败——**写路径由 `writeColumnErrorResponse` 翻成 400 并点名缺的那一列**（项目新建/更新、站点文案、逐仓库导入、同步的逐行失败都接了），**读路径用的是显式列清单，缺列仍是 500**。（`0015` 是纯数据迁移：不引入新列、代码不依赖它，单独跑或补跑都不会让任何请求失败。`0016` 是新建表：公开站不受影响，但 `/api/usage` 的统计写入会被静默丢弃、`/api/admin/visits` 会明确返回 503 并点名 0016。）

| 缺哪批 | 引用的代码位置 | 表现 |
|---|---|---|
| `0005` 底部栏文案 | `site_settings` 写白名单（`footer_*`） | 「站点设置」保存报 **400 并点名缺的那一列**（读侧是 `SELECT *`，只会静默回退默认文案） |
| `0006` 展示偏好 | `site_settings` 读写白名单 | 「站点设置」保存报 **400 并点名缺的那一列** |
| `0007` 标本文档 | 公开详情路由的 SELECT（`readme_zh` 等） | `GET /api/projects/:id` 每条都 500，详情页文档区退化为空 |
| `0008` 演示入口 | 项目的读路径与写路径 | 管理端保存项目报 **400 并点名该列**（`demo_url` / `demo_enabled`） |
| `0009` 馆长手记 | `site_settings` 写白名单（`curator_*`，`worker/index.ts` 映射表） | 「站点设置」保存报 **400 并点名缺的那一列**（读侧同样静默回退，所以只有保存才暴露） |
| `0010` 预览图 | 项目列表/详情的 SELECT 与同步写路径 | `GET /api/projects` 每条都 500（列表 SELECT 引用了不存在的列），首页与陈列整体空白 |
| `0011` 双语叙述 | 项目列表/详情的 SELECT 与管理端写路径 | 列表/详情仍是 500（读路径用的是显式列清单）；「挑战 / 解决方案」保存报 **400 并点名 `challenge_json` / `solution_json`** |
| `0012` 标本协议 | 公开列表/详情的显式 SELECT（`license`）、管理端写路径与同步写路径 | `GET /api/projects` 每条都 500（首页与陈列空白）；**写路径不会 500**——缺列被 `writeColumnErrorResponse` 翻成 `400` 并点名是哪一列、提示去跑 `d1-migrate.sh remote` |
| `0013` 详情页小标题 | `site_settings` 写白名单（`challenge_headline_*` / `solution_headline_*`） | 「04 详情页文案」保存报 **400 并点名缺的那一列**（读侧 `SELECT *`，只会静默回退内置文案） |
| `0014` 栏目与页面文案 | `site_settings` 写白名单（`section_copy_json`） | 栏目文案卡保存报 **400 并点名 `section_copy_json`**；读侧同样静默回退内置标题，所以只有保存才暴露 |
| `0016` 访问台账 | `/api/usage` 的 D1 写入、`GET /api/admin/visits` | 公开站与 204 行为不受影响；统计写入被静默丢弃，管理端「访问统计」明确 **503** 并点名 0016 |
| `0017` 馆长姓名 | `site_settings` 写白名单（`curator_name`） | 「03 首页栏目」保存站点文案报 **400 并点名 `curator_name`**；读侧是 `SELECT *`，缺列只是姓名回退内置默认，公开站不受影响 |

> ⚠️ **顺序是硬约束，而且 Git 自动构建不会替你把关**：第 4 节的 Workers Builds 是"push 即部署"，
> 一旦你为了跑迁移而先 push 了代码，部署就已经发生了。正确顺序是
> **先 `bash scripts/d1-migrate.sh remote` → 再 push/部署**。
> 反序的实际表现（实测，不是推测）：`no such column: challenge_json` →
> `GET /api/projects` 与详情接口 500 → 首页不报错，但公开列表变为空并显示一句
> 「馆藏尚未公开任何标本」的空状态（内置演示标本只作**首屏占位**，接口不可达时也继续显示；
> 只有当服务端**明确回报**空馆藏（200 + `[]`）时，才显示这条空状态而不是拿演示数据顶着说"有数据"），
> 详情页里已发布 id 仍显示陈旧内容、其它 id 显示"未找到标本"，管理端保存项目被拒（写路径缺列一律 400 并点名该列）。
> 这类"接口全 500 但页面还在跑"的形态比白屏更难发现，所以 `test/sync_update.test.mjs` 的 case 17f 已经把
> **代码引用的列 ⊆ migrations/ 声明的列** 钉成闸门（含反向验证：喂一个不存在的列会红）。

---

### 3. 配置管理员安全口令（Secrets）
在 Cloudflare 边缘环境注入安全密钥，**任何代码中都不会明文暴露**：
```bash
# 先生成高强度随机密钥（32 字节，直接使用输出值）
openssl rand -base64 32

# 注入到 Worker（在 frontend 目录执行，自动读取 wrangler.toml 的项目名）
npx wrangler secret put ADMIN_SECRET_KEY
# （可选）注入 GitHub Personal Access Token，避免公共 IP 60 次/小时速率限制并支持私有仓库导入
npx wrangler secret put GITHUB_TOKEN
# 如需 preview 环境也可用密钥联调，可在控制台 Settings ➔ Variables 为 Preview 一并添加
```
> 注意：请使用 32 字节以上纯随机字符串作为 `ADMIN_SECRET_KEY`。不要使用人类可记忆的模式化口令
> （如 `Curator_NestSpace_2026!#`），防止被在线暴力破解。

---

### 4. 连接 Git 仓库进行自动构建部署（Workers Builds 向导）
1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/) ➔ **Workers & Pages** ➔ **Create** ➔ 导入仓库 `AtaraxyEcho/NestSpace`。
2. 关键配置：
   - **Project name**：`nestspace`
   - **Root directory（根目录）**：`frontend`（Advanced settings 中设置，关键）
   - **Build command**：`pnpm run build`（仓库只有 `frontend/pnpm-lock.yaml`，构建环境的包管理器按锁文件识别为 pnpm；写 `npm run build` 与 CI 口径不一致）
   - **Deploy command**：保持默认 `npx wrangler deploy`（Workers 形态开箱即用）
   - **Enable Preview builds**：保持关闭（`frontend/wrangler.toml` 的 `preview_urls = false` 刻意不留预览入口；确需预览见下方安全说明，必须同时加 Access 且注意默认连同一个 D1）
   - **Protect with Cloudflare Access**：开启（保护 preview 部署，不影响公开生产站）
3. D1 绑定由 `frontend/wrangler.toml` 声明，Git 构建自动生效，无需控制台手动绑定。

**主机名要求**：见本节开头的形态对照——默认配置（`workers_dev = false`）下部署完没有可访问 URL：
要么绑自定义域名（管理端子域随之成为必需），要么打开 `workers_dev` 走无域名模式（后台就地渲染）。

---

## 三、 管理端防护：代码层鉴权 + Zero Trust + 暴露面收敛

管理 API（`/api/admin/*`）由三层防线共同保护（下表末行是叠加在上面的失败限流），完成以下配置后全部生效：

| 防线 | 层级 | 拦截对象 |
|---|---|---|
| Bearer `ADMIN_SECRET_KEY`（常量时间比较） | 代码层 | 一切未持密钥的调用，含 workers.dev / preview 等任意入口 |
| Access JWT 签名校验（`Cf-Access-Jwt-Assertion` 头或 `CF_Authorization` Cookie） | 代码层 | 伪造身份头——明文头一律不信任，只认通过 RS256 签名验证的 JWT |
| Zero Trust Access 边缘拦截 | 边缘层 | 让未认证请求根本到不了 Functions |
| 鉴权失败限流 | 代码层 | 同一来源（`CF-Connecting-IP`）在 **10 分钟窗口**内累计 10 次**错误口令**后返回 `429` + `Retry-After: 600`；**什么都没带的走 401、不计数**，过期/伪造的 Access 令牌也不计——锁定判据在凭据校验之后，正确凭据永远不会被锁在外面。计数器活在 Worker isolate 内存里（每个机房各一份），属尽力而为的抑制手段，**不能替代强口令** |

**只开密钥、不开 Access 时，边界是什么**：密钥本身不会泄漏——它存为 Worker secret、不进仓库与响应、
比较是常量时间（先各自 SHA-256 再逐字节异或，长度旁路也被抹平）。但它是**长期有效的静态口令**，
没有过期与自动轮换；前端把它放在当前标签页的 sessionStorage，任何 XSS 都能读走；失败锁定只在
单个 isolate 内计数，多 IP / 多机房轮换不受约束——安全性因此完全取决于熵（用
`openssl rand -base64 32`，256 位）。Access（免费档 50 用户以内）把管理端从"公网 + 一个口令"
变成"先过身份、再谈口令"，Worker 里的 JWT 校验是代码层第二防线；不用 Access 时，请把轮换当成
常规动作，而不是事故后的补救。

另有一条**防跨站写入的纵深**：控制台在"已被 Access 放行、没输过口令"时是**纯 Cookie 认证**
（凭 `CF_Authorization`），此时一个跨站页面发出的简单请求也可能带上它。所以管理端**写操作要求
`Content-Type: application/json`**，否则一律 `415`（跨站表单发不出这个类型；而带 `Authorization`
头的调用天然免疫 CSRF，因为跨站 JS 设不了这个头）。这条只有在 `CF_Authorization` 被设为
`SameSite=None` 时才是必需的——但由于该属性由边缘下发、代码里看不到，索性一直开着。

**代码层的按 IP 限流**（`worker/index.ts`）有两种桶，**覆盖面不同，别当成"所有公开端点都两层"**：

- **isolate 内存桶**（`createRateLimiter`，每个实例各一份）：所有公开端点都有——`/api/usage` 120/分钟 +
  1000/天（超出静默 204，不打扰访客）、`pageview` 另有一道 30/分钟（一次 pageview 要写 7–9 行 D1）、
  公开读接口 `/api/projects`（列表与详情）与 `/api/site-settings` 共用 240/分钟（超出 `429` + `Retry-After: 60`；
  一次浏览正好是这三条）、`/api/img` 300/分钟（图片一页要十来张，给得更宽；被限的表现就是那张图裂掉，
  客户端有 `imgfail` 埋点兜着）、HTML 240/分钟。
  键空间有上限且**装满时是放行而不是拒绝**（宁可漏记也不无界增长）：分钟桶 2000 个键（窗口 60 秒会自己清空），
  日桶单独给到 `USAGE_DAILY_STORE_MAX = 50000`——窗口是 24 小时，2000 个键在一个忙 isolate 里一天就满了，
  满了之后日配额形同不存在，所以按"一个 isolate 一天可能见过多少来源 IP"重新算过。
- **Cache API 桶**（`allowCachedRate`，同 colo 内共享、免费、不占 D1/KV 配额）：接在放大倍数最高的入口——
  `/api/usage` 的分钟与日桶、`pageview` 的分钟桶，以及 `/api/img` 的分钟桶（每次未命中都要借第三方转码）。
  其余读接口每次只是查询，没有第二层。
  闸门 `test/usage_stats.test.mjs` 用桩 Cache 钉住了它的三种分支（累加到上限拒绝 / 换 name 或桶就重新计 /
  缓存缺失与写失败一律放行不上抛）。**注意这条证据的边界**：桩只证明"缓存存在时这层算得对"，
  不证明"生产上 `caches.default` 真的在"——后者要靠一次真实观测，别把它当已验证。

请求体也各有一道闸：`/api/usage` 1024 字节（先按声明的 `Content-Length` 拒 `413`，再按真实字节数边读边停），
管理端 2 MB（超出与不可解析同样返回 `400`，由调用方话术兜着）。

共同前提要说清楚：isolate 桶只活在当前实例，Cache API 桶只在同一个 colo 内共享且是"读改写"（会少计），
所以它们挡的是"同一来源的脚本化连打"，不是分布式压力。跨机房、IP 轮换的那一类要靠边缘速率规则，
而那是付费项、不在本方案内 ⇒ 这条边界保持敞开，靠强口令 + Access + 只读公开接口 + 聚合表基数防线兜着。
阈值都留了十倍以上余量，正常访客碰不到。此外，登录页在**没有 `admin.` 兄弟域**的环境
（本地、IP 直连、`*.workers.dev` 预览域）会多出一条警示：那里没有 Access 那一层，后台只剩口令。

### 1. 配置独立管理子域名与 Access 应用（主流金标方案）

为彻底杜绝公开主站与管理端的跨站风险，推荐将管理控制台部署在专属子域名。
**约定只有一个：管理端是主域的 `admin.` 兄弟域**——代码里不写死域名，
前后台互跳的地址都按当前访问的 hostname 推导（`admin.X` ↔ `X`，见 `App.tsx` 的
`publicSiteOrigin()` / `adminSiteOrigin()`），所以下文用本项目的 `nestspace.online` 作示例，
换成你自己的主域即可，不必改代码重新构建。

**这不是可选项，而是代码的假设**：`hasAdminSibling()` 只看 hostname 的形状——任何真实域名都认为存在
`admin.<主域>`，公开站上的 `/admin` 会被 `location.replace()` 跳过去。所以只部署主域、不绑 `admin.`
子域时，后台在那个域名下**不可用**（本地、IP 直连、`*.workers.dev` / `*.pages.dev` 是例外：没有兄弟域，
会就地渲染后台）。想让后台与公开站同域，需要改 `hasAdminSibling()` 的判据，而不是改某个配置项。

1. **添加 DNS 记录**：
   - 进入 Cloudflare 控制台 ➔ `nestspace.online` ➔ **DNS** ➔ **Records**。
   - 添加记录：
     - **Type**：`CNAME`
     - **Name**：`admin`
     - **Target**：`nestspace.online`
     - **Proxy status**：开启 **Proxied（橙色小云朵）**
2. **在 Worker 绑定该自定义域名**：
   - 进入 **Workers & Pages** ➔ `nestspace` ➔ **Settings** ➔ **Domains & Routes**。
   - 点击 **Add Custom Domain**，输入：`admin.nestspace.online`，等待生效。
3. **创建 Zero Trust Access 拦截应用**：
   - 登录 Cloudflare Dashboard ➔ 左侧菜单点击 **Zero Trust**。
   - 进入 **Access** ➔ **Applications** ➔ 点击 **Add an Application**：
     - 选择 **Self-hosted（自托管）**。
     - **Application name**：`NestSpace Curator Console`。
     - **Application domain**：
       - **Subdomain**：`admin`
       - **Domain**：`nestspace.online`
       - **Path**：**留空**（整站全锁定保护）。
   - 配置策略（**Policies**）：
     - Policy name：`Admin Only`，Action：`Allow`。
     - **Include 规则**：选择 **Emails** ➔ 填入**你的私人邮箱**。
   - 在应用详情页记录 **AUD Tag**（应用基本信息中可见），下一步要用。

**防护与交互效果**：
- 访客在公开主站 `https://nestspace.online` 浏览作品，若手动敲入 `/admin`，前端会自动重定向至 `https://admin.nestspace.online`；
- 访问 `https://admin.nestspace.online` 时，整站直接被 Cloudflare 边缘节点拦截并弹出邮箱验证码登录页；
- 验证通过后浏览器写入 `CF_Authorization` Cookie，页面自动进入馆长控制台，点击「← 返回公开站点」自动跳回主站；
- 未授权者在最外层 CDN 即被拦截，连后台前端与 API 的一个字节都无法获取。

### 2. 配置 JWT 校验环境变量（代码层第二防线）

在 **Workers & Pages ➔ nestspace ➔ Settings ➔ Variables and Secrets** 中，
为 **Production（和 Preview）** 添加：

| 变量名 | 值 | 说明 |
|---|---|---|
| `ACCESS_TEAM_NAME` | 你的 Zero Trust 团队名 | 即 `<team>.cloudflareaccess.com` 中的 `<team>`，在 Zero Trust 控制台 Settings ➔ Custom Pages 可见 |
| `ACCESS_AUD_TAG` | 上一步记录的 AUD Tag | |
| `ACCESS_ALLOWED_EMAILS` | 可选：允许进入管理端的邮箱或 sub（逗号分隔） | **未配置 = 放行**——它是可选的"收紧"，不是主闸门（主闸门是 Access 应用策略，且 JWT 的 RS256 签名 + `aud` 已保证身份来自本应用，伪造不了）。**只有两种情况才需要填**：① 该 Access 应用比管理端更宽（一份政策盖多个应用 ⇒ 同一 `aud` 下还有非管理员）；② 担心日后有人无意放宽策略 |
| `ALLOWED_ORIGINS` | 可选，公开**读**接口的跨域白名单：只注册在 `/projects` 与 `/projects/*` 两条路由上 | 逗号分隔的完整 origin；不配置则不下发跨域头（同源请求不受影响）。`/api/site-settings`、`/api/usage`、`/api/img` 不带这层中间件 |

配置后，后端会验证 Access 签发 JWT 的 RS256 签名及 `iss` / `aud` / `exp` 声明，
并在配置了 `ACCESS_ALLOWED_EMAILS` 时把 JWT 载荷里的 `email` / `sub` 与该名单比对（未配置则不比对，
因为此时"谁能拿到本应用的 JWT"已经由 Access 策略决定）。
**安全红线：`Cf-Access-Authenticated-User-Email` 等明文身份头可在任何未被 Zero Trust
覆盖的入口被客户端伪造，代码层一律不作为凭据。** 若这两个变量未配置，管理 API 仅接受
Bearer 密钥——同样是安全的默认状态（fail-closed）。

配置生效后，已通过 Access 验证码验证的浏览器访问管理后台时会自动携带
`CF_Authorization` Cookie，无需再输入口令即可进入；本地开发或其他浏览器仍可输入
`ADMIN_SECRET_KEY` 进入。

### 3. 关闭未受保护的入口（重要）

**经典的应用级 Access 只对配置的自定义域名生效。** 走无域名模式时没有可关的 workers.dev 入口（它就是唯一地址），
此时要么接受"只剩口令"，要么改用 Cloudflare 的 **Worker 级 Access**（策略绑在 Worker 上，可覆盖自定义域、路由、
`workers.dev` 子域与预览 URL）。注意：本项目代码按**经典应用级 JWT**（`ACCESS_TEAM_NAME` + `ACCESS_AUD_TAG`）校验，
Worker 级 Access 下令牌形态是否仍带同样的 `iss`/`aud` **未经实测**，接入前先用一次真实请求确认，
否则会出现"边缘放行了、Worker 仍判 401"的假故障。

以下入口在自定义域名模式下默认不在保护范围内——即使代码层防线已能拦截，也应关闭暴露面，不给出任何试探机会：

1. **`nestspace.<你的子域>.workers.dev` 默认域名**：自定义域名上线后，在 Worker 的
   **Settings ➔ Domains & Routes** 中停用 workers.dev 域名；
   若需保留，则为该域名单独创建一个 Access 应用兜底。
2. **Preview 部署**：仓库默认 `preview_urls = false` / `workers_dev = false`，不生成任何绕过自定义域名的入口
   （README 已说明这是刻意的）。若你手动开启：必须给 preview 域名单独加 Access，并注意 preview 环境默认连接
   **同一个 D1 数据库**——写操作会直接影响生产数据；要隔离就另建库。
3. **速率限制（建议，先确认套餐）**：在 **Security ➔ WAF ➔ Rate limiting rules** 里配规则
   （例：1 分钟内每 IP 超过 60 次就质询或拦截；`/api/admin/*` 可以更严，如 1 分钟 10 次）。
   免费版**是否包含**这条规则各账号/时期并不一致——控制台里看得到就配上；看不到也不必为此升级套餐：
   代码层已按 IP 做了尽力而为的限流（见第三节「代码层的按 IP 限流」那段，它挡的是脚本连打，不是分布式压力）。

---

## 四、 本地全真模拟测试命令

在本地使用 wrangler 进行全仿真运行（Worker + 静态资产 + 本地 D1 数据库）：

**同一套代码，本地与生产有这些行为差异**（排查"本地好好的、线上不对"时先对照）：

| 维度 | 本地（`wrangler dev`） | 生产（自定义域名） |
|---|---|---|
| 后台入口 | `http://localhost:8787/admin`，**就地渲染** | 公开站 `/admin` 会跳到 `admin.<主域>`；该子域不绑定则后台不可用 |
| 数据 | `.wrangler/state` 里的本地 D1 | 远程 D1；迁移必须单独跑 `d1-migrate.sh remote` |
| 密钥 | `frontend/.dev.vars`（不进仓库） | `wrangler secret put`（不进仓库） |
| 资产 | 服务 `dist/` 快照，改完必须先 `pnpm run build` | Workers Builds 每次构建后部署 |
| Cron | 不自动触发；`curl http://127.0.0.1:<端口>/cdn-cgi/local/scheduled` 手动跑 | 每天 03:17 UTC 自动执行 |
| 退出统计偏好 | 退回 localStorage（没有共享父域可写 cookie） | 跨子域 `Domain=<主域>` 的功能性 cookie |
| Access | 没有，只剩口令 | 建议开启（admin 子域由边缘整站拦截） |
| 可访问性 | 任意端口 | 必须有主机名；默认只认自定义域名（`workers_dev` / `preview_urls` 关闭） |

无域名模式（`workers.dev`）没有 `admin.` 兄弟域：后台入口和本地一样**就地渲染**，地址是 `*.workers.dev`；
其余差异（数据、密钥、资产、cron）与表里的生产列相同。

想要前端热更：另开一个终端跑 `pnpm run dev`（Vite 默认 8443，可用环境变量 `PORT` 覆盖；`/api` 代理到并行起的 8787，
可用 `WRANGLER_DEV_URL` 覆盖代理目标）。注意 `wrangler dev` 服务的是 `dist/` 快照，所以走 8787 之前必须先 `pnpm run build`。

页面级核对（版式、图标、某一行文案是不是真的渲染出来了）：`bash scripts/visual-check.sh` —— 自起 8899 的 dev、
无头 Chrome 取 DOM 与截图、断言顶栏 GitHub 图标 / 馆长姓名行 / `<title>` 非空，产物落在 `.tmp-visual/`，
结束后按端口收进程。它依赖本机装 Chrome，所以**不进 CI**。

```bash
# 进入 frontend 目录
cd frontend

# 0.（首次）生成本地开发环境变量：含本地管理员密钥，供 wrangler dev 自动加载。
#    .dev.vars 已被 .gitignore 忽略，密钥只存在于本机，与生产密钥完全无关。
cp .dev.vars.example .dev.vars
# 编辑 .dev.vars，将 openssl rand -base64 32 的输出填入 ADMIN_SECRET_KEY

# 1. 本地执行全部迁移（在仓库根目录，可与生产用同一条命令）
bash scripts/d1-migrate.sh local

# 2. 构建静态资产（Worker 的资产目录指向 dist，必须先构建；build 会先跑三套 tsconfig 的 typecheck）
pnpm run build

# 3. 启动 Worker 本地仿真服务器（自动挂载 dist、.dev.vars 和本地 D1）
npx wrangler dev
```
浏览器打开 `http://localhost:8787` 即可体验与云端完全一致的边缘全栈环境。

改动鉴权或证书校验逻辑后，运行安全回归：

```bash
# 全部 18 条闸门（纯函数、不联网；test_chain.test.mjs 核对"注册链 = test/ 目录"，漏登记会红）
pnpm test
# 前置：Node ≥ 22.18（`frontend/.mise.toml` 已钉 22）。单测直接 `import` .ts 源文件，
# 靠的是 Node 原生的 TS 类型剥离——22.6–22.17 不带 flag 会在 import 阶段就报错。

# Functions TypeScript 类型检查
pnpm typecheck

# 一条命令跑完的接口端到端探针（自己起 dev、自己收尾，只杀自己起的进程）：
#   健康检查 / 埋点端点的接受与拒绝（含白名单外事件）/ /api/img 三档是否真返回 webp /
#   管理端 PUT 的两条写路径与相册 400 话术（测完把 001 的两列原值写回）
# 端口固定在 8898（避开 8787），起 dev 前先探测该端口是否已被占用：占着就立即退出，
#   否则"等就绪"会拿到别人实例的应答、实测写进那一支的库，收尾还按端口把别人的 workerd 收掉。
#   要并行跑就换端口：PROBE_PORT=8897 bash scripts/usage-probe.sh
bash scripts/usage-probe.sh
```

> Windows/Git Bash 实测坑：`wrangler dev` 的父进程被杀后 **workerd 子进程可能仍占着端口**，
> 后续探针会打到"旧代码的幽灵"上（表现：路由明明存在却 404，或 D1 报 `no such table`）。
> 怀疑时先看 `netstat -ano | grep :<端口>`，只清理自己起的那些 PID。

### CI（`.github/workflows/ci.yml`）

push / PR 时跑的就是上面这三条：`pnpm run typecheck`（前端 + Worker 两套 tsconfig）、`pnpm test`（十八个纯函数闸门）、
`pnpm run build`。用 **pnpm** 不是风格问题：仓库里只有 `pnpm-lock.yaml`，`npm ci` 会直接 ENOLOCK 失败。
版本钉在 `frontend/.mise.toml` 的同一套（node 22 / pnpm 10.34.3）。

闸门里 `17f` 与 `18` 两条是 CI 真正的价值所在：**代码引用的列必须存在于 `migrations/`**、
**站点设置的三份清单（内置默认 / Worker 白名单 / 迁移列）必须双向对齐**。这两种错在本地全是运行时问题
（保存 500、或"保存成功但字段被丢弃"），只有钉进闸门才会在 CI 里被拦住。

两点刻意的取舍：
- **没有 `wrangler deploy --dry-run` 这一步**：wrangler 不在 `devDependencies` 里（本地用的是全局二进制），
  为它在 CI 单独装一次只会把这一步变成"能不能联网装工具"的噪声。要预检就在本地跑
  `npx wrangler deploy --dry-run`（实测不需要账号凭据，只打印解析后的绑定列表）。
- **CI 跑不了 `scripts/usage-probe.sh`**：它要起 Worker、要 `.dev.vars` 里的本地口令，也会写库。

本工作流在本机没有被"执行"过（没有 GitHub runner、且装依赖要联网），能验的都验了：YAML 可解析、
步骤里的三条命令在本地用 pnpm 逐条跑过并退出 0、`cache-dependency-path` 指向的锁文件真实存在。

---

## 五、 搜索引擎收录配置

站点的标题、描述与收录开关由 `frontend/.figma/make/site.json` 统一控制
（`vite.config.ts` 中的 figmaSiteConfiguration 插件在构建时注入到 HTML）：

```json
{
  "title": "NestSpace · AtaraxyEcho 的开源项目",
  "description": "AtaraxyEcho's personal open-source showcase: curated tools, experiments and long-lived systems with docs, tech stack and evolution notes. · github.com/AtaraxyEcho",
  "robots": { "index": true }
}
```

**站点身份文案有三份，改一处要想到另外两处**（2026-10-19 统一过一次，别再让它漂）：

| 落点 | 什么时候生效 | 字段 |
|---|---|---|
| `frontend/.figma/make/site.json` | **构建期**注入 HTML 的 `<title>` / description / og（后台没配 SEO 时就是它） | `title`、`description` |
| `frontend/src/data/defaultSiteSettings.ts` | 后台**留空**时的内置默认（首屏大标题、SEO 标题、页脚简介） | `heroZh` / `heroEn`、`seoTitle`、`footerBlurbZh` |
| 生产库 `site_settings` | 实际显示值，优先级最高 | `seo_title`、`seo_description`、`hero_zh`、`footer_blurb_zh` |

对外定位统一成「**AtaraxyEcho 的开源项目**」，不再用"标本馆/标本柜"这类站内隐喻出现在**站点名称位**
（栏目名与卡片标签里的「标本」保留，那是界面语汇）。后台改文案属于生产写入，由站长自己在
「03 首页栏目 / 08 站点设置 / 05 底部栏文案」里保存。

- `robots.index: true`：构建产物不再注入 noindex meta，也不再自动生成全站 Disallow 的 robots.txt；
- `frontend/public/robots.txt`：显式声明允许收录全站、屏蔽 `/api/`（JSON 接口无需进索引）；
- 未配置 `title` 时会回退为默认值 "Figma Make App"，改标题务必在 site.json 中改。

**收录范围说明**：站点用 **History 路由**，每个标本有自己的地址（`/project/001`）——
未命中具体路线时回退首页，并在页面头部注入相应的 canonical 与 og:url；
深链（`/project/*`、`/admin`）与首页一样经过 Worker 注入，所以爬虫与社交平台拿到的是同一份头部。
**旧地址仍然可用**：哈希路由时代分享出去的 `#project/001` / `#admin` 会在进站时被替换成路径地址。
`robots.txt` 允许全站（仅屏蔽 `/api/`）；没有 sitemap.xml —— 收藏量在几十件这个量级，
交给 Search Console 的常规抓取足够，为它维护一份生成器不划算。

**上线后加速收录**：在 [Google Search Console](https://search.google.com/search-console)
添加站点属性并请求编入索引；Bing Webmaster Tools 同理。

---

## 六、 站点文案与备案号管理（管理端）

主标题、副标题、关于文案、GitHub/邮箱、SEO 标题描述、**页脚备案号**与**底部栏文案**存储在 D1 的
`site_settings` 表中（迁移 `0003`，页脚文案字段见迁移 `0005`），通过管理端编辑保存后即时生效，无需重新部署
（入口按环境而定，见本节末「管理端入口」）：

**管理端按「页面」分栏，页面内按栏目分卡**（2026-10-10）：侧栏依次是
`01 馆藏总览 · 02 标头与导航 · 03 首页栏目 · 04 详情页文案 · 05 底部栏文案 · 06 项目管理 · 07 GitHub 同步 · 08 站点设置 · 09 访问统计`。

各栏管的东西（README 只留一句指针到这里，别再抄第二份）：

| 栏 | 管的东西 |
|---|---|
| 01 馆藏总览 | 最近更新、馆藏状态计数 |
| 02 标头与导航 | 导航项的顺序 / 名称 / 显示、Logo 图文与显示模式 |
| 03 首页栏目 | 首屏叙事、统计（指标 / 年鉴 / 描述行与开关）、馆长手记（**姓名** / 所在地 / 方向 / 引言 / 标题）、目录描述、GitHub 地址与联系方式 |
| 04 详情页文案 | 详情页的预览区 / 特征区 / 相邻标本三处标题，以及挑战·方案两段正文小标题 |
| 05 底部栏文案 | 页脚各栏与版权行，支持 `{name}` `{since}` `{year}` 模板变量 |
| 06 项目管理 | 每件标本的增删改与排序 |
| 07 GitHub 同步 | 按编号选择范围拉取仓库指标与文档（勾选后连同 README 里的图一起提取预览图） |
| 08 站点设置 | 展示偏好（语言 / 主题 / 开关）、页面标题与 Meta 描述、ICP 备案号、域名只读信息（联系方式与简介在 03 首页栏目，同一值只有一处编辑） |
| 09 访问统计 | 累计 / 近 7·30·90 天 PV·UV、热门页面、来源 / 设备 / 语言 / 地域、时段分布、行为事件与本设备排除开关（面板本身只读，不写库） |

「03 首页栏目」把原先散在三个视图里的首页四段配置收成一页，卡片顺序就是访客看到的顺序：
陈列 → 统计（指标 / 年鉴 / 该段描述）→ 手记（关于与联系 / 手记正文）→ 目录（该段描述），这一页只有一个保存按钮。
侧栏序号、页内 eyebrow 与顶栏标题同源（`src/App.tsx` 的 `ADMIN_NAV`，只维护一份）。
"按栏目分"指的是页面内分区，不是侧栏条目数；分栏只改 JSX 归属与编号，**状态字段与写路径没动**，
所有卡仍调同一个 `saveSettings`（PUT 只发与库里不同的顶层键）。

- **03 首页栏目**：主标题 / 副标题（陈列段）、关于文案 / GitHub 主页 / 联系邮箱、手记正文（手记段）、统计指标与年鉴、目录段与统计段的描述行；中英各一份，用页内语言页签切换；
- **站点设置 → 站点信息 / 搜索与分享**：SEO 标题与 Meta 描述（保存后动态应用到页面标题与描述）；
- **站点设置 → 备案信息 (ICP)**：**默认关闭**。填写备案号并开启开关后，页脚展示
  备案号并链接至工信部备案系统（默认 `https://beian.miit.gov.cn/`，可自定义）；
- **03 首页栏目 → 手记栏目文案**（迁移 `0009`）：栏目标签、引言（按语言切换）、主标题（每行一句，
  两种语言模式下都会显示）、中文尾注（斜体，留空则不显示）、HABITAT / FIELD 属性值；
  改名或改文案都在此完成，无需改代码。
- **按页面分开的「栏目与页面文案」卡**（迁移 `0014`，`src/utils/sectionCopy.ts`）：五个槽位存成一列 JSON
  （`section_copy_json`，键形如 `home.catalogue` / `detail.anatomy`），放的是补充文案——`home.*` 是标题下的
  描述行（内置默认为空 = 不渲染），`detail.*` 是详情页三处小标题（内置默认就是原文）。
  **首页栏目的大标题不在这里**：它就是「导航项控制」里的那个名称本身，改一次，顶栏、页脚章节列、栏目标题三处同变。
  两类槽位两套判据，不可混用：**并排显示**（`EN <em>/ ZH</em>`）的按语言各取、该语言空则回退**该语言**的
  内置默认；**按访客语言只显示一种**的走 `pickSiteHeading` 跨语言回退。混用会让"只填英文"的标题框把中文侧
  也顶成英文。闸门 `section_copy.test.mjs` 钉住同源、两类判据、"内置默认不许被 merge 进 state"（否则任何一次
  保存都会把默认烤进库，以后改默认再也传不下去）与超限点名。
- **04 详情页文案 → 详情页正文小标题**（迁移 `0013`，`src/utils/bilingual.ts` 的 `pickSiteHeading`）：
  详情页 FIELD NOTES 两栏 `THE CONDITION` / `THE RESPONSE` 下面的那两句标题，中英各一份、随访客语言切换。
  内置默认是 `Why it needed to exist.` / `A narrow tool, carefully shaped.`，中文默认留空 = 中文模式也显示这两句英文；
  两栏都留空则回退内置默认（清空 = 恢复默认，不是删掉标题；只敲空格同样算留空）。
  **这两句是唯一真源**：前台小标题与「06 项目管理」抽屉里那两栏正文的上排标注读同一个值，改完标题后台指称跟着变。
  栏名本身（`THE CONDITION` / `THE RESPONSE`）是排版语汇，不做双语、也不可配置——所以这张卡以它们为锚点，
  抽屉底部另有一条直达这张卡的入口（有未保存改动时只弹确认，不会把人带走）。
- **正文的换行与样式**（`src/utils/markdown.tsx` + `markdownLines.ts`）：**两套口径，不是一套全局行为**——
  挑战 / 方案正文用 `breaks`（单个回车就是硬换行，空行分段，`- ` 列表、`**粗体**`、`` `代码` `` 生效，
  抽屉里每栏下面的只读预览与前台同源）；README **保持默认口径**（源码按 80 列折行，句中换行不是排版意图）。
  全程 markdown → React 节点，**零 `dangerouslySetInnerHTML`**（闸门 `markdown.test.mjs` 4a/4b 按属性用法匹配钉着）。
  首页卡片简介仍是纯文本：它靠四行钳制控高，塞块级元素会把按钮顶出去。
- **项目管理 → 顺序**：表格每行的 ▲ / ▼ 直接调整公开站点与后台列表的展示顺序
  （按 `sort_order` 升序落库，只写顺序真正变化的行）；抽屉里的「排序权重」仍可手工指定数值。
- **底部栏**：中英文各一份，随访客语言切换。含品牌区小标与说明段落、三列标题、
  GitHub / 联系链接文字、Colophon 入口文字与底行版权行；文案支持 `{name}`（Logo 副标题署名）、
  `{since}`（馆藏起始年份）、`{year}`（当前年份）占位符；其中「章节导航列」的链接顺序、
  名称与显示状态直接跟随**02 标头与导航**的配置，改导航即同步改页脚；
- **08 站点设置 → 展示偏好**（迁移 `0006`）：默认语言（跟随浏览器 / 中文 / English）、默认主题
  （跟随系统 / 白日标本室 / 夜间标本室）、是否展示前台深浅色与语言切换按钮。**默认值等于既有行为**：
  语言与主题跟随访客浏览器与系统，两个切换按钮全部开启。「是否展示首页统计栏目」的开关在
  **03 首页栏目**的统计卡旁；关闭时同步从导航与页脚移除该入口，不留点不到的链接；
- **SEO 生效范围**：管理端保存的标题与 Meta 描述会即时改写浏览器内的文档标题，同时由边缘 Worker
  注入到首页 HTML 的 `<title>` / `description` / `og:*`（**因此不执行 JS 的爬虫与社交平台也能读到**；
  注入结果按 isolate 缓存 60 秒，保存后最多 1 分钟生效）。页面语言也会同步写入 `<html lang>`。
  `rel="canonical"` 与 `og:url` 在构建产物里**并不存在**，只有一行 `<!-- seo:origin-tags -->` 标记，
  由同一次注入按当前请求的 origin 换成绝对地址——因此换主域、上 preview 子域都不用改 `index.html`。
  （标记不能写成 `href="/"` 之类的相对地址：`vite:build-html` 会把根斜杠当站内资产去读文件，
  `pnpm build` 直接以 `EISDIR` 失败。）
- **首屏主题不闪**：展示偏好选「白日/夜间」这类**显式**值时，同一次注入把 `data-theme` 直接打在 `<html>` 上
  （这份 SELECT 顺带读 `default_theme`），第一帧就是对的，不用等 JS 起来；选「跟随系统」时不注入，
  由 `index.css` 里 `@media (prefers-color-scheme: dark)` 那一段兜底。两处深色取值必须一致
  （`test/shell_guards.test.mjs` 逐项比对，改一处忘另一处就红）。
  **社交分享图目前未配置**（站点没有 `og:image`）：要添加就把图片放进 `frontend/public/`，
  并在 `.figma/make/site.json` 声明 `openGraph.image`，重新构建部署后生效；后台不提供修改。
- **站点设置 → 域名与部署**：**只读信息卡**（当前访问域名、公开站点入口）。主域名、DNS 记录与
  管理端子域由 Cloudflare 部署配置决定，后台不提供修改；前后台互跳地址按当前 hostname 推导。

数据库字段为空时，公开站自动回退到 `frontend/src/data/defaultSiteSettings.ts` 的内置默认文案，
因此未做任何配置的部署也始终有完整可读的内容。**"空"按 trim 后判定**：只填空格等同于没填
（写侧 `PUT /api/admin/site-settings` 会裁掉首尾空白后入库，读侧 `mergeSiteSettings` 也把纯空白当空处理，
SEO 的 `seo_title` 同样如此——否则管理端敲一个空格就会把 `<title>` 覆写成空白）。

保存的语义有两条，都是为了让"默认值"保持是默认值：

- **只发改动的列**：管理端「保存并发布」PUT 的是与库里那份**不同的字段**（判据与项目抽屉共用
  `changedColumns`）。整份回传会把"当时套着的内置默认"一起抄进 `site_settings` 那一行，之后在代码里
  改默认文案就再也传不到线上（库值赢）。零改动时直接短路、不发请求。
- **超长值点名拒绝，不静默截断**：单个文本/JSON 字段上限 5000 字符，超了返回 400 并写明是哪个字段
  （`「heroEn」有 6000 字符，超过 5000 字符上限`）；截断后再回"已保存"就是假状态。
  上限常量在 Worker 里刻意**不导出**，原因见第七节末尾的 workerd 导出约束。
- **URL 列在写侧校验**：`githubUrl` / `icpUrl` / `logoImageUrl` 必须是 http(s) 绝对地址，否则 400 并点名字段；
  空串表示不显示（回退内置默认）。渲染侧另有一道 `settingsHref`，两道都留。

另有两点使用约定：

- **管理端入口**：公开界面（页头/详情页/页脚）不展示任何管理入口按钮。直接访问 `https://admin.你的域名`
  （建议收藏）；在公开站上敲 `https://你的域名/admin`（旧的 `#admin` 也认）会自动跳到该子域。**没有 `admin.` 兄弟域可用的环境**
  （本地、IP 直连、`*.workers.dev` / `*.pages.dev` 预览域）不做跳转，`/admin` 就地打开后台——
  判据是 `src/utils/siteHost.ts` 的 `hasAdminSibling()`，所以不存在"跳到不存在的域名"这种死链。
  这只是减少暴露面，真正的安全边界在管理 API 层（见第三节三层防线）。
- **GitHub 同步**：管理端「07 GitHub 同步」按各项目的仓库地址调用 GitHub 公开 API，
  把最新 stars / 推送时间 / Release 版本写回 D1。公开仓库无需任何 Token；**私有仓库
  在匿名 API 下不可见（会如实显示 404）**。如需同步私有仓库或提高速率限额，可配置
  `GITHUB_TOKEN`（`npx wrangler secret put GITHUB_TOKEN`），或在管理端「GitHub 同步」里临时填入
  Token（只走请求头，不进 URL）。
  同步为**串行**执行（刻意不并发，避免对匿名 API 造成突发压力）；一旦某个仓库返回 `403`
  （频率超限）**立即停止后续请求**，其余标本标记为"已跳过"而不是逐个白白重试；仓库列表接口
  最多取 3 页（300 个），超出时管理端会明确提示"仅列出最近更新的 N 个"；项目列表类查询带
  `LIMIT 500`（`QUERY_ROW_LIMIT`）安全阀（当前馆藏规模远低于该值）。
  **每次调用最多处理 10 个标本；开启「同时抓取 README / Compose 文档」时最多 2 个**——
  上限是从免费版 Workers **每次调用 50 个子请求**（GitHub fetch 与 D1 查询都计入）算出来的：
  一行不开文档最坏 3 个（仓库 + releases + 写库），开文档最坏 20 个（README 中英/通用与两个
  Compose 的候选路径逐个探测），故 10×3+2=32、2×20+2=42。超过就会在循环中途被平台掐断，
  留下"已写几行、后面的行没有结果"的半更新状态；因此接口在**任何写入之前**返回 400，让管理端分批操作。
  `frontend/test/sync_scope.test.mjs` 用导出的 `syncRowCost` 钉住这套算术，改动候选路径或上限都会红。
- **同步的字段归属**（迁移 `0007/0008/0012` 之后）：
  - **GitHub 权威、每次覆盖（空值也写回）**：`stars`、`updated`、`version`、`language`、`date`/`year`（仓库创建时间）、
    `metrics_json`（STARS / FORKS / OPEN ISSUES）、`features_json`（仓库 topics，前 4 个）、
    `timeline_json`（按仓库事实生成：建档 / 最多 4 个 Release / 最近推送，按月倒序，最多 8 条）；
    管理端「Stars 展示值 / 版本 / 技术语言 / 年份 / 采集月份 / 最近更新 / 特性列表 / 指标」这些输入框
    因此会被同步覆盖（空值也会写回），界面已逐项标注。
  - **编辑所有、只在空白时填充**：`description_json`、README/Compose 文档与预览图（项目图片 `preview_image_url` + 相册 `preview_images_json`）、
    以及**开源协议 `license`**（迁移 `0012`，管理端「项目管理 → 编辑 → 开源协议」可填，展示在首页标本卡片右下角）；
    后台手写内容一律不覆盖。
    「空」= 待填：主动清空后下次同步会重新自动填充。
    > 协议取自仓库响应里的 `license.spdx_id`（`GET /repos/{owner}/{repo}` 已带，**不额外发请求**）；
    > GitHub 识别不出协议时的 `NOASSERTION` 与我们认不出的情形都不写；没有 LICENSE 文件时该字段为 `null`，同样不写。
    > 为什么不让同步覆盖：协议是"作者怎么授权"的声明，不能让一次同步替作者改口。
  - 星数展示口径统一为一份实现（≥1000 用 `2.8k`），卡片与指标卡不会再出现 `2.8k` 与 `2800` 并存。
- **无 Release 的项目**：`version` 保持空串（手动新建与同步都不再编造 `v1.0.0`），前台会省略版本位而不是显示空占位。
- **删除标本会连带删掉按编号聚合的台账行**（`visit_page_day` / `visit_event_day`）：不清理会让「热门页面」
  永久保留已删标本，而新标本按 `max+1` 复用该编号时还会继承它的历史统计。
- **同步的健壮性**：所有 GitHub 出网请求带 10 秒超时（含 Access 证书端点），单个卡住的响应不会拖住整个同步；
  响应里回传 `rateLimitRemaining`，管理端在同步/扫描提示里显示"GitHub 剩余额度"；
  403 会结合配额头与响应体区分"频率超限"与"该仓库被拒绝"，只有确认限流才短路后续请求；
  四个文档都已齐备的项目**跳过文档抓取**（原来每个项目都会空跑一遍候选路径，最多 17 个请求，见 `syncRowCost`）。
- **标本文档抓取**（迁移 `0007`）：同步界面勾选「同时抓取 README / Compose 文档」后，按仓库
  `README.md`（辅以 `README.en.md` / `README.zh*.md` / `README_en-US.md` 等具名文件）与
  `deploy/dev|prod/docker-compose.yml`（辅以根目录 `docker-compose.yml`）抓取正文：
  - 通用 `README.md` 按**正文是否含中文**决定写入 `readme_zh` 还是 `readme_en`，避免英文说明串进中文字段；
  - 单份文档超过 100000 字符会被截断，避免单行过大触及 D1 单行上限；
  - 与描述同步同一原则：**只填充空白字段，绝不覆盖后台手工整理过的文档**；一个文件都没抓到时如实提示
    （仓库无对应文件或已达 GitHub 匿名 API 频率限制），不会假称"已存在"；
  - 导入新标本时同样抓取一次；文档也可在「项目管理 → 编辑」的四个文档编辑框中手工维护。
- **详情页预览图**（迁移 `0010`）：详情页 OVERVIEW 顶部有一块「PREVIEW / 01」观察台相册，展示项目截图。
  数据分两列且**互不等价**：**项目图片** `preview_image_url`（显式字段，作用范围见下面「两个字段互不兼任」那条）
  与**相册** `preview_images_json`（观察台用，有序数组）。管理端有四个入口：「项目图片」输入框
  （含「用相册第一张填入」捷径）、「预览图」多行文本框、「按目录批量导入」，以及同步时从 README 自动提取。
  **公开列表与公开详情都返回这两列**：`ProjectRoute` 会先用列表项当初始值渲染详情页，列表若只给项目图片，
  相册会在详情到达前短暂只显示一张（无导航）。README/Compose 文档仍只在详情接口返回。
  - **位置**：预览区在 **OVERVIEW 面板内**，切到 README / DEPLOYMENT 时不会看到它；
    hero 右栏有项目图片时显示它（相框按图片自身比例自适应，夹在 `[0.8, 2.2]`），该项为空才退回占位标本图。
  - **自动提取**：同步（含勾选「同时抓取文档」的全量同步）会把 README 里的**全部真实截图**（`![](…)` 或
    `<img src=…>`）按出现顺序解析出来；**跳过 shields.io / badge 等徽章**，**位图优先于 SVG 矢量图**，去重、
    **最多 12 张**；相对路径按仓库默认分支拼成 `raw.githubusercontent.com/<owner>/<repo>/<branch>/<path>`，
    已是绝对地址的保留原值，`data:` / `javascript:` 等内联资源一律忽略——**提取不到就留空，绝不编造**。
  - **只填空、不覆盖**：与描述、文档同一原则——两列都只在**为空**时填充；已有项目图片/相册的项目同步时不会被改写。
    同步时给项目图片补的是 **README 里提取到的首张图**（不是"相册第一张"；相册本就非空时两者可能不同）。
    `github-import` 新建标本时项目图片一律留空，不代替用户做选择。
    注意语义是「空 = 待填」：**主动清空项目图片或相册后，下次同步会重新自动填充**；若想彻底不用自动图，
    请在字段里填自己的地址，而不是留空。
  - **写入是严格的，不静默降级**：管理端保存相册/项目图片时任一非法条目都返回 **400** 并点名第几行、什么原因
    （缺协议、非 http(s)、重复、超过 12 张），**绝不"丢掉坏行后回成功"**——那会让后台显示"已保存并同步到 D1"
    而库里实际少图，是本项目在演示入口上已经定过的红线（宁 400 不降级）。
    两列各自只在"请求体里出现该键"时才写，所以只改相册不会把项目图片抹掉（部分更新语义）；
    写侧不做任何"空项目图片→取相册第一张"的推导（那是假状态来源，见下面「两个字段互不兼任」那条）。
    POST 与 PUT 共用同一条规则（`validatePreviewInput` + `previewFieldsFromBody`）——
    同一请求体在两条路径必须落库一致（`demoUrl` 就踩过两条路径不一致的坑）。
    读取侧仍保持宽容：绕过 Worker 直接写库的脏值不会让接口 500，只会被过滤掉。
  - **版面**：观察台是 3D 封面流（`perspective: 1800px` + `preserve-3d`，四张牌 active / next / previous / back），
    画框按**当前那张**的自身宽高切换横板 / 竖板（横图桌面 `min(720px, 80%)`、竖图 `min(230px, 36%)`，
    高度固定 `min(72%, 420px)`），一律 `contain` 不裁切截图；方向不入库，由 `<img>` 解码后的
    `naturalWidth/naturalHeight` 得出并按张序缓存，挂载时补查一次 `img.complete`（缓存命中会早于 `load` 监听器）。
    **≤760px 不用这套封面流**：只显示当前张，邻位信息交给索引条（它是确定可见的，不依赖 3D 残片）；
    侧牌在窄屏**直接不渲染**——`useNarrowScreen()` 与 CSS 共用同一个 760 断点，因为 `display: none` 的 `<img>`
    仍会发请求，只靠 CSS 隐藏会让"首屏只让一张图抢带宽"落空。过渡统一 ≤280ms、不加 blur；
    `prefers-reduced-motion` 只把主牌变换写回原点、保留侧牌排布（那是版面不是动画）。
    `.preview-gallery` 用 `overflow-x: clip` 裁掉超出列宽的侧牌：选 `clip` 不选 `hidden`，因为 `clip` 不算
    grouping（不会把 `transform-style` 压平），也不会凭空多出一个滚动容器。
  - **只渲染当前张 + 左邻 + 右邻**，总数 >3 时再多一张后牌（编号牌标 `+N`，N = 未显示的张数）；2 张时左右邻
    绕回同一张，`previewFrames()`（纯函数 + `test/preview_frames.test.mjs`）去重只留一张侧牌；1 张时不渲染翻页控件。
    侧牌与后牌**等主牌定妆后才开始请求**（`load` 与 `error` 都算定妆，坏图不会冻住整台），定妆前是同尺寸占位盒
    所以不跳版；冷缓存首屏因此只有 1 张 1600 走 Worker→转换服务那两跳。**不给侧牌降档**：同一张图会产生两种
    转换变体（12 张全翻一遍：12 次 → 24 次），免费转换服务反而多承担一倍的真实请求。
  - **缩略图索引条**（每张 58×44 的小图 + 左上角 `0N` 角标，可换行，触控目标 ≥44px；窄屏单独一行横向滚动）：
    与前台、管理端抽屉共用 `IMAGE_WIDTH.thumb = 200` 同一档 → 同一个 `/api/img` URL → 同一份边缘缓存。
    为什么不是裸编号：`01…12` 无法预告"第 7 张是什么"，十几张时访客只能逐张盲翻。
  - **交互**：←→ 方向键、回车/空格放大、指针拖动（位移 >8px 才算起拖并接管指针，>45px 才真的翻页，
    中间回弹；拖拽时牌面自己的 click 被重定向，不会「拖一下就顺手改了当前张」）、鼠标点侧牌直接切、
    鼠标悬停 3D 倾斜（只在 `pointerType === 'mouse'` 响应）。可访问名 = **可见的编号牌文字 + 文件名**
    （满足 WCAG 2.5.3 的名称包含可见标签，又不把整条 URL 目录念给读屏；目录那行 `aria-hidden`，无目录时整行不渲染）；
    索引条整体是 `role="group"`，页码 `aria-live="polite"`，后牌是 `aria-hidden` 的 `<div>`。
  - **放大看图层**（点主牌 / 「放大」按钮 / 舞台内回车）：`role="dialog"` + `aria-modal`，图取
    `IMAGE_WIDTH.zoom = 2000`（就是 `/api/img` 的宽度上限），层内 ←/→ 继续翻同一本相册、Esc 或点空白关闭并还原
    `body` 滚动。**背景用实底页面色而不是半透明压暗**：截图多为浅色 UI，压暗会把图边缘吃进背景里；
    层里另给「原图」直链（新标签打开未转换的原地址），代理是为了省流量，不是替访客做选择。
  - **文案栏的数据都是真的**：左栏页码 `0N / 0M` 与进度段宽度按相册实际张数与当前序号计算；每张牌的标题与
    副标题取**图片 URL 自身的文件名与目录**（`frameLabel` 解 `pathname`，百分号解码失败就原样显示），
    没有说明文字时退回项目名——不写虚构的界面描述与指标。
  - **两个字段互不兼任**（相册首张不再代做封面）：`preview_image_url` 是显式字段，抽屉里就叫「**详情页大图（项目图片）**」，
    只驱动详情页 hero 与对外 `previewImageUrl`；**首页卡片仍用占位标本图、`og:image` 仍是构建期静态文件**
    （字段说明里明写，不让管理员猜）。管理端是独立输入框 +「用相册第一张填入」按钮，带过之后两者互不影响
    （调整相册顺序不会改大图）。写侧 `validatePreviewInput` 不做任何推导：不给该键就不动这一列，显式空串就是清空。
    读侧 `publicGallery` 保留退化：项目图片为空时对外报告相册第一张，老数据不会因为解耦而没图；
    抽屉的缩略图条会给等于项目图片的那一张打上「详情页大图」标记。
    用户可见文案统一到「项目图片」——服务端 400 话术与同步备注曾写「封面」，同一个概念只留一种词。
  - **按目录批量导入预览图**（`POST /api/admin/preview-import`，body `{dir}`）：填图片所在目录地址即可，
    支持 `raw.githubusercontent.com/owner/repo/分支/路径`、`github.com/owner/repo/{tree|blob}/分支/路径`
    以及省略协议/省略域名三种写法；**只支持 GitHub**（gitlab 等一律 400 说明原因），只列**一层**目录
    （子目录只计数不递归），只取位图扩展名（png/jpg/jpeg/webp/gif/avif/bmp，SVG 与 markdown 计入
    `skippedNonBitmap`），排除徽章类文件名，**按文件名排序**保证顺序稳定，路径逐段 `encodeURIComponent`。
    分支名带 `/` 时切分会歧义，解析器因此给出第二个候选「整段当路径 + 用默认分支」再试一次；
    只给 `owner/repo/X` 一段时直接要求写全。返回 `images / found / truncated / skippedNonBitmap /
    skippedBadge / subDirectories / rateLimitRemaining`，**上限 12 张**，超出标 `truncated` 并如实告知还剩几张没填。
    前端把结果**并入草稿文本框**（去重、凑满 12 即停），必须再点「保存项目」才写库——导入本身不改数据库；
    旁边「整体替换现有相册」开关默认追加（相册本来就满 12 张时"只能追加"等于导入无效）。
    配额来源：Worker 的 `GITHUB_TOKEN`，或抽屉那条请求自动带上的「GitHub 同步」栏 token；两者都没有时走匿名
    60 次/小时，撞限返回 **429 并说明剩余配额**，输入内容保留、按钮变成「重试」。失败原因与统计
    （新增/替换几张、跳过重复、过滤非位图与徽章、被上限挤掉几张）**就近显示在按钮下面**，不只放在顶部那条通知里。
  - **抽屉的四个关闭入口都有未保存保护**：Esc / 点遮罩 / 右上角 × / 底部「取消」全部收敛到 `requestClose()`。
    判据与保存路径**共用同一个 `changedColumns()`**（`src/utils/projectDiff.ts`，纯函数 + `test/preview_rules.test.mjs` 闸门），
    所以不会出现"关闭时说没改动、保存却写进去"的分裂；有改动时在页脚上方展开一条确认条
    （「继续编辑」/「放弃并关闭」，`role="alertdialog"`，不用浏览器原生 confirm 以免脱离抽屉焦点）。
    新建项目拿 `createProject` 生成的空白模板当基线——**一个字没改的新草稿可以直接关**，不弹确认。
    `preview_images_json` 这类 JSON 列比较前会先解析再比，避免库里 `["a", "b"]`（带空格）对上本地
    `["a","b"]` 造成"每次打开都有改动"的假警报。
  - **相册坏行在点保存之前就被点名**：文本框下面按行列出问题（`第 7 行：不是有效的 http/https 绝对地址…`），
    对应的缩略图描红边。判据不是前端另写一份，而是与 Worker 写侧**同一份** `src/utils/previewRules.ts`
    （`sanitizeImageUrl` / `PREVIEW_IMAGE_LIMIT` 由 Worker 再导出，`galleryRowIssues` 是它的逐行诊断视图）；
    `test/preview_rules.test.mjs` 把同一批输入喂给前后端两侧，要求**结论必须一致**。服务端仍是最终裁决。
  - **后台通知分三种生命周期**：结果类（`info`）6 秒自动让位，失败类（`error`）常驻、带关闭按钮并用
    `role="alert"` + 红边，在途类（`busy`，如「正在读取目录…」）不自动消失——抓取可能超过 10 秒。
  - **管理端与公开站不共用一份行数据**：`/api/projects` 是对外投影（camel 命名，**不含**
    `readme_zh / readme_en / compose_dev / compose_prod / internal_notes / sort_order / docs_synced_at /
    preview_images_json / preview_image_url`），而编辑抽屉绑的就是这些原始列名。管理端单独持有 `adminItems`
    （公开数据只有一份 `items` 时，标签页重新聚焦会拿对外投影覆盖它——切出去复制个 URL 再回来，这九项就整片空了），
    退出后台时再显式重取一次公开数据给前台用。`saveProject` 成功后**重取管理端列表**而不是把本地 payload
    拼回列表——回显显示的永远是库里的行，服务端的规范化结果不会看不见。
    管理端列表也**不带四份长文档**（各上限 10 万字符 × 最多 500 行会让响应随馆藏线性放大），
    只回 `has_readme_*` 之类的有无标记；抽屉打开时用 `GET /api/admin/projects/:id` 取全文再渲染。
  - **PUT 只提交改动过的列**（`saveProject` 拿列表里的当前行做基线逐项比较）：整行全量回写会把抽屉打开期间
    后台同步/导入刚写进库的字段（`stars`、`version`、`README`、时间线…）用陈旧值悄悄盖回去，
    那是另一种"提示成功但库里被改坏"。没有检测到任何改动时直接不发请求（也不报"已保存"）。
    同一条规则也用在「一键切换状态」与「保存展示顺序」上（各只提交 `status` / `sort_order` 一列）；
    POST 新建仍提交全量，因为要落所有列的默认值。
    抽屉的相册文本框不会在项目图片非空时把它当作第一行——否则任何一次保存都把项目图片固化成相册，
    并让 `has_preview_images` 变 1，此后同步永不再为该项目的相册补图。
  - **访客正在看的那一张要经得起重拉**：`items` 换成一批新对象 → `ProjectRoute` 依赖 `listed` 重跑 →
    `project.previewImages` 换成新数组引用。所以 `PreviewGallery` 的复位 effect 依赖 **`images.join("|")`**
    （相册内容）而不是数组引用——内容没变就不动，切一下标签页不该把访客从第 5 张打回第 1 张。
  - **预览区用「密集档」间距**（`--section-pad-dense`，不是叙述段落的 loose 档）。区块级 eyebrow 编号为
    `PREVIEW / 01 → FIELD NOTES / 02 → ANATOMY / 03 → EVOLUTION / 04 → NEIGHBOURING SPECIMENS / 05`；
    预览区无相册时整段不渲染，编号按版面身份保留（不从 01 起排）。
- **图片代理**（同源 `GET /api/img`）：详情页所有相册图都经它中转，**这是解决"图显示慢"的关键**。
  - **为什么需要**：图源是站外的 GitHub raw（原图常见几百 KB 的 PNG，且只缓存 5 分钟）；Workers 运行时装不了
    图片解码器、Cloudflare 自带的 Image Resizing 要付费。因此由 Worker 借免费的转换服务
    （`wsrv.nl`）把图压成 **webp** 再回给浏览器：实测 446KB 的 PNG → 1600 档约 **31KB**。
  - **接口**：`/api/img?w=<宽度>&src=<原图 URL>`。宽度先夹到 `[64, 2000]`（默认 1600），再**吸附到前台实际使用的三档**
    （200 / 1600 / 2000）：否则任意宽度都是一个独立缓存键与一次真实转换。缓存键还会去掉 `src` 的 query/fragment，
    但取图仍用原地址（签名类 URL 的 query 可能是必需的）；只接受默认端口；除 isolate 桶外还有一层 Cache API 桶。
    前台三档 `IMAGE_WIDTH`：
    `plate = 1600`（观察台的牌，台上最多 4 张全按主图清晰度取，**不给侧牌/后牌单设小档**，理由见上面
    "只渲染当前张 + 左邻 + 右邻"那条）、`thumb = 200`（索引条角标小图**与管理端抽屉的缩略图同一档**：
    同一个 URL → 同一份边缘缓存，管理员看到的字节量与速度就是访客那一份）、`zoom = 2000`（放大层，
    等于服务端 `IMG_WIDTH_MAX`）。冷缓存首屏的实际账（按常量推算，未做真实视口复测）：大图请求由 4 次降到
    **1 次**，换来索引条为每张图多要一个 200 档小图（懒加载、去重、边缘缓存 7 天），约 `1×31KB + 最多 12×几 KB`。
    留意两点：台上 4 张 1600 同尺寸牌在场会让低配手机的解码内存上升（**未实测**）；要核对"原地址本身是否可达"
    用放大层里的「原图」直链，而不是靠抽屉缩略图。
  - **边缘缓存**：转换结果写入 `caches.default`，`Cache-Control: public, max-age=604800`
    （不写 `stale-while-revalidate`——Cache API 的 `put`/`match` 不支持，写了是空承诺）。
    **每个「源图 × 宽度」在每个边缘节点只真的转换一次**；实测命中约 7ms，回源约 1s。
    源图地址用的是分支（内容可能变），所以给有界 TTL 而非 immutable。
    注意：`cache.match` 返回的响应头是**只读**的，必须重新包一层可写头部再返回，
    否则全局安全头中间件会抛 `Can't modify immutable headers` 并让命中请求全部 500（已实测踩过）。
  - **安全（必须保留）**：只代理白名单图源（`raw.githubusercontent.com`、`user-images.githubusercontent.com`、
    `camo.githubusercontent.com`、`objects.githubusercontent.com`、`github.com`、`cdn.jsdelivr.net`）；
    **名单外的主机一律 404，不做 302**——否则会多出一条开放重定向（钓鱼 / 绕过过滤器的跳板）。
    另限 `src` 长度 ≤2048、协议只放行 http(s) 且必须解析出主机名。
    **转换服务自身（`wsrv.nl` / `images.weserv.nl`）绝不能进白名单**：那样
    `/api/img?src=https://wsrv.nl/?url=<任意地址>` 就绕过了整套限制，本站会退化成真正的开放代理，
    还会把任意内容缓存到自己的边缘缓存里。
    前端 `IMAGE_PROXY_HOSTS`（`App.tsx`）必须与该名单一致**或更窄**：名单外的地址直接原样使用、不绕代理，
    所以两边漂移时安全方向是「前端更窄」，反向漂移会让图片挂掉。
  - **兜底**：白名单内的图源若遇转换服务抖动、限流或超时（15s），则 **302 回原图**（目标本身就是自家
    白名单，不构成开放重定向），绝不白屏。
  - **依赖与隐私**：`wsrv.nl` 是免费的第三方公共服务（BSD-3-Clause 开源，文档未承诺配额或 SLA），
    图片会经过它的服务器。若将来开通 Cloudflare Image Resizing，只需改 `buildWeservUrl` 这一处即可切换。
- **详情页版面契约**（`frontend/src/index.css` 的 `:root` token）：
  - `--gutter` = `clamp(20px, 6vw, 96px)` 是 header / hero / 各 section **共用的左右边缘**；
    **文档区（README / DEPLOYMENT）刻意例外，保持居中**——它是阅读版面。
  - 纵向两档：`--section-pad-loose`（叙述段）与 `--section-pad-dense`（预览 / 统计等密集区块）。
  - `--sticky-offset` = `calc(72px + 16px)` 作 `scroll-margin-top`，用在各 section、compose 块与 README 的
    h1–h4 上，否则锚点落点被 72px 吸顶头盖住。
  - 文档列宽 `220px`（目录）+ `minmax(0, 920px)`（正文）居中，间隙 `clamp(32px, 5vw, 96px)`；760px 以下收成单列。
  - 小字：观察台自己的微标签（`FRAME / 0N`、图注、索引条角标、页码）与 COPY 按钮统一 **10px**；
    共享的 `.eyebrow` 与文档目录项仍 9px、`.related-grid span` 仍 8px。README 标题只有一套字号
    `clamp(26px, 2.6vw, 34px)`，`h1` 行距 `.9`（`.76` 会把中文行距压太紧）。
    > 未办：全站微标签统一到 10px（首页 / 页脚 / 管理端仍有 8–9px 的）需要单独确认，目前只抬了观察台与 COPY。
  - DEPLOYMENT 代码块：头部是 flex 行（路径 + COPY），`pre` 用 `max-height: min(72vh, 760px)` +
    `overscroll-behavior: contain`，宽度随文档列一起到 920px，COPY 触控目标 ≥32px；滚动条统一为低对比细条
    （`scrollbar-width: thin` + `::-webkit-scrollbar`，深色块内用浅色 thumb），**刻意不隐藏**，
    免得丢掉「这里能滚」的可发现性。
- **管理端写接口对请求体本身也是严格的**：`POST/PUT /api/admin/projects*`、`POST /api/admin/github-import`、
  `PUT /api/admin/site-settings` 收到**不可解析的请求体**时返回 **400**（此前会抛错变成 500，把客户端问题
  报成服务端问题）。`POST /api/admin/github-sync` 的请求体是可选的，缺失或不可解析按默认方式同步，不报错。
- **同一列不接受两种拼写**：管理端用 D1 原始列名（`preview_images_json` / `preview_image_url`），
  公开投影用 camel 名（`previewImages` / `previewImageUrl`）。两者同时出现在一个写请求里且内容不一致时，
  `previewFieldsFromBody` 直接 **400 点名两种写法**——让其中一种悄悄赢会造成"抽屉里编辑的是 A、库里存的是 B、
  后台还提示已保存成功"的假状态。内容一致时按管理端口径写入，只给其中一种也照常接受。
- **详情页文档展示**：仅 `GET /api/projects/:id` 返回文档内容（列表接口不携带，避免体积膨胀）。前台
  README tab 用内置极简 Markdown 渲染器（`frontend/src/utils/markdown.tsx`）把 Markdown 转成 React
  元素——**不解析也不透传原始 HTML**，链接只放行 http/https/mailto；当前语言缺 README 时回退另一种语言
  并标注「原文」；DEPLOYMENT tab 展示 dev/prod Compose 原文并可复制。详情页由 `ProjectRoute` 按 id 自行
  拉取，深链或刷新时先显示骨架、查不到则给出「未找到标本」页，不再闪回首页。

## 七、 访问台账（D1，永久聚合）与可选的 Analytics Engine

改版前整站**零度量**，所有判断只能靠专家走查，所以补了六个聚合事件；
真正的持久落点是 **D1 访问台账（迁移 0016）**，管理端「访问统计」面板直接读它。

- **存什么**：按天聚合的 PV/UV、页面（home/detail/admin × 标本编号）、来源类别 / 设备档 / 语言 /
  国家 / 24 小时分布，以及六个事件的计数。**不存单次访问行、不存 IP/UA/来源 URL。**
- **累计口径**：累计 PV = `visit_day.pv` 求和；累计 UV = `visit_identity` 行数（永久保留）。
  每日 UV 快照在 `visit_day.uv`；`visit_day_visitor` 只是当天的去重索引，由 `wrangler.toml` 里
  每日 03:17 UTC 的 cron（`scheduled` handler）清理 90 天前的行——清理只删"哪一天来过"的索引，
  累计与日快照都不受影响。读接口不再承担清理写操作。
- **访客标识**：浏览器在 localStorage 生成一个随机匿名 ID，随请求的 `v` 字段上报；
  Worker 用 `visit_meta.hash_salt` 做 HMAC-SHA256 后才落库。清缓存、隐私模式、多设备会各算一个新访客。
- **排除规则**：管理端自己的 `/admin` 浏览单独计数，不进 PV/UV/维度分布；会跑 JS 的爬虫按 UA 剔除，
  **但只作用于 `pageview`**（`recordVisitEvent` 先落非 pageview 的事件计数，再判 bot）——所以爬虫触发的
  `deck` / `outbound` / `imgfail` 仍会进「行为事件」表，看事件分布时要知道这一点。
  管理端面板底部有 **「本设备不计入访问」** 开关：管理端在 `admin.<主域>`、公开站在 `<主域>`，
  两边 localStorage 不互通，因此生产环境用一枚 `Domain=<主域>` 的**功能性偏好 cookie**
  （值只有 `1`/删除，不含任何标识）让公开站也读到；本地/IP/`*.workers.dev`（同源、无兄弟域）退回 localStorage。
- **为什么不用 Analytics Engine 当主落点**：AE 只能写、不能从 Worker 读，要在自己的管理端展示
  还得额外引 CF API token；D1 按天聚合后正常流量一天只有几十行。
  ⚠️ **但每次 pageview 会写 7–9 行**（日聚合 + 页面 + 小时 + 四个维度 + 身份 + 去重索引）。
  所以这道写入口靠代码侧限流兜住（两种桶的构成与能力边界见第三节）：单 IP 日配额 1000 条
  ≈ 最坏 9k 行，约 D1 日写额度的 9%。WAF 或 Durable Objects 是可选的进一步收紧项，**不配置也能上线**。
  AE 绑定仍是**可选的第二通道**（默认注释；未启用 AE 的账号部署会 `code 10089`，本地 dev 测不出来）。
- **部署顺序（硬前提）**：先本地、再远程，最后部署新 Worker：
  ```bash
  bash scripts/d1-migrate.sh
  bash scripts/d1-migrate.sh remote
  ```
  新 Worker 先上而表未建时，`/api/admin/visits` 会返回 **503** 并点名 0016，
  不会把 0 当成"没有访问"。
- **收什么**（白名单在 `worker/index.ts` 的 `USAGE_EVENTS`，白名单外一律 **400**，`test/preview_rules.test.mjs` 会核对这份表）：
  | 事件 | 方式（`m`） | 回答的问题 |
  | --- | --- | --- |
  | `deck` | `view` / `thumb` / `plate` / `arrow` / `drag` / `key` / `zoom` | 观察台有没有让人看图、翻图；缩略图索引与放大被用到没有 |
  | `imgfail` | —（带图源主机名 `h`） | 图片加载失败率，分母用 `deck view`；哪个图源在坏 |
  | `dirimport` | `ok` / `ratelimited` / `notfound` / `error` | 批量导入到底用了多少次、卡在哪一步（对应"减少手工粘贴"这个诉求） |
  | `pageview` | `home` / `detail` / `admin` | 哪个页面有人在看；详情带标本编号 `r`，整段会话带同一个入口来源主机名 `s` |
  | `specimen_open` | `card` / `index` / `related` / `footer` | 标本是从哪一段被打开的（带标本编号 `r`） |
  | `outbound` | `github` / `demo` | 真的出站了没有（带标本编号 `r`）；转化率 = `outbound ÷ specimen_open` |
- **不收什么**：IP、原始 User-Agent、完整 URL 与查询串都不写；`v` 是随机匿名 ID，
  `s` 只收主机名并在落库前归类成 direct / search / github / linkedin / social / other。
  入口来源取 `document.referrer` 的主机名，**同站与子域互跳（`admin.X` ↔ `X`）一律算没有来源**，
  否则站内翻页会被记成外部引流；判据在 `utils/visitStats.ts` 的 `entrySourceOf`（闸门 `test/visit_stats.test.mjs`），
  会话内缓存在 sessionStorage 的 `nestspace_entry_source`（只存主机名或占位符 `-`，关标签页即消失，不参与身份识别）。
  唯一的一枚 cookie 是上面说的退出统计偏好（值只有 `1`/删除），不参与身份识别。
  `/api/usage` 是**公开无鉴权**的，带按 IP 的代码限流（isolate 内存 + Cache API 分钟/日桶：
  通用 120/分钟、pageview 30/分钟、单 IP 日配额 1000 条；超出静默丢弃并返回 204，不给访客报错），
  并要求浏览器侧的 `Sec-Fetch-Site` / `Origin` 为同源——
  第三方页面无法直接用 sendBeacon 往台账灌数据；HTML 页面另有 240/分钟的宽松兜底。
  主机名只收 `[a-z0-9.-]{1,63}` 形态，其余当没给。
  > 诚实标注：UV 由客户端上报的匿名 ID 去重，公开端点理论上可伪造；这个数字用于自省，不是审计口径。
- **前端怎么发**：`src/utils/usage.ts` 用 `navigator.sendBeacon`（页面正在卸载也能发出），
  没有 Beacon 时退到 `fetch(..., { keepalive: true, credentials: "omit" })`；**任何失败都静默吞掉**——
  埋点不该产生用户可见的错误，D1 写不进去时端点也照样返回 204。
- **怎么看**：管理端左侧「访问统计」支持 7 / 30 / 90 天窗口（累计值始终全量）；
  本地验证跑 `bash scripts/usage-probe.sh`，第 6 节实测 PV/UV 去重、爬虫与管理端排除、事件计数。
  AE 开启后仍可用 `npx wrangler analytics query nestspace_usage --since 7d` 作为旁路，
  但不要把 AE 与 D1 的数字混在一起对账（两边的剔除规则不同）。
- **workerd 的一条硬约束（踩过）**：Worker **入口模块的导出**只接受 handler 或函数，
  把数字常量（如 `export { PREVIEW_IMAGE_LIMIT }`）从入口再导出会让 workerd 直接启动失败：
  `Incorrect type for map entry 'PREVIEW_IMAGE_LIMIT': the provided value is not of type 'function or ExportedHandler'`。
  因此 `worker/index.ts` 只再导出 `sanitizeImageUrl`（函数）；上限的一致性改由闸门测试做**行为断言**
  （13 张必须被服务端 400，且话术里的数字取自那一个常量）。

### 回滚与发布后核验

- **先备份，再动库**：`bash scripts/d1-backup.sh` 默认导出**远程**库到 `backups/`（已 gitignore），
  并自动做一次恢复演练——把 dump 灌进临时 sqlite 文件库、比对 `projects` / `site_settings` / `_migrations`
  的行数。没被恢复过的备份只是"以为有备份"。`--no-verify` 只导出；`local` 备份本地库。
  恢复前**再备份一次现状**（别让恢复把证据也覆盖了）；dump 里是 `CREATE TABLE`，直接灌回非空库会撞
  `already exists`，所以恢复只对空库执行，或先确认要删哪些表（这一步不替你决定）。
- **Worker 回滚**：`npx wrangler rollback`（或控制台 Deployments → 选上一版 → Rollback）。
- **迁移不回滚**：0016 是纯新增表，回滚 Worker 到上一版不影响数据；**不要为了"回滚干净"删表**，
  否则累计台账与 90 天去重索引一起丢失（聚合表一删不可恢复）。
- **回滚后检查 cron**：上一版本没有 `[triggers]`，回滚可能把每日清理任务一起带走。到
  Worker → Settings → Triggers 确认 `17 3 * * *` 仍在；若不在，恢复新版后重新部署，
  或在 D1 手工执行 `DELETE FROM visit_day_visitor WHERE day < date('now','+8 hours','-90 day')`
  （**必须带 `+8 hours`**：写入口径是按北京时间切日，用裸 `date('now')` 会在 UTC 与 +8 的 8 小时差里多删/少留一天）。
- **发布后核验**：先跑 `bash scripts/verify-production.sh`（只读，不打印凭据）。它检查首页 `<title>`、
  `/api/projects` 非空、`/api/site-settings` 是 JSON、`/api/admin/visits` 未带凭据为 **401**、四个
  `/brand/*` 资产以图片直出。想同时确认 0016 是否已迁移，给一个生产口令再跑：
  `ADMIN_TOKEN=... bash scripts/verify-production.sh`（200 = 台账可读；非 200 会带出响应体前 160 字节）。
  然后人工补一步：打开一次公开页，确认 `/api/usage` 返回 204、管理端「访问统计」的今日 PV 增长。
  若 `/api/admin/visits` 返回 503，按提示先跑 0016，不要先找前端问题。
- **本地/远程顺序**：本地迁移 → 远程迁移 → 部署；反序不会让公开站挂掉，但统计写入会被静默丢弃。

## 八、 品牌标 / 栏目顺序 / 双语叙述 / 同步范围

- **品牌标只有一版（2026-10-19 起），且可被管理端替换**：原件是 `frontend/design/Logo.png`（1254×1254 半身像）
  与 `frontend/design/Logo horizontal scroll.png`（含 `NestSpace` 字标的横版整标）。站点用的是
  `python scripts/make-brand-logos.py` 生成的派生图（原件不动）：
  - `public/brand/logo-mark.png`（160px 高）→ 标头图，**深浅两种主题共用这一张**；
  - `public/brand/favicon.ico`（16/32/48）+ `apple-touch-icon.png`（180）→ 浏览器图标，同一脚本产出、跟着一起更新；
  - `public/brand/logo-banner.png`（200px 高的横版整标）→ **只给 README / 文档当头图**，标头仍不用它：
    字标是深墨色，放进深色主题的标头会直接看不见，而标头本来就有站点自己的排印文字（`logo_text`）。
    它**保留原件的近白底、不抠成透明**——同一张图在 GitHub 深色主题里是一块浅色卡片，抠透明就只剩看不见的一行字。
  - 旧的深浅两版素材（`logo-mark-on-{dark,light}.png` / `logo-lockup-on-{dark,light}.png`，里面还是旧名
    `OmniNest`）与 `design/logo_{dark,light}.png` 已删除。**判据是"抠图后主体与背景的明暗关系"**：旧素材是
    "浅发主体"或"深发主体"，一张只能压住一种底色；新素材浅发 + 深色衣着，两头都立得住 ⇒ 一张够用。
    换标时先跑脚本，看 `frontend/design/preview.png`（同一张标分别贴在深、浅两种底上 + 一行真实尺寸的图标）
    再决定要不要恢复两版。
  抠图**从四边泛洪**而不是全局阈值（头发接近底色，全局阈值会在人脸上打出洞）；底色取**边框像素的中位数**
  而不是均值（这张图下边压着深色衣服，均值会把底色拖成中灰 ⇒ 几乎什么都抠不掉）；新素材的透明被压平成了
  棋盘格（PNG 无 alpha 通道），所以只保留**最大连通块**——被主体包住的棋盘残屑都是独立小块，这样一并清掉。
  浏览器图标：`favicon.ico`（16/32/48）**透明底 + 等比 contain**——不铺深墨底（浅色标签栏里会成一团黑）、
  也不"居中裁成正方形"（会把人物上下各切掉一截）。`apple-touch-icon.png` 例外，仍铺深墨底：
  iOS 会把透明区域按黑色渲染，不铺底等于让深色衣着融进黑底，圆角由系统遮罩。
  - 渲染收在一个组件里：`LogoContent`（内容）+ `LogoWordmark`（首页的 `<a>` 外壳）；
    详情页返回入口是 `<button>`，所以那里用 `LogoContent` 而不是把 `<a>` 套进 `<button>`（非法 HTML）。
    `LogoContent` 已不再接 `dark` 参数（单版素材没有主题分支）。
  - 管理端「02 标头与导航」的 Logo 地址**留空 = 用内置徽章**，填了 = 换成它（这就是替换入口）。
    预览区仍是深浅两格——现在是**同一张标在两种底色上各看一次**，正是单版素材的可读性检查位。
  - ⚠️ **这些 PNG / ICO 必须留在 Git 里、不能走 LFS**：`frontend/.gitattributes` 原本对 `*.png`、`*.ico` 全量启用 LFS，
    而 Workers Builds 的 git clone 不解 LFS 指针 —— 那样 `dist/brand/*.png` 会变成 ~130 字节的指针文本，
    配上 `not_found_handling=single-page-application`（缺失路径返回 200 + index.html）与 CSP
    `img-src 'self'`，logo 与 favicon 都会**静默坏图**，控制台什么都不报。
    已在 `.gitattributes` 里给 `public/brand/*.png` 与 `public/brand/*.ico` 单独关掉 filter/diff/merge/text
    （`git check-attr` 实测四项均 unset）；原件 `frontend/design/` 继续走 LFS 无妨，它不参与构建。
  - ⚠️ **内置默认不会覆盖已存的偏好**：代码里的默认值只对"该列为空"生效，库里一旦存过值就以库值为准——
    所以改了默认文案而线上没变，先读 `/api/site-settings` 看那一列是不是已有值，别改代码。
    显示模式（`logo_type`）就属于这一类：要标头出图，去「02 标头与导航 → 显示模式」选「图标 + 文字」保存一次。
    （线上这一列当前是 `'both'`，即已经出图；具体线上取值属于运维现场，不在本手册里维护。）
- **顶部进度条是整页滚动进度**：`--page-progress` 在 `App` 顶层按 `scrollY / (scrollHeight - innerHeight)` 计算，
  与段落顺序无关（栏目顺序可配置，若仍读螺旋段自己的滚动比例，cabinet 被拖到后面时前面几段全程读 0，
  进度条看着就是坏的）；螺旋段自己的投影动画仍用段内比例，没有改。
- **首页内容栏目顺序 = 管理端导航顺序**：`src/utils/navOrder.ts` 的 `orderHomeSections(navItems)` 是纯函数
  （闸门：`test/nav_order.test.mjs`），首页四段按它渲染；导航里没有的段落**排到末尾而不是消失**，
  外链/未知 id 不参与排版。`visible` 开关只管导航条上那个链接在不在，**不会**把对应段落从页面上删掉——
  段落显隐仍由 `homeStatsVisible` 单独控制（在 **03 首页栏目**），两件事刻意不合并。
- **栏目标题 = 导航标签本身**（迁移 `0014` 配套，`src/utils/sectionCopy.ts`）：四段标题都由
  `navLabel(item, lang)` 从导航项取，与顶栏、页脚章节列、后台预览**同一份判据**
  （闸门：`test/section_copy.test.mjs`），所以后台改名必然三处同变。刻意**不加**标题覆盖字段：
  加了就得配"已被覆盖、不跟随导航名称"的指示，否则改导航名会被静默顶掉。
  eyebrow（`CABINET RECORD`、`ANATOMY / 03` 这类）保持单语硬编码，只有其中 `/ 02` 的序号随渲染位置派生
  （默认顺序下仍是 02，不产生视觉差异）。
- **挑战 / 解决方案改为中英双语**（迁移 `0011`）：库里新增 `challenge_json` / `solution_json`（`{en, zh}`），
  沿用 `description_json` 那一套（`EDITABLE_JSON_COLUMNS` + 管理端投影守卫）。
  - **旧单列降级为只读兜底，不双写**：新列为空时把旧列的值当中文（历史内容确实都是中文写的），
    所以老标本不会因为这次改动整段变空；`test/bilingual.test.mjs` 锁住这条退化路径。
  - **"没写过"与"被清空"必须分得开**（若两者都回退旧列，删除就永远不生效）：
    抽屉保存的永远是完整一对，清空后写入 `{"en":"","zh":""}` = **显式空记录，不再回退旧列**；
    只有 `''`、`'{}'`、坏 JSON，以及 `'[]'` / `'null'` / `'0'` / `'"abc"'` 这类垃圾形状才算"没写过"，
    继续用旧列兜底（垃圾形状**不会**被当成正文渲染，页面上不会出现引号或字面量 null）。
    判据只看"整串是不是 JSON"，不看开头是不是数字——否则"3 天内完成迁移"这类正文会被吞掉。
    闸门：`test/bilingual.test.mjs`（含 POST/PUT 同一 body 落库一致）。
  - 前台规则与 README 一致：当前语言没有内容时显示另一种语言并标注「中文原文 / ENGLISH 原文」
    （`pickBilingual` 的 `fallback` 标志），两栏都空才显示「尚未记录」。
  - 管理端抽屉里是「中文 / English」两个并排输入框（`BilingualField`），窄屏收成单列。
- **`description` 与挑战 / 方案同一套规则**：三处读侧投影走 `asBilingual(row.description_json)`
  （trim、形状校验、默认值统一为 `{en:'',zh:''}`——默认 `{}` 会让 `description.en` 是 `undefined`）；
  写侧 POST/PUT 共用 `normalizeJsonValue`；详情页与卡片用 `pickBilingual`，缺当前语言时回退并标注「原文」
  （卡片那处不加标注，那里是提要位置）。
  - **同步与导入同一口径**：两处都走 `pairFromSingleText`——**含 CJK 就只填中文，否则只填英文**。
    不同塞两边的理由：同塞会让"当前语言有内容"成立，中文站于是把英文简介当中文文案显示，
    **连「原文」标注都不给**，那是对访客撒谎。猜错的代价只是标注方向反了，可见内容不变。
  - **抽屉里两个简介框不设 `required`**：单语填充是正常状态，留着 required 等于
    逼管理员编一段翻译才能保存；框下说明"至少填一种"。
  - 闸门：`test/bilingual.test.mjs`（读侧统一 / 单语配对器 / POST-PUT 同 body 同落库）、
    `test/sync_update.test.mjs` case 4a/4a2（英文描述只进 en、中文描述只进 zh）。
- **同步可以只挑几个标本**：`POST /api/admin/github-sync` 接受可选 `ids`（参数化 `IN` 列表）。
  - 语义：**省略 = 全表**（老行为不变）；**空数组 = 400 拒绝**，绝不退化成全表——
    那会变成"界面显示选了 0 个、实际把整个馆藏都刷了一遍"的假状态（闸门：`test/sync_scope.test.mjs`）。
  - 未知 id 只是匹配不到，返回 200 + 空结果，不报错；`ids` 入参最多 100 条（`SYNC_ID_LIMIT`，
    与一条语句的绑定参数规模相称），单次实际处理最多 10 个（抓取文档时 2 个，见上方子请求预算），超出 400 并提示分批。
  - 管理端「GitHub 同步」的「同步范围」勾选卡：按钮是「全选本批（N）」——N 取当前模式的上限
    （不抓文档 `SYNC_MAX_ROWS`，抓文档 `SYNC_MAX_DOC_ROWS`，两个数与 Worker 共用 `src/utils/syncLimits.ts`）。
    以前那里是「全选」= 不带 `ids`（全表），馆藏一旦超过一批上限就必定被服务端 400，按钮写着却永远点不动。
    另有反选 / 清空；反选可能选出超过一批的数量，所以**发起前客户端先按同一个上限拦住**，
    不再白跑一次 Worker 与 GitHub 配额。一个都没选时按钮禁用并说明原因。
    附带收益：GitHub 匿名配额只有 60/小时，现在能只刷刚改过的那一两个仓库。
  - 探针 `bash scripts/usage-probe.sh` 的第 5 节实测这五条（单个=只跑它 / 抓文档选 3 个=400 且不发出任何
    GitHub 请求 / 空数组=400 / 形态不对=400 / 未知 id=200 且 0 条）；第 4 节实测双语写读往返（先快照、测完按快照复原）。
    双语载荷由 `scripts/probe-bilingual-payload.mjs` 生成到文件再 `--data-binary @文件` 送出——
    Git Bash 会按本地码页改写命令行里的中文，内联写法会让探针自己造出乱码再误判成接口缺陷。
