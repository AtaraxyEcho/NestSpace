# 首页栏目文案可配置 · 实施方案 001
> ⚠️ **行号是快照**：本文的 `App.tsx:NNNN` 一类引用是写作当时抓的位置，Phase 4 的 `refactor(admin)` 之后已整体位移（`App.tsx` 增删约 300 行）。定位请搜符号名／字符串，不要照着行号跳。

> **已被 `SECTION_CONFIG_PLAN_003.md`（最终版）取代，中间态见 `SECTION_CONFIG_PLAN_002.md`（2026-10-10）**：本文件的 §1(D2/D8)、§2、§3、§4、§5、§7、§8、§9、§11 均由后续版本更新或取代。
> 取代原因：D2「标题按导航标签优先」与「前台零视觉变化」互相矛盾——`App.tsx:807` 的副标是语言判据、`App.tsx:968` 的 Index 标题比导航标签长，
> 我当时没验到底。本文件保留作为裁定过程的记录，**不要按它执行**。
>
> 状态：方案成文，本轮未改动任何代码。D1–D8 已按推荐默认自取（每条都给了推翻它的代价），等你放行后按 Phase 顺序执行。
> 需求来源：他提出「管理端按页面分栏控制；公开站点每个页面都该有自己的配置；Catalogue 段的作用明明是统计；导航改名后栏目标题没跟着改」。
> 所有行号来自 2026-10-10 的两次全量核对；本地 D1 实测值见 §8。

---

## 0. 根因（一句话）

导航标签是数据（`navItems`），栏目标题是 JSX 字面量，两者从未连接。

| 现象 | 证据 |
|---|---|
| 导航项只有 4 个字段，无标题/描述 | `src/types/siteSettings.ts:2-7`，存 `nav_items_json`（`worker/index.ts:2291-2294`） |
| Catalogue 段标题写死 | `App.tsx:804-808`：`CABINET RECORD / 02` + `Catalogue <em>/ 馆藏统计</em>` |
| Index 段标题写死，且组件拿不到 settings | `App.tsx:964-969`；props 只有 `{items,onOpen}`（`945-959`），唯一调用点 `6153` |
| 序号「02」写死，而段落顺序是数据驱动的 | `App.tsx:804` vs `utils/navOrder.ts` + 渲染处 `App.tsx:6129-6155` |
| Curator 段已是正确样板 | `App.tsx:900-915` 走 `curatorEyebrow*/Headline*/Quote*` |
| 一段配置散在三个视图 | 标签/顺序在 02、指标在 03、显隐 `homeStatsVisible` 在 07「展示偏好」（`App.tsx:~4452`），标题无处可配 |

---

## 1. 裁定表

| # | 裁定 | 取值 | 推翻它的代价 |
|---|---|---|---|
| D1 | 描述存哪 | **塞进 `navItems`**（零迁移、零 worker 改动、闸门 case 18 不触发）+ 客户端长度闸门 | 独立 `section_copy_json` 列要 1 条迁移、worker JSON 列映射、`settingsPayloadFromRow` 的形状兜底（现对新列回退 `[]`，对象形会被打歪）、`mergeSiteSettings` 特例，共 5 处 |
| D2 | 栏目标题口径 | **标签优先**：`item.titleEn` 为空 → 用 `item.labelEn`。**不内置标题默认值** | 一旦加内置默认，默认值赢过标签，"导航改名→栏目改名"就又不传播了（等于回到原 bug） |
| D3 | 描述行默认值 | **内置默认全为空串 ⇒ 前台视觉零变化**，管理员填了才出现该行 | 若预置一句默认文案，等于我替他改首页版式（他否过"顺手改视觉"） |
| D4 | eyebrow | **不配置化**；只把 `CABINET RECORD / 02` 的序号改成按渲染位置派生 | 项目既定约定：结构标签刻意单语，是排版语汇（`FIELD NOTES / 02`、`ANATOMY / 03` 同理不动） |
| D5 | 本轮范围 | **只修首页 Catalogue + Index 两段** | 详情页那批（`App.tsx:1462-1719`、`5408-5423`）与 Catalogue 四张统计卡标签（`775-798`）按 D4 约定保持硬编码 |
| D6 | Catalogue → Statistics | 内置默认改 `labelEn:'Statistics'`（只对空库安装生效）；**现网那行要他在后台改一次** | `id:'catalogue'` 是锚点（`SECTION_ANCHORS` `App.tsx:296`、`HomeSectionId` `navOrder.ts:10`、`homeStatsVisible` 过滤 `App.tsx:5947-5954`），**不可改名** |
| D7 | 管理端按页面重排 | 作为**独立 Phase 4**，接线（Phase 1–3）先落地 | 同轮一起做＝同时动渲染和面板结构，回归时分不清是哪一半坏 |
| D8 | `zh === en` 时 | 不渲染 `<em>` 重复串（`Statistics / Statistics` 是噪声） | 一行判据 + 一条测试用例 |

