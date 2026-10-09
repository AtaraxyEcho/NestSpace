# NestSpace Cloudflare 零成本全栈分离与安全管理端架构方案

本文档为 **NestSpace** 项目量身定制，基于 **Cloudflare 官方免费额度（Free Tier）**，实现**前后端彻底分离**、**数据动态持久化**、**管理端零信任防护（边缘拦截 + 代码层签名校验，fail-closed）** 的生产级全栈落地架构方案。

---

## 1. 整体架构全景图

```
+--------------------------------------------------------------------------------------------------+
|                                    Cloudflare 全球边缘网络 (CDN/Edge)                            |
+--------------------------------------------------------------------------------------------------+
                                                    |
             +--------------------------------------+--------------------------------------+
             |                                                                             |
      [ 公开访客流量 ]                                                              [ 管理员流量 ]
             |                                                                             |
      域名: nestspace.dev                                                           域名: nestspace.dev/admin*
             |                                                                             |
             |                                                              +-------------------------------+
             |                                                              | Cloudflare Zero Trust (Access)|
             |                                                              | 白名单拦截 (指定个人邮箱 OTP)   |
             |                                                              +-------------------------------+
             |                                                                             | (验证通过放行)
             v                                                                             v
+-----------------------------+                                             +-------------------------------+
|  Cloudflare Workers 静态资产托管 |                                             |   Admin SPA 独立管理界面      |
|  (访客端 React 19 + Vite)   |                                             |   (独立打包/无敏感信息混入公开端)|
+-----------------------------+                                             +-------------------------------+
             |                                                                             |
             | fetch('/api/projects')                                                      | fetch('/api/admin/*')
             |                                                                             | 携带 Access 凭证或 Admin Token
             +--------------------------------------+--------------------------------------+
                                                    |
                                                    v
                             +----------------------------------------------+
                             | Cloudflare Worker — Hono (TypeScript)       |
                             | 框架: Hono (极轻量、高性能 TypeScript 原生)    |
                             +----------------------------------------------+
                                                    |
                         +--------------------------+--------------------------+
                         |                                                     |
                 [ 公开 API 路由 ]                                      [ 管理 API 路由 (中间件拦截) ]
                 - GET /api/projects (仅 LIVE 状态)                     - GET    /api/admin/projects (全量)
                 - GET /api/projects/:id (公开字段脱敏)                 - POST   /api/admin/projects
                                                                        - PUT    /api/admin/projects/:id
                                                                        - DELETE /api/admin/projects/:id
                         |                                                     |
                         +--------------------------+--------------------------+
                                                    |
                                                    v
                                  +------------------------------------+
                                  | Cloudflare D1 边缘数据库 (SQLite)   |
                                  | 表: projects (持久化与草稿隔离)    |
                                  +------------------------------------+
```

---

## 2. 项目工程目录重构规划

推荐采用 **轻量 Monorepo / 单仓库标准 Workers 架构**，既能享有单仓库 Git 维护的便利，又能保持代码物理隔离。

```text
NestSpace/
├── frontend/                     # 公开访客端 React 19 应用
│   ├── src/
│   │   ├── api/                  # 封装的客户端 API 请求层
│   │   │   └── client.ts
│   │   ├── components/           # 公开展示组件
│   │   ├── types/                # 数据类型定义
│   │   │   └── project.ts
│   │   ├── App.tsx               # 动态获取并展示项目数据
│   │   └── main.tsx
│   ├── index.html
│   └── vite.config.ts
│
├── admin/                        # [可选独立工程] 管理后台纯净 SPA（或以 #admin 哈希路由内嵌）
│   ├── src/                      # 独立的管理仪表盘，拥有独立的编译入口
│   │   ├── App.tsx               # 项目 CRUD 表单、草稿发布控制台
│   │   └── main.tsx
│   └── vite.config.ts
│
├── worker/                       # Cloudflare Worker (后端 API 核心)
│   ├── api/
│   │   ├── [[route]].ts          # Hono 入口网关与路由挂载
│   │   ├── routes/
│   │   │   ├── public.ts         # 公开接口（数据脱敏/只读）
│   │   └── admin.ts              # 管理接口（增删改查/全量审计）
│   └── tsconfig.json
│
├── migrations/                   # Cloudflare D1 数据库迁移脚本
│   ├── 0001_create_projects.sql
│   └── 0002_seed_initial_data.sql
│
├── wrangler.toml                 # Cloudflare 边缘计算与 D1 绑定配置（实际位于 frontend/ 下，见下方落地差异说明）
├── ARCHITECTURE_PLAN.md          # 架构方案说明文档
└── package.json                  # 全局构建与脚本调度
```

