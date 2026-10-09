# 项目演示入口 · 实施方案 001

> **已被 `DEMO_ENTRY_PLAN_002.md` 取代（2026-10-08）**：本文件的 §4.2(3)、§4.6 行号、§5、§6、§7、§9、§10、§12 均由 002 更新或取代；
> 002 记录了全量审查后的 7 条修复与真实端到端验证结果。本文件保留作为方案演化与裁定过程的记录，**不要按它执行**。
>
> 状态：**D3 已裁定（3 个按钮）**；其余四项（D1/D2/D4/D5）维持推荐默认。等你放行后执行，本轮未改动任何代码。
> 依据：本文件对应上一轮需求分析；本版为首次成文，无被取代的前版。
> 修订对照：见 §0（对上一轮分析中一处结论的更正）。
> 裁定记录：见 §2 表末。

---

## 0. 对上一轮分析的一处更正

上一轮我写过"D1 不接受布尔绑定，必须转 1/0"。查 Cloudflare D1 官方类型矩阵后更正：

| JavaScript（写入） | D1 类型 | JavaScript（读回） |
|---|---|---|
| Boolean | INTEGER | **Number（0 / 1）** |

即**写入侧**布尔会被自动转成 1/0，不会报错；真正的故障点是**读回侧**：`demo_enabled` 读出来是 `1/0`，而不是 `true/false`。所以：

- 上一轮判断的故障后果成立（开关静默失效、入口可能永不显示），但**成因要改成"读侧缺映射"**，不是"写入类型不支持"。
- 方案里仍显式写 1/0，理由变为：与 `site_settings.icp_enabled` 的既有读写先例一致（`worker/index.ts:771`、`:813-817`），读写对称、便于人工核对，而不是为了绕过写入错误。

---

## 1. 目标与非目标

**目标**

1. 项目卡片与项目详情页各增加一个"项目演示"入口，指向该项目的演示部署地址。
2. 管理端可编辑该地址、可开关该入口。
3. 未开启的项目在前台完全不出现入口（且公开接口不返回地址）。

**非目标（本版明确不做，避免范围外扩）**

| 项 | 理由 |
|---|---|
| 详情页 iframe 内嵌预览 | `frontend/public/_headers` 的 CSP 为 `default-src 'self'`（未声明 `frame-src`，回落至 default-src）且 `frame-ancestors 'none'`，内嵌会被直接拦死；要内嵌必须先放宽 CSP，且演示站自身常带 `X-Frame-Options`。 |
| 演示站健康检查 / 自动置灰 | 需新增 Worker `scheduled` handler，并引入"Worker 抓取管理员填写的任意 URL"的 SSRF 面。当前用"手动开关"兜底。 |
| 管理端项目表格加"演示"列快捷开关 | 需求点名的两个控制项（地址、开关）都在编辑抽屉内已完成。若你要一键上下线再加列，成本约 15 行 + 1 处栅格调整。 |
| 首页 Index 行、详情页 related 磁贴加演示外链 | 这两处是"整行/整块即站内跳转"的语义，插入外链会破坏可点击语义。 |
| 自定义按钮文案、演示说明字段 | 需求未提；每多一个字段就多一列 + 一个表单控件，本次保持 2 列。 |
| 私有/内网地址拦截 | `<a href>` 不产生 SSRF；拦截 `localhost` 会挡住本地演示调试。**若将来加上健康检查 Cron，此项必须一并处理。** |

---

## 2. 已裁定口径（按推荐收敛，每条都给出单行切换法）

