# NestSpace — 给编码 agent 的事实清单

> 每次动手前必读。上手步骤在 [README.md](README.md)，部署 / 安全 / 运维细节在
> [docs/DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md)。下面是这个仓库的真实回路与
> **违反后不会报错**的约定。（`frontend/CLAUDE.md` 用 `@AGENTS.md` 指回本文件。）

## 回路

- 装依赖：`cd frontend && pnpm install --frozen-lockfile`
  （仓库只有 `frontend/pnpm-lock.yaml`，`npm ci` 会 ENOLOCK；wrangler 4.148.0 也在这份依赖里，
  脚本优先用它，不再依赖机器上的全局版本）
- 改完必跑：`pnpm run typecheck`（前端 / Worker / `vite.config.ts` 三套 tsconfig）→ `pnpm test`（18 条纯函数闸门）→ `pnpm run build`
  （`build` 自己也先跑 typecheck：Workers Builds 只执行这一条命令，不能让它跳过类型检查）
- 接口级实测：仓库根 `bash scripts/usage-probe.sh`（自起 8898 的 dev、自收尾；端口已被占用就直接退出，
  不去应答/击杀另一个会话的实例）
- 页面级核对：`bash scripts/visual-check.sh`（无头 Chrome 截图 + DOM 断言；机器上要有 Chrome，所以不进 CI）
- 备份：`bash scripts/d1-backup.sh`（默认导远程库，并做一次真恢复演练）
- 生产只读烟测：`bash scripts/verify-production.sh`

## 硬约定（违反后大多**不会**让 tsc / 闸门 / build 变红，只会静默坏）

- **先 `pnpm run build` 再 `wrangler dev`**：dev 启动时固化资产清单，顺序反了会白屏。
- **Worker 入口模块只能导出函数或对象**。`worker/index.ts` 里导出数字/字符串/布尔会让 workerd 直接起不来
  （`Incorrect type for map entry`），而 tsc、闸门、build 全绿；要暴露常量给闸门就包成函数（见 `syncCaps()`）。
  `test/sync_scope.test.mjs` 有静态钉子。
- **迁移按文件名记账**（`scripts/d1-migrate.sh` + `_migrations` 表）：不要合并、改名、删除历史迁移文件。
  `0002` 原本用 `INSERT OR REPLACE`（重放会把 001–004 后来加上的列一并清成默认值），已改为 `INSERT OR IGNORE`；
  但**"按文件名记账"这条纪律不变**——改内容不改文件名，生产库里已登记的文件不会重跑。
- **新增站点设置列要三处同步**：`migrations/` + `SITE_SETTINGS_COLUMNS`（Worker 白名单）+
  `defaultSiteSettings.ts`；`test/sync_update.test.mjs` 的 17f / 18 核对「代码引用的列 ⊆ 迁移列」与
  「三份清单双向对齐」。
- **站点身份文案三份同步**：`frontend/.figma/make/site.json`（构建期注入）/ `defaultSiteSettings.ts`（后台留空时）/
  生产库 `site_settings`（实际显示）。三份的生效时机见部署手册**第五节**的对照表。
- **`public/brand/*` 不走 LFS**（`frontend/.gitattributes` 对 `*.png` 与 `*.ico` 各有例外条目），
  `frontend/design/` 的原件走 LFS；改品牌资产后跑 `python scripts/make-brand-logos.py`，
  并看 `frontend/design/preview.png`（同一张标贴在深浅两种底上 + 一行真实尺寸的图标）。
- **`public/` 下的文件按根路径引用，不能被 JS import**（Vite 会报错）。
- **管理端不许有假控件 / 假状态**：控件要么真落库，要么明确标只读；静默 sanitize 后回成功等于假状态。
  两个具体形态：派生值不许落库（活跃度条形高度只由权重算，落库就会出现"改了数字、图不动"）；
  同一个值不许有两个编辑器（`seoTitle` 以前在「站点信息」和「搜索与分享」各一个，其中那个叫"站点名称"的并不改标头）。
- **判据只写一份**：图源白名单在 `frontend/src/utils/previewRules.ts`（`IMAGE_PROXY_HOSTS`）、
  同步批次上限在 `frontend/src/utils/syncLimits.ts`，Worker 与前端都 import 同一份；
  闸门 `test/usage_stats.test.mjs` 有一条静态钉子，见到第二份 `new Set(...)` 就红。
- **同步的字段归属**：`stars / updated / version / language / date / year / metrics / features / timeline`
  归 GitHub、**每次覆盖（空值也写回）**——只在非空时写会让删了 Release 或清空 topics 的仓库永远停在旧值；
  `license / description / README / Compose / 预览图` 只在库里为空时填充，且判据要落在**同一条 UPDATE 的 CASE 里**，
  不能用同步开始时的快照（那会覆盖同步期间管理员刚补的内容）。
- **删除标本要连带删台账聚合**：`visit_page_day` / `visit_event_day` 按标本编号聚合；不清理会让「热门页面」
  永久保留已删标本，而新标本沿用 `max+1` 的编号时会继承它的历史统计。
- **管理端列表不带四份长文档**：列表只回本行字段 + `has_readme_*`，正文由
  `GET /api/admin/projects/:id` 在抽屉打开时取。任何"从列表取文档"的新代码都会让响应随馆藏线性放大。
- **站点设置的 URL 列在写侧校验**（`githubUrl / icpUrl / logoImageUrl`）：非 http(s) 绝对地址直接 400 并点名字段。

## 文档怎么写（这几条是被反复修正出来的）

- 一份事实只写一处，其余用指针。手册第六节一度把限流构成与图片分档各写了 2–3 遍。
- **手册只写现状契约**（数值、上限、写语义、能力边界），不写「当初怎么走过头、为什么这样才对」；
  迭代过程留在 `docs/plans/`，立项稿是 `docs/ARCHITECTURE_PLAN.md`（顶部有「规划 vs 现状」偏离表，改现状就更新那张表）。
- **文档里的数字要么由闸门算出来，要么别写**。没人核对的计数（「某测试 13 条断言」「16 条迁移」）一定会过期。
- 不写死域名与账号：前后台互跳按 hostname 推导（`frontend/src/utils/siteHost.ts`）。

## 边界

- 不 `git push`（部署由仓库主人触发）；不写生产库（只读核验可以）。
  远程 D1 迁移、`wrangler secret`、`wrangler deploy` 都由仓库主人执行。
- 同一工作树可能有**并行会话**在改别的文件：`git status` 按文件归属看，提交只 `git add` 自己改的那些，
  并在正文标注非本会话产物的归属。本地端口 8787 / 8898 / 8899 可能正被另一个会话占用。
- 改 `.figma/make/site.json` 前先看 `vite.config.ts` —— 它是构建输入，不是临时文件。
- `docs/screenshots/*.png` 直接进 Git、不走 LFS：`.gitattributes` 只放在 `frontend/` 下，根目录的图不在
  它的管辖范围，而这批图共约 2.4 MB、只给 README 看、不参与构建，留在 Git 里克隆即见。要转 LFS 得先在
  仓库根放一份 `.gitattributes`，并确认 GitHub 与 Workers Builds 两边的拉取方式都还能拿到真字节。