---

## 2. 取文契约（新纯函数，前后台共用）

新增 `src/utils/sectionCopy.ts`：

```
resolveSectionCopy(navItems, id) →
  title = { en: nonEmpty(item.titleEn) ?? nonEmpty(item.labelEn) ?? DEFAULT_LABEL[id].en,
            zh: nonEmpty(item.titleZh) ?? nonEmpty(item.labelZh) ?? DEFAULT_LABEL[id].zh }
  desc  = { en: nonEmpty(item.descEn) ?? DEFAULT_SECTION_COPY[id].en,     // 默认为空 ⇒ 整行不渲染
            zh: nonEmpty(item.descZh) ?? DEFAULT_SECTION_COPY[id].zh }
```

- `nonEmpty` = `typeof v === 'string' && v.trim() !== ''`，与 `mergeSiteSettings` 的「空/纯空白 = 未填写」同一口径（`test/sync_update.test.mjs:837-861`）。
- 渲染取文用 `pickSiteHeading`（`src/utils/bilingual.ts`，已被 `App.tsx:1233-1240` 与后台字段标签共用，`test/bilingual.test.mjs:159-164` 钉住）——**不另写第二套回退判据**。
- 查不到 item（被 D6 的过滤路径剔除、或库里缺 id）→ 落 `DEFAULT_NAV_ITEMS` 兜底，返回结果永不为 undefined。

---

## 3. Phase 1 · 数据面（4 处，零迁移）

1. `src/types/siteSettings.ts:2-7` — `NavItemConfig` 增四个**可选**键：`titleEn? titleZh? descEn? descZh?`
2. `src/data/defaultSiteSettings.ts` — 新增 `DEFAULT_SECTION_COPY: Record<HomeSectionId, {en,zh}>`，四条**全是空串**（D3）；导出上限常量 `SECTION_TITLE_MAX = 40`、`SECTION_DESC_MAX = 160`（供管理端闸门用；**不放 worker**——workerd 会把入口模块的标量具名导出当 handler 映射，直接打死运行时）
3. `src/data/defaultSiteSettings.ts:118-133` — 「catalogue 缺失就补回」的分支里 `labelEn:'Catalogue'` 是 `DEFAULT_NAV_ITEMS:5` 的第二份字面量；改为从 `DEFAULT_NAV_ITEMS` 查，消除双份（否则 D6 改名会漏一处）
4. `mergeSiteSettings` **不动 item 内部**，只加注释说明为什么不在这里补默认：`saveSettings`（`App.tsx:2359-2386`）按顶层 key 比基线（`projectDiff.ts:28-40`），`navItems` 一旦被判"有改动"就整列重写；在 merge 里填默认＝每次保存都把整套栏目文案烤进库 ⇒ 以后改内置默认再也传不下去（本地库 `nav_items_json` 已是整份默认数组，实测见 §8）

## 4. Phase 2 · 前台接线（视觉除序号外不变）

5. `App.tsx:6129-6155` — 渲染 map 时把 `shownSections.indexOf(id) + 1` 作为段落序号传下去
6. `App.tsx:801-811` CatalogueStats — 标题改走 `resolveSectionCopy`（`<h2>{en} <em>/ {zh}</em></h2>`，D8 时省 `<em>`）；eyebrow 文本不动、序号用传入的 `sectionIndex`；描述 `<p className="section-desc">` 仅在有文时渲染
7. `App.tsx:945-1000` + `6153` — `SpecimenIndex` 补 `settings`/`sectionIndex` props，同款标题与描述接线；`SYSTEMATIC REGISTER / {件数}` 保持（那是件数不是序号）
8. `App.tsx:715` `CABINET NO. 01 · …` — **不动**（柜号是装饰，不与段落序号联动，避免过度耦合）
9. `src/index.css` — 新增 `.section-heading .section-desc`（`304-307` 现在只有 eyebrow/h2/as-of，无 `<p>` 规则）+ 移动端一条（对照 `1216-1218`）。Curator 段用 `.curator-copy`，不共用该样式，本轮不动它

