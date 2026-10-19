<p align="center">
  <img src="frontend/public/brand/logo-banner.png" alt="NestSpace" width="420">
</p>

# NestSpace

**在线预览：<https://nestspace.online/>**

记录自己在用的开源项目：每个项目写清做什么、怎么装、现在什么状态。对外是只读展示站，对内是一个后台。
没有常驻服务器——`git push` 即部署，成本是 Cloudflare 的免费额度而不是账单。

[![许可 Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-4b6cb7)](LICENSE)
[![在线预览](https://img.shields.io/badge/live-nestspace.online-2f6f4f)](https://nestspace.online/)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F68121?logo=cloudflare&logoColor=white)
![React 19](https://img.shields.io/badge/React%2019-149eca?logo=react&logoColor=white)
![Vite 8](https://img.shields.io/badge/Vite%208-646cff?logo=vite&logoColor=white)
![D1 · SQLite](https://img.shields.io/badge/D1%20%C2%B7%20SQLite-003b57?logo=sqlite&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?logo=typescript&logoColor=white)

| 层 | 选型 |
|---|---|
| 前端 | React 19 · Vite 8 · Tailwind v4 → 静态资产 `frontend/dist` |
| 后端 | Cloudflare Workers + Hono（`frontend/worker/index.ts`）：公开只读 API、管理端 API、SEO 注入 |
| 数据 | D1（边缘 SQLite）：项目、站点文案、访问台账 |
| 后台 | 同源的 `/admin`；生产挂在 `admin.<主域>` 上，由 Zero Trust Access 拦截 |

---

## 预览

| 陈列（首页） | 详情页 |
|---|---|
| ![陈列](docs/screenshots/home.png) | ![详情页](docs/screenshots/detail.png) |

线上实拍（1440×900 视口）；站点支持深浅主题与中英切换。

---

## 快速开始（以 Cloudflare 为例）

需要：**Node ≥ 22.18**、**pnpm 10.34.3**（版本钉在 `frontend/.mise.toml`）、**全局 wrangler**
（`npm i -g wrangler`；`scripts/d1-migrate.sh` 内部调的是裸命令）、一个免费 Cloudflare 账号。

```bash
# 本地跑起来（不需要 Cloudflare 账号）
git clone https://github.com/AtaraxyEcho/NestSpace.git && cd NestSpace
cp frontend/.dev.vars.example frontend/.dev.vars    # ADMIN_SECRET_KEY 填 `openssl rand -base64 32`
bash scripts/d1-migrate.sh local                    # 0001–0017，首次会自建本地库
cd frontend && pnpm install --frozen-lockfile
pnpm run build && npx wrangler dev                  # localhost:8787，管理端 /admin
```

```bash
# 上线（先迁移，再部署；顺序反了公开接口会整片 500）
npx wrangler login
npx wrangler d1 create nestspace-prod               # 把 database_id 填进 frontend/wrangler.toml
npx wrangler secret put ADMIN_SECRET_KEY
bash ../scripts/d1-migrate.sh remote                # 可反复执行，只跑没跑过的
npx wrangler deploy
```

生产建议：管理端放 `admin.<主域>` 并由 Access 拦截；自动部署用 Workers Builds（Root directory 填 `frontend`）。
配额边界与运维细节见 [docs/DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md)。`0002` 会带进 4 个占位项目
（仓库地址是虚构的 `github.com/nestspace/*`），按需删除或替换。

---

## 开发与核对

```bash
cd frontend
pnpm run typecheck   # 前端 + Worker 两套 tsconfig
pnpm test            # 17 条闸门（纯函数，不联网）
pnpm run build
bash ../scripts/usage-probe.sh      # 接口探针：自起 8898、自收尾
bash ../scripts/visual-check.sh     # 页面级：无头 Chrome 截图 + DOM 断言（需本机 Chrome）
```

```bash
cd ..                                               # 回到仓库根
bash scripts/verify-production.sh                   # 上线后只读烟测
ADMIN_TOKEN=... bash scripts/verify-production.sh   # 额外确认访问台账可读
bash scripts/d1-backup.sh                           # 备份远程库 + 自动恢复演练
```

---

## 管理端与文案

文案、导航、展示偏好全部在管理端（九个分栏），保存即生效、不用重新部署。两条规则：标题跟随导航名；
留空 = 用内置默认，且默认不会写进库。数据结构改动一律新增 `migrations/NNNN_*.sql`。

访问统计：`POST /api/usage` 收六个白名单事件，落 D1 按天聚合台账（迁移 `0016`）；不存 IP / User-Agent /
来源 URL，UV 由浏览器匿名 ID 经服务端 HMAC 去重——口径是"浏览器"不是"人"。

---

## 仓库结构

```text
frontend/    src/ 前端 · worker/ 后端 · test/ 闸门 · public/ 静态资产
migrations/  D1 建表与种子（0001–0017）
scripts/     migrate · backup · probe · visual-check · verify-production · brand
docs/        DEPLOYMENT_GUIDE.md（部署、安全与配额）· ARCHITECTURE_PLAN.md · plans/
```

---

## 反馈与许可

问题与建议走 [Issues](https://github.com/AtaraxyEcho/NestSpace/issues)。代码与文档采用
**Apache License 2.0**（全文见 [`LICENSE`](LICENSE)）。