| # | 口径 | 默认裁定 | 依据 | 若你要改成另一种 |
|---|---|---|---|---|
| D1 | 「Hero卡片」指代 | 首页 cabinet 螺旋柜里的 `SpecimenCard`（`App.tsx:107-184`）+ 详情页 `detail-actions`（`App.tsx:941-953`） | 仓库自身把 "Hero" 用于首页文案区（`App.tsx:465`、管理端文案 `App.tsx:2522`），那里没有项目数据，放不了按项目维度的入口 | 无（若你另有所指，改这 2 个渲染点） |
| D2 | 前台显示判据 | `demoEnabled === true && demoUrl !== ''`，**不额外要求** `status === 'LIVE'` | 公开接口已强制只返回 LIVE/BETA（`worker/index.ts:72`、`:118`），DRAFT/ARCHIVED 不可能到达前台；额外要求 LIVE 会让 BETA 项目的演示入口消失 | 在两处渲染条件追加 `&& project.status === 'LIVE'` |
| D3 | 卡片上入口的形态 | **已裁定：3 个按钮**（`View specimen` 主 → `Live demo` 次 → `GitHub` 次），并给 `.card-actions` 加 `flex-wrap: wrap` | 见 §8 风险 2：不加换行在窄卡片下溢出。三按钮与 `flex-wrap` 是一对——`.card-actions` 原本没有换行能力（`index.css:249`），去掉换行则第三个按钮在窄卡片下会挤出边界 | 已排除的替代方案：条件主按钮（有演示时 `Live demo` 当主、`View specimen` 降为次）。若你要改按钮主次配色而不改数量，只动 `className`，见下 |
| D4 | 允许的协议 | 允许 `http://` 与 `https://`，管理端提示明文风险 | VPS 演示机常年没有证书 | 在 §5 的规范化函数里把 `http:` 一并返回 `null` |
| D5 | 抽屉里的开关控件 | `<select>`（未上线 / 已上线），复用"状态"控件的写法 | `index.css:600` 的 `.editor-fields label`（特异性 0,1,1）会盖掉 `.toggle-row`（0,1,0）的 `display:flex`；`index.css:601` 的 `.editor-fields input` 未排除 `[type="checkbox"]`，会把复选框渲染成整行输入框。用 `select` 零 CSS 改动 | 想用复选框需补 2 行 CSS：`.editor-fields label.toggle-row{display:flex}` + `.editor-fields input[type="checkbox"]{width:34px;height:18px;padding:0;border:0}` |

另有两个随此生效的小裁定：

- 公开接口在演示未开启时**把 `demoUrl` 抹成空串**（不返回未上线地址）——与"公开接口严格脱敏"的既有原则一致（`worker/index.ts:65` 的注释）。
- 地址规范化只在 **Worker 写入侧**做一次，前台按存储值原样渲染。避免前后端两套规范化实现漂移。

**裁定记录**

| 日期 | 项 | 裁定 |
|---|---|---|
| 2026-10-08 | D3 | 3 个按钮（`View specimen` 主 / `Live demo` 次 / `GitHub` 次）+ `.card-actions` 换行；条件主按钮方案作废 |
| 2026-10-08 | D1 / D2 / D4 / D5 | 未提异议，按表内默认执行；如需改动，逐条报编号即可（每条都有单行切换法） |

**仍可改的小项（默认不动，仅换配色）**：三个按钮的主次。现方案保持"`View specimen` 是唯一主按钮（实心），演示入口与 GitHub 同为次按钮（描边）"，即 **不改既有主按钮语义**。若你希望演示入口更"显眼"（它是转化件，而非文档入口），把 §4.5(1) 里那个 `<a>` 的 `className` 从 `button secondary` 换成 `button primary` 即可——三按钮数量与布局不变，但卡片上会出现两个实心按钮。

---

## 3. 数据契约

### 3.1 D1 `projects` 表新增列

```sql
demo_url     TEXT    NOT NULL DEFAULT ''   -- 已规范化的演示地址，空 = 未填
demo_enabled INTEGER NOT NULL DEFAULT 0    -- 0 未上线 / 1 已上线
```

### 3.2 API 字段

| 端点 | 返回 |
|---|---|
| `GET /api/projects`、`GET /api/projects/:id` | `demoEnabled: boolean`；`demoUrl: string`（`demoEnabled === false` 时恒为 `''`） |
| `GET /api/admin/projects` | `demoEnabled: boolean`；`demoUrl: string`（原样返回，供编辑） |
| `POST /api/admin/projects` | 接受 `demoUrl`、`demoEnabled` |
| `PUT /api/admin/projects/:id` | 同上，部分更新 |

### 3.3 前端类型

`src/types/project.ts` 的 `Project` 增加 `demoUrl: string` 与 `demoEnabled: boolean`（放在 `repository` 之后）。

---

## 4. 改动清单（按执行顺序）

### 4.1 新建 `migrations/0008_add_demo_fields.sql`