## 5. Phase 3 · 管理端编辑面（仍留在「02 导航与标头」）

10. `App.tsx:3155-3260` — 每个 `nav-config-item` 加第二行：标题 EN/ZH（input）+ 描述 EN/ZH（textarea rows=2）。现网格是 `80px 1fr 1fr 90px 70px`（`index.css:1072-1092`），新增字段做不进同一行 ⇒ 加 `.nav-config-copy { grid-column:1/-1; display:grid; grid-template-columns:1fr 1fr; }`
11. `placeholder` 用既有「留空自动…」写法（先例 `App.tsx:3436`）：标题＝`跟随导航名称（当前：Statistics）`，描述＝`留空则不显示此行`。**绝不预填 value**（预填＝烤默认进库，见 Phase 1 第 4 条）
12. 即时校验函数 `sectionCopyIssues(navItems)`：逐 item 点名「哪个栏目、哪一栏、超了几个字」，并算整列序列化长度是否逼近 5000。挂在保存按钮上方，判据与 `buildSiteSettingsWrite` 的拒绝口径一致（超长是**点名拒绝**，不静默截断——`worker/index.ts:2351/2372-2374`，`test/sync_update.test.mjs:918-925`）。仿 `galleryRowIssues` 的"填的时候就点名坏行"模式（`App.tsx:2563-2569`）
13. `App.tsx:3274-3282` 重置按钮的文案与列表跟随 `DEFAULT_NAV_ITEMS`（含 D6 改名）
14. `App.tsx:3146-3152` 说明段更新为：这里的名称同时决定**顶栏导航、页脚章节列（`App.tsx:1045-1053`）、首页栏目标题**；栏目标题留空即跟随

## 6. Phase 4 · 管理端按页面重排（可停在这里，独立一轮）

已核实：`view` 只有 `useState`（`App.tsx:2251`），无 localStorage/深链 ⇒ 重排编号没有旧链接失效风险。

| 新侧栏 | 内容来源（现视图） |
|---|---|
| 01 总览 | 不变 |
| 02 全局 · 标头与导航 | 02 的 HEADER & LOGO + 导航顺序/标签/显示 |
| 03 首页栏目 · 陈列 | 04 的 HERO 卡 |
| 04 首页栏目 · 统计 | 03 整卡（指标/年鉴）+ 该段标题/描述 + `homeStatsVisible`（从 07 搬来） |
| 05 首页栏目 · 手记 | 04 的 CURATOR + CURATOR COPY |
| 06 首页栏目 · 目录 | 新卡：该段标题/描述 |
| 07 详情页 | 04 的 DETAIL / FIELD NOTES（挑战/方案小标题） |
| 08 页脚 | 现 08 |
| 09 项目 / 10 同步 / 11 站点设置 | 现 05 / 06 / 07（去掉 `homeStatsVisible`） |

同步要做的事：`AdminView` 联合类型（`App.tsx:1746`）、`viewNames`（`2326-2335`）、侧栏按钮（`2897-2952`），以及**清掉页内 eyebrow 与侧栏编号的错位**（现 `EDITORIAL CONTENT / 02` 在侧栏 04、`SITE CONFIGURATION / 03` 在侧栏 07、`FOOTER COPY / 08`、`SPECIMEN REGISTER / 02`、`REMOTE COLLECTION / 06`）。
硬约束：搬家只动 JSX 归属，**不动写路径**；所有卡片的保存按钮仍指向同一个 `saveSettings`，别复制出第二个。`homeStatsVisible` 与导航 `visible` 仍必须是两个开关（`App.tsx:6125-6128` 的注释就是那次"隐藏链接不该顺手删段落"留下的）。

## 7. 闸门与验证

