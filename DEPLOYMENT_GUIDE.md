# NestSpace 生产部署与安全运营手册

本项目已全面完成**前后端分离**改造，具备 **Cloudflare 全球边缘毫秒级分发**、**D1 边缘 SQLite 持久化**、**防网页劫持（CSP+HSTS）**，以及**管理 API 的三层防线防护**（边缘 Zero Trust 拦截 + 代码层 Bearer 密钥常量时间比较 + Access JWT 签名校验，默认 fail-closed）。

---

## 一、 项目工程概览

```text
NestSpace/
├── frontend/
│   ├── dist/                     # vite 构建产物（含 _headers，作为 Worker 静态资产目录）
│   ├── worker/                   # Cloudflare Worker（后端边缘 API）
│   │   ├── index.ts              # Hono 入口（公开脱敏接口 + 管理接口 + 鉴权中间件）
│   │   └── tsconfig.json
│   ├── public/
│   │   ├── _headers              # 严格 CSP 策略、防 iframe 钓鱼、防运营商劫持 HSTS、静态资产缓存
│   │   └── robots.txt            # 搜索引擎收录规则（允许全站，屏蔽 /api/）
│   ├── src/
│   │   ├── api/                  # 前端客户端 API (client.ts & adminClient.ts)
│   │   ├── data/                 # 内置默认值与回退数据 (fallbackProjects / defaultSiteSettings)
│   │   ├── types/                # 数据类型定义 (project.ts / siteSettings.ts)
│   │   ├── utils/                # 可独立测试的纯逻辑：markdown.tsx 渲染、stats.ts 统计、
│   │   │                         #   previewFrames.ts 观察台在场牌与牌面文字
│   │   └── App.tsx               # 动态数据渲染与安全管理端
│   ├── .dev.vars.example         # 本地开发环境变量模板（复制为 .dev.vars 使用，不入 Git）
│   ├── jwt_verify.test.mjs       # JWT 校验与 Access 白名单单元测试（pnpm test 依次跑以下五个文件）
│   ├── demo_url.test.mjs         # 演示地址规范化单元测试
│   ├── sync_update.test.mjs      # GitHub 同步字段归属 / 时间线生成单元测试
│   ├── image_proxy.test.mjs      # 图片代理：宽度夹取 / 图源白名单 / 转换地址构造单元测试
│   ├── preview_frames.test.mjs   # 观察台：在场张数 / 环形去重 / +N 口径 / URL 解析兜底单元测试
│   ├── wrangler.toml             # Worker 配置：入口 + 静态资产 + D1 绑定（本地与 Git 构建共用）
│   └── package.json
│
├── migrations/                   # Cloudflare D1 边缘数据库建表与种子数据
│   ├── 0001_create_projects.sql  # 表结构定义（字段脱敏、草稿状态、版本时间戳）
│   ├── 0002_seed_initial_data.sql# 初始 4 个标本数据（Aperture, Lumen, Fjord, Meridian）
│   ├── 0003_create_site_settings.sql # 站点文案与备案号配置表（管理端可编辑）
│   ├── 0004_add_nav_and_logo_settings.sql # 顶部导航顺序、Logo 与统计指标扩展表结构
│   ├── 0005_add_footer_settings.sql # 公开站点底部栏中英文案（管理端「底部栏」视图）
│   ├── 0006_add_display_preferences.sql # 展示偏好：默认语言/主题、首页统计与两个切换开关
│   ├── 0007_add_project_docs.sql # 标本文档：README 中英文与 dev/prod Compose 编排内容
│   ├── 0008_add_demo_fields.sql  # 项目演示入口：演示地址与演示开关
│   ├── 0009_add_curator_copy.sql # 馆长手记栏目文案（标签 / 标题 / 引言 / 属性值）
│   └── 0010_add_preview_image.sql# 详情页标本托板预览图：封面 + 相册（同步从 README 提取，管理端可覆盖）
│
├── scripts/                      # 运维脚本
│   └── d1-migrate.sh             # 一键按序执行全部 D1 迁移（local / remote，可反复执行）
│
└── ARCHITECTURE_PLAN.md          # 详细架构与审查设计文档
```

---

## 二、 部署到 Cloudflare Workers（步骤指引）

本项目为 **Workers 形态**：单一 Worker（`worker/index.ts`，Hono）+ 静态资产（`dist/`）+ D1。
`/api/*`、`/` 与 `/index.html` 由配置中的 `run_worker_first` 优先进入 Worker，其余路径走静态资产
（未知路径回退 index.html）。`[assets]` 里的 `binding = "ASSETS"` **不可删除**——Worker 依赖它取回首页
HTML 做 SEO 注入（见第六节）；删掉会导致首页 503。注意：只有 `/` 会被改写头部，深链（如 `/some/path`
由 SPA 兜底）仍返回构建产物原文。

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