```sql
-- 0008_add_demo_fields.sql: 项目演示入口（演示地址 + 演示开关）
-- demo_url 为空或 demo_enabled = 0 时，前台不渲染演示入口；
-- demo_enabled 取值 0/1，与 site_settings.icp_enabled 的既有约定一致。
ALTER TABLE projects ADD COLUMN demo_url TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN demo_enabled INTEGER NOT NULL DEFAULT 0;
```

沿用 `0004`、`0005` 的 `ADD COLUMN ... NOT NULL DEFAULT` 写法（SQLite 支持带非空默认值的新增列）。

### 4.2 `frontend/worker/index.ts`（6 处）

**(1) 公开列表 SELECT（`:66-74`）**：字段清单末尾追加 `demo_url, demo_enabled`。

**(2) 公开列表映射（`:77-99`）**：在 `repository` 附近插入

```ts
      demoEnabled,
      demoUrl: demoEnabled ? (row.demo_url || '') : '',
```

并在映射前定义 `const demoEnabled = row.demo_enabled === 1`。

**(3) 公开详情 SELECT（`:112-119`）与映射（`:125-147`）**：同上两处。

**(4) 管理端列表映射（`:211-219`）**：`...row` 展开之后覆盖成前端形状

```ts
      demoEnabled: row.demo_enabled === 1,
      demoUrl: row.demo_url || '',
```

**(5) 新增地址规范化函数**（放在 `parseGithubRepo` 附近，`worker/index.ts:369` 一带）

```ts
/** 规范化演示地址：无协议按 https 补全，仅放行 http/https；非法输入返回 null */
function normalizeDemoUrl(raw: unknown): string | null {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) return ''
  // 显式带了非 http/https 协议头（javascript: / data: / ftp: …）一律拒绝
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) return null
  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed.replace(/^\/+/, '')}`
  try {
    const parsed = new URL(candidate)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    if (!parsed.hostname) return null
    if (!parsed.hostname.includes('.') && parsed.hostname !== 'localhost') return null
    return parsed.toString()
  } catch {
    return null
  }
}
```

**(6a) `POST /projects`（`:242-271`）**：INSERT 列清单 `repository,` 之后加 `demo_url, demo_enabled`，VALUES 占位符同步 +2；绑定值前先做校验与规范化：

```ts
    const demoUrl = normalizeDemoUrl(body.demoUrl)
    if (demoUrl === null) {
      return c.json({ error: '演示地址无效：仅支持 http/https 地址或域名' }, 400)
    }
    const demoEnabled = body.demoEnabled === true && demoUrl ? 1 : 0
```

> 为什么必须改 POST：管理端"新建项目"走的就是这条路径（`adminClient.ts:74-78` 的 `isNew` 分支）。若 INSERT 不含这两列，**新建时填的演示地址会被静默丢弃**。

**(6b) `PUT /projects/:id`（`:309-352`）**：`EDITABLE_COLUMNS` 循环之后（不要加进该映射表）、`assignments.length === 0` 判断之前，插入：

```ts
    // 演示入口：地址规范化 + 开关/地址一致性校验
    let demoUrlPatch: string | undefined
    if (body.demoUrl !== undefined) {
      const normalized = normalizeDemoUrl(body.demoUrl)
      if (normalized === null) {
        return c.json({ error: '演示地址无效：仅支持 http/https 地址或域名' }, 400)
      }
      demoUrlPatch = normalized
    }
    let demoEnabledPatch: number | undefined
    if (body.demoEnabled !== undefined) {
      if (typeof body.demoEnabled !== 'boolean') {
        return c.json({ error: 'demoEnabled 必须是布尔值' }, 400)
      }
      demoEnabledPatch = body.demoEnabled ? 1 : 0
    }
    if (demoUrlPatch !== undefined || demoEnabledPatch !== undefined) {
      // 部分更新：开关与地址是一对约束，需与当前行合成后再判定
      const current: any = await c.env.DB.prepare(
        'SELECT demo_url, demo_enabled FROM projects WHERE id = ?',
      ).bind(id).first()
      if (!current) {
        return c.json({ error: 'Project not found' }, 404)
      }
      const effectiveUrl = demoUrlPatch ?? (current.demo_url || '')
      const effectiveEnabled = demoEnabledPatch ?? (current.demo_enabled === 1 ? 1 : 0)
      if (effectiveEnabled === 1 && !effectiveUrl) {
        return c.json({ error: '开启演示入口前必须先填写演示地址' }, 400)
      }
    }
    if (demoUrlPatch !== undefined) {
      assignments.push('demo_url = ?')
      values.push(demoUrlPatch)
    }
    if (demoEnabledPatch !== undefined) {
      assignments.push('demo_enabled = ?')
      values.push(demoEnabledPatch)
    }