1. `package.json:11` 的 test 链新增 `node test/section_copy.test.mjs`，用例至少覆盖：标签优先回退 / 空白=未填 / 稀疏 item（老库无新键）/ 缺 id 兜底 / `zh===en` 省 `<em>` / 超长点名 / 整列 5000 预算判定。
2. `pnpm build && pnpm test && pnpm typecheck` 全绿；确认 case 18b/c/d（`sync_update.test.mjs:815-832`）未触发（只遍历顶层 key），`nav_order.test.mjs` 未触发（只认 `id`/`visible`）。
3. 起 dev（探针走 **8898，勿用 8787**）浏览器实测：
   - 后台改导航名称 → 前台栏目标题、顶栏、页脚章节列三处同时变
   - 填描述 → 行出现；清空 → 行消失（D3 语义）；中英切换各看一遍
   - 段落拖序 → 栏目标题序号跟着走（`/ 02` 不再是死的）
   - `homeStatsVisible=false` → 段落消失且不留空描述
   - Network 里核对 PUT body **只含 `navItems` 一项**（证明没把默认抄进库）
   - 移动端：注意 0×0 视口下 `vw/vh` 恒为 0 的老坑，别据此判断布局
4. 文档：`docs/DEPLOYMENT_GUIDE.md:373/398-400/§八(733-768)` 补「栏目标题/描述可配 + 留空语义 + Statistics 改名」。
5. 提交：Phase 1–3 一个 commit（`feat(copy): make home section headlines and blurbs admin-configurable`），Phase 4 单独一个；**不 push**（部署由他 push）。

## 8. 数字口径（改动前重算最坏路径）

- 实测本地 D1 `site_settings.nav_items_json` 长度 **277**（4 项齐全，即整份默认已被烤进去）。上限 5000 作用在**序列化后的整串**（`worker/index.ts:2372-2374` + `push` 的长度判据）。
- 最坏（4 项全填满）：每项 40+40+160+160 = 400 字符内容 + 约 140 字符键名与标点开销 ≈ 540，×4 ≈ 2160，加括号 ≈ **2.2 KB < 5000**，余量约 2.8K。⇒ D1 成立的前提是 §5 第 12 条的客户端上限；没有它，一句粘长的描述会把整列写失败，且 400 只点名 `navItems`，会连带锁死标签/顺序/显隐的保存。

## 9. 风险

| 风险 | 处置 |
|---|---|
| 默认值被烤进库（改默认不再生效） | Phase 1 第 4 条 + 验证第 3 步的 Network body 核对 |
| 从 `effectiveSettings` 读到已过滤的 navItems | 取文案一律按 id 查未过滤列表，util 内置 `DEFAULT_NAV_ITEMS` 兜底 |
| worker 入口新增标量导出打死 workerd | 本方案不动 worker；上限常量放前端 `data/` |
| 序号联动改坏 Curator/Cabinet | D4/D8 明确：Curator 无序号、`CABINET NO. 01` 不联动 |
| Phase 4 搬卡把同一状态渲染两处 | 限制：Phase 4 只动归属与编号，不动 state 字段与保存函数 |

## 10. 不做范围（列入口，不在本轮）

- 统计卡四张的 `SPECIMENS / CITATIONS / RANGE / SINCE` 及其中文副标（`App.tsx:775-798`）—— D4 约定
- 详情页 eyebrow 与 `Continue observing`（`App.tsx:1462-1719`、`1720`）、`Inside the specimen / 项目预览` 与含 `{total}` 插值的 hint（`5408-5423`）。要做可复用 `fillFooterTemplate` 的占位符机制（`App.tsx:1003-1009`，用替换函数防 `$&`）
- 新增段落 / 导航项增删（`HomeSectionId` 仍是闭集四段）
- 富文本、HTML 存储（全站 markdown→React 节点、零 `dangerouslySetInnerHTML`，是既定硬约束）

## 11. 证据缺口（未验证，勿当已核）

1. **远程生产库那行没查**（只测了本地 `.wrangler` D1）；若线上标签被手改得很长，§8 余量要重算。放行后我先跑一条只读 SELECT。
2. **未实跑** test/typecheck——"闸门不触发"目前是读代码的判断。
3. **未起 dev 看过渲染**——新增 `<p>` 在 `.section-heading` 与移动端的排版，还只是代码推断。
4. Phase 4 的 `homeStatsVisible` 搬家后，「展示偏好」里剩下的两个开关的分组文案要重写，具体措辞未定。