---

### 2. 执行数据库初始化迁移
将建表语句与初始数据推送到远程 D1 数据库：
```bash
# 在仓库根目录一次性按序执行 migrations/ 下的全部迁移（生产）
bash scripts/d1-migrate.sh remote
```

脚本会按 `0001 → 0010` 的文件名顺序逐条执行、打印每条的 `✓ 已执行 / · 已应用过，跳过 / ✗ 失败`，
并在结尾给出汇总；**已经应用过的迁移（重复的 ADD COLUMN、已存在的表）会被识别为跳过而不是报错，
因此可以反复执行**。只有真正的错误（SQL 语法、约束冲突等）才会以非 0 退出并点名失败文件。
需要指定库名时：`bash scripts/d1-migrate.sh remote nestspace-prod`。

**顺序要求**：迁移必须先于 Worker 代码生效。新版 Worker 引用了这几批新列，任何一批没先落到生产库就部署代码，都会 500：

| 缺哪批 | 引用的代码位置 | 表现 |
|---|---|---|
| `0005` 底部栏文案 | `site_settings` 写白名单（`footer_*`） | 「站点设置」保存报 500（读侧是 `SELECT *`，只会静默回退默认文案） |
| `0006` 展示偏好 | `site_settings` 读写白名单 | 「站点设置」保存报 500 |
| `0007` 标本文档 | 公开详情路由的 SELECT（`readme_zh` 等） | `GET /api/projects/:id` 每条都 500，详情页文档区退化为空 |
| `0008` 演示入口 | 项目的读路径与写路径 | 管理端保存**任何**项目报 500（写路径引用不存在的列） |
| `0009` 馆长手记 | `site_settings` 写白名单（`curator_*`，`worker/index.ts` 映射表） | 「站点设置」保存报 500（读侧同样静默回退，所以只有保存才暴露） |
| `0010` 预览图 | 项目列表/详情的 SELECT 与同步写路径 | `GET /api/projects` 每条都 500（列表 SELECT 引用了不存在的列），首页与陈列整体空白 |

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
   - **Build command**：`npm run build`
   - **Deploy command**：保持默认 `npx wrangler deploy`（Workers 形态开箱即用）
   - **Enable Preview builds**：开启
   - **Protect with Cloudflare Access**：开启（保护 preview 部署，不影响公开生产站）
3. D1 绑定由 `frontend/wrangler.toml` 声明，Git 构建自动生效，无需控制台手动绑定。

---

## 三、 管理端防护：代码层鉴权 + Zero Trust + 暴露面收敛

管理 API（`/api/admin/*`）由三层防线共同保护，完成以下配置后全部生效：

| 防线 | 层级 | 拦截对象 |
|---|---|---|
| Bearer `ADMIN_SECRET_KEY`（常量时间比较） | 代码层 | 一切未持密钥的调用，含 workers.dev / preview 等任意入口 |
| Access JWT 签名校验（`Cf-Access-Jwt-Assertion` 头或 `CF_Authorization` Cookie） | 代码层 | 伪造身份头——明文头一律不信任，只认通过 RS256 签名验证的 JWT |
| Zero Trust Access 边缘拦截 | 边缘层 | 让未认证请求根本到不了 Functions |
| 鉴权失败限流 | 代码层 | 同一来源（按 `CF-Connecting-IP`）连续 10 次鉴权失败后返回 `429` 并带 `Retry-After: 600`，抑制在线口令爆破。计数器存在于 Worker isolate 内存中，属尽力而为的抑制手段，**不能替代强口令**，建议在 Cloudflare 侧叠加 WAF / Rate limiting 规则 |

### 1. 配置独立管理子域名与 Access 应用（主流金标方案）

为彻底杜绝公开主站与管理端的跨站风险，推荐将管理控制台部署在专属子域名 `admin.nestspace.online`：

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
- 访客在公开主站 `https://nestspace.online` 浏览作品，若手动敲入 `#admin`，前端会自动重定向至 `https://admin.nestspace.online`；
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
| `ACCESS_ALLOWED_EMAILS` | 可选，允许进入管理端的邮箱或 sub（逗号分隔） | 配置后**即使 Access 政策放行了某身份、但其不在名单内也会被拒**；不配置则只依赖 Access 应用自身策略。适合 Access 政策同时覆盖多个应用的场景 |
| `ALLOWED_ORIGINS` | 可选，公开 API 跨域白名单 | 逗号分隔的完整 origin；不配置则不下发跨域头（同源请求不受影响） |