```

不加入 `EDITABLE_COLUMNS` 的理由：该映射表的通道是"请求体原值直绑"，而这两列需要先规范化/转换；列名在此处是字面量，不存在列名注入面。

**不改动**：`ALLOWED_STATUSES`、CORS、静态安全头、`/admin/github-sync`。已核对 `github-sync` 的写回只涉及 `stars / updated / version / language / description_json`（`worker/index.ts:452-474`），不会覆盖演示字段——从 GitHub 同步过的项目，演示入口不受影响。

### 4.3 `frontend/src/types/project.ts`

`repository: string` 之后加：

```ts
  demoUrl: string
  demoEnabled: boolean
```

### 4.4 `frontend/src/data/fallbackProjects.ts`

4 条静态数据各在 `repository` 之后补 `demoUrl: "",` 与 `demoEnabled: false,`。

> 必改项：`npm run typecheck` 会因缺字段报错（非静默）；不同步则 API 故障期的回退站点会丢失入口，与"上线的就显示"自相矛盾。

### 4.5 `frontend/src/App.tsx`（4 处）

**(1) `SpecimenCard` 的 `card-actions`（`:159-175`）**：在 `View specimen` 与 `GitHub` 之间插入

```tsx
            {project.demoEnabled && project.demoUrl ? (
              <a
                className="button secondary"
                href={project.demoUrl}
                target="_blank"
                rel="noreferrer"
              >
                Live demo <span>↗</span>
              </a>
            ) : null}
```

**(2) `DetailPage` 的 `detail-actions`（`:941-953`）**：在 `VIEW SOURCE` 与 `READ FIELD NOTES` 之间插入

```tsx
              {project.demoEnabled && project.demoUrl ? (
                <a
                  className="button secondary"
                  href={project.demoUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  LIVE DEMO <span>↗</span>
                </a>
              ) : null}
```

**(3) `createProject`（`:1753-1769`）**：`repository:` 之后补 `demoUrl: "",` 与 `demoEnabled: false,`。

**(4) 编辑抽屉（`:3302-3310` 的"仓库地址"之后）**：新增两个字段（不塞进既有 `field-row`，保持最小 diff）

```tsx
              <label>
                演示地址
                <input
                  value={editing.demoUrl}
                  onChange={(event) =>
                    setEditing({ ...editing, demoUrl: event.target.value })
                  }
                  placeholder="https://demo.example.com（可省略协议）"
                />
              </label>
              <label>
                演示入口
                <select
                  value={editing.demoEnabled ? "1" : "0"}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      demoEnabled: event.target.value === "1",
                    })
                  }
                >
                  <option value="0">未上线 · 前台不显示入口</option>
                  <option value="1">已上线 · 前台显示入口</option>
                </select>
              </label>
```

**(5) 可选但默认包含（1 行）**：详情页 deployment 标签页（`:1144-1148`）现有 `PUBLIC_REPOSITORY={project.repository}`，其下补一行，让演示地址也出现在"部署说明"里

```tsx
              {project.demoEnabled && project.demoUrl ? (
                <code>PUBLIC_DEMO_URL={project.demoUrl}</code>
              ) : null}
