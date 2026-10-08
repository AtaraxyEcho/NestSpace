# 项目演示入口 · 实施方案 002（全量审查后的修复版）

> 状态：**修复已落地并验证**（2026-10-08）。本版自足可读，含对 001 的取代关系与新增的修复记录。
> 取代关系见 §0；修复清单见 §1；当前实现契约见 §2；验证证据见 §3。

---

## 0. 本版取代 001 的哪些节

| 001 的节 | 本版状态 |
|---|---|
| §4.2(3) 公开详情路由 | 001 执行时漏做，已在复核轮补上（见 §1 的 F0） |
| §4.5(5) 部署页环境变量行 | **已被并行工作线的重构取代**：该块改成中文 + COPY + `<pre><code>`，并在新结构里输出同一行。本版不再视为我的改动 |
| §4.6 的 `index.css:414` | 行号已漂移到 `:416`。**本版起行号只作参考，契约以符号为准**（见 §2 末尾的说明） |
| §5 校验规则 | 新增"渲染期协议复验"一条（F5），写入侧单点规则不变 |
| §6 验证清单 | 静态检查 + SQL 层 + 布局测量保留；新增 13 项**真实 wrangler 端到端**结果（§3.2），手测矩阵中仍不可自动化的部分保留 |
| §7 部署顺序 | 说明从"仅 0008"扩为 **0006 / 0007 / 0008 三批**（F2），因为新版 Worker 同时引用了另两批新列 |
| §9 自审 / §10 未核实清单 / §12 执行记录 | 由本版 §1 与 §5 取代 |
| §11 提交切分 | 不变（仍未提交，见 §6） |

---

## 1. 修复清单（本轮全部完成并验证）

条目命名沿用 F 编号，避免与 001 的 D1–D5 决策编号混淆。

### F1 · `POST /api/admin/projects` 静默降级开关 → 管理端假状态（P1，我的缺陷）
- **现象**：新建项目时选「已上线」但不填地址，POST 把 `demo_enabled` 存成 `0` 却返回 201；前端 `saveProject` 是乐观更新，于是管理端显示"已上线"并提示"已成功保存并同步到 D1"，而库里是 0。违反本项目「管理端不许有假状态」红线。
- **根因**：POST 用 `body.demoEnabled === true && demoUrl ? 1 : 0` 兜底，PUT 却返回 400——同一规则两条路径行为不一致。
- **修法**：POST 与 PUT 同判据，`body.demoEnabled === true && !demoUrl` 直接 400（`worker/index.ts` 的 `adminApp.post('/projects')`，现 `:381`）。
- **验证**：真实请求返回 `400 {"error":"开启演示入口前必须先填写演示地址"}`（§3.2 用例 2）。

### F2 · 部署顺序说明只覆盖 0008（P1，操作级）
- **修法**：`DEPLOYMENT_GUIDE.md` 的顺序要求改为三批迁移的表格，列出各自的引用点与失败面：缺 `0006` → 站点设置保存 500；缺 `0007` → 公开详情接口每条 500（详情页文档区退化为空）；缺 `0008` → 管理端保存任何项目 500。
- **验证**：文档现状 `DEPLOYMENT_GUIDE.md:85`。

### F3 · 同一条判据在 4 处各写一遍（P2）
- **现象**：`project.demoEnabled && project.demoUrl` 分别出现在卡片、详情按钮、部署页环境变量块的显示与复制文本里。
- **修法**：新增唯一判据 `demoHref(project)`（`App.tsx:222`），4 处全部经它；卡片与详情页各取一次 `const demoUrl = demoHref(project)`（`:117`、`:969`）。
- **验证**：`grep "demoEnabled && project.demoUrl"` 全仓已无命中。

### F4 · `normalizeDemoUrl` 导出后无消费方（P2，残留）
- **修法**：新增正式测试 `frontend/demo_url.test.mjs`（18 个用例，仿 `jwt_verify.test.mjs` 的导入方式），并接入 `npm test`：`node jwt_verify.test.mjs && node demo_url.test.mjs`。导出因此有了长期消费方，不再是我上轮临时探针的残留。
- **验证**：`npm test` 输出 `normalizeDemoUrl: 18 个用例全部通过`。