配置后，后端会验证 Access 签发 JWT 的 RS256 签名及 `iss` / `aud` / `exp` 声明，
并在配置了 `ACCESS_ALLOWED_EMAILS` 时把 JWT 载荷里的 `email` / `sub` 与名单比对。
**安全红线：`Cf-Access-Authenticated-User-Email` 等明文身份头可在任何未被 Zero Trust
覆盖的入口被客户端伪造，代码层一律不作为凭据。** 若这两个变量未配置，管理 API 仅接受
Bearer 密钥——同样是安全的默认状态（fail-closed）。

配置生效后，已通过 Access 验证码验证的浏览器访问管理后台时会自动携带
`CF_Authorization` Cookie，无需再输入口令即可进入；本地开发或其他浏览器仍可输入
`ADMIN_SECRET_KEY` 进入。

### 3. 关闭未受保护的入口（重要）

Zero Trust 应用只对**配置的自定义域名**生效。以下入口默认不在保护范围内——即使代码层
防线已能拦截，也应关闭暴露面，不给出任何试探机会：

1. **`nestspace.<你的子域>.workers.dev` 默认域名**：自定义域名上线后，在 Worker 的
   **Settings ➔ Domains & Routes** 中停用 workers.dev 域名；
   若需保留，则为该域名单独创建一个 Access 应用兜底。
2. **Preview 部署**：导入向导的 **Protect with Cloudflare Access** 开关即为 preview
   部署而设计（勾选后未认证者无法访问 preview URL）；若当时未勾选，在
   **Settings ➔ Domains & Routes ➔ Preview URLs** 中补开。注意 preview 环境默认连接
   同一个 D1 数据库。
3. **速率限制（建议）**：在 **Security ➔ WAF ➔ Rate limiting rules** 中对路径
   `/api/admin/*` 添加规则（例如 1 分钟内每 IP 超过 10 次即拦截或质询），
   抬高对 Bearer 密钥的在线暴力破解成本。免费版包含基础速率限制规则。

---

## 四、 本地全真模拟测试命令

在本地使用 wrangler 进行全仿真运行（Worker + 静态资产 + 本地 D1 数据库）：

```bash
# 进入 frontend 目录
cd frontend

# 0.（首次）生成本地开发环境变量：含本地管理员密钥，供 wrangler dev 自动加载。
#    .dev.vars 已被 .gitignore 忽略，密钥只存在于本机，与生产密钥完全无关。
cp .dev.vars.example .dev.vars
# 编辑 .dev.vars，将 openssl rand -base64 32 的输出填入 ADMIN_SECRET_KEY

# 1. 本地执行全部迁移（在仓库根目录，可与生产用同一条命令）
bash scripts/d1-migrate.sh local

# 2. 构建静态资产（Worker 的资产目录指向 dist，必须先构建）
npm run build

# 3. 启动 Worker 本地仿真服务器（自动挂载 dist、.dev.vars 和本地 D1）
npx wrangler dev
```
浏览器打开 `http://localhost:8787` 即可体验与云端完全一致的边缘全栈环境。

改动鉴权或证书校验逻辑后，运行安全回归：

```bash
# JWT 校验逻辑单元测试（含证书轮换、算法降级等 13 个用例）
pnpm test

# Functions TypeScript 类型检查
pnpm typecheck
```

---

## 五、 搜索引擎收录配置

站点的标题、描述与收录开关由 `frontend/.figma/make/site.json` 统一控制
（`vite.config.ts` 中的 figmaSiteConfiguration 插件在构建时注入到 HTML）：

```json
{
  "title": "NestSpace — AtaraxyEcho 的开源项目标本馆",
  "description": "AtaraxyEcho's personal open-source showcase: curated tools, experiments and long-lived systems with docs, tech stack and evolution notes. · github.com/AtaraxyEcho",
  "robots": { "index": true }
}
```

- `robots.index: true`：构建产物不再注入 noindex meta，也不再自动生成全站 Disallow 的 robots.txt；
- `frontend/public/robots.txt`：显式声明允许收录全站、屏蔽 `/api/`（JSON 接口无需进索引）；
- 未配置 `title` 时会回退为默认值 "Figma Make App"，改标题务必在 site.json 中改。