```

### 4.6 `frontend/src/index.css`（2 处）

- `:249` → `.card-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; }`
- `:414` → `.detail-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 34px; }`

### 4.7 文档同步

- `DEPLOYMENT_GUIDE.md:68-74`（远程）与 `:204-208`（本地）：两处迁移清单各追加
  `npx wrangler d1 execute nestspace-prod --remote --file=../migrations/0008_add_demo_fields.sql`（本地那份用 `--local`），并补一句顺序要求：**先对生产库执行 0008，再推送 Worker 代码**。
- `ARCHITECTURE_PLAN.md`：§3 表结构（`:114-146`）补两列注释；§4 公开 SELECT 示例（`:177-190`）补两字段；管理端示例（`:236-276`）补映射与校验。
  **注意**：该文档已经和代码漂移——`:141` 的 `is_featured INTEGER DEFAULT 0` 在 `migrations/0001` 里根本不存在，`:237` 的 `SELECT * ... ORDER BY updated_at DESC` 与实际的 `sort_order ASC, date DESC` 不一致，`:262-268` 的固定 `SET` 也已被白名单映射取代。本次**只补演示相关字段**，其余漂移单独立项处理，不混进这次改动。

---

## 5. 校验与规范化规则（单一实现点）

| 规则 | 落点 | 违反时 |
|---|---|---|
| 行首显式非 http/https 协议（`javascript:`、`data:`、`ftp:`…） | `normalizeDemoUrl` | 400 `演示地址无效：仅支持 http/https 地址或域名` |
| 无协议输入（`demo.example.com/app`） | 同上，按 `https://` 补全 | — |
| 无点的裸词（`abc`） | 同上 | 400 同上 |
| 开关与地址一致性（开启必须有地址） | `PUT` 合成判定 / `POST` 归一 | 400 `开启演示入口前必须先填写演示地址` |
| 前台渲染判据 | `App.tsx` 两处 | 双条件 `demoEnabled && demoUrl`，即使接口侧已抹除也不会误显示 |

`http://192.168.1.10:8080/app` 这类本地/VPS 地址按 D4 放行，原样存储并渲染。

---

## 6. 验证清单

**自动化**

1. `npm run typecheck`（`tsc --noEmit` × 2，含 `worker/tsconfig.json`）→ 应拦住 fallback 数据漏字段。
2. `npm run build`。

**本地端到端**（`frontend/` 目录）

```bash
npx wrangler d1 execute nestspace-prod --local --file=../migrations/0008_add_demo_fields.sql
npx wrangler dev
```

**手测矩阵**（每条都要在实际浏览器里过，不能只看接口）

| # | 操作 | 期望 |
|---|---|---|
| 1 | 抽屉里填 `demo.example.com/app`，保存 | 保存成功；重开抽屉显示已规范化为 `https://demo.example.com/app`（**这条同时验证读侧映射，是本方案最易漏的故障点**） |
| 2 | 开关切"已上线"，保存 | 前台卡片与详情页同时出现 `Live demo` / `LIVE DEMO`；`curl /api/projects` 里该条 `demoEnabled: true` 且 `demoUrl` 非空 |
| 3 | 开关切回"未上线" | 两处入口消失；`curl /api/projects` 里该条 `demoUrl` 为空串 |
| 4 | 只填地址不开开关 | 两处入口都不出现 |
| 5 | 清空地址后把开关打开 | 400，提示"开启演示入口前必须先填写演示地址"（开关不被写入） |
| 6 | 填 `javascript:alert(1)` | 400，提示地址无效 |
| 7 | 填 `http://192.168.1.10:8080/app` | 保存成功，前台按原样渲染 |
| 8 | 新建项目时填地址 + 开开关 | 保存后仍在（**验证 POST 列清单已同步**） |
| 9 | 宽度 375 / 900 / 1050 / 1440px | 卡片与详情按钮不溢出、不遮挡，换行后不影响 `1fr` 文案区可读性；卡片正面朝向时三个按钮均可点（`App.tsx:428` 的 `pointerEvents` 门槛） |
| 10 | 观察浏览器控制台 | 无 CSP 报错（顶级导航不受 `default-src` 约束） |

**回归面**：管理端项目列表、GitHub 同步、详情页三个标签页切换、页脚与导航。

---

## 7. 上线与回滚

**上线顺序（不可颠倒）**

1. 本地 `--local` 执行 0008 → 本地 `wrangler dev` 手测通过。
2. **先对生产库执行 0008（`--remote`）**。未做这步就推代码，会造成：Worker 的写入路径引用不存在的列 → **所有项目保存一律 500**。
3. 合并并推送代码；Cloudflare Git 构建自动部署（`frontend/wrangler.toml` 为唯一 Worker 配置）。
4. 管理端逐项目填地址、开开关。

**回滚**

