# NestSpace — 给编码 agent 的事实清单

> 本文件替代 Figma Make 脚手架自带的说明。仓库的真实回路以 [README.md](../README.md) 与
> [docs/DEPLOYMENT_GUIDE.md](../docs/DEPLOYMENT_GUIDE.md) 为准；下面是每次动手前必须先知道的约定。

## 回路

- 装依赖：`cd frontend && pnpm install --frozen-lockfile`（仓库只有 `pnpm-lock.yaml`，`npm ci` 会 ENOLOCK）
- 改完必跑：`pnpm run typecheck`（前端 + Worker 两套 tsconfig）→ `pnpm test`（17 条闸门）→ `pnpm run build`
- 接口级实测：仓库根 `bash scripts/usage-probe.sh`（自起 8898 的 dev、自收尾、只杀自己起的进程）
- 页面级核对：`bash scripts/visual-check.sh`（无头 Chrome 截图 + DOM 断言；机器上要有 Chrome）
- 备份：`bash scripts/d1-backup.sh`（默认导远程库，并做一次真恢复演练）
- 生产只读烟测：`bash scripts/verify-production.sh`

## 硬约定（违反后大多**不会**让 tsc / 闸门 / build 变红，只会静默坏）

- **先 `pnpm run build` 再 `wrangler dev`**：dev 启动时固化资产清单，顺序反了会白屏。
- **Worker 入口模块只能导出函数或对象**。`worker/index.ts` 里导出数字/字符串/布尔会让 workerd
  直接起不来（`Incorrect type for map entry`），而 tsc、闸门、build 全绿；要暴露常量给闸门就包成函数
  （见 `syncCaps()`）。`test/sync_scope.test.mjs` 有静态钉子。
- **迁移按文件名记账**（`scripts/d1-migrate.sh` + `_migrations` 表）：不要合并、改名、删除历史迁移文件；
  `0002` 是 `INSERT OR REPLACE`，被重放会把 001–004 重置回种子值。
- **新增站点设置列要三处同步**：`migrations/` + `SITE_SETTINGS_COLUMNS`（Worker 白名单）+
  `defaultSiteSettings.ts`；`test/sync_update.test.mjs` 会核对"代码引用的列都存在"。
- **站点身份文案三处同步**：`.figma/make/site.json`（构建期注入）/ `defaultSiteSettings.ts`（后台留空时）/
  生产库 `site_settings`（实际显示）。三者的对照表在部署手册第六节。
- **`public/brand/*` 不走 LFS**（`frontend/.gitattributes` 有例外条目），`frontend/design/` 的原件走 LFS；
  改动品牌资产后跑 `python scripts/make-brand-logos.py` 并看 `design/preview.png`。
- **`public/` 下的文件按根路径引用，不能被 JS import**（Vite 会报错）。
- **管理端不许有假控件/假状态**：控件要么真落库，要么明确标只读；静默 sanitize 后回成功等于假状态。

## 边界

- 不 `git push`（部署由仓库主人触发）；不写生产库（只读核验可以）。
- 改 `.figma/make/site.json` 前先看 `vite.config.ts` —— 它是构建输入，不是临时文件。