### F5 · 渲染期不复验 `href` 协议（P2，纵深防御）
- **现象**：001 §5 决定"规范化只在 Worker 写入侧做一次"，前端直接 `href={project.demoUrl}`。合法路径安全，但绕过 Worker 直接写 D1 的值会原样落进公开页面的 `href`。
- **修法**：并入 F3 的单点判据——`demoHref` 只在 `/^https?:\/\//i` 成立时返回地址，否则 `null`（不渲染入口）。即"写入侧规范化 + 渲染侧白名单"双保险，仍然只有一个判据。
- **副作用（已知且可接受）**：若库中存在没有协议的裸地址（写入侧不可能产生，只有绕过 Worker 的手工写入才可能），前台会不渲染该入口而不是猜协议。

### F6 · 方案已批准的"管理端提示文案"未做（P2）
- **修法**：编辑抽屉的「演示地址」下补 `<small>` 提示：仅支持 http/https、选「已上线」前必须先填地址、演示机未配 HTTPS 时浏览器会提示不安全（`App.tsx` 抽屉内的演示字段区）。`<select>` 的两个选项文案本身已说明前台是否显示。

### F7 · 文档行号腐坏（P3）
- **修法**：本版把引用粒度从行号换成符号；001 的 §4.6 等行号不再维护。行号只在 §3 的验证记录里作为"当时的观测点"保留。

### F0 · 上一轮复核补上的漏项（记录，非本轮）
- `GET /api/projects/:id` 缺演示字段。它并行工作线把详情页改成"用详情接口响应整体替换本地状态"后升级为真实缺陷——详情页的 `LIVE DEMO` 按钮会永不显示。已补齐（`worker/index.ts:146`、`:171-177`），并在本轮 e2e 用例 6 中确认。

---

## 2. 当前实现契约（自足）

### 2.1 数据
`migrations/0008_add_demo_fields.sql`：
```sql
ALTER TABLE projects ADD COLUMN demo_url TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN demo_enabled INTEGER NOT NULL DEFAULT 0;
```

### 2.2 写路径规则（唯一实现点：`normalizeDemoUrl` + 两条路由的同判据校验）
| 输入 | 结果 |
|---|---|
| 无协议（`demo.example.com/app`） | 补 `https://` 后存储 |
| `http://` / `https://` | 原样存储（允许明文，自建演示机常无证书） |
| `javascript:` / `data:` / `vbscript:` / `ftp:` / `file:` | 400 `演示地址无效：仅支持 http/https 地址或域名` |
| 无点裸词（`abc`）、裸 `host:port`（`localhost:8787/demo`） | 400（后者须写 `http://localhost:8787/demo`） |
| 空 / 未传 | 存 `''`（与"无效"的 400 区分） |
| 开关为真但地址为空（POST 与 PUT 同判据） | 400 `开启演示入口前必须先填写演示地址` |
| `demoEnabled` 非布尔 | 400 `demoEnabled 必须是布尔值` |

### 2.3 读路径规则
- 公开列表与公开详情：`demoEnabled` 由 `demo_enabled === 1` 转换；`demoEnabled === false` 时 **`demoUrl` 恒为空串**（不下发未上线地址）。
- 管理端列表：返回 `demoEnabled`（布尔）+ `demoUrl`（原值，供编辑）。`SELECT *` 的 snake_case 键不影响，因为两者都被显式覆盖。
- 管理端新增/更新：`POST` 的 INSERT 列清单与 25 个占位符同步包含 `demo_url` / `demo_enabled`；`PUT` 走"部分更新 + 与当前行合成后再判定一致性"。

### 2.4 前台
- 唯一判据 `demoHref(project)`（`App.tsx:222`）：开关开、地址非空、协议为 http(s) 三者同时成立才返回地址。
- 入口位置：卡片 `View specimen` 与 `GitHub` 之间（`Live demo`）、详情页 `VIEW SOURCE` 与 `READ FIELD NOTES` 之间（`LIVE DEMO`）、详情页部署标签页的 `PUBLIC_DEMO_URL` 行。
- 外链一律 `target="_blank"` + `rel="noreferrer"`。
- `.card-actions` / `.detail-actions` 均已 `flex-wrap: wrap`（三按钮在窄卡片下换行而不挤压）。

### 2.5 管理端
编辑抽屉的「演示地址」（input + 提示）与「演示入口」（select：未上线/已上线）。不做表格快捷开关（001 的非目标，未变）。