| 层级 | 动作 | 影响 |
|---|---|---|
| 数据级（推荐，秒级生效） | `UPDATE projects SET demo_enabled = 0;` | 全站入口立即消失，无需回滚代码 |
| 代码级 | revert 相关提交 | 多出的两列无消费方，管理端 `SELECT *` 会多回传两个键，前端类型不含它们也不报错；现有功能不受影响 |
| 迁移级 | SQLite 无简单 `DROP COLUMN` | 保留两列（带默认值）是安全的；强行重建表不值得 |

---

## 8. 风险表

| # | 风险 | 级别 | 缓解 |
|---|---|---|---|
| 1 | 部署顺序颠倒 → 全部项目保存 500 | 高 | §7 的固定顺序；`DEPLOYMENT_GUIDE` 写明 |
| 2 | 三按钮在窄卡片下溢出（`.card-actions` 原无 `flex-wrap`） | 中 | 加 `flex-wrap: wrap`（§4.6）。已缓解到"最多换行占高"，不影响正确性 |
| 3 | 读侧映射漏改一处 | 高影响·易漏 | 三处 GET 必须同轮改齐：公开列表、公开详情、管理端列表。漏公开侧 → 入口永不显示且无任何报错；漏管理端 → 抽屉回读为"未上线"，**保存即把开关覆盖为关闭**。手测 1、2 专打这两处 |
| 4 | 演示站不可用（云主机离线）→ 死链 | 中 | 手动开关兜底；不做健康检查（见非目标） |
| 5 | `http://` 明文地址触发浏览器降级提示 | 低 | 保留提示能力；不加硬拦截 |
| 6 | 回退数据未同步 → 回退期入口消失 | 低 | `typecheck` 必拦（字段必填） |
| 7 | 抽屉里用复选框会踩 CSS 特异性 | 低 | 已规避：改用 `select`（D5） |

---

## 9. 自审（四类错逐条核过）

1. **未核实断言**：上一轮"D1 不支持布尔绑定"已更正（§0）；本方案不再依赖该断言成立。§6 手测 1 覆盖"读侧映射"这个真实故障点。
2. **能力倒退**：本方案纯增量。卡片三个按钮全部保留，没有用演示入口替换 `GitHub` 或 `View specimen`；公开接口在未上线时抹除地址属"本不该暴露"，不是能力削减，但已在此显式声明。
3. **连带清理**：无删除动作 → 无失去消费方的注册或工具函数需要清理。要跟随的只有两处迁移清单与表结构文档（已列入 §4.7）。
4. **低估工作量**：容易被低估的三处已单列——`PUT` 的一致性校验需要一次额外 `SELECT`；`POST` 的列清单与 23 个占位符要同步 +2；`values` 数组类型 `(string | number)[]` 容纳 1/0 无需改类型。

---

## 10. 未核实清单（可逐条点名核）

1. 三按钮在 375 / 900 / 1050 / 1440px 下的实际像素与换行行为——**未在浏览器实测**，§8 风险 2 的数值是按 11px 等宽字 + `.1em` 字距的推导值。**D3 已定为 3 个按钮，故 §6 手测 9 从"待定项"升级为必过项**：必须在真实宽度下确认三个按钮换行后不溢出、不压掉 `1fr` 文案区。
2. 本项目 D1 实例对布尔值/`undefined` 绑定的实测行为——只查了官方类型矩阵，**未跑 wrangler 实测**；方案不依赖该结论成立（统一按 1/0 走）。
3. `new URL(...).toString()` 会给裸域补尾斜杠（`https://demo.example.com/`），是否接受这种存储形态——未定。若要保留原样，改用 `parsed.origin + parsed.pathname.replace(/\/$/, '')`。
4. 生产库现有列清单**未直接读取**（本次只读了 migrations 与代码）。若线上库被手工加过列，执行 0008 前先 `PRAGMA table_info(projects);` 核对，避免 `ADD COLUMN` 重名报错。
5. 抽屉将新增两个字段使滚动变长——现有 `.editor-fields { overflow-y: auto }`（`index.css:630`）可承载，但**未在浏览器实测**抽屉高度与滚动体验。

---

## 11. 建议的提交切分（英文标题，3 个提交）

1. `feat(db): add demo url and demo enabled columns to projects`
   `migrations/0008_add_demo_fields.sql`、`DEPLOYMENT_GUIDE.md`
2. `feat(api): expose and persist project demo entry with url normalization`
   `frontend/worker/index.ts`、`frontend/src/types/project.ts`