> **落地差异说明**：实际工程将 Worker 入口（`worker/index.ts`，`export default app`）
> 与 `public/` 嵌套在 `frontend/` 目录下（以 `DEPLOYMENT_GUIDE.md` 的目录树为准）；
> 管理端暂以公开 SPA 内的 `#admin` 路由实现而非独立工程，其安全边界完全由管理 API 层承担。

---

## 3. 数据库设计（Cloudflare D1）

使用 SQLite 语法的 Cloudflare D1 关系型数据库。将当前写死在前端的数据拆解为规范表结构，支持**草稿与私有数据隔离**。

### `migrations/0001_create_projects.sql`
```sql
-- 项目核心表
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,                       -- 如 "001", "002"
    date TEXT NOT NULL,                        -- "2024.08"
    status TEXT NOT NULL DEFAULT 'DRAFT',      -- 'LIVE' (公开), 'BETA' (公测), 'DRAFT' (草稿私密), 'ARCHIVED'
    name TEXT NOT NULL,                        -- "Aperture"
    cn TEXT NOT NULL,                          -- "光圈档案"
    latin TEXT,                                -- "Apertura Photographica"
    habitat TEXT NOT NULL,                     -- "The Terminal"
    type TEXT NOT NULL,                        -- "CLI"
    language TEXT NOT NULL,                    -- "Rust"
    stars TEXT DEFAULT '0',                    -- "2.8k"
    year TEXT NOT NULL,                        -- "2024"
    shape TEXT NOT NULL DEFAULT 'aperture',    -- "aperture" | "lumen" | "fjord" | "meridian"
    version TEXT NOT NULL,                     -- "v2.4.1"
    updated TEXT NOT NULL,                     -- "2024.10.18"
    repository TEXT,                           -- "github.com/nestspace/aperture"
    challenge TEXT,                            -- 最初是单列纯文本；0011 起以 challenge_json 为准，本列只读兜底
    solution TEXT,                             -- 同上（solution_json）
    
    -- 复杂嵌套对象使用标准 JSON 存储
    description_json TEXT NOT NULL,            -- {"en": "...", "zh": "..."}
    features_json TEXT,                        -- ["Lossless batch pipeline", ...]
    metrics_json TEXT,                         -- [{"label": "BUILD TIME", "value": "−63%"}]
    timeline_json TEXT,                        -- [{"date": "2023.12", "title": "First seed", "note": "..."}]
    
    -- 管理端专享内部字段（绝不对外公开）
    internal_notes TEXT,                       -- 内部备忘录/待办/运维细节
    is_featured INTEGER DEFAULT 0,             -- 是否精选推荐
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
```

### `migrations/0008_add_demo_fields.sql`

```sql
-- 项目演示入口（管理端「项目管理 → 编辑」维护演示地址与开关）
ALTER TABLE projects ADD COLUMN demo_url TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN demo_enabled INTEGER NOT NULL DEFAULT 0;
```

