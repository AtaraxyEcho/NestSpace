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
│   │   └── App.tsx               # 动态数据渲染与安全管理端
│   ├── .dev.vars.example         # 本地开发环境变量模板（复制为 .dev.vars 使用，不入 Git）
│   ├── jwt_verify.test.mjs       # JWT 校验逻辑单元测试（node jwt_verify.test.mjs）
│   ├── wrangler.toml             # Worker 配置：入口 + 静态资产 + D1 绑定（本地与 Git 构建共用）
│   └── package.json
│
├── migrations/                   # Cloudflare D1 边缘数据库建表与种子数据
│   ├── 0001_create_projects.sql  # 表结构定义（字段脱敏、草稿状态、版本时间戳）
│   ├── 0002_seed_initial_data.sql# 初始 4 个标本数据（Aperture, Lumen, Fjord, Meridian）
│   ├── 0003_create_site_settings.sql # 站点文案与备案号配置表（管理端可编辑）
│   └── 0004_add_nav_and_logo_settings.sql # 顶部导航顺序、Logo 与统计指标扩展表结构
│
└── ARCHITECTURE_PLAN.md          # 详细架构与审查设计文档
```

---

## 二、 部署到 Cloudflare Workers（步骤指引）

本项目为 **Workers 形态**：单一 Worker（`worker/index.ts`，Hono）+ 静态资产（`dist/`）+ D1。
`/api/*` 由配置中的 `run_worker_first` 优先进入 Worker，其余路径走静态资产（未知路径回退 index.html）。

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
# 1. 创建表结构
npx wrangler d1 execute nestspace-prod --remote --file=../migrations/0001_create_projects.sql

# 2. 注入 4 个初始项目标本 + 创建站点文案配置表与扩展表结构
npx wrangler d1 execute nestspace-prod --remote --file=../migrations/0002_seed_initial_data.sql
npx wrangler d1 execute nestspace-prod --remote --file=../migrations/0003_create_site_settings.sql
npx wrangler d1 execute nestspace-prod --remote --file=../migrations/0004_add_nav_and_logo_settings.sql
```

---

### 3. 配置管理员安全口令（Secrets）
在 Cloudflare 边缘环境注入安全密钥，**任何代码中都不会明文暴露**：
```bash
# 先生成高强度随机密钥（32 字节，直接使用输出值）
openssl rand -base64 32

# 注入到 Worker（在 frontend 目录执行，自动读取 wrangler.toml 的项目名）
npx wrangler secret put ADMIN_SECRET_KEY
# 如需 preview 环境也可用密钥联调，可在控制台 Settings ➔ Variables 为 Preview 一并添加
```
> 注意：请使用 32 字节以上纯随机字符串。不要使用人类可记忆的模式化口令
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

### 1. 创建 Access 应用（边缘拦截）

1. 登录 Cloudflare Dashboard ➔ 左侧菜单点击 **Zero Trust**。
2. 进入 **Access** ➔ **Applications** ➔ 点击 **Add an Application**：
   - 选择 **Self-hosted（自托管）**。
   - **Application name**：`NestSpace Curator Console`。
   - **Application domain**：输入你的自定义域名，路径填 `/api/admin*`。
3. 配置策略（**Policies**）：
   - Policy name：`Admin Only`，Action：`Allow`。
   - **Include 规则**：选择 **Emails** ➔ 填入**你的私人邮箱**。
4. 在应用详情页记录 **AUD Tag**（应用基本信息中可见），下一步要用。

**防护效果**：任何人未登录调用 `/api/admin/*`，在 Cloudflare CDN 边缘直接被拦截；
只有你的邮箱能收到 6 位一次性验证码，验证后才被边缘放行。

### 2. 配置 JWT 校验环境变量（代码层第二防线）

在 **Workers & Pages ➔ nestspace ➔ Settings ➔ Variables and Secrets** 中，
为 **Production（和 Preview）** 添加：

| 变量名 | 值 | 说明 |
|---|---|---|
| `ACCESS_TEAM_NAME` | 你的 Zero Trust 团队名 | 即 `<team>.cloudflareaccess.com` 中的 `<team>`，在 Zero Trust 控制台 Settings ➔ Custom Pages 可见 |
| `ACCESS_AUD_TAG` | 上一步记录的 AUD Tag | |

配置后，后端会验证 Access 签发 JWT 的 RS256 签名及 `iss` / `aud` / `exp` 声明。
**安全红线：`Cf-Access-Authenticated-User-Email` 等明文身份头可在任何未被 Zero Trust
覆盖的入口被客户端伪造，代码层一律不作为凭据。** 若这两个变量未配置，管理 API 仅接受
Bearer 密钥——同样是安全的默认状态（fail-closed）。

配置生效后，已通过 Access 验证码验证的浏览器访问 `#admin` 管理页时会自动携带
`CF_Authorization` Cookie，无需再输入口令即可进入；其他浏览器仍需输入
`ADMIN_SECRET_KEY`。

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

# 1. 本地执行本地 D1 迁移测试
npx wrangler d1 execute nestspace-prod --local --file=../migrations/0001_create_projects.sql
npx wrangler d1 execute nestspace-prod --local --file=../migrations/0002_seed_initial_data.sql
npx wrangler d1 execute nestspace-prod --local --file=../migrations/0003_create_site_settings.sql
npx wrangler d1 execute nestspace-prod --local --file=../migrations/0004_add_nav_and_logo_settings.sql

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

主标题、副标题、关于文案、GitHub/邮箱、SEO 标题描述与**页脚备案号**存储在 D1 的
`site_settings` 表中（迁移 `0003`），通过 `#admin` 管理端编辑保存后即时生效，无需重新部署：

- **内容管理**：中英文主标题 / 副标题 / 关于文案、GitHub 主页、联系邮箱；
- **站点设置 → 站点信息 / 搜索与分享**：SEO 标题与 Meta 描述（保存后动态应用到页面标题与描述）；
- **站点设置 → 备案信息 (ICP)**：**默认关闭**。填写备案号并开启开关后，页脚展示
  备案号并链接至工信部备案系统（默认 `https://beian.miit.gov.cn/`，可自定义）。

数据库字段为空时，公开站自动回退到 `frontend/src/data/defaultSiteSettings.ts` 的内置默认文案，
因此未做任何配置的部署也始终有完整可读的内容。

另有两点使用约定：

- **管理端入口**：公开界面（页头/详情页/页脚）不展示任何管理入口按钮，通过直接访问
  `https://你的域名/#admin` 进入（建议收藏）。这只是减少暴露面，真正的安全边界在
  管理 API 层（见第三节三层防线）。
- **GitHub 同步**：管理端「04 GitHub 同步」按各项目的仓库地址调用 GitHub 公开 API，
  把最新 stars / 推送时间 / Release 版本写回 D1。公开仓库无需任何 Token；**私有仓库
  在匿名 API 下不可见（会如实显示 404）**，如需同步请将项目仓库设为公开，或后续扩展
  Token 支持。