3. `feat(ui): add project demo entry to specimen card and detail page with admin control`
   `frontend/src/App.tsx`、`frontend/src/data/fallbackProjects.ts`、`frontend/src/index.css`、`ARCHITECTURE_PLAN.md`

原子性说明：提交 1 与 2/3 存在顺序约束（先有列，再有写列代码）。三者合成一次推送合并到 `main` 由 Cloudflare 构建部署，只要**先手工对生产库执行 0008**（§7 第 2 步），部署窗口内不会出现"代码已上线、库缺列"的状态。

---

## 12. 执行记录（2026-10-08）

§4 各项已全部落地。执行中出现 3 处与原文不同，逐条记录：

### 12.1 迁移编号：0006 → 0008

同一工作区里有**另一条并行的功能线**（`0006_add_display_preferences.sql` 展示偏好、
`0007_add_project_docs.sql` 标本文档），`0006` 与 `0007` 均已被占用。本方案新建的文件改为
`migrations/0008_add_demo_fields.sql`。本文档内所有 `0006_add_demo_fields` 字样已统一改为 `0008`。
两列都只作用于 `projects` 表，与 `0007`（同表加 5 列）无列名冲突，先后顺序不影响结果。

### 12.2 详情页"环境变量"块的那一行由对方重构覆盖

§4.5(5) 由我在 `detail-actions` 后的"环境变量"块内加了 `PUBLIC_DEMO_URL` 一行；并行那条线随后
把该块整体重构为中文标题 + COPY 按钮 + `<pre><code>` 结构，并在新结构里加了等价的一行
（`App.tsx:1298-1311`）。行为一致，故**没有把我的版本塞回去**，避免同一语义两套实现。

### 12.3 复核阶段发现并补上一处漏做项：公开详情接口

首轮执行漏了 §4.2(3)：`GET /api/projects/:id` 的 SELECT 与响应都没有演示字段。这一项在
并行那条线把详情页改成"用详情接口响应整体替换本地状态"之后（`ProjectRoute` 于 `App.tsx:4006-4071`
`setDetail(data)` → `<DetailPage project={detail}>`）**升级为真实缺陷**：详情页的 `LIVE DEMO`
按钮会永不显示（列表页正常，只有详情页静默缺失）。已补齐（`worker/index.ts:146`、`:172-177`）
并在真实 schema 上验证。

### 12.4 与原文的其他偏差

- `normalizeDemoUrl` 按本仓库既有先例导出（`worker/index.ts:568`，与 `verifyAccessJwt` 的"仅供本地单元测试"注释同风格），因此可以被 Node 直接 import 实测，而不是靠镜像函数推断。
- 裸写 `localhost:8787/demo` 会被拒绝（被当作协议头），需写 `http://localhost:8787/demo`。这是 §5 "行首非 http/https 协议一律拒绝"这条严格规则的副作用，属可接受边界。
- 回退数据 `fallbackProjects.ts` 的 4 条只补了 `demoUrl: ""` / `demoEnabled: false`（默认关闭），因此 API 故障期不显示任何演示入口。

### 12.5 复验结果

| 项 | 结果 |
|---|---|
| `npm run typecheck`（两个 tsconfig） | 通过 |
| `npm run build` | 通过 |
| `npm test`（`jwt_verify.test.mjs`） | 13 + 6 用例全过 |
| `normalizeDemoUrl` 真实导出实测 | 合法/非法分支全部符合 §5 |
| 列表与详情接口列清单（真实 SQLite，含 0007+0008） | 执行成功，28 字段，`demoEnabled/demoUrl` 映射正确 |
| 卡片三按钮布局（浏览器 DOM 实测） | 三按钮共 423px；卡片 600–880px 单行、无水平溢出；460px 时换行成两行、仍无溢出 |
| 端到端（管理端改地址 → 前台出现入口） | **未验证**：需 wrangler + 真实 D1；且 in-app Browser 无可见视口（`viewport=0x0`）故无截图。§6 手测 1–10 仍未跑 |

### 12.6 未提交

本轮所有改动均未提交。当前工作区同时存在并行功能线的改动，且 `worker/index.ts`、`App.tsx`
内两条线的 hunk 交织，无法按文件干净切分。