`demo_url` 为空或 `demo_enabled = 0` 时前台不渲染演示入口；开关关闭时公开接口把 `demoUrl`
置为空串，不下发未上线的演示地址。地址在写入侧规范化（无协议按 https 补全，仅放行 http/https），
因此不会出现 `javascript:` 之类协议进入公开页面 `href` 的情况。
**迁移必须先于引用这两列的 Worker 代码执行**（见 `DEPLOYMENT_GUIDE.md` 第二节的顺序要求）。

> 本节只覆盖已列出的迁移文件：`0006`（展示偏好）、`0007`（标本文档）、`0009`（馆长手记）、
> `0010`（预览图）与 `0011`（双语叙述）由各自的功能批次维护。
> 另注：上面 `0001` 的字段清单与本仓库实际表结构已有漂移，本节的 SQL 示例**不是**现行 schema：
> - 示例里的 `is_featured` 并未在 `0001_create_projects.sql` 中创建；
> - 实际还有示例未列的 `sort_order INTEGER DEFAULT 0`（管理端拖序/权重用）；
> - `features_json` / `metrics_json` / `timeline_json` 实际是 `NOT NULL`（示例写成可空）。
>
> 现行结构以 `migrations/` 与 `frontend/worker/index.ts` 为准；本节保留原样，漂移单独立项处理。

---

## 4. 后端 API 设计与安全防御（Hono on Functions）

后端采用 **[Hono](https://hono.dev/)**，体积仅十几 KB，冷启动 0ms。

### `worker/index.ts`

```typescript
import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'

type Bindings = {
  DB: D1Database
  ADMIN_SECRET_KEY: string
  // 以下两个变量成对配置后启用 Access JWT 签名校验防线（见 DEPLOYMENT_GUIDE.md 第三节）
  ACCESS_TEAM_NAME?: string
  ACCESS_AUD_TAG?: string
}

const app = new Hono<{ Bindings: Bindings }>().basePath('/api')

// CORS：站点自身为同源请求，默认不开放跨域；需要时通过 ALLOWED_ORIGINS 环境变量
// 做白名单放行。管理端路由（/api/admin/*）不注册 CORS。严禁 origin: '*' 通配。

/* -------------------------------------------------------------
 * 1. 公开端路由 (Public API) - 任何人可调，严格脱敏与过滤
 * ------------------------------------------------------------- */
app.get('/projects', async (c) => {
  // 安全规则 1：只返回 LIVE / BETA 状态的数据，绝对排除 DRAFT 和 ARCHIVED
  // 安全规则 2：显式 SELECT 需要公开的字段，严禁 SELECT *，避免暴露 internal_notes
  const query = `
    SELECT 
      id, date, status, name, cn, latin, habitat, type, 
      language, stars, year, shape, version, updated, repository,
      demo_url, demo_enabled,
      challenge, solution, description_json, features_json, metrics_json, timeline_json
    FROM projects 
    WHERE status IN ('LIVE', 'BETA')
    ORDER BY date DESC
  `
  const { results } = await c.env.DB.prepare(query).all()

  const formatted = results.map((row: any) => ({
    ...row,
    description: JSON.parse(row.description_json || '{}'),
    features: JSON.parse(row.features_json || '[]'),
    metrics: JSON.parse(row.metrics_json || '[]'),
    timeline: JSON.parse(row.timeline_json || '[]'),
  }))

  return c.json(formatted)
})

// 注：以上为示意片段，与实际实现存在漂移——公开接口必须逐字段显式列出（不能用 `...row`
// 展开整行），且演示入口需把 `demo_enabled` 转成布尔、开关关闭时把 `demoUrl` 置空后再下发。

/* -------------------------------------------------------------
 * 2. 安全中间件：管理端身份严密核验（默认 fail-closed）
 * ------------------------------------------------------------- */
const admin = new Hono<{ Bindings: Bindings }>()

admin.use('*', async (c, next) => {
  // 防线 1：Bearer 密钥（常量时间比较，防时序侧信道）
  const authHeader = c.req.header('Authorization') ?? ''
  const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (provided && c.env.ADMIN_SECRET_KEY && timingSafeEqual(provided, c.env.ADMIN_SECRET_KEY)) {
    await next()
    return
  }

  // 防线 2：Cloudflare Access JWT（RS256 签名 + iss/aud/exp 核验）。
  // 安全红线：Cf-Access-Authenticated-User-Email 等明文身份头可被客户端伪造
  // （在 workers.dev / preview 等未被 Zero Trust 覆盖的入口尤其如此），
  // 绝不作为鉴权凭据；身份只能来自通过签名验证的 JWT。
  const teamName = c.env.ACCESS_TEAM_NAME
  const audTag = c.env.ACCESS_AUD_TAG
  if (teamName && audTag) {
    const jwt = c.req.header('Cf-Access-Jwt-Assertion') ?? getCookie(c, 'CF_Authorization') ?? ''
    if (jwt && (await verifyAccessJwt(jwt, teamName, audTag)).valid) {
      await next()
      return
    }
  }

  return c.json({ error: '403 Forbidden: 非法访问，未授权的管理端操作' }, 403)
})

/* -------------------------------------------------------------
 * 3. 管理端路由 (Admin API) - 全量增删改查
 * ------------------------------------------------------------- */
admin.get('/projects', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all()
  return c.json(results)
})

admin.post('/projects', async (c) => {
  const body = await c.req.json()
  await c.env.DB.prepare(`
    INSERT INTO projects (
      id, date, status, name, cn, latin, habitat, type, language, stars, year, shape, version, updated, repository,
      challenge, solution, description_json, features_json, metrics_json, timeline_json, internal_notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    body.id, body.date, body.status, body.name, body.cn, body.latin, body.habitat, body.type, body.language,
    body.stars, body.year, body.shape, body.version, body.updated, body.repository, body.challenge, body.solution,
    JSON.stringify(body.description), JSON.stringify(body.features), JSON.stringify(body.metrics), JSON.stringify(body.timeline),
    body.internal_notes || ''
  ).run()

  return c.json({ success: true, message: '项目创建成功' })
})