### 2.6 行号策略
文件同时承载两条并行功能线的改动，行号在一天内已漂移多次。**契约以符号为准**（函数名、路由、列名）；行号仅作参考。

---

## 3. 验证

### 3.1 静态与单元
| 项 | 结果 |
|---|---|
| `npm run typecheck`（两个 tsconfig） | 通过 |
| `npm test` | JWT 13 + 6 用例、`normalizeDemoUrl` 18 用例全过 |
| `npm run build` | 通过 |
| `bash scripts/d1-migrate.sh local` | 8 条迁移全部就绪（0008 已应用） |

### 3.2 真实端到端（`wrangler dev --port 8899` + 本地 D1，13 项全过）

| # | 用例 | 期望 | 实测 |
|---|---|---|---|
| 1 | 无口令访问 `/api/admin/projects` | 403 | 403 |
| 2 | POST 开关开 + 地址空 | 400（F1 修复点） | 400 + 正确文案 |
| 3 | POST `javascript:alert(1)` | 400 | 400 |
| 4 | POST 裸域名（省略协议） | 201 + 规范化 | 201，存为 `https://demo.example.com/app` |
| 5 | 公开列表读演示字段 | 布尔 + 规范化地址 | `demoEnabled=true`、地址同上 |
| 6 | 公开详情读演示字段（F0） | 同上 | 同上 |
| 7 | PUT 清空地址但开关仍开 | 400 | 400 |
| 8 | PUT 关闭开关 | 200，公开接口抹除地址 | 200，`demoUrl=""` |
| 9 | PUT 重新上线（地址仍在） | 200，公开接口恢复 | 200，地址恢复 |
| 10 | PUT 非布尔开关 | 400 | 400 |
| 11 | PUT `ftp://` | 400 | 400 |
| 12 | 管理端列表回读形状 | 布尔（非 0/1） | `true (boolean)` |
| 13 | 删除测试数据 | 200，公开列表移除 | 200，已移除 |

清理：测试项目 `999` 已删除；本地 Worker 用端口精确终止（8899 释放，未影响其他会话在 8787 上的实例）。

### 3.3 布局（浏览器 DOM 测量，桌面端按钮参数）
三按钮实测 164 + 133 + 110 + 2×8 = 423px；卡片 600–880px 时单行、水平溢出为 0；460px 时换行成两行、仍无溢出。推导结论：桌面端栅格（文案列 = 65%×卡片宽 − 80px）下约 1050px 视口以上单行，以下换行。

---

## 4. 部署顺序与回滚

1. 本地：`bash scripts/d1-migrate.sh local` → `npm run build` → `wrangler dev --port 8899` 手测。
2. 生产：**先** `bash scripts/d1-migrate.sh remote`（脚本按序执行 0001→0008、已应用自动跳过），**再**推送代码。顺序颠倒会出现 §1-F2 的三种 500。
3. 回滚：数据级最快——`UPDATE projects SET demo_enabled = 0;` 全站入口立即消失；代码回滚后 `demo_url` / `demo_enabled` 两列无消费方，保留无害。

---

## 5. 仍未核实

1. **真实视口截图**：in-app Browser 无可见视口（`viewport=0x0`、`visibilityState=hidden`），三按钮布局数值是在隐藏视口下强制卡片宽度 + 强制桌面端按钮参数测得的，没有截图；§3.3 的推导值需在真实窗口确认一次。
2. **生产 Cloudflare 环境**：本轮全在本地 Workerd + 本地 D1 完成；未在生产域名上验证 CSP 是否影响外链跳转（按规范 `default-src` 不约束顶级导航，但未实测点击）。
3. **演示站可用性**：开关开着而云主机离线时是死链，属已知取舍（001 非目标：不做健康检查）。
4. **`http://` 明文**：仅验证了可存储与可下发，未实测浏览器降级提示。
5. 浏览器端 `demoHref` 的白名单分支（F5）只有类型检查与代码审查覆盖，未做前端运行时用例——前端无测试基建。

---

## 6. 与并行工作线的关系（未变）

工作区里存在另一条功能线（`0006` 展示偏好、`0007` 标本文档、`frontend/src/utils/markdown.tsx` 等）。本方案的改动与它在 `worker/index.ts`、`App.tsx` 内交织，**仍无法按文件干净切分**；本轮所有改动均未提交。
