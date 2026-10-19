<p align="center">
  <img src="frontend/public/brand/logo-banner.png" alt="NestSpace" width="420">
</p>

# NestSpace

**在线预览：<https://nestspace.online/>**

集中记录自己在用的开源项目：每个项目写清它做什么、怎么装、目前什么状态，对外是只读展示站，
对内是一个后台。部署在 Cloudflare 的免费额度上，不需要服务器。

[![许可 Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-4b6cb7)](LICENSE)
[![在线预览](https://img.shields.io/badge/live-nestspace.online-2f6f4f)](https://nestspace.online/)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F68121?logo=cloudflare&logoColor=white)
![React 19](https://img.shields.io/badge/React%2019-149eca?logo=react&logoColor=white)
![Vite 8](https://img.shields.io/badge/Vite%208-646cff?logo=vite&logoColor=white)
![D1 · SQLite](https://img.shields.io/badge/D1%20%C2%B7%20SQLite-003b57?logo=sqlite&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?logo=typescript&logoColor=white)


| 层 | 选型 |
|---|---|
| 前端 | React 19 + Vite 8 + Tailwind v4，构建为静态资产 `frontend/dist` |
| 后端 | Cloudflare Workers + Hono（`frontend/worker/index.ts`）：公开只读 API、管理端 API、静态资产与 SEO 注入 |
| 数据 | D1（边缘 SQLite）：项目、站点文案、按天聚合的访问台账 |
| 管理端 | 与前台同源代码的 `/admin`；生产部署在 `admin.<主域>`，由 Zero Trust Access 拦截 |

**为什么不是"前端 + 一台常驻后端"**：代码里前后端确实分开，省掉的是那台机器——没有容器、Nginx、进程守护、
系统补丁和备份作业，`git push` 就是部署。代价不是账单而是免费额度，真正会咬到的是三个数：
CPU 10 ms/调用、子请求 50 个/调用、D1 写入 10 万行/天。本站所有批量上限都从这些数字算出来，并由闸门钉住
（完整额度表与设计边界见 [docs/DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md) 第二节开头）。

---

## 快速开始（以 Cloudflare 为例）

**跑起来只需要工具，部署才需要 Cloudflare 账号**：第 1 步全程本地（本地 SQLite + 本地模拟运行时），
不授权也能跑完。

| 前置 | 装什么 / 版本 | 用在哪 |
|---|---|---|
| Node | **≥ 22.18**（`frontend/.mise.toml` 钉 22；闸门直接 import `.ts` 源码，靠 Node 原生类型剥离，22.6–22.17 不带 flag 会在 import 阶段报错） | 全部 |
| pnpm | **10.34.3**。版本钉在 `frontend/.mise.toml`（`mise install` 会连 Node 22 一起装好），没有 mise 就 `npm i -g pnpm@10.34.3`。仓库只有 `frontend/pnpm-lock.yaml`，用 `npm install` / `npm ci` 会直接 ENOLOCK | 安装与检查 |
| wrangler（Cloudflare CLI） | `npm i -g wrangler` 或 `pnpm add -g wrangler`。**必须全局**：`scripts/d1-migrate.sh` 内部调的是裸 `wrangler`，写在脚本外面的 `npx` 前缀帮不到它（`usage-probe.sh` 自己用 `npx wrangler dev`，不受这条限制） | 本地 dev、迁移、部署 |
| Cloudflare 账号 | 免费档即可，注册 <https://dash.cloudflare.com/sign-up>；`npx wrangler login` 授权一次，令牌存在本机 | 只有第 2、3 步需要 |
| Git | 任意近期版本 | 克隆；生产自动构建走 Workers Builds 拉仓库 |

**1. 本地跑起来**（数据进本地 SQLite，不碰生产；以下在仓库根执行）

```bash
git clone https://github.com/AtaraxyEcho/NestSpace.git && cd NestSpace
cp frontend/.dev.vars.example frontend/.dev.vars   # ADMIN_SECRET_KEY 填 `openssl rand -base64 32` 的输出
bash scripts/d1-migrate.sh local                   # 首次自建本地库，按序跑 0001–0016
cd frontend && pnpm install --frozen-lockfile
pnpm run build && npx wrangler dev                 # http://localhost:8787，管理端 /admin
```

留空 `ADMIN_SECRET_KEY` = 管理端 fail-closed（无凭据 401、凭据无效 403），公开站不受影响。

**2. 接到你自己的 Cloudflare 账号**（各一次，在 `frontend/` 下）

```bash
npx wrangler login
npx wrangler d1 create nestspace-prod              # 把返回的 database_id 填进 frontend/wrangler.toml
npx wrangler secret put ADMIN_SECRET_KEY
```

**3. 先远程迁移，再部署**（顺序不能反：列不存在时部署照样成功，但公开列表会整片 500，
而首页静默退回内置数据，看起来"只是没读到配置"）

```bash
cd ..
bash scripts/d1-migrate.sh remote                  # 可反复执行，只跑没跑过的
cd frontend && npx wrangler deploy
```

**4. 管理端与自动构建**（可选，但生产建议）：主域加 `admin` CNAME（Proxied）→ 把
`admin.<主域>` 绑到同一个 Worker → 建 Zero Trust Access 应用；Workers Builds 导入仓库自动部署，
Root directory 填 `frontend`。前后台互跳地址按 hostname 推导（`admin.X ↔ X`），代码与构建产物都不写死域名。

演示数据：`0002` 会写入 4 个**占位项目**（Aperture / Lumen / Fjord / Meridian，仓库地址是虚构的
`github.com/nestspace/*`，所以「07 GitHub 同步」对它们只会返回 404），`0015` 再给它们补中英文案。
不要就 `DELETE FROM projects;`，或在「06 项目管理」逐件删掉后录入自己的项目。`workers_dev = false` 与
`preview_urls = false` 是刻意的——不留能绕过域名级边缘策略的备用入口，代价是自定义域名生效前没有可访问 URL
（本地 dev 不受影响）。

---

## 改过代码之后

```bash
cd frontend
pnpm run typecheck        # 前端 + Worker 两套 tsconfig
pnpm test                 # 17 个闸门：纯函数、不联网、不起服务
pnpm run build
bash ../scripts/usage-probe.sh   # 接口级实测：自己起 8898 的 dev，自己收尾，只杀自己起的进程
```

CI 跑前三条。最值得留意三条闸门：代码引用的列必须存在于 `migrations/`、站点设置的三份清单（内置默认 /
Worker 白名单 / 迁移列）必须双向对齐、`pnpm test` 的注册链与 `test/` 目录一一对应（漏登记的闸门会在 CI 里静默不跑）。

---

## 改文案 / 改结构

站点文案与展示偏好**全部在管理端**，保存即生效、不需要重新部署（九个分栏各自管什么，见指南第六节）。
两条容易踩的规则：

- 栏目大标题跟随导航名称，没有单独的覆盖字段——改导航名，首页标题、导航、页脚入口一起变。
- 留空 = 用内置默认，且默认绝不写进库。一旦把默认当值保存进库，以后改默认就再也传不下去。

数据结构改动一律新增 `migrations/NNNN_*.sql`（按文件名顺序执行，`_migrations` 表登记）。

---

## 访问统计

`POST /api/usage` 收六个事件（`pageview` / `deck` / `specimen_open` / `outbound` / `imgfail` / `dirimport`），
白名单外的名字与形态一律拒绝。落点是 D1 的按天聚合台账（迁移 `0016`）：不存单次访问行，不存 IP / User-Agent /
来源 URL；访客用浏览器端随机匿名 ID 经服务端 HMAC 派生后去重——所以 UV 的口径是"浏览器"而不是"人"，
清缓存、隐私模式、多设备会各算一个新访客。管理端「09 访问统计」查看，页底有「本设备不计入访问」开关。
限流全在代码里（`/api/usage` 走 isolate 内存 + Cache API 两层，读接口只有 isolate 一层），不依赖付费 WAF。

---

## 目录

```text
frontend/    src/ 前端 · worker/ 后端 · test/ 闸门 · public/ 静态资产（含 _headers）
migrations/  D1 建表与种子（0001–0016）
scripts/     d1-migrate.sh · usage-probe.sh · probe-visit-ledger.mjs · probe-bilingual-payload.mjs
docs/        DEPLOYMENT_GUIDE.md（部署、安全与配额手册）· ARCHITECTURE_PLAN.md · plans/
```

---

## 许可

本项目采用 **Apache License 2.0**（全文见仓库根 [`LICENSE`](LICENSE)）。