admin.put('/projects/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  await c.env.DB.prepare(`
    UPDATE projects SET 
      status = ?, name = ?, cn = ?, updated = ?, version = ?,
      description_json = ?, internal_notes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    body.status, body.name, body.cn, body.updated, body.version,
    JSON.stringify(body.description), body.internal_notes, id
  ).run()

  return c.json({ success: true, message: '项目更新成功' })
})

admin.delete('/projects/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(id).run()
  return c.json({ success: true, message: '项目已删除' })
})

app.route('/admin', admin)

export default app
```

> 上图为设计示意精简版（省略 `timingSafeEqual` / `verifyAccessJwt` 等辅助函数实现），
> 以 `frontend/worker/index.ts` 的实际代码为准。

---

## 5. 前端改造：解耦数据与优雅加载

将 `frontend/src/App.tsx` 中写死的 2000 多行常量数据彻底分离，使用标准前端数据请求范式。

### 新建客户端请求工具：`frontend/src/api/client.ts`
```typescript
import type { Project } from '../types/project'

export async function fetchPublicProjects(): Promise<Project[]> {
  const response = await fetch('/api/projects')
  if (!response.ok) {
    throw new Error(`Failed to load projects: ${response.statusText}`)
  }
  return response.json()
}
```

### 修改 `frontend/src/App.tsx`（关键片段）
```tsx
import { useEffect, useState } from "react"
import { fetchPublicProjects } from "./api/client"
import type { Project } from "./types/project"