**收录范围说明**：本项目是哈希路由 SPA（如 `/#/project/001`），搜索引擎只会把根路径
作为一个页面收录（Google 会执行 JS 渲染，首页动态内容可被索引）；各项目详情页不会
成为独立的搜索结果。若未来需要每个项目拥有独立的搜索落地页，需改造为 History 路由
并配合 sitemap.xml，属于架构级变更，届时再评估。

**上线后加速收录**：在 [Google Search Console](https://search.google.com/search-console)
添加站点属性并请求编入索引；Bing Webmaster Tools 同理。

---

## 六、 站点文案与备案号管理（管理端）

主标题、副标题、关于文案、GitHub/邮箱、SEO 标题描述、**页脚备案号**与**底部栏文案**存储在 D1 的
`site_settings` 表中（迁移 `0003`，页脚文案字段见迁移 `0005`），通过 `#admin` 管理端编辑保存后即时生效，无需重新部署：

- **内容管理**：中英文主标题 / 副标题 / 关于文案、GitHub 主页、联系邮箱；
- **站点设置 → 站点信息 / 搜索与分享**：SEO 标题与 Meta 描述（保存后动态应用到页面标题与描述）；
- **站点设置 → 备案信息 (ICP)**：**默认关闭**。填写备案号并开启开关后，页脚展示
  备案号并链接至工信部备案系统（默认 `https://beian.miit.gov.cn/`，可自定义）；
- **内容管理 → 手记栏目文案**（迁移 `0009`）：栏目标签、引言（按语言切换）、主标题（每行一句，
  两种语言模式下都会显示）、中文尾注（斜体，留空则不显示）、HABITAT / FIELD 属性值；
  改名或改文案都在此完成，无需改代码。
- **项目管理 → 顺序**：表格每行的 ▲ / ▼ 直接调整公开站点与后台列表的展示顺序
  （按 `sort_order` 升序落库，只写顺序真正变化的行）；抽屉里的「排序权重」仍可手工指定数值。
- **底部栏**：中英文各一份，随访客语言切换。含品牌区小标与说明段落、三列标题、
  GitHub / 联系链接文字、Colophon 入口文字与底行版权行；文案支持 `{name}`（Logo 副标题署名）、
  `{since}`（馆藏起始年份）、`{year}`（当前年份）占位符；其中「章节导航列」的链接顺序、
  名称与显示状态直接跟随**导航与标头**的配置，改导航即同步改页脚；
- **站点设置 → 展示偏好**（迁移 `0006`）：默认语言（跟随浏览器 / 中文 / English）、默认主题
  （跟随系统 / 白日标本室 / 夜间标本室）、是否展示首页 Catalogue 统计区块、是否展示前台深浅色与
  语言切换按钮。**默认值等于既有行为**：语言与主题跟随访客浏览器与系统，统计与两个切换按钮全部开启；
  关闭「公开项目统计」时会同步从导航与页脚中移除「馆藏统计」入口，避免留下点不到的链接；
- **SEO 生效范围**：管理端保存的标题与 Meta 描述会即时改写浏览器内的文档标题，同时由边缘 Worker
  注入到首页 HTML 的 `<title>` / `description` / `og:*`（**因此不执行 JS 的爬虫与社交平台也能读到**；
  注入结果按 isolate 缓存 60 秒，保存后最多 1 分钟生效）。页面语言也会同步写入 `<html lang>`。
  **社交分享图目前未配置**（站点没有 `og:image`）：要添加就把图片放进 `frontend/public/`，
  并在 `.figma/make/site.json` 声明 `openGraph.image`，重新构建部署后生效；后台不提供修改。
- **站点设置 → 域名与部署**：**只读信息卡**（当前访问域名、公开站点入口）。主域名、DNS 记录与
  管理端子域由 Cloudflare 部署配置和代码中的跳转规则决定，后台不提供修改。

数据库字段为空时，公开站自动回退到 `frontend/src/data/defaultSiteSettings.ts` 的内置默认文案，
因此未做任何配置的部署也始终有完整可读的内容。

另有两点使用约定：

- **管理端入口**：公开界面（页头/详情页/页脚）不展示任何管理入口按钮，通过直接访问
  `https://你的域名/#admin` 进入（建议收藏）。这只是减少暴露面，真正的安全边界在
  管理 API 层（见第三节三层防线）。
- **GitHub 同步**：管理端「06 GitHub 同步」按各项目的仓库地址调用 GitHub 公开 API，
  把最新 stars / 推送时间 / Release 版本写回 D1。公开仓库无需任何 Token；**私有仓库
  在匿名 API 下不可见（会如实显示 404）**。如需同步私有仓库或提高速率限额，可配置
  `GITHUB_TOKEN`（`npx wrangler secret put GITHUB_TOKEN`），或在管理端「GitHub 同步」里临时填入
  Token（只走请求头，不进 URL）。
  同步为**串行**执行（刻意不并发，避免对匿名 API 造成突发压力）；一旦某个仓库返回 `403`
  （频率超限）**立即停止后续请求**，其余标本标记为"已跳过"而不是逐个白白重试；仓库列表接口
  最多取 3 页（300 个），超出时管理端会明确提示"仅列出最近更新的 N 个"；所有列表类查询统一
  带 `LIMIT 500` 安全阀（当前馆藏规模远低于该值）。
- **同步的字段归属**（迁移 `0007/0008` 之后）：
  - **GitHub 权威、每次覆盖**：`stars`、`updated`、`version`、`language`、`date`/`year`（仓库创建时间）、
    `metrics_json`（STARS / FORKS / OPEN ISSUES）、`features_json`（仓库 topics，前 4 个）、
    `timeline_json`（按仓库事实生成：建档 / 最多 4 个 Release / 最近推送，按月倒序，最多 8 条）；
    管理端「Stars 展示值 / 版本 / 技术语言 / 特性列表 / 指标」这几个输入框因此会被同步覆盖，界面已标注。
  - **编辑所有、只在空白时填充**：`description_json`、README/Compose 文档与预览图（封面 `preview_image_url` + 相册 `preview_images_json`）；后台手写内容一律不覆盖。
    「空」= 待填：主动清空后下次同步会重新自动填充（详见下一节）。
  - 星数展示口径统一为一份实现（≥1000 用 `2.8k`），卡片与指标卡不会再出现 `2.8k` 与 `2800` 并存。
- **无 Release 的项目**：`version` 保持空串（不再编造 `v1.0.0`），前台会省略版本位而不是显示空占位。
- **同步的健壮性**：所有 GitHub 出网请求带 10 秒超时（含 Access 证书端点），单个卡住的响应不会拖住整个同步；
  响应里回传 `rateLimitRemaining`，管理端在同步/扫描提示里显示"GitHub 剩余额度"；
  403 会结合配额头与响应体区分"频率超限"与"该仓库被拒绝"，只有确认限流才短路后续请求；
  四个文档都已齐备的项目**跳过文档抓取**（原来每个项目都会空跑约 11 个候选路径请求）。
- **标本文档抓取**（迁移 `0007`）：同步界面勾选「同时抓取 README / Compose 文档」后，按仓库
  `README.md`（辅以 `README.en.md` / `README.zh*.md` / `README_en-US.md` 等具名文件）与
  `deploy/dev|prod/docker-compose.yml`（辅以根目录 `docker-compose.yml`）抓取正文：
  - 通用 `README.md` 按**正文是否含中文**决定写入 `readme_zh` 还是 `readme_en`，避免英文说明串进中文字段；
  - 单份文档超过 100000 字符会被截断，避免单行过大触及 D1 单行上限；
  - 与描述同步同一原则：**只填充空白字段，绝不覆盖后台手工整理过的文档**；一个文件都没抓到时如实提示
    （仓库无对应文件或已达 GitHub 匿名 API 频率限制），不会假称"已存在"；
  - 导入新标本时同样抓取一次；文档也可在「项目管理 → 编辑」的四个文档编辑框中手工维护。
- **详情页预览图**（迁移 `0010`）：详情页 OVERVIEW 顶部有一块「PREVIEW / 01」观察台相册，展示项目截图。
  数据分两列：**封面** `preview_image_url`（卡片/Hero/分享图用，取值 = 相册第一张）与**相册**
  `preview_images_json`（详情页相册用，有序数组）。图片来源与管理端一致：编辑抽屉里的「预览图」多行文本框
  （每行一个 URL，第一行即封面）→ 同步时从 README 自动提取。
  **公开列表与公开详情都返回这两列**：`ProjectRoute` 会先用列表项当初始值渲染详情页，列表若只给封面，
  相册会在详情到达前短暂只显示一张（无导航）。README/Compose 文档仍只在详情接口返回。
  - **位置**：预览区在 **OVERVIEW 面板内**（不再夹在页签与面板之间），切到 README / DEPLOYMENT 时不会看到它；
    hero 右栏在项目**有封面时显示封面图**（相框按图片自身比例自适应，夹在 `[0.8, 2.2]`），
    没有封面才退回原来的占位标本图。
  - **自动提取**：同步（含勾选「同时抓取文档」的全量同步）会把 README 里的**全部真实截图**（`![](…)` 或
    `<img src=…>`）按出现顺序解析出来；**跳过 shields.io / badge 等徽章**，**位图优先于 SVG 矢量图**，去重、
    **最多 12 张**；相对路径按仓库默认分支拼成 `raw.githubusercontent.com/<owner>/<repo>/<branch>/<path>`，
    已是绝对地址的保留原值，`data:` / `javascript:` 等内联资源一律忽略——**提取不到就留空，绝不编造**。
  - **只填空、不覆盖**：与描述、文档同一原则——两列都只在**为空**时填充；已有封面/相册的项目同步时不会被改写。
    注意语义是「空 = 待填」：**主动清空封面或相册后，下次同步会重新自动填充**；若想彻底不用自动图，
    请在字段里填自己的地址，而不是留空。
  - **写入是严格的，不静默降级**：管理端保存相册/封面时任一非法条目都返回 **400** 并点名第几行、什么原因
    （缺协议、非 http(s)、重复、超过 12 张），**绝不"丢掉坏行后回成功"**——那会让后台显示"已保存并同步到 D1"
    而库里实际少图，是本项目在演示入口上已经定过的红线（宁 400 不降级）。
    两列各自只在"请求体里出现该键"时才写，所以只改相册不会把封面抹掉（部分更新语义）。
    「空封面 + 本次带相册 → 取相册第一张」的补齐只在 `validatePreviewInput` 里实现一份，
    **POST 与 PUT 共用**——同一请求体在两条路径必须落库一致（本仓库为 `demoUrl` 踩过两条路径不一致的坑）。
    读取侧仍保持宽容：绕过 Worker 直接写库的脏值不会让接口 500，只会被过滤掉。
  - **画框方向自适应**：整台观察台按**当前那张**的自身宽高换画框尺寸——横图用宽板（桌面 `min(720px, 80%)`，
    ≤760px 收成 78%），竖图（手机截图）收窄成竖板（桌面 `min(230px, 36%)`，≤760px 为 50%），
    画框高度固定（桌面 `min(72%, 420px)`、手机 `min(70%, 320px)`），一律 `contain` **不裁切截图**。
    方向不写在数据库里，由 `<img>` 解码后的 `naturalWidth/naturalHeight` 得出并按张序缓存进 state；
    命中缓存的图可能先于 `load` 监听器就绪，所以挂载时还查一次 `img.complete`，否则竖图首帧会先套横框。
  - **相册交互**：只渲染**当前张 + 左邻 + 右邻**，总数 >3 时再多渲染一张代表「往后还有」的后牌
    （编号牌上标 `+N`，N = 未显示的张数）——一张 12 图的相册不会同时解码 12 张大图。
    2 张时左右邻会绕回同一张，`previewFrames()`（`src/utils/previewFrames.ts`，纯函数 + `preview_frames.test.mjs` 闸门）
    去重只留一张侧牌；1 张时不渲染翻页控件，舞台 `tabindex="-1"`（不可 Tab 停留）。
    下方是**编号条**（`01…12`，可换行，触控目标 ≥44px）而非缩略图条，配 ←/→ 两侧翻页。
    舞台支持 ←→ 方向键、指针拖动、以及**鼠标悬停时的 3D 倾斜**：位移超过 8px 才算起拖并接管指针
    （此时牌面自己的 click 会被重定向，不会「拖一下就顺手改了当前张」），再超过 45px 才真的翻页；
    8–45px 之间什么都不发生（回弹）。鼠标点侧牌可直接切过去，**键盘**选张只走编号条与方向键。
    可访问名 = **可见的编号牌文字 + 文件名**（`FRAME / 03 pipeline-console`、编号条是 `03 pipeline-console`）：
    这样既满足 WCAG 2.5.3（名称包含可见标签文字），又不会把整条 URL 目录念给读屏——目录那行 `<small>`
    是 `aria-hidden`，且**没有目录可显示时整行不渲染**（免得跟项目名重复一行）。
    编号条整体是 `role="group"` + 组名，否则一排裸 `01…12` 对读屏没有上下文；文件名同时挂 `title`（只对鼠标有效）。
    页码用 `aria-live="polite"`；后牌是 `aria-hidden` 的 `<div>`（纯版面，不进读屏顺序）。
  - **3D 封面流（取代竖向牌堆）**：`perspective: 1800px` + `transform-style: preserve-3d`，
    四张牌按 `data-position` 排成 active / next / previous / back，侧牌 `rotateY ±42deg` 向两侧摊开。
    与上一版竖向牌堆的取舍：侧牌按**自身宽度**的 76% / 23% 位移，会把一部分牌面推到主牌轮廓之外。
    实测（把舞台宽度钉成 360px / 838px、关掉过渡后读边界）两侧各露出 **110–150px**，
    而横向扇形当年是位移量级不够导致后牌被主图整块压住。
    > 诚实标注：这组数字是在 0×0 的浏览器面板里**钉宽度**测的，当时生效的是 ≤760 那组位移常量
    > （±78%/±22%、scale .72/.74）；桌面那组（±76%/±23%、scale .76/.79）与它接近但**未在真实视口下复测**。
    > 手机侧因为画框占 78%，被列宽裁掉后每侧只剩约 20–30px 的薄片，是这套版面目前最弱的一环。
    过渡统一 ≤280ms、**不加 blur**、倾斜只在 `pointerType === 'mouse'` 时响应；
    `prefers-reduced-motion` 由 CSS 把主牌变换写回 `translate(-50%, -50%)`（JS 设的 `--tilt-*` 因此不生效），
    但**保留侧牌的 3D 排布**——那是版面不是动画。
    `.preview-gallery` 上加 `overflow-x: clip`，把侧牌超出列宽的部分裁掉，免得蹭到左栏文案：
    选 `clip` 而不选 `hidden`，是因为 `hidden` 在另一轴仍为 `visible` 时会被强算成 `auto`、凭空多出一个滚动容器；
    而 `clip` 按规范**不算** grouping——`transform-style` 被压平的条件是 overflow "any value other than
    visible **or clip**"。**早前一版这里写成「clip 放到 .preview-stage 上会按规范把 3D 压平」是错的**（引据方向反了），
    代码本身没问题（裁的是列盒，与舞台同宽），错的只是理由，已更正。
  - **文案栏的数据都是真的**：左栏页码 `0N / 0M` 与进度段宽度（`--preview-progress`）按相册实际张数与
    当前序号计算；每张牌的标题与副标题取**图片 URL 自身的文件名与目录**（`frameLabel` 解 `pathname`，
    百分号解码失败就原样显示），没有说明文字时退回项目名——**不写参照稿里那种虚构的界面描述与指标**。
  - **访客看到的张数位置要经得起重拉**：标签页重新可见 / 重新获得焦点时 `refreshPublicData` 会重读公开接口，
    `items` 换成一批新对象 → `ProjectRoute` 依赖 `listed` 重跑 → `project.previewImages` 换成新数组引用。
    所以 `PreviewGallery` 的复位 effect 依赖的是 **`images.join("|")`**（相册内容），不是数组引用；
    内容没变就不动，访客正看第 5 张不会因为切了一下标签页被硬打回第 1 张（换标本 / 后台改图才复位）。
  - **预览区留白**：用「密集档」间距（`--section-pad-dense`），而不是叙述段落的 loose 档，避免图被推到很下方。
    区块级 eyebrow 重新编号为 `PREVIEW / 01 → FIELD NOTES / 02 → ANATOMY / 03 → EVOLUTION / 04 →
    NEIGHBOURING SPECIMENS / 05`；预览区无相册时整段不渲染，编号按版面身份保留（不从 01 起排）。
- **图片代理**（同源 `GET /api/img`）：详情页所有相册图都经它中转，**这是解决"图显示慢"的关键**。
  - **为什么需要**：图源是站外的 GitHub raw（原图常见几百 KB 的 PNG，且只缓存 5 分钟）；Workers 运行时装不了
    图片解码器、Cloudflare 自带的 Image Resizing 要付费。因此由 Worker 借免费的转换服务
    （`wsrv.nl`）把图压成 **webp** 再回给浏览器：实测 446KB 的 PNG → 1600 档约 **31KB**
    （上一版还有 160 档缩略图约 3.4KB；该档现在前台已无调用路径，数字只作为「转换后体量级」的历史实测留档）。
  - **接口**：`/api/img?w=<宽度>&src=<原图 URL>`。宽度夹到 `[64, 2000]`（默认 1600）。
    前台**只有 1600 一档**（`IMAGE_WIDTH.plate`）：观察台上同时存在的牌不超过 4 张，全部按主图清晰度取，
    翻到邻牌时不必再请求一次更大的尺寸。**也别给侧牌/后牌单设小档**——后牌每次翻页会换成另一张，
    相册里每张图迟早都会当一次后牌，分档会让同一张图产生两种转换变体（12 张全看完：12 次 → 24 次），
    免费的第三方转换服务反而多承担一倍的真实转换。**按常量推算**：首屏转换请求由上一版（1 主图 + 4 邻卡 +
    12 张 160 缩略图）的 ~17 降到 4，翻完 12 张由 ~36 降到 12，首屏字节基本持平；
    代价是 4 张 1600×1000 同尺寸牌同时在场，解码内存比上一版多约十几 MB——
    低配手机上是这套版面需要留意的一点（**未实测**）。
    管理端抽屉的缩略图仍用原地址，便于直接核对填进去的链接本身是否可达。
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
- **详情页布局约定**（`frontend/src/index.css` 的 `:root` token）：
  - **统一栅格**：`--gutter`（`clamp(20px, 6vw, 96px)`）是 header / hero / 各 section **共用的左右边缘**。
    原先三处各自为政（header 固定 40px、hero 叠加 6vw+4vw、section 6vw），最宽处差到 100px 以上。
    **文档区（README / DEPLOYMENT）例外，保持居中**——它是阅读版面，与叙述区左边缘不一致是刻意选择。
  - **纵向两档**：`--section-pad-loose`（叙述段）与 `--section-pad-dense`（预览 / 统计等密集区块），
    取代原来所有区块一律 `128px`。
  - **锚点偏移**：`--sticky-offset`（72px 吸顶头 + 16px）作为 `scroll-margin-top`，
    用在各 section、compose 块与 README 的 h1–h4 上——原来「READ FIELD NOTES」与 README 目录跳转
    的落点会被吸顶头盖住。
  - **文档列宽**：`220px`（目录）+ `minmax(0, 920px)`（正文），`justify-content: center`，间隙
    `clamp(32px, 5vw, 96px)`；760px 以下收成单列。
    曾经收窄到 `58ch` 想让行长更讲究，但实际太窄（尤其中英文混排与长 compose 行），已放宽。
- **详情页排版约定**：**观察台自己**的微标签（`FRAME / 0N`、图注、编号条、页码）统一到 **10px**（参照稿是
  7/8/9px 混用）；但详情页其余小字**没跟着抬**——共享的 `.eyebrow` 仍 9px、`.document-section > aside` 目录项
  与 `.doc-toc-item` 仍 9px、NEIGHBOURING 区块的 `.related-grid span` 仍 8px（原来 7px 的 COPY 按钮已抬到 10px）。
  `h1` 行距 `.76 → .9`（`.76` 会把中文行距压太紧）；README 标题只有**一套**字号——
  原 `.markdown-body h2` 的 `48–78px` 会被 `.markdown-body .readme-doc h2` 完全盖掉，
  且在 deployment 面板里是 52px 的隐患，已合并为 `clamp(26px, 2.6vw, 34px)`。
  > 注意：`.eyebrow`（9px）与首页 / 页脚 / 管理端的 8px 微标签**本轮仍未动**，全站抬到 10px 需单独确认。
- **DEPLOYMENT 代码块**：头部（路径 + COPY）从绝对定位改为 **flex 行**，去掉 54px 占位内边距与
  `min-height: 118px`，因此**短 compose 文件不再被撑高**；`pre` 用 `max-height: min(72vh, 760px)` +
  `overscroll-behavior: contain`（既看得下较长的 compose，又不至于和整页抢滚动）；
  宽度随上面的文档列一起放宽到 920px；COPY 按钮 7px→10px、触控目标 ≥32px。
  滚动条统一为一档**低对比细条**（`scrollbar-width: thin` + `::-webkit-scrollbar`，深色块内用浅色 thumb）——
  刻意**不隐藏**滚动条，避免丢掉「这里能滚」的可发现性。
- **管理端写接口对请求体本身也是严格的**：`POST/PUT /api/admin/projects*`、`POST /api/admin/github-import`、
  `PUT /api/admin/site-settings` 收到**不可解析的请求体**时返回 **400**（此前会抛错变成 500，把客户端问题
  报成服务端问题）。`POST /api/admin/github-sync` 的请求体是可选的，缺失或不可解析按默认方式同步，不报错。
- **详情页文档展示**：仅 `GET /api/projects/:id` 返回文档内容（列表接口不携带，避免体积膨胀）。前台
  README tab 用内置极简 Markdown 渲染器（`frontend/src/utils/markdown.tsx`）把 Markdown 转成 React
  元素——**不解析也不透传原始 HTML**，链接只放行 http/https/mailto；当前语言缺 README 时回退另一种语言
  并标注「原文」；DEPLOYMENT tab 展示 dev/prod Compose 原文并可复制。详情页由 `ProjectRoute` 按 id 自行
  拉取，深链或刷新时先显示骨架、查不到则给出「未找到标本」页，不再闪回首页。
