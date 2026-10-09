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
│   │   │                         #   previewFrames.ts 观察台在场牌与牌面文字、
│   │   │                         #   previewRules.ts 相册判据（与 Worker 写侧同一份）、
│   │   │                         #   projectDiff.ts 抽屉改动列判定、usage.ts 匿名埋点、
│   │   │                         #   navOrder.ts 首页栏目顺序、bilingual.ts 双语读侧规则
│   │   └── App.tsx               # 动态数据渲染与安全管理端
│   ├── .dev.vars.example         # 本地开发环境变量模板（复制为 .dev.vars 使用，不入 Git）
│   ├── jwt_verify.test.mjs       # JWT 校验与 Access 白名单单元测试（pnpm test 依次跑以下十个文件）
│   ├── demo_url.test.mjs         # 演示地址规范化单元测试
│   ├── sync_update.test.mjs      # GitHub 同步字段归属 / 时间线生成单元测试
│   ├── image_proxy.test.mjs      # 图片代理：宽度夹取 / 图源白名单 / 转换地址构造单元测试
│   ├── preview_frames.test.mjs   # 观察台：在场张数 / 环形去重 / +N 口径 / URL 解析兜底单元测试
│   ├── preview_dir.test.mjs      # 预览图目录导入：地址解析 / 位图筛选 / 排序 / 拼接 / 异常兜底单元测试
│   ├── preview_rules.test.mjs    # 相册判据前后端一致性 / 坏行行号 / 抽屉改动列判定 / 埋点事件白名单
│   ├── nav_order.test.mjs        # 首页栏目顺序 = 导航顺序（缺项兜底 / 脏输入退化）
│   ├── bilingual.test.mjs        # 挑战/方案双语读侧：新列优先、旧列中文兜底、坏 JSON 不抛错、回退标注
│   ├── sync_scope.test.mjs       # 同步范围 ids：省略=全表、空数组=拒绝、形态与上限、去重
│   ├── wrangler.toml             # Worker 配置：入口 + 静态资产 + D1 绑定 + Analytics Engine 数据集（本地与 Git 构建共用）
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
│   ├── 0010_add_preview_image.sql# 详情页标本托板预览图：项目图片 + 相册（同步从 README 提取，管理端可覆盖）
│   └── 0011_add_bilingual_narrative.sql
│                                 # 挑战 / 解决方案双语列（challenge_json / solution_json，旧单列只读兜底）
│
├── scripts/                      # 运维脚本
│   ├── d1-migrate.sh             # 一键按序执行全部 D1 迁移（local / remote，可反复执行）
│   ├── usage-probe.sh            # 接口探针：起 8898 的本地 Worker，自收进程（埋点 / 图片 / 双语写读）
│   ├── probe-bilingual-payload.mjs # 生成双语写读往返的请求载荷（供探针第 4 节 --data-binary 用）
│   └── make-brand-logos.py       # 由 frontend/assert/ 原件派生 frontend/public/brand/ 两套 logo
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

脚本会按 `0001 → 0011` 的文件名顺序逐条执行、打印每条的 `✓ 已执行 / · 已记录，跳过 / ✗ 失败`，
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
| `0011` 双语叙述 | 项目列表/详情的 SELECT 与管理端写路径 | 同上两条 500；且「挑战 / 解决方案」保存写不进库（`challenge_json` / `solution_json` 不存在） |

> ⚠️ **顺序是硬约束，而且 Git 自动构建不会替你把关**：第 4 节的 Workers Builds 是"push 即部署"，
> 一旦你为了跑迁移而先 push 了代码，部署就已经发生了。正确顺序是
> **先 `bash scripts/d1-migrate.sh remote` → 再 push/部署**。
> 反序的实际表现（本轮实测，不是推测）：`no such column: challenge_json` →
> `GET /api/projects` 与详情接口 500 → 首页不报错，但公开列表变为空并显示一句
> 「馆藏尚未公开任何标本」的空状态（列表从空开始，接口失败时保持当前内容、**不再**用内置示例顶替），
> 详情页里已发布 id 仍显示陈旧内容、其它 id 显示"未找到标本"，管理端保存项目直接 500。
> 这类"接口全 500 但页面还在跑"的形态比白屏更难发现，所以 `sync_update.test.mjs` 的 case 17f 已经把
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
# 前置：Node ≥ 22.18（`.mise.toml` 已钉 22）。单测直接 `import` .ts 源文件，
# 靠的是 Node 原生的 TS 类型剥离——22.6–22.17 不带 flag 会在 import 阶段就报错。

# Functions TypeScript 类型检查
pnpm typecheck