export default function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    fetchPublicProjects()
      .then((data) => {
        if (isMounted) {
          setProjects(data)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message)
          setLoading(false)
        }
      })
    return () => { isMounted = false }
  }, [])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0d0f12] text-zinc-400">
        <div className="text-sm font-mono tracking-widest uppercase">Connecting to NestSpace Edge...</div>
      </div>
    )
  }

  // 保持原有精致 UI 渲染，直接消费 projects 状态
  return (
    <div className="min-h-screen bg-[#0d0f12] text-zinc-100">
      {/* ...原有页面渲染... */}
    </div>
  )
}
```

---

## 6. 管理端零信任防护落地（Cloudflare Zero Trust 实操）

当前实现中，管理界面是公开 SPA 内的 `#admin` 哈希路由（每个访客都能下载到管理界面代码，
但其中不含任何密钥），因此安全边界完全落在**管理 API（`/api/admin/*`）**上，由三层防线组成：
边缘 Access 拦截 + 代码层 Bearer 密钥（常量时间比较）+ 代码层 Access JWT 签名校验。
配置步骤见 `DEPLOYMENT_GUIDE.md` 第三节，要点如下：

1. **登录 Cloudflare Dashboard** -> 进入 **Zero Trust** 控制台（首次点击 0 元开通团队名称）。
2. 点击 **Access** -> **Applications** -> **Add an Application**：
   - 类型选择：**Self-hosted（自托管）**。
   - Application Name：`NestSpace Admin Console`。
   - Application Domain：输入你的自定义域名，Path 填 `/api/admin*`
     （`/admin*` 对哈希路由无意义——`#` 之后的部分不会发送到服务器）。
3. **配置策略（Policy）**：
   - Action：`Allow`。
   - Rule type：`Include`。
   - Selector：**Emails** -> 输入**你的私人邮箱**（如 `you@example.com`）。
4. 在 Worker 环境变量中配置 `ACCESS_TEAM_NAME` 与 `ACCESS_AUD_TAG`，
   使代码层的 JWT 签名校验防线生效。
5. **效果**：
   - 任何人未登录调用 `/api/admin/*`，在 Cloudflare CDN 边缘层直接截停，弹出验证码输入框；
   - 只有你的邮箱能收到 6 位验证码，验证后浏览器获得 `CF_Authorization` Cookie，
     后端校验其 JWT 签名后放行管理操作；
   - 即使攻击者从未受保护的入口（`nestspace.<子域>.workers.dev` 默认域名、preview 部署）绕过边缘，
     仍需通过代码层的 Bearer 密钥或有效 JWT 签名，伪造明文身份头完全无效。
     （配套要求：关闭 workers.dev 与 preview 的公开访问，见部署手册。）

---

## 7. 部署与上线命令规范（Wrangler）

### 7.1 配置文件 `frontend/wrangler.toml`（全仓库唯一，Workers 形态）
```toml
name = "nestspace"
main = "worker/index.ts"
compatibility_date = "2026-10-01"

[assets]
directory = "./dist"
not_found_handling = "single-page-application"
run_worker_first = ["/api/*"]

[[d1_databases]]
binding = "DB"
database_name = "nestspace-prod"
database_id = "<你的_D1_DATABASE_ID>"
```

### 7.2 部署步骤命令链
> 实际操作以 `DEPLOYMENT_GUIDE.md` 第二、四节为准（命令均在 `frontend/` 目录下执行）。
```bash
# 1. 创建 Cloudflare 免费 D1 数据库
npx wrangler d1 create nestspace-prod

# 2. 本地执行数据库建表与初始数据填充
npx wrangler d1 execute nestspace-prod --local --file=./migrations/0001_create_projects.sql
npx wrangler d1 execute nestspace-prod --local --file=./migrations/0002_seed_initial_data.sql

# 3. 本地全真模拟调试 (前端 + 后端 Functions + 本地 D1 数据库)
npx wrangler dev

# 4. 发布上线执行远程数据库迁移
npx wrangler d1 execute nestspace-prod --remote --file=./migrations/0001_create_projects.sql
npx wrangler d1 execute nestspace-prod --remote --file=./migrations/0002_seed_initial_data.sql

# 5. 注入管理端密钥（不保存在任何 Git 代码中）
npx wrangler secret put ADMIN_SECRET_KEY
```