# 一条命令跑完的接口端到端探针（自己起 dev、自己收尾，只杀自己起的进程）：
#   健康检查 / 埋点端点的接受与拒绝（含白名单外事件）/ /api/img 三档是否真返回 webp /
#   管理端 PUT 的两条写路径与相册 400 话术（测完把 001 的两列原值写回）
# 端口固定在 8898，避开 8787（另一个会话可能在用）。
bash scripts/usage-probe.sh
```

> Windows/Git Bash 实测坑：`wrangler dev` 的父进程被杀后 **workerd 子进程可能仍占着端口**，
> 后续探针会打到"旧代码的幽灵"上（表现：路由明明存在却 404，或 D1 报 `no such table`）。
> 怀疑时先看 `netstat -ano | grep :<端口>`，只清理自己起的那些 PID。
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
  - **编辑所有、只在空白时填充**：`description_json`、README/Compose 文档与预览图（项目图片 `preview_image_url` + 相册 `preview_images_json`）；后台手写内容一律不覆盖。
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
  数据分两列且**互不等价**：**项目图片** `preview_image_url`（详情页 hero 大图与对外 `previewImageUrl` 用，
  是显式字段；首页卡片仍是占位标本图、`og:image` 是构建期静态文件）与**相册** `preview_images_json`（观察台用，有序数组）。管理端有四个入口：「项目图片」输入框
  （含「用相册第一张填入」捷径）、「预览图」多行文本框、「按目录批量导入」，以及同步时从 README 自动提取。
  **公开列表与公开详情都返回这两列**：`ProjectRoute` 会先用列表项当初始值渲染详情页，列表若只给项目图片，
  相册会在详情到达前短暂只显示一张（无导航）。README/Compose 文档仍只在详情接口返回。
  - **位置**：预览区在 **OVERVIEW 面板内**（不再夹在页签与面板之间），切到 README / DEPLOYMENT 时不会看到它；
    hero 右栏在项目**有项目图片时显示它**（相框按图片自身比例自适应，夹在 `[0.8, 2.2]`），
    该项为空才退回原来的占位标本图。
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
    写侧**不再做任何"空项目图片→取相册第一张"的推导**（那是假状态来源，见下）。
    POST 与 PUT 共用同一条规则（`validatePreviewInput` + `previewFieldsFromBody`）——
    同一请求体在两条路径必须落库一致（本仓库为 `demoUrl` 踩过两条路径不一致的坑）。
    读取侧仍保持宽容：绕过 Worker 直接写库的脏值不会让接口 500，只会被过滤掉。
  - **画框方向自适应**：整台观察台按**当前那张**的自身宽高换画框尺寸——横图用宽板（桌面 `min(720px, 80%)`，
    ≤760px 为 86%），竖图（手机截图）收窄成竖板（桌面 `min(230px, 36%)`，≤760px 为 62%），
    画框高度固定（桌面 `min(72%, 420px)`、手机 `min(74%, 320px)`），一律 `contain` **不裁切截图**。
    方向不写在数据库里，由 `<img>` 解码后的 `naturalWidth/naturalHeight` 得出并按张序缓存进 state；
    命中缓存的图可能先于 `load` 监听器就绪，所以挂载时还查一次 `img.complete`，否则竖图首帧会先套横框。
  - **相册交互**：只渲染**当前张 + 左邻 + 右邻**，总数 >3 时再多渲染一张代表「往后还有」的后牌
    （编号牌上标 `+N`，N = 未显示的张数）——一张 12 图的相册不会同时解码 12 张大图。
    2 张时左右邻会绕回同一张，`previewFrames()`（`src/utils/previewFrames.ts`，纯函数 + `preview_frames.test.mjs` 闸门）
    去重只留一张侧牌；1 张时不渲染翻页控件，舞台 `tabindex="-1"`（不可 Tab 停留）。
    下方是**缩略图索引条**（每张 58×44 的小图 + 左上角 `0N` 角标，可换行，触控目标 ≥44px），两侧 ←/→ 翻页，
    末端一个「放大」按钮。为什么不是裸编号：`01…12` 无法预告"第 7 张是什么"，十几张时访客只能逐张盲翻；
    管理端抽屉早就用同一批 URL 渲染缩略图，前台没理由更弱。索引小图与管理端**共用同一档宽度**
    （`IMAGE_WIDTH.thumb = 200` → 同一个 `/api/img` URL → 同一份边缘缓存）。
    舞台支持 ←→ 方向键、回车/空格（放大当前张）、指针拖动、以及**鼠标悬停时的 3D 倾斜**：位移超过 8px 才算起拖并接管指针
    （此时牌面自己的 click 会被重定向，不会「拖一下就顺手改了当前张」），再超过 45px 才真的翻页；
    8–45px 之间什么都不发生（回弹）。鼠标点侧牌可直接切过去，**键盘**选张走方向键与索引条。
    可访问名 = **可见的编号牌文字 + 文件名**（`FRAME / 03 pipeline-console`、索引条是 `03 pipeline-console`）：
    这样既满足 WCAG 2.5.3（名称包含可见标签文字），又不会把整条 URL 目录念给读屏——目录那行 `<small>`
    是 `aria-hidden`，且**没有目录可显示时整行不渲染**（免得跟项目名重复一行）。
    索引条整体是 `role="group"` + 组名，否则一排缩略图对读屏没有上下文；文件名同时挂 `title`（只对鼠标有效）。
    页码用 `aria-live="polite"`；后牌是 `aria-hidden` 的 `<div>`（纯版面，不进读屏顺序）。
  - **放大看图层**（点主牌 / 「放大」按钮 / 舞台内回车）：整幅实底图层，`role="dialog"` + `aria-modal`，
    图取 `IMAGE_WIDTH.zoom = 2000`（就是 `/api/img` 的宽度上限）。层内 ←/→ 继续翻同一本相册、Esc 或点空白关闭，
    关闭时还原 `body` 滚动。**背景用实底页面色而不是半透明压暗**：截图多为浅色 UI，压暗会把图边缘吃进背景里；
    层里另给「原图」直链（新标签打开未转换的原地址），代理是为了省流量，不是替访客做选择。
  - **首屏只让主牌抢带宽**：侧牌与后牌**等主牌定妆后才开始请求**（`load` 与 `error` 都算定妆，坏图不会冻住整台），
    定妆前它们是同尺寸的占位盒，所以不跳版。冷缓存时首屏只有 1 张 1600 走 Worker→转换服务那两跳，
    而不是 4 张同时抢；命中边缘缓存（实测 ~7ms）时肉眼没有差别。**没有**给侧牌降档——
    降档会让同一张图产生两种转换变体（12 张全翻一遍：12 次 → 24 次），第三方免费转换服务反而吃更多请求。
  - **3D 封面流（取代竖向牌堆）**：`perspective: 1800px` + `transform-style: preserve-3d`，
    四张牌按 `data-position` 排成 active / next / previous / back，侧牌 `rotateY ±42deg` 向两侧摊开。
    与上一版竖向牌堆的取舍：侧牌按**自身宽度**的 76% / 23% 位移，会把一部分牌面推到主牌轮廓之外。
    实测（把舞台宽度钉成 360px / 838px、关掉过渡后读边界）两侧各露出 **110–150px**，
    而横向扇形当年是位移量级不够导致后牌被主图整块压住。
    > 诚实标注：这组数字是在 0×0 的浏览器面板里**钉宽度**测的，当时生效的是 ≤760 那组位移常量
    > （±78%/±22%、scale .72/.74）；桌面那组（±76%/±23%、scale .76/.79）与它接近但**未在真实视口下复测**。
    **≤760px 不再沿用这套 3D 封面流**：主牌占 78% 时两侧残片只剩 20–30px，"后面还有图"这个线索基本读不出来，
    十几个格子还会换 3 排挤占正文。手机版面改为**只显示当前张**（侧牌/后牌 `display: none`、主牌 86% 并写回静态变换），
    第一行放 ←/→ 与「放大」，缩略图索引单独一行**横向滚动**（用显式 `order`，不靠 DOM 顺序凑），
    44px 触控目标保持。邻位信息交给索引条——它是确定可见的，不依赖 3D 残片能否被看见。
    **侧牌在窄屏是直接不渲染的**（`useNarrowScreen()` 与 CSS 共用同一个 760 断点）：
    `display: none` 的 `<img>` 仍会发请求，只靠 CSS 隐藏会让"首屏只让一张图抢带宽"落空。
    过渡统一 ≤280ms、**不加 blur**、倾斜只在 `pointerType === 'mouse'` 时响应；
    `prefers-reduced-motion` 由 CSS 把主牌变换写回 `translate(-50%, -50%)`（JS 设的 `--tilt-*` 因此不生效），
    但**保留侧牌的 3D 排布**——那是版面不是动画。
    装饰层也随之外收：椭圆轨道的内圈虚线与内阴影在 ≤1100px 撤掉（只留一条椭圆线），≤760px 整条不画
    （那里已经没有 3D 排布，轨道没有指代对象）；区块的径向主色渐变由 10% 降到 7%——
    坐标纸底纹 + 两层渐变 + 双层轨道同时在场会跟主牌抢注意力。
    `.preview-gallery` 上加 `overflow-x: clip`，把侧牌超出列宽的部分裁掉，免得蹭到左栏文案：
    选 `clip` 而不选 `hidden`，是因为 `hidden` 在另一轴仍为 `visible` 时会被强算成 `auto`、凭空多出一个滚动容器；
    而 `clip` 按规范**不算** grouping——`transform-style` 被压平的条件是 overflow "any value other than
    visible **or clip**"。**早前一版这里写成「clip 放到 .preview-stage 上会按规范把 3D 压平」是错的**（引据方向反了），
    代码本身没问题（裁的是列盒，与舞台同宽），错的只是理由，已更正。
  - **文案栏的数据都是真的**：左栏页码 `0N / 0M` 与进度段宽度（`--preview-progress`）按相册实际张数与
    当前序号计算；每张牌的标题与副标题取**图片 URL 自身的文件名与目录**（`frameLabel` 解 `pathname`，
    百分号解码失败就原样显示），没有说明文字时退回项目名——**不写参照稿里那种虚构的界面描述与指标**。
  - **项目图片与相册是两个字段**（不再让相册首张兼任封面）：`preview_image_url` 是**显式**字段，
    抽屉里的名字就叫「**详情页大图（项目图片）**」——名字即作用范围：它只驱动详情页 hero 与对外 `previewImageUrl`，
    **首页卡片仍用占位标本图、`og:image` 仍是构建期静态文件**（这两点在字段说明里明写，不让管理员猜）。
    独立输入框 +「用相册第一张填入」按钮（带过之后两者互不影响，调整相册顺序不会改大图）。
    写侧 `validatePreviewInput` **不再做任何推导**：不给该键就不动这一列（部分更新），显式空串就是清空；
    只有 README 同步在**库里该项为空**时才用相册首张补齐（`buildProjectSyncUpdate` 的「只填空白」）。
    读侧 `publicGallery` 仍保留退化：项目图片为空时对外报告相册第一张，所以老数据不会因为解耦而没图。
    管理端抽屉里的缩略图条，会给等于项目图片的那一张打上「详情页大图」标记。
    > 用户可见文案统一到「项目图片」：服务端 400 话术（`项目图片地址无效…`）与同步备注（`预览图已从 README 提取（项目图片 / 相册 5 张）`）
    > 以前写的是「封面」，与抽屉里的字段名两种叫法——同一个概念只留一种词。
  - **按目录批量导入预览图**（`POST /api/admin/preview-import`，body `{dir}`）：填图片所在目录地址即可，
    支持 `raw.githubusercontent.com/owner/repo/分支/路径`、`github.com/owner/repo/{tree|blob}/分支/路径`
    以及省略协议/省略域名三种写法；**只支持 GitHub**（gitlab 等一律 400 说明原因），
    只列**一层**目录（子目录只计数不递归），只取位图扩展名
    （png/jpg/jpeg/webp/gif/avif/bmp，SVG 与 markdown 被过滤并计入 `skippedNonBitmap`），
    排除徽章类文件名，**按文件名排序**保证顺序稳定，路径逐段 `encodeURIComponent`（空格 → `%20`）。
    分支名带 `/` 时切分会歧义，因此解析器给出第二个候选「整段当路径 + 用默认分支」再试一次；
    只给 `owner/repo/X` 一段时直接要求写全（避免把分支名当目录）。
    返回 `images / found / truncated / skippedNonBitmap / skippedBadge / subDirectories / rateLimitRemaining`，
    **上限 12 张**：超出部分标 `truncated` 并如实告知还剩几张没填。
    前端把结果**并入草稿文本框**（去重、凑满 12 即停），必须再点「保存项目」才写库——导入本身不改数据库。
    旁边有个「**整体替换现有相册**」开关（默认追加）：相册本来就满 12 张时，"只能追加"等于导入无效。
    GitHub 配额来源：Worker 的 `GITHUB_TOKEN`（`.dev.vars.example` 已改为"建议配置"），
    或抽屉里那条请求自动带上的「GitHub 同步」栏 token；两者都没有时走匿名 60 次/小时，
    触发限制返回 **429 并说明剩余配额**。撞限后**输入内容保留、按钮变成「重试」**，并提示填 token 可绕开匿名限额，
    不必重填地址；导入的失败原因与统计（新增/替换几张、跳过重复、过滤非位图与徽章、被上限挤掉几张）
    **就近显示在按钮下面**，不只放在顶部那条会被冲掉的通知里。
  - **抽屉的四个关闭入口都有未保存保护**：Esc / 点遮罩 / 右上角 × / 底部「取消」全部收敛到 `requestClose()`。
    判据与保存路径**共用同一个 `changedColumns()`**（`src/utils/projectDiff.ts`，纯函数 + `preview_rules.test.mjs` 闸门），
    所以不会出现"关闭时说没改动、保存却写进去"的分裂；有改动时在页脚上方展开一条确认条
    （「继续编辑」/「放弃并关闭」，`role="alertdialog"`，不用浏览器原生 confirm 以免脱离抽屉焦点）。
    新建项目拿 `createProject` 生成的空白模板当基线——**一个字没改的新草稿可以直接关**，不弹确认。
    `preview_images_json` 这类 JSON 列比较前会先解析再比，避免库里 `["a", "b"]`（带空格）对上本地
    `["a","b"]` 造成"每次打开都有改动"的假警报。
  - **相册坏行在点保存之前就被点名**：文本框下面按行列出问题（`第 7 行：不是有效的 http/https 绝对地址…`），
    对应的缩略图描红边。判据不是前端另写一份，而是与 Worker 写侧**同一份** `src/utils/previewRules.ts`
    （`sanitizeImageUrl` / `PREVIEW_IMAGE_LIMIT` 由 Worker 再导出，`galleryRowIssues` 是它的逐行诊断视图）；
    `preview_rules.test.mjs` 把同一批输入喂给前后端两侧，要求**结论必须一致**。服务端仍是最终裁决。
  - **后台通知分三种生命周期**：结果类（`info`）6 秒自动让位，失败类（`error`）常驻、带关闭按钮并用
    `role="alert"` + 红边，在途类（`busy`，如「正在读取目录…」）不自动消失——抓取可能超过 10 秒，
    自动消失会让人觉得没反应。以前只有一条永不消失、新消息覆盖旧消息的通知位。
  - **管理端抽屉的缩略图也走 `/api/img`**：以前是 `<img src=原图>` 直连，一次开抽屉要拉十几张几百 KB 的 PNG，
    而公开页同一张图走 webp + 边缘缓存——**管理员看到的字节量与速度不该和访客不是同一份**。
    现在与前台索引条共用 `IMAGE_WIDTH.thumb = 200` 同一档（同一个 URL → 同一份缓存）。
  - **管理端与公开站不再共用一份行数据**（这是「保存后再次打开没有回显」的根因修复）：
    `/api/projects` 是对外投影（camel 命名，**不含** `readme_zh / readme_en / compose_dev / compose_prod /
    internal_notes / sort_order / docs_synced_at / preview_images_json / preview_image_url`），
    而编辑抽屉绑的就是这些原始列名。以前 `App` 只有一份 `items`，而标签页重新聚焦时的
    `refreshPublicData` 会用公开投影覆盖它——人在后台切出去复制一个 URL 再回来，抽屉里这六项就整片空了，
    只有刷新页面（`AdminGateway` 重新拉管理端列表）才恢复。现在管理端单独持有 `adminItems`，
    退出后台时再显式重取一次公开数据给前台用。
    同时 `saveProject` 成功后**改为重取管理端列表**（和「保存展示顺序」同一条模式），
    不再把本地 payload 拼回列表——这样回显显示的永远是库里的行，服务端的规范化结果不会看不见。
  - **PUT 只提交改动过的列**（`saveProject` 拿列表里的当前行做基线逐项比较）：整行全量回写会把抽屉打开期间
    后台同步/导入刚写进库的字段（`stars`、`version`、`README`、时间线…）用陈旧值悄悄盖回去，
    那是另一种"提示成功但库里被改坏"。没有检测到任何改动时直接不发请求（也不报"已保存"）。
    同一条规则也用在「一键切换状态」与「保存展示顺序」上（各只提交 `status` / `sort_order` 一列）；
    POST 新建仍提交全量，因为要落所有列的默认值。
    顺带两处同源修正：抽屉的相册文本框**不再**在项目图片非空时把它当作第一行（否则任何一次保存都会把
    项目图片固化成相册，并让 `has_preview_images` 变 1，此后同步永不再为该项目的相册补图）；
    `.admin-notice` 的 `z-index` 从 50 抬到 220——抽屉遮罩是 100，原来抽屉里看到的保存失败/导入结果全被盖住。
  - **访客正在看的那一张要经得起重拉**（同一个根因在详情页的表现）：`items` 换成一批新对象 →
    `ProjectRoute` 依赖 `listed` 重跑 → `project.previewImages` 换成新数组引用。
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
    前台有**三档**（`IMAGE_WIDTH`）：`plate = 1600`（观察台的牌，台上同时最多 4 张全按主图清晰度取，
    避免同一张图因侧牌降档产生两种转换变体）、`thumb = 200`（索引条角标小图与管理端抽屉的缩略图，
    两处同一档 = 同一份缓存）、`zoom = 2000`（放大层，就是服务端 `IMG_WIDTH_MAX` 的上限）。
    翻到邻牌时不必再请求一次更大的尺寸。**也别给侧牌/后牌单设小档**——后牌每次翻页会换成另一张，
    相册里每张图迟早都会当一次后牌，分档会让同一张图产生两种转换变体（12 张全看完：12 次 → 24 次），
    免费的第三方转换服务反而多承担一倍的真实转换。**冷缓存首屏的实际账**（按常量推算，未做真实视口复测）：
    大图请求由「主牌 + 3 张侧后牌」4 次降到 **1 次**（侧牌等主牌定妆后才发），
    换来索引条为每张图多要一个 200 档小图（懒加载、去重、边缘缓存 7 天）——
    即约 `1×31KB + 最多 12×几 KB`，比原来的 `4×31KB` 仍是一档的下降；索引条那部分是为了"看得清要翻什么"付的代价。
    代价是 4 张 1600×1000 同尺寸牌同时在场，解码内存比上一版多约十几 MB——
    低配手机上是这套版面需要留意的一点（**未实测**）。
    管理端抽屉的缩略图**也走这条通道**（与索引条共用 200 档）：以前它是 `<img src=原图>` 直连，
    管理员一次开抽屉要拉十几张几百 KB 的 PNG，看到的字节与速度都不是访客那一份。
    要核对"原地址本身是否可达"用放大层里的「原图」直链，而不是靠抽屉缩略图。
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
- **详情页排版约定**：**观察台自己**的微标签（`FRAME / 0N`、图注、索引条角标、页码）统一到 **10px**（参照稿是
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
- **同一列不接受两种拼写**：管理端用 D1 原始列名（`preview_images_json` / `preview_image_url`），
  公开投影用 camel 名（`previewImages` / `previewImageUrl`）。两者同时出现在一个写请求里且内容不一致时，
  `previewFieldsFromBody` 直接 **400 点名两种写法**，不再像以前那样让 camel 悄悄赢过 snake——
  那会造成"抽屉里编辑的是 A、库里存的是 B、后台还提示已保存成功"的假状态。内容一致时按管理端口径写入，
  只给其中一种也照常接受。
- **详情页文档展示**：仅 `GET /api/projects/:id` 返回文档内容（列表接口不携带，避免体积膨胀）。前台
  README tab 用内置极简 Markdown 渲染器（`frontend/src/utils/markdown.tsx`）把 Markdown 转成 React
  元素——**不解析也不透传原始 HTML**，链接只放行 http/https/mailto；当前语言缺 README 时回退另一种语言
  并标注「原文」；DEPLOYMENT tab 展示 dev/prod Compose 原文并可复制。详情页由 `ProjectRoute` 按 id 自行
  拉取，深链或刷新时先显示骨架、查不到则给出「未找到标本」页，不再闪回首页。

## 七、 匿名使用度量（Analytics Engine，免费、无迁移）

改版前先回答一句"怎么知道有没有变好"。此前整站**零度量**，所有判断只能靠专家走查，所以这轮补了三个聚合事件。

- **为什么用 Analytics Engine 而不是新开 D1 表**：免费额度每天 10 万个数据点（约合每月 300 万）足够、**不需要数据库迁移**
  （因此不涉及生产写库）、数据天然按时间分桶。数据集 `nestspace_usage`，绑定名 `METRICS`（见 `frontend/wrangler.toml`）。
- **收什么**（白名单在 `worker/index.ts` 的 `USAGE_EVENTS`，白名单外一律 **400**，`preview_rules.test.mjs` 会核对这份表）：
  | 事件 | 方式（`m`） | 回答的问题 |
  | --- | --- | --- |
  | `deck` | `view` / `thumb` / `plate` / `arrow` / `drag` / `key` / `zoom` | 观察台有没有让人看图、翻图；缩略图索引与放大被用到没有 |
  | `imgfail` | —（带图源主机名 `h`） | 图片加载失败率，分母用 `deck view`；哪个图源在坏 |
  | `dirimport` | `ok` / `ratelimited` / `notfound` / `error` | 批量导入到底用了多少次、卡在哪一步（对应"减少手工粘贴"这个诉求） |
- **不收什么**：IP、User-Agent、cookie、访客标识、项目 id、URL 查询串都不写。`/api/usage` 是**公开无鉴权**的，
  因此带**按 IP 的粗限流**（每分钟 120 条，超出静默丢弃并返回 204，不给访客报错），主机名只收
  `[a-z0-9.-]{1,63}` 形态，其余当没给。
- **前端怎么发**：`src/utils/usage.ts` 用 `navigator.sendBeacon`（页面正在卸载也能发出），
  没有 Beacon 时退到 `fetch(..., { keepalive: true, credentials: "omit" })`；**任何失败都静默吞掉**——
  埋点不该产生用户可见的错误，绑定缺失时整条端点也照样返回 204。
- **怎么看**（部署后，本地 dev 的数据不进远端数据集）：
  ```bash
  cd frontend
  npx wrangler analytics query nestspace_usage --since 7d --limit 20
  ```
  子命令名随 wrangler 版本可能不同（旧版为 `wrangler analytics engine query`）；
  也可以在 Cloudflare 控制台 → Analytics Engine Explorer → `nestspace_usage` 里按 `indexes[0]`（事件名）分组看。
  > 诚实标注：本仓库**未在真实数据集上验证过查询命令的输出形态**（那需要一次 `wrangler deploy`，属线上动作）。
  > 端点侧的写入与拒绝行为已在本地 `wrangler dev` 实测。
- **workerd 的一条硬约束（踩过）**：Worker **入口模块的导出**只接受 handler 或函数，
  把数字常量（如 `export { PREVIEW_IMAGE_LIMIT }`）从入口再导出会让 workerd 直接启动失败：
  `Incorrect type for map entry 'PREVIEW_IMAGE_LIMIT': the provided value is not of type 'function or ExportedHandler'`。
  因此 `worker/index.ts` 只再导出 `sanitizeImageUrl`（函数）；上限的一致性改由闸门测试做**行为断言**
  （13 张必须被服务端 400，且话术里的数字取自那一个常量）。

## 八、 品牌标 / 栏目顺序 / 双语叙述 / 同步范围

- **品牌标按深浅模式各一张，且可被管理端替换**：原件是 `frontend/assert/logo_dark.png` 与 `logo_light.png`
  （882×882 的**完整组合标**：徽章 + `OmniNest` + `ATARRAYECHO`，各带不透明底色）。
  站点用的是 `python scripts/make-brand-logos.py` 生成的派生图（原件不动）：
  - `public/brand/logo-mark-{dark,light}.png`（128px，只有徽章）→ 标头默认图；
  - `public/brand/logo-lockup-{dark,light}.png`（320px，整标）→ 想要整标时在管理端填这个路径。
  派生图**从四边泛洪抠背景**而不是全局阈值——浅色版的头发/皮肤本身就接近底色，全局阈值会在人脸上打出洞。
  整标不进标头的原因：图框只有 28px 高，里面的字会被压到读不出，还会和站点自己的 `NESTSPACE` 文字重复。
  - 渲染收在一个组件里：`LogoContent`（内容）+ `LogoWordmark`（首页的 `<a>` 外壳）；
    详情页返回入口是 `<button>`，所以那里用 `LogoContent` 而不是把 `<a>` 套进 `<button>`（非法 HTML）。
  - 管理端「导航与标头」的 Logo 地址**留空 = 用内置深浅两版**，填了 = 两个主题共用它（这就是替换入口）。
    预览区是深浅两版并排——后台只有一套配色，跟着控制台主题走就永远看不到另一版的实际效果。
  - ⚠️ **这些 PNG 必须留在 Git 里、不能走 LFS**：`frontend/.gitattributes` 原本对 `*.png` 全量启用 LFS，
    而 Workers Builds 的 git clone 不解 LFS 指针 —— 那样 `dist/brand/*.png` 会变成 ~130 字节的指针文本，
    配上 `not_found_handling=single-page-application`（缺失路径返回 200 + index.html）与 CSP
    `img-src 'self'`，logo 会**静默坏图**，控制台什么都不报。
    已在 `.gitattributes` 里给 `public/brand/*.png` 单独关掉 filter/diff/merge/text
    （`git check-attr` 实测四项均 unset）；原件 `frontend/assert/` 继续走 LFS 无妨，它不参与构建。
  - ⚠️ **内置默认不会覆盖已存的偏好**：`logo_type` 在生产库里已经是 `'text'`（当年保存过一次），
    代码里的默认值 `'both'` 只对"该列为空"的情况生效。要让标头出图，去
    「导航与标头 → 显示模式」选「图标 + 文字」保存一次即可（这是一次生产写，由你执行）。
- **顶部进度条改为整页滚动进度**：`--page-progress` 以前由螺旋段（cabinet）自己的滚动比例写入，
  而栏目顺序现在可配置 —— cabinet 一旦被拖到后面，前面几段全程读 0，进度条看着是坏的。
  改在 `App` 顶层按 `scrollY / (scrollHeight - innerHeight)` 计算，与段落顺序无关；
  螺旋段自己的投影动画仍用段内比例，没有改。
- **首页内容栏目顺序 = 管理端导航顺序**：`src/utils/navOrder.ts` 的 `orderHomeSections(navItems)` 是纯函数
  （闸门：`nav_order.test.mjs`），首页四段按它渲染；导航里没有的段落**排到末尾而不是消失**，
  外链/未知 id 不参与排版。`visible` 开关只管导航条上那个链接在不在，**不会**把对应段落从页面上删掉——
  段落显隐仍由「站点设置 → 展示偏好」的 `homeStatsVisible` 单独控制（两件事刻意不合并）。
- **挑战 / 解决方案改为中英双语**（迁移 `0011`）：库里新增 `challenge_json` / `solution_json`（`{en, zh}`），
  沿用 `description_json` 那一套（`EDITABLE_JSON_COLUMNS` + 管理端投影守卫）。
  - **旧单列降级为只读兜底，不双写**：新列为空时把旧列的值当中文（历史内容确实都是中文写的），
    所以老标本不会因为这次改动整段变空；`bilingual.test.mjs` 锁住这条退化路径。
  - **"没写过"与"被清空"必须分得开**（本轮实测到反例，早期版本写成两者都回退，会让删除永远不生效）：
    抽屉保存的永远是完整一对，清空后写入 `{"en":"","zh":""}` = **显式空记录，不再回退旧列**；
    只有 `''`、`'{}'`、坏 JSON，以及 `'[]'` / `'null'` / `'0'` / `'"abc"'` 这类垃圾形状才算"没写过"，
    继续用旧列兜底（垃圾形状**不会**被当成正文渲染，页面上不会出现引号或字面量 null）。
    判据只看"整串是不是 JSON"，不看开头是不是数字——否则"3 天内完成迁移"这类正文会被吞掉。
    闸门：`bilingual.test.mjs`（含 POST/PUT 同一 body 落库一致）。
  - 前台规则与 README 一致：当前语言没有内容时显示另一种语言并标注「中文原文 / ENGLISH 原文」
    （`pickBilingual` 的 `fallback` 标志），两栏都空才显示「尚未记录」。
  - 管理端抽屉里是「中文 / English」两个并排输入框（`BilingualField`），窄屏收成单列。
- **`description` 现在与挑战/方案同一套规则**（此前是"同一个概念两种规则"）：三处读侧投影改用
  `asBilingual(row.description_json)`（trim、形状校验、默认值统一为 `{en:'',zh:''}`——旧写法管理端默认 `{}`
  会让 `description.en` 是 `undefined`）；写侧 POST/PUT 共用 `normalizeJsonValue`；
  详情页与卡片改用 `pickBilingual`，缺当前语言时回退并标注「原文」（卡片那处不加标注，那里是提要位置）。
  - **同步与导入不再两个口径**：以前同步首次填充写 `{en:t, zh:t}`、导入写 `{en:t, zh:''}`。
    现在两处都走 `pairFromSingleText`：**含 CJK 就只填中文，否则只填英文**。
    为什么不同塞两边——同塞会让"当前语言有内容"成立，中文站于是把英文简介当中文文案显示，
    **连「原文」标注都不给**，那是对访客撒谎。猜错的代价只是标注方向反了，可见内容不变。
  - **抽屉里两个简介框去掉了 `required`**：单语填充现在是正常状态，留着 required 等于
    逼管理员编一段翻译才能保存；改为框下说明"至少填一种"。
  - 闸门：`bilingual.test.mjs`（读侧统一 / 单语配对器 / POST-PUT 同 body 同落库）、
    `sync_update.test.mjs` case 4a/4a2（英文描述只进 en、中文描述只进 zh）。
- **同步可以只挑几个标本**：`POST /api/admin/github-sync` 现在接受可选 `ids`（参数化 `IN` 列表）。
  - 语义：**省略 = 全表**（老行为不变）；**空数组 = 400 拒绝**，绝不退化成全表——
    那会变成"界面显示选了 0 个、实际把整个馆藏都刷了一遍"的假状态（闸门：`sync_scope.test.mjs`）。
  - 未知 id 只是匹配不到，返回 200 + 空结果，不报错；一次上限 500 条（与 `QUERY_ROW_LIMIT` 同值）。
  - 管理端「GitHub 同步」新增「同步范围」勾选卡：默认全选（等价于以前点一下按钮的效果），
    另有全选 / 反选 / 清空，按钮上直接写「(${N})」，一个都没选时按钮禁用并说明原因。
    附带收益：GitHub 匿名配额只有 60/小时，现在能只刷刚改过的那一两个仓库。
  - 探针 `bash scripts/usage-probe.sh` 的第 5 节实测这四条；第 4 节实测双语写读往返（先快照、测完按快照复原）。
    双语载荷由 `scripts/probe-bilingual-payload.mjs` 生成到文件再 `--data-binary @文件` 送出——
    Git Bash 会按本地码页改写命令行里的中文，内联写法会让探针自己造出乱码再误判成接口缺陷。
