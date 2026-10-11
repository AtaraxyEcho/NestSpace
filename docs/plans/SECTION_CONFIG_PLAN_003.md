# 栏目与页面文案可配置 · 最终方案 003
> ⚠️ **行号是快照**：本文的 `App.tsx:NNNN` 一类引用是写作当时抓的位置，Phase 4 的 `refactor(admin)` 之后已整体位移（`App.tsx` 增删约 300 行）。定位请搜符号名／字符串，不要照着行号跳。

> 状态：**Phase 1–4 全部落地并本地实测通过**（2026-10-10）。Phase 4 的侧栏第一版拆得过细、当天并按他的否决改回
> 「一页一栏」（见 §7 顶部与 §17）。**唯一未完成**：迁移 0014 只跑在本地，**远程未执行**——
> push 前必须先 `bash scripts/d1-migrate.sh remote`。
> 取代 `SECTION_CONFIG_PLAN_001.md` 与 `SECTION_CONFIG_PLAN_002.md`（两版保留为裁定过程记录，不要按它们执行）。
> 执行记录与对本文的四处事实修正见 §15；Phase 4 的落地差异见 §7 开头。
> 依据：全栈审查一轮 + 产品审查一轮 + nav 消费者全量清点 + 详情页槽位逐个读码 + 本地 D1 实测。**本轮仍未改动任何代码。**

---

## 0. 三轮审查改变了什么（净结论）

| 前版结论 | 审查发现 | 本版 |
|---|---|---|
| 001-D2「标题=导航标签优先，另留覆盖字段」 | 与「零视觉变化」矛盾：`App.tsx:807` 的副标是语言判据、`App.tsx:967-968` 的 Index 标题比导航标签长 | **标题就是导航标签，不加覆盖字段**（D2′），差异摊开为一句可核的事实（§8 验收） |
| 001-D1「描述塞进 `navItems`，零迁移」 | 纳入详情页槽位后，要存的文案**不属于导航**；塞进导航数组＝假结构，且与标签/顺序共享 5000 整串预算 | 改用**一个按槽位键存的 JSON 列** `section_copy_json`（迁移 0014），`NavItemConfig` 本轮**一个键都不加**（D1″） |
| 002 未提 | `labelZh \|\| labelEn` 这段判据今天已内联重复三份（`531-535`/`1045-1053`/`1850-1852`） | 抽 `navLabel()` 四消费者同调（D10） |
| 002-D11 | `pickSiteHeading` 会 trim **且跨语言回退**，不能用于并排双语的 h2 槽位 | 定 D14：并排显示与按语言显示是两套判据，不可混用 |

---

## 1. 裁定表（最终取值）

| # | 议题 | 定 | 理由／代价 |
|---|---|---|---|
| D1″ | 文案存哪 | 新列 `site_settings.section_copy_json`（迁移 **0014**），形状 `{ "<page>.<slot>": {en, zh} }` | 首页与详情页的槽位统一一套机制；加槽位零迁移。代价：1 条迁移（本地+远程按序执行）+ worker 三清单与 `DEFAULT_SITE_SETTINGS` 各加一项，全部由 `sync_update` case 18b/c/d 钉住 |
| D2′ | 栏目标题 | 首页四段的 `<h2>` = 导航标签本身，`{labelEn} <em>/ {labelZh}</em>`；**无覆盖字段、无内置标题默认** | 结构性消灭"改了导航不动标题"。代价：en 模式 Catalogue 不再显示 `Collection record`（`App.tsx:807`，全仓唯一一处语言判据副标）、Index 标题由 `Index of Specimens` 缩为 `Index`。恢复办法是把导航标签本身写全（顶栏 `≤760px` 整条隐藏 `index.css:1185-1187`，长标签只吃桌面宽度） |
| D9 | 标题覆盖字段 | **不做** | 加了就必须配「已被覆盖，不跟随导航名称」指示 + 一键清空，否则他改导航名而标题被静默顶掉＝原 bug 复发。真需要时另开一轮 |
| D3 | 首页描述默认 | `home.*` 内置默认全空串 ⇒ 行不出现，他填了才有 | 我不替他定首页文案 |
| D13 | 内置默认的统一规则 | **配置项的内置默认 = 它替换掉的那句原文**；纯新增行默认空 = 不渲染 | 保证"接线前后视觉一致"这一条对详情页同样成立 |
| D4 | eyebrow | 不配置化（项目既定：结构标签刻意单语） | 首页只把 `CABINET RECORD / 02` 的字面量序号改为按渲染位置派生；默认顺序算出来仍是 `02` ⇒ 零变化 |
| D15（原 P1） | `Collection record` | **删**，不挪成描述行 | 它是 en 模式下对「馆藏统计」的注疏；同段其他 h2（Index、Anatomy、Preview）在 en 模式本就显示中文侧 ⇒ 删掉是向既有版式收敛，且避免我凭空加一行小字 |
| D16（原 P2） | 详情页纳入 | **纳入**，共 3 个槽位：`detail.preview`(`5421`)、`detail.anatomy`(`1497-1498`)、`detail.related`(`1720`) | `1468/1480` 两句已是配置项（迁移 0013），不动；`A LIVING SPECIMEN`(`1534`) 与 7 处 eyebrow 属结构标签，不动 |
| D6 | Catalogue→Statistics | `DEFAULT_NAV_ITEMS[1].labelEn = 'Statistics'`；**现网那行要他在后台改一次**（库里已存过整份默认，以库为准） | `id:'catalogue'` 不可改名：`SECTION_ANCHORS`(`App.tsx:296`)、`HomeSectionId`(`navOrder.ts:10`)、`homeStatsVisible` 过滤(`App.tsx:5947-5954`) 三处依赖 |
| D7 | 按页面分栏重排 | Phase 4，独立一轮 | `view` 只有 `useState`(`App.tsx:2251`)、无 localStorage ⇒ 重排无旧链接失效风险（已核） |
| D10 | 取文单源 | 抽 `navLabel(item, lang)`，顶栏/页脚章节列/后台预览/栏目标题四处同调 | 现状三份行为相同但各写一遍的内联判据，第四处再加就是第四次分叉 |
| D14 | 两套双语判据 | **并排显示**（`EN <em>/ ZH</em>`）：按语言各取，该语言空→回**该语言**的内置默认。**按访客语言只显示一种**（`home.*` 描述、挑战/方案小标题）：用 `pickSiteHeading` 跨语言回退 | 混用会让"只填英文"的槽位在中文侧显示英文（对并排式是错的），或让后台预览与前台不同串 |
| D12 | 长度闸门 | 计数器 + 保存前点名拒绝；**不用 `maxLength`** | `maxLength` 粘贴即静默截断＝本仓禁止的"静默 sanitize 后回成功"。仿抽屉 `galleryRowIssues` 的坏行即时点名(`App.tsx:2563-2569`)；现有导航输入框也都没有 `maxLength`(`3206/3224`) |

---

## 2. 存储契约

**槽位与内置默认**（`src/data/defaultSiteSettings.ts` 新增导出 `BUILT_IN_SECTION_SLOTS`）：

| key | 替换掉现在的 | 内置默认 en / zh |
|---|---|---|
| `home.catalogue` | 新增描述行（`App.tsx:811` 之后） | `'' / ''`（不渲染） |
| `home.index` | 新增描述行（`App.tsx:970` 之后） | `'' / ''` |
| `detail.preview` | `Inside the specimen <em>/ 项目预览</em>`（`5421`） | `Inside the specimen` / `项目预览` |
| `detail.anatomy` | `Core capabilities <em>/ 标本特征</em>`（`1497-1498`） | `Core capabilities` / `标本特征` |
| `detail.related` | `Continue observing`（`1720`） | `Continue observing` / `''`（无中文侧，不渲染 `<em>`） |

**迁移 0014**（`migrations/0014_add_section_copy.sql`）：

```sql
ALTER TABLE site_settings ADD COLUMN section_copy_json TEXT NOT NULL DEFAULT '';
```

**worker 三清单**：`SITE_SETTINGS_JSON_COLUMNS` 加 `sectionCopy: 'section_copy_json'`（`worker/index.ts:2291-2294`）。
- **不改** `settingsPayloadFromRow`：空列会被回吐成 `[]`（`2314` 的兜底），由 util 判"非纯对象＝空槽位表"，比在 worker 入口新增符号更小回归面（workerd 会把入口模块标量具名导出当 handler 映射，打死运行时）。
- 写侧 `2372-2374` 对 JSON 列整串 `JSON.stringify` + 5000 上限判据（`2351/2361-2363`），超长 400 会点名 `sectionCopy`。

**闸门兼容**：`sectionCopy` 同时出现在 worker 映射与 `DEFAULT_SITE_SETTINGS`（值 `{}`）⇒ case 18c/18d 满足；`section_copy_json` 出现在 0014 ⇒ 18b 满足。

**禁止烤默认**：`mergeSiteSettings` 只加一条分支——`sectionCopy` 为纯对象则原样透传，否则置 `{}`；**绝不把 `BUILT_IN_SECTION_SLOTS` 合进去**。理由：`saveSettings`(`App.tsx:2359-2386`) 用 `changedColumns`(`projectDiff.ts:28-40`) 按顶层 key 比，整列重写；merge 里填默认＝每次保存把文案烤进库 ⇒ 以后改内置默认再也传不下去（本地库 `nav_items_json` 已是整份默认数组、长度 277，就是这个陷阱的实物证据）。

---

## 3. 取文契约（新纯函数 `src/utils/sectionCopy.ts` + `navLabel`）

```
navLabel(item, lang)      = lang==='zh' ? (trim(item.labelZh) || trim(item.labelEn))
                                       : (trim(item.labelEn) || trim(item.labelZh))
sectionTitlePair(items,id)= item = find(items,id) ?? DEFAULT_NAV_ITEMS[id]
                            → { en: navLabel(item,'en'), zh: navLabel(item,'zh') }
                            → en===zh 时不渲染 <em>
sideBySide(key, lang)     = trim(slot[key][lang]) || BUILT_IN[key][lang]        // D14 并排式
proseSlot(key, lang)      = pickSiteHeading(slot[key] ?? {en:'',zh:''}, lang)   // D14 单显式，空则不渲染
ordinal(id)               = shownSections.indexOf(id) + 1，两位补零
```
取 item 必须查**未过滤**的 `siteSettings.navItems`（`effectiveSettings` 在 `homeStatsVisible=false` 时会剔掉 catalogue，`App.tsx:5947-5954`）；util 内置兜底，列为测试用例。

---

## 4. Phase 1 · 数据面

1. `migrations/0014_add_section_copy.sql`（上面那条 ALTER）
2. `src/types/siteSettings.ts` — 新增 `SectionSlotKey` 联合类型与 `type SiteSectionCopy = Partial<Record<SectionSlotKey, {en:string;zh:string}>>`；`SiteSettings` 加 `sectionCopy: SiteSectionCopy`。**`NavItemConfig` 不加键**
3. `src/data/defaultSiteSettings.ts` — 加 `BUILT_IN_SECTION_SLOTS`、`DEFAULT_SITE_SETTINGS.sectionCopy = {}`、`SECTION_SLOT_TEXT_MAX = 160`
4. `src/data/defaultSiteSettings.ts:118-133` — 补回 catalogue 用的 `'Catalogue'` 字面量是 `DEFAULT_NAV_ITEMS:5` 的第二份，改为按 id 查（否则 D6 改名必漏一处）；同文件把 `DEFAULT_NAV_ITEMS[1].labelEn` 改为 `'Statistics'`（D6）
5. `mergeSiteSettings` — 加 `sectionCopy` 的纯对象分支（§2 末）
6. `src/utils/sectionCopy.ts` + `navLabel`（新文件，被前台与后台共用）
7. `frontend/worker/index.ts:2291-2294` — 加 `sectionCopy` 映射（仅此一行；**不动其它 worker 代码、不加标量导出**）

## 5. Phase 2 · 前台接线

8. `App.tsx:805-808`、`967-968` — 删两处硬编码，改标题同源（D2′）
9. `App.tsx:804` — `CABINET RECORD / {ordinal}`
10. `App.tsx:531-535`、`1045-1053`、`1850-1852` — 三处内联判据改调 `navLabel`（行为不变，纯去重；这是本轮最需要实机对比的一步）
11. `App.tsx:945-1000` + `6153` — `SpecimenIndex` 补 `settings`/`sectionIndex` props（唯一调用点已核）；`SYSTEMATIC REGISTER / {件数}` 保持（那是件数不是序号）
12. 首页描述行：`proseSlot('home.catalogue'|'home.index')` 非空时渲染 `<p className="section-desc">`
13. 详情页三处 h2 改走 `sideBySide`（`5421`、`1497-1498`、`1720`）；`detail.related` 无中文侧 ⇒ 不渲染 `<em>`
14. `src/index.css` — 新增 `.section-heading .section-desc`（现 `304-307` 无 `<p>` 规则）+ 移动端一条（对照 `1216-1218`）。注意 `.section-heading` 是 `align-items:flex-end`，多一行会把 `.as-of` 下沿拉下去 ⇒ 实机决定是否给 `.as-of` 单独定位
15. `App.tsx:715` `CABINET NO. 01 · …` 不动（柜号装饰，不与段落序号联动）

## 6. Phase 3 · 管理端编辑面

16. 「02 导航与标头」说明段(`3146-3152`)改写：这里的名称同时决定顶栏、页脚章节列、**首页栏目标题**三处
17. 新增「栏目与页面文案」区（放 02 底部，Phase 4 再归位）：5 个槽位 × 中英两个输入 = 10 格，`placeholder` 用既有「留空自动…」写法（先例 `App.tsx:3436`）显示 `BUILT_IN_SECTION_SLOTS` 的值；**value 一律不预填**
18. `sectionSlotIssues(slot)`：逐格点名「哪个槽位 / 哪一栏 / 几个字」，并算整串序列化是否逼近 5000；话术与 worker 拒绝口径一致（真实 400 形如 `「sectionCopy」有 N 字符，超过 5000 字符上限`，`worker/index.ts:2351/2361-2363` + `api/adminClient.ts:151` + `App.tsx:2384`）
19. `App.tsx:3274-3282` 重置按钮文案跟随 D6，并说清它只重置导航顺序与名称（不动文案，因为文案是另一个键）
20. 站内三处 "Catalogue" 字样跟随：`3393`、`4447`（「关闭后首页隐藏 Catalogue 统计区块…」）、`3282`
21. 文档：`docs/DEPLOYMENT_GUIDE.md:373/398-400/§八(733-768)` 补「标题同源规则 + 槽位表 + 留空语义」；目录树与迁移清单加 0014

## 7. Phase 4 · 管理端按页面分栏重排（独立一轮，可停在 Phase 3）

> **已执行，但第一版走过头、当天就改了。** 我对"按页面分栏"的理解先落成了**四个侧栏条目**
> （`03 首页·陈列 / 04 首页·统计 / 05 首页·手记 / 06 首页·目录`），他当场否掉：
> "侧边栏为什么要分成四个首页导航栏，缺少产品设计，应该归为一个导航栏统一到一个页面里，本身内容并不多"。
> ⇒ 首页四段并回**一条「03 首页栏目」**，页面内按访客顺序分卡；「详情页」那条也更名为「详情页文案」。
> 教训：分栏指的是**页面内分区**，不是侧栏条目数；一条侧栏只装一两张卡就是空壳。
>
> 最终形态与落地时的三处差异：
> ① 序号不逐处手写，改成 `ADMIN_NAV` + `adminNavNo(key)` 一处维护（本文只说"清掉错位"，没规定怎么做）；
> ② 中 / EN 语言页签抽成 `ContentLanguageTabs`——首页、详情页两栏都要它，以前那段 JSX 只有一份；
> ③ 「关于与联系」卡（about + GitHub + 邮箱）的 eyebrow 从 `CURATOR / 馆长手记` 改成 `ABOUT & CONTACT`
>   （同页另一张卡也叫 CURATOR，两个同名会指不清）。
> 另外修掉一批会误导人的跨栏指称（抽屉里"入口在「04 内容管理」"、页脚 hint 里的旧视图名），
> 以及本文自己写错的两句提示——**手记段的大标题用的是 headline，并不跟随导航名称**。

| 侧栏（最终 8 条） | 内容 |
|---|---|
| 01 馆藏总览 | 不变 |
| 02 标头与导航 | 导航顺序 / 名称 / 显示 + Logo |
| 03 首页栏目 | 陈列（HERO）→ 统计（指标 / 年鉴 / `home.catalogue` / `homeStatsVisible`）→ 手记（关于与联系、`curator*`）→ 目录（`home.index`），按访客顺序排；**整页一个保存按钮** |
| 04 详情页文案 | `challenge/solutionHeadline*` + `detail.preview/anatomy/related` |
| 05 底部栏文案 / 06 项目管理 / 07 GitHub 同步 / 08 站点设置 | 原样（站点设置已不含 `homeStatsVisible`） |

合并成一页后，原先四块各自的页级按钮与卡内"保存馆藏指标设置""保存活跃度设置"这类按钮一共七个，
全都调用同一个 `saveSettings`、提交的都是整份改动集——**标签暗示的作用域并不存在**（点"只存指标"会把手记的改动一起写进去），
所以首页这一页只保留一个按钮。其余页面（02/04/05/08）的"页级 + 卡级"双按钮组合这次没动，留作一致性清理项。

同步改：`AdminView`(`App.tsx:1746`)、`viewNames`(`2326-2335`)、侧栏按钮(`2897-2952`)，并清掉页内 eyebrow 与侧栏编号的错位（`EDITORIAL CONTENT / 02` 实为侧栏 04、`SITE CONFIGURATION / 03` 实为 07、`SPECIMEN REGISTER / 02` 实为 05、`REMOTE COLLECTION / 06` 巧合对上）。
硬约束：只动 JSX 归属与编号，**不动 state 字段与写路径**；所有卡仍调同一个 `saveSettings`；`homeStatsVisible` 与导航 `visible` 保持两个开关（`App.tsx:6125-6128` 的注释就是那次"隐藏链接不该顺手删段落"留下的）。

---

## 8. 验收标准

| 场景 | 期望 |
|---|---|
| 后台把 `Catalogue` 改名 `Statistics` 并保存 | 顶栏、页脚章节列、首页该段 `<h2>` 英文侧**三处同时变**（zh/en 各看一遍） |
| 接线前后对比 zh 模式首页 | Catalogue 段仍是 `… / 馆藏统计`、Index 段标题从 `Index of Specimens` 变 `Index`（**唯一两处视觉差异**，D2′ 明记）、eyebrow 序号不变 |
| en 模式首页 Catalogue | 副标从 `Collection record` 变中文标签（D15，刻意为之） |
| 填 `home.catalogue` 描述 | 出现一行小字，`.as-of` 不错位；清空 → 行消失 |
| 填 `detail.anatomy` 仅英文 | 中文侧仍显示内置「标本特征」，**不是**跟着变英文（D14） |
| 段落拖序 | `CABINET RECORD / 0N` 的 N 跟着渲染位置走 |
| `homeStatsVisible=false` | 段落消失、导航项同步移除、不留空描述 |
| 详情页三处标题 | 不改配置时与改前**逐字相同**（D13） |
| 保存后 Network body | 只含被改的那个顶层键（`navItems` 或 `sectionCopy`），证明默认没被烤进库 |
| **豁免项（不是没修好）** | Curator 的大标题是 `curatorHeadline*`（编辑性宣言，`App.tsx:903-910`）、Cabinet 无 `<h2>`（只有 `ambient-mark` `712-715`）⇒ 改导航名不动这两段的大标题；eyebrow 全部保持单语硬编码（D4） |

---

## 9. 数字口径（改动前重算最坏路径）

- `section_copy_json`：5 槽 × 中英 × 160 = 1.6KB 内容 + 键名标点约 0.3KB ⇒ **约 1.9KB < 5000**，余量 3.1K。
- `nav_items_json`：本轮**不加键** ⇒ 维持实测 277 字符，与文案写入彻底解耦（不再共享预算）。
- 每格 `SECTION_SLOT_TEXT_MAX = 160`：详情页现有最长串 `Inside the specimen` 19 字符，160 已是十倍余量，只挡"把整段 README 粘进标题框"。

## 10. 执行与部署顺序（照本仓既有回路）

1. **先跑只读探针**：查远程生产库 `SELECT length(nav_items_json), nav_items_json FROM site_settings WHERE id=1`，确认线上标签未被手改过长文本、并据此确认 D6 只需一次后台编辑。
2. `pnpm wrangler d1 migrations apply <DB> --local` → 再起 dev 验（**先 build 再 dev**，探针端口 **8898，勿用 8787**；孤儿 workerd 按端口收）。
3. `pnpm test`（含新增 `section_copy.test.mjs`，接进 `package.json:11`）+ `pnpm typecheck` 全绿；确认 case 18 通过。
4. 浏览器实测 §8 全部行项（含 ≤760px 与语言/主题切换；注意 0×0 视口下 `vw/vh` 恒为 0 的老坑，别据此判断布局）。
5. 远程迁移**先本地后远程按序**执行；部署前 dry-run（AE 绑定会 gate 部署）。**push 由他执行**，我不推。
6. 提交两个：`feat(copy): drive home headlines from nav labels and make section copy admin-configurable`（Phase 1–3 + 迁移）、`refactor(admin): group console by page`（Phase 4）。

## 11. 已知且刻意（免得下轮当漏洞重修）

1. worker 对 JSON 列的**对象内部零校验**（`2372-2374` 原样 stringify，未知键 round-trip；只有顶层陌生键被丢，`sync_update.test.mjs:907-911`）。保持现状：与今天一致，值只作 React 文本子节点，无注入面（全站零 `dangerouslySetInnerHTML`）。
2. 多标签并发是整键 last-write-wins（今天已如此，不给 4 行配置加乐观锁）。
3. 管理路由无 body 上限（`readJsonBody:584-593` 无 cap，唯一 413 是 `/api/usage`）⇒ 仓库内第一道闸就是 5000。
4. 槽位存原样字符串不裁首尾；**显示**侧按 trim 判"填没填"（与 `mergeSiteSettings` 同口径，`sync_update.test.mjs:837-861`）。

## 12. 不做范围

统计卡的 `SPECIMENS/CITATIONS/RANGE/SINCE` 及其副标（`App.tsx:775-798`）、全部 eyebrow（首页 1 处 + 详情页 7 处）、`A LIVING SPECIMEN`(`1534`)、`CABINET NO. 01`(`715`)、标题覆盖字段（D9）、段落增删（`HomeSectionId` 仍是闭集四段）、富文本/HTML 存储。
留的入口：`section_copy_json` 是 keyed map ⇒ **加新槽位零迁移**，后续想纳入空状态文案（`App.tsx:1565` 附近）或导航外链标题，只加 key + 一格输入。

## 13. 闸门用例（新 `frontend/test/section_copy.test.mjs`）

`navLabel` 四处同源 / 空白=未填 / 缺 id 落 `DEFAULT_NAV_ITEMS` 兜底 / `effectiveSettings` 过滤后仍能取到 / `en===zh` 不渲染 `<em>` / 并排式只回退本语言默认（D14） / 单显式跨语言回退 / 槽位超 160 点名 / 整串逼近 5000 点名 / `mergeSiteSettings` 不把 `BUILT_IN_SECTION_SLOTS` 合进 `sectionCopy` / 序号随 `orderHomeSections` 结果派生。

## 14. 证据缺口（放行后第一步就补）

1. 远程生产库那行未查（只测了本地 `.wrangler` D1）——§10.1 的第一条动作。
2. 未实跑 test/typecheck/dev，本版全部是读代码结论。
3. 新增 `<p class="section-desc">` 在 `align-items:flex-end` 容器里的真实排版未经浏览器验证。
4. Phase 4 搬走 `homeStatsVisible` 后，「展示偏好」剩两个开关，分组文案未定。

## 15. 执行记录（2026-10-10，Phase 1–3）

**落地范围**：迁移 0014、types、`defaultSiteSettings`（含 `'Catalogue'` 双份字面量的消除）、
`utils/sectionCopy.ts`、worker 的 `SITE_SETTINGS_JSON_COLUMNS` 一行、App.tsx 的四处同源与五个槽位接线、
`index.css` 两处、管理端「栏目与页面文案」卡与前端闸门、新闸门 22 例接进 `pnpm test`、`DEPLOYMENT_GUIDE` 五处。
**当时未做**：Phase 4 —— 当天随后落地，第一版拆得过细又改回一页（见 §7 顶部与 §17）。

**验证结果**：12 个闸门全绿（**当时的数量**，现为 14 条、见 §18；`sync_update` case 18 的三份清单双向对齐在新列下仍过）、两个 typecheck 过、build 过；
本地 Worker 实测：改名后顶栏/页脚章节列/栏目标题三处同时变、描述行填了才出现、
`detail.anatomy` 只填英文时中文侧仍是内置「标本特征」（D14）、超限那格标红且**一个请求都没发**、
PUT body 实测只有 `{"sectionCopy":{"home.catalogue":{"en":"","zh":"…"}}}`（未填的 `en` 仍是空串＝默认没被烤进库）、
服务端超长回 `400 「sectionCopy」有 5232 字符，超过 5000 字符上限` 且**拒绝后原值未改写**。测毕已把本地库复原。

**对本文的四处事实修正**：

1. **§14.1 的探针证伪了 D6 的前提**：远程现网 `nav_items_json` 的 `catalogue.labelEn` **已经是 `Statistics`**
   （他早就在后台改过——这正是他这次抱怨的起因，不是待办），序列化 268 字符，预算余量结论不变。
   同时读到线上四个标签都是**短词**：`Cabinet/陈列`、`Statistics/统计`、`Index/目录`、`About/关于`，
   且线上顺序是 cabinet → catalogue → **index → curator**（与内置默认相反）。
   ⇒ 接线上线后，他的栏目标题会变成 `Statistics / 统计`、`Index / 目录`；要长标题就在后台把导航名称本身写全。
2. **一处本文没预见的真实缺陷**：`.section-heading > div` 按内容取宽，会被最长的单个词顶死
   （实测 631px 视口下整列只有 140px 宽），描述行会挤成一条竖条。已加
   `.section-heading > div { flex: 1 1 auto; min-width: 0 }`，量测后左列 460、描述受 420 上限、`.as-of` 仍在右岸。
3. **`detail.preview` 槽位的渲染路径在这台机器上不可观测**：本地种子标本都没有相册，
   `PreviewGallery` 在相册为空时自己返回 null。不往种子行写测试值，所以这一处只有闸门测覆盖
   （内置默认与原句逐字相同），**没有实机看到过它**。
4. **本文 §14.3 的排版风险是真的**（见第 2 条），且**桌面宽度未量测**：内嵌浏览器无可视表面，截图不可用，
   所有版式结论来自 Range/getBoundingClientRect 量测，不是像素核对。

**两条环境事实（下次别再踩）**：本机 curl 走 Schannel，对任何域名都失败，"站点不可达"要用 node fetch 复核；
`wrangler dev` 优先读 `.dev.vars`，用同名环境变量**覆盖不了**管理员密钥——要无密钥泄露地验管理端 UI，
就用隔离的 `-c` 配置目录 + 一次性密钥（顺带得到独立的本地 D1 state，完全不碰他的本地库）。

## 16. 全量审查（Phase 1–4 之后）的修复记录

四条互斥只读审计线 + 我自己逐条回码复验。审计结论里**每一条都回代码核过**才动手；
其中"文档与测试"那条线实际只复述了任务、没做验证，那部分由我自己重跑（结论见第 9、10 条）。

| # | 发现的问题 | 证据 | 处置 |
|---|---|---|---|
| 1 | `sectionHeading` 用的是**同语言内置默认**回退，而 `navLabel` 是**跨语言**回退——标签只填一种语言时，导航显示那串、标题被内置默认顶住，"改导航名不跟"这类 bug 在一边留空时复活 | `utils/sectionCopy.ts` 旧 50–53 行 vs 26–30 行 | 改成标题直接调 `navLabel(item, lang)`，内置默认只在**整项缺失**时由 `findNavItem` 兜底；补闸门用例 |
| 2 | `<em>` 前的空格被我塞进了 em 内部，而 `.section-heading h2 em` 是 `.38em` 且 `nowrap` → 间距缩到约 0.38 倍，且副标与标题粘成不可断行 | 旧形 `Catalogue{" "}<em>/ …</em>`（`37ae25e:806`）vs 新形 | 5 处统一改成 `{X.en}{" "}` + `<em>/ …</em>`，与改造前逐字同形 |
| 3 | 三条管理端提示仍指旧序号：「05 项目管理」（现 09）×2、「07 站点设置」（现 11）；另有一条把 GitHub 地址说成在「站点设置」（实际在 05） | `App.tsx:2084 / 4169 / 2157 / 4365` | 全部改指现视图；**我上一轮 commit 信息说"retargeted four hints"是过度声明，漏了这三条** |
| 4 | `min-width: 0` 拿掉了左列的内容下限，长标题会反过来挤压 `.as-of`（原来靠内容撑出不可能被压） | 审计线 3 第 4 条 | 加 `.section-heading .as-of { flex: 0 0 auto; white-space: nowrap }` |
| 5 | Worker 把 `sectionCopy` 空列回吐成 `[]`，而它形状是对象表；我原来的注释说"因为 workerd 不能导出标量所以不改这里"——**理由不成立**（内联 `{}` 不是导出） | `worker/index.ts:2317` 与其上方注释 | 按字段给兜底形状（`navItems→null`、`sectionCopy→{}`、其余 `→[]`），注释重写 |
| 6 | 管理端写侧 `...siteContent.sectionCopy?.[key]`：库里被手改成字符串时会把 `"文本"` 摊成 `{"0":"文"}` 再写回库 | `App.tsx patchSectionSlot` | 写侧只认字符串值；读侧新增 `plainSlot` 统一挡非对象形状 + 闸门用例 |
| 7 | 前端整串上限的报错说"保存会被服务端拒绝"，其实是**前端自己拦下、请求都不发**；且没任何测试钉住"前端上限 < 服务端上限" | `utils/sectionCopy.ts` 话术 | 话术改成"已拦下，未发送；服务端上限是 5000"；新增闸门从 Worker 真实拒绝话术里反推阈值并断言大小关系（临时抬高到 6000 验证过它真的会红） |
| 8 | `SpecimenIndex` 接了 `sectionIndex` 却从不使用，注释还写"序号随渲染位置走"（它的 eyebrow 是条目数） | `App.tsx:979/986/6417` | 删掉这个死参数与假注释，把"eyebrow 用条目数是刻意的"写清 |
| 9 | 「搜索与分享」卡有两个输入框却**没有自己的保存按钮**（要按别的卡的按钮才能存）——Phase 4 之前就存在，我的"每栏保存入口一致"的说法因此站不住 | `App.tsx:4741–4775` | 补一个「保存搜索与分享设置」按钮（仍调同一个 `saveSettings`，写路径不变） |
| 10 | 三份方案文档共 109 处 `文件:行号` 引用，Phase 4 后整体位移 | grep 计数 41/35/33；`DEPLOYMENT_GUIDE` 为 0 处 | 三份都挂"行号是快照，按符号名定位"的横幅；指南不受影响。CI 侧核实：`pnpm test` 链上 12 条闸门 = `test/` 下 12 个文件，指南"十二个闸门"的说法准确（**当时的数量**；§18 加了两条闸门后指南已改口径） |

**审查里发现但刻意没动的两处**（都先于本轮存在，改它们要挪字段、属另一轮决定）：
`contactEmail` 在「03 首页栏目」的关于与联系卡与「08 站点设置 · 站点信息」各有一个编辑口；
`seoTitle` / `seoDescription` 在「站点信息」与「搜索与分享」两张卡里重复。
两处写的都是同一个键，不会分叉，但**同一字段两个入口**与他"别放与既有控制重复的控件"的偏好相抵——留作下一轮清理项。

## 17. 侧栏拆得太细，当天按否决改回（Phase 4 的修正）

我把"按页面分栏"落成了 `03 首页·陈列 / 04 首页·统计 / 05 首页·手记 / 06 首页·目录` 四条侧栏项，他当场否掉：
**"侧边栏为什么要分成四个首页导航栏，缺少产品设计，应该归为一个导航栏统一到一个页面里，本身内容并不多，
详情页导航栏名称也设计不行需要优化"**。误读的点：他要的"分栏"是**页面内分区**，我把"栏"理解成了侧栏条目。

改完的形态：

- 侧栏 11 条 → **8 条**：`01 馆藏总览 / 02 标头与导航 / 03 首页栏目 / 04 详情页文案 / 05 底部栏文案 / 06 项目管理 / 07 GitHub 同步 / 08 站点设置`。
  「全局 · 标头与导航」的"全局 · "前缀一并去掉（只剩一条全局项时它是噪声）。
- **「03 首页栏目」一页装 7 张卡**，顺序即访客顺序：HERO → 统计指标 → 活跃度年鉴 → 统计段描述 → 关于与联系 → 手记正文 → 目录段描述。
- 「详情页」→ **「详情页文案」**，与既有的「底部栏文案」同构（都不是新造词）。
- 合并后整页**只留一个保存按钮**：四块各自的页级按钮 + 卡内"保存馆藏指标设置""保存活跃度设置""保存栏目文案"合计七个，
  全都调同一个 `saveSettings`、提交的都是整份改动集。留着它们等于用标签暗示一个不存在的作用域——
  点"只存指标"会把手记的改动一起写进库。其余页面（02/04/05/08）的"页级 + 卡级"双按钮这次没动，记为一致性清理项。

顺带在这轮改掉：**JSX 文本里写 markdown 星号**（`**空白**`、`**详情页 hero 的那张大图**`、`**直接复制浏览器地址栏**` 三处）
——JSX 不解析 markdown，管理员看到的就是字面星号，改成 `<strong>`；
`hint="正文按 Markdown 渲染：…**粗体**…"` 那处**保留**（它是在示例 markdown 语法，不是强调）。
这类"渲染出来的字面量"和 §16 第 3 条的旧序号是同一族问题：管理端说的和做的不一致。

验证：`tsc` 两个工程都过、12 条闸门全绿（当时数量）、build 过；`<section>` 开闭 40/40 配平；
与合并前做行多重集差，消失的 131 行全部是"四个页头 + 七个按钮 + 四条旧 eyebrow"这类预期删除，
`settings-card` 计数 30→30、各字段绑定计数逐项相等（`heroZh` 4、`customActivityLog` 9、`curatorField` 3、
`aboutZh` 3、`contactEmail` 8、`homeStatsVisible` 6、`sectionCopy` 18）⇒ 合并没吞任何一张卡。
登录隔离实例走一遍 8 条侧栏：首页页 7 卡 1 按钮、语言页签在、详情页文案标题正确、站点设置仍 5 卡。
过程中我自己犯的错也记一条：删按钮的脚本算了起始行却没用它，留下三处 `<button type="button"` 残头，
`tsc` 的 `TS1003` 抓到后定点清掉（又一次印证"结构改动要靠编译器与计数，不靠眼看"）。

## 18. 产品审查后的"全部修复"（A–F 六组）与开源闸门 D 的落地

> **本节到 §23 提到的提交 hash 都是当时的临时提交**：这一整段（连同 §17 之后的所有改动）在 2026-10-11
> 被**压成了一个提交**，旧 hash 只存在于本机的 `backup/pre-squash-2026-10-11` 分支上。
> 记流程时可以照旧引用它们，但不要再拿它们去 `git show`。

他给完清单后的指令是一句**「全部修复」**，所以这轮不再挑软硬，按六组一次做完：
A 公开侧诚实性与排序索引、B 保存安全（过期基线不再静默回写）、C 三个转化事件接上、
D 开源闸门（README／去个人化）、E 规模化（序号补零、螺旋段高度按件数、目录加文本筛选）、F 可及性（accent 对比、抽屉焦点环）。
A/B/C/E/F 的判据已写在各组提交与 §16–§17 的延长线上，本节只记 D 里两处**不显然**的东西。

**D1 README**：根目录 `README.md` 只讲"三分钟跑起来 + 后台能改什么 + 检查项 + 上线顺序"，
部署与安全仍归 `DEPLOYMENT_GUIDE.md`。里面的每条命令都实测过：
`bash scripts/d1-migrate.sh local` 在全新本地库上会自动建库（用一份只含 D1 绑定的临时 config 验过：
`wrangler d1 execute <绑定名> --local` 对不存在的本地库会直接建，`d1 create` **没有** `--local` 这一档）；
脚本里调的是裸 `wrangler`，`npx` 前缀对脚本内部不生效；仓库只有 `frontend/pnpm-lock.yaml`，
所以手册第四节里原先的 `npm run build` 与"十一个闸门"两处口径一起纠正（CI 用 pnpm，`npm ci` 直接 ENOLOCK）。

**D2 去个人化**——把"换了人就坏"的字面量换成推导，规则收成一句：
**个人字样只允许存在于演示文案本体（`defaultSiteSettings.ts` 与 `.figma/make/site.json`），
其余一律从配置或 hostname 取**。

| 原来 | 现在 |
|---|---|
| `isAdminHost()` 里写死 `admin.nestspace.online`；后台退出与 `#admin` 跳转写死两个 origin | 判据抽成 `utils/siteHost.ts`（`admin.X ↔ X`，端口与多层子域都算），App 只把 `window.location` 递进去 |
| `index.html` 里 canonical / og:url 写死生产 origin | 构建产物里只留 `<!-- seo:origin-tags -->`，Worker 按**请求 origin** 注入绝对地址 |
| Worker 缺账号时兜底扫 `AtaraxyEcho` | 400 点名"未指定 GitHub 账号"，先按 `site_settings.github_url` 推导，推不出才拒绝 |
| `useState("AtaraxyEcho")`、两处 `logoSubtext \|\| "AtaraxyEcho"`、三处 `\|\| "ATARAXYECHO"`、两处 `<strong>NestSpace</strong>` | 初值留空（载入后仍按 GitHub 地址回填）、兜底改取 `logoText`、两处站名改取 `logoText` |
| 两处错误话术里的示例 `AtaraxyEcho/NestSpace` | 改中性 `owner/repo` |

顺带修掉一句会说谎的提示：「07 GitHub 同步」写着"账号留空则按 03 的 GitHub 地址自动推导"，
但 `handleScanRepos` 前端就把空值拦下了——去掉那道拦截，空值真的走到服务端推导。

**踩到的坑（值得单独留字）**：canonical 先写成 `href="/"` 想靠相对地址免注入，
`vite build` 当场失败——`vite:build-html` 会把根斜杠当站内资产去读文件，报
`EISDIR: illegal operation on a directory, read`。**"构建过了"不等于"能构建"**：这一条只有在真跑 build 时才暴露，
`pnpm run typecheck` 与 14 条闸门全绿也照样带病。于是改成标记注入，并把标记名做成**跨文件钉子**
（Worker 里的常量与 index.html 里的标记必须互相能找到），改名漏改一边就红。
副作用是首页正文从此**无条件**被改写，所以条件请求头必须一并摘掉（`hasOverrides` 那条分支删掉，闸门钉住它不再回来）。

**两处可见后果**（如实记下，不是零视觉变化）：首页 ambient-mark 与登录卡的站名从此跟 `logo_text`，
库里那一份是 `NESTSPACE`，所以写法由 `NestSpace` 变成全大写；实测宽度 153px（旧 111px），
容器 220px 且 ≤1270px 时整块隐藏，不破版。卡片脚注 `Collected by NestSpace` **刻意不动**——
它在手写体里，换成大写就成了喊话；要让它可配置得新开一个文案槽位，那是另一个请求。

**新增两条闸门**（`pnpm test` 12 → 14 条）：
`site_host.test.mjs`（admin.X ↔ X 的拼接 / 端口 / 多层子域 / 大小写 / 裸 `admin.` 返回空，
外加"出货源码不含写死的域名与账号"（大小写不敏感）与 canonical 注入的形状钉子）；
`test_chain.test.mjs`（注册链与 `test/` 目录一一对应、CI 只调 `pnpm test`）——
本轮加第二个文件时才看清：`pnpm test` 是手写 `&&` 链，**漏登记的闸门会在 CI 里静默不跑且不报错**，
比测试失败更糟。

验证：`tsc` 两个工程过、14 条闸门全绿、`build` 过；8898 隔离实例（`--persist-to` 独立状态目录）实测
`GET /` 返回按 origin 拼出的 canonical/og:url 且标记已消失、带陈旧 `If-None-Match` 仍 200 且响应不再带 ETag、
无 token → 403、有 token 无账号 → 400 点名、库里填 `github.com/octocat` 后同样请求 → 200 且 `username: "octocat"`；
浏览器读回首页 ambient-mark 与登录卡站名均为 `NESTSPACE`、页脚 `{name}` 仍是 `ATARAXYECHO`（`logo_subtext` 非空，行为未变）。
探针实例与临时状态目录已收干净（workerd 子进程按端口和命令行找齐再杀，父进程死了它会占着状态目录导致删不掉）。

## 19. 全量审查后的修复（K 组代码 / D 组文档，同日第二轮）

他看完 §18 后让我再做一次"是否无误、设计是否合理"，并按四路互斥只读审查（去个人化与 SEO 注入 / App 行为六组 / 文档一致性 / 数据契约）
的结果逐条回码复核，然后说**「修复所有问题」**。审查本身没有阻断项，改的是下面这些。

**我本轮自己引入的真错（三条）**：

- **埋点把详情页也算成首页**：`trackPageView(route === "admin" ? "admin" : "home")` 是按排除法写的，
  `project/*` 命中"不是 admin"于是也记了一次 `home`，而 `ProjectRoute` 另记 `detail`
  ⇒ 每进一次详情，home 被多记一次。改成只认 `home` / `admin` 两种。浏览器里实测：进详情只出现
  `pageview/detail`，回首页才是 `pageview/home`。
- **放大层翻页会把焦点甩出浮层**：`zoom` 的 effect 依赖 `[zoom, albumKey]`，"关闭后还焦点"写在它的清理里，
  于是 0→1 的翻页也会跑清理 ⇒ 每按一次 ←/→ 焦点就跳回遮罩外的"放大"按钮，焦点环断掉。
  拆出一条只在 `zoom === null` 时跑的 effect（沿用抽屉那句 `document.contains` 判据）。
  实测：打开后焦点在 `[关闭放大]`，按 → 仍**在浮层内**（计数 02/02），Esc 后回到 `.preview-enlarge`。
- **`deck/plate` 是死事件**：白名单与 `wrangler.toml` 的说明里都有"点侧牌选张"，但 `goTo()` 只在
  `method === "thumb"` 时埋点，`goTo(index, "plate")` 那条路什么都不记 ⇒ 该桶恒为 0。改成两种都记。
  （这条本机测不到：这台的内嵌浏览器视口 0×0，`useNarrowScreen()` 判定为窄屏，侧牌根本不渲染。）

**设计上最脆的一环，这轮加固了**：原来把 **hostname 的形状当角色判据**（`admin.` 前缀 = 管理端），
于是 `admin.com` 这种**公开域名**会被当成控制台（整站只剩登录页），而 `*.workers.dev` / IP 直连上
敲 `#admin` 会跳到**不存在的域名**。现在：

- `isAdminHostname` 要求 `admin.` 后面**本身像站点**（含点、非本地名、非 IP、非 `*.workers.dev|pages.dev`）；
  新增 `isSiteHostname` 与 `hasAdminSibling` 两个判据，末尾根点/大小写/两侧空白先归一化。
- **没有兄弟域的环境不再跳转，改为就地开后台**（判据同一个 `hasAdminSibling`，`routeFromHash` 与跳转 effect 共用）
  ——鉴权靠口令 + Access JWT，不靠"域名长什么样"。闸门里钉住 App 不许退回"只排除 localhost"的老写法。
- `createProject` 补记 `drawerOpenerRef`（只有 `openProject` 记过）⇒ 新建抽屉关闭后焦点能回到"＋ 新建项目"。

**文档与代码对齐**：指南里 canonical/og:url 的"相对 `/`"两处（上午写、下午改实现时漏改）改成"只留
`<!-- seo:origin-tags -->` 标记 + 由 Worker 按 origin 注入"，并把 `href="/"` 会 `EISDIR` 的坑写进去；
两处视图序号（「05 项目管理」→06、「06 GitHub 同步」→07）；管理端入口那段补上"没有兄弟域时就地开后台"；
目录树补 `plans/SECTION_CONFIG_PLAN_001/002/003`。README 三处：01 栏的卡片名（实际是「最近更新」+「馆藏状态」）、
脚本口径（`d1-migrate.sh` 用裸 `wrangler`、`usage-probe.sh` 用 `npx wrangler dev`，原文把两者混为一谈）、
07 栏的预览图（随文档一起提取，不是独立开关）。`usage-probe.sh` 内部 `npm run build` → `pnpm run build`。

**闸门加固**：`site_host` 12→19 条用例（新增 `isSiteHostname` / `hasAdminSibling` / `admin.com` 不被当控制台 /
末尾根点 / App 不许退回 localhost 白名单的源码钉子）。`sync_update` 补 **18f 反向断言**（迁移列 ⊆ 映射）——
此前只有 18b 的单向检查，而指南那句"三份清单双向对齐"比闸门实际覆盖面更大；现在两个方向都钉住，
`id`/`updated_at` 列为代码自维护，不参与映射。

**刻意不改的三条**（连同理由）：

1. 无条件改写首页 HTML ⇒ 文档永不 304：这是"域名只在边缘知道"的必然代价，代码注释里已写明。
2. `formatRepositoryUrl("foo")` 仍会拼出可点死链：既有行为，收紧会连内网主机名一起误伤。
3. `1507010` 的提交正文写成 "passes eight rows"（代码是 `>= 8`）：要改得重写已提交的 commit，不划算，记在这里。

验证：`tsc` 两个工程过、14 条闸门全绿（含新用例）、build 过；浏览器里实测了埋点（进详情只记 detail）、
放大层的焦点（翻页不丢、关闭归还）、新建抽屉的焦点归还（这台 surface 的 rAF 不推进，测这条时把
`requestAnimationFrame` 临时换成 `setTimeout` 才能让那一步跑到——换掉后焦点确实落回"＋ 新建项目"）；
探针用的临时标本 `zz9probe` 已删除（库里回到 4 件），token 文件与 scratch 目录已清，8898 上的 workerd 按端口收干净。

## 20. 第三轮（最终）审查后的修复（A 组代码 / B 组文档）

他说"进行最终审查"并在我给出清单后说**「开始修复所有列出的问题」**。这轮的审查换了视角：不再只看 diff，
而是按四路互斥只读审查拆成 **Worker/安全面、前端交互面、文档与 CI 全面核对、数据与迁移+脚本面**，
我逐条回码复核后再改。清单与证据见本节末尾的对照表。

**代码（A 组）**：

- **A1 管理端 banner 在撒谎**：写的是"所有保存操作已禁用"，但没有任何保存按钮带 `disabled`
  （`settingsLoaded` 只在 `saveSettings` 里做运行时拦截）——正是本项目明令禁止的"说的和做的不一样"。
  改成如实描述："保存会被拒绝：点保存只会提示先重新加载，不会写入任何一列"。
- **A2 旧列被当中文解释，而种子写的是英文**：`asBilingual` 的旧列兜底硬编码 `{en:'', zh:text}`，
  而 `0002` 把英文写进 `challenge`/`solution` ⇒ **全新部署**的中文视图会把英文当"中文文案"显示且不打「原文」标
  （生产的 004/005/006 都有 `challenge_json`，JSON 优先，所以线上没暴露；这是"下一个部署者看到的第一屏"的问题）。
  改成走 `pairFromSingleText` 的语言猜测（与 GitHub 简介同一套），闸门补 3 条用例（英文旧列落 en + 中文视图标「原文」）。
- **A3 首屏主题闪烁**：`data-theme` 只在 effect 里写，冷启动时 JS 还没跑，系统深色的访客先看到一片浅色。
  按推荐方案做了 **②+③**：`index.css` 增一段 `@media (prefers-color-scheme: dark) { :root:not([data-theme]) { …深色… } }`
  （跟随系统时兜底），Worker 在显式设了日/夜时把 `data-theme` 直接注入 `<html>`（那一帧就是对的），
  `App` 的首屏取值 `initialDark()` 反过来优先采信已注入的标记——否则会出现"注入深 → effect 改浅 → 设置再改深"的两次翻转。
  隔离实例实测三条分支：`dark → data-theme="dark"`、`light → data-theme="light"`、`auto →` 不注入。
- **A4 存储被禁时整站白屏**：`useState(() => sessionStorage.getItem(...))` 跑在 render 期、无 try/catch
  （隐私模式/企业策略下读属性即抛 SecurityError）。抽出 `utils/safeStorage.ts`（读/写/清各带 try/catch），
  App 与 `adminClient` 的口令存取全部改走它。
- **A5/A6**：`isSiteHostname` 里 `host === 'localhost'` 是死条件（上一行的"不含点"已拦掉）；删掉
  `.deployment-table`、`.domain-status` 与 `.site-header nav .nav-button`（并列选择器的一半）三处死 CSS。

**文档（B 组）**：指南第七节写"补了**三个**聚合事件"而表里也只有三行（实际 6 个，补上
`pageview`/`specimen_open`/`outbound` 三行）；§三开头"三层防线"紧邻四行表格（补注"末行是叠加的限流"）；
哈希路由示例写成 `/#/project/001`（实际 `#project/001`）；两行逐字重复的条目去重；
目录树补 `markdownLines.ts` 与 `safeStorage.ts`、闸门清单补 `shell_guards`、计数 14→15；
首屏主题的注入行为写进 SEO 那一节。`_headers` 首行注释仍写 "Cloudflare Pages"（现为 Workers）已改。
README 的 01 栏卡片顺序按屏幕顺序改回（「最近更新」在前）。计划 003 里 §15/§16 的"12 条闸门"标成**当时数量**
（现状 14→15 见 §18/§20）。`docs/ARCHITECTURE_PLAN.md` 加顶部横幅：这是**立项规划稿**，
并列四处与现状的偏离（域名 `nestspace.dev`/`/admin*` 路径 → `admin.<主域>`+`#admin`、2 条迁移的直跑命令 →
14 条 + `d1-migrate.sh`、规划目录树里的三个路径不存在、"2000 多行常量"→ App.tsx 已 ~6.5k 行）。
探针标签"要 400 点名第 13 行"改成"服务端点名张数，逐行点名在前端"（服务端确实只回张数）。

**新增闸门 `shell_guards.test.mjs`（15 条）**：深色变量的**两份副本逐项比对**（改一处忘另一处就红）、
每个深色变量在浅色里都有定义、`@media` 兜底必须带 `:not([data-theme])`、
Worker"只在显式 dark/light 时注入"与 `App` 首屏取值同源（源码钉子）、
以及把 `sessionStorage` 换成"一读就抛"的对象后 `readSession` 返回空串、写/清不抛错。

**刻意没改的三条**（与前几轮一致）：无条件改写首页 HTML ⇒ 文档永不 304；`formatRepositoryUrl("foo")` 仍会拼出可点死链
（收紧会误伤内网主机名）；`1507010` 的提交正文里 "passes eight rows" 与代码 `>= 8` 的措辞差（要改得重写已提交历史）。

**这轮我自己犯的错，如实记一条**：我用 Edit 删掉一个"多余空行"时只改了注释行、把行尾换行一起吞了，
于是下面那行 `import { PREVIEW_IMAGE_LIMIT, … }` 被并进注释里 ⇒ `tsc` 报 `TS2304`。**教训：Edit 的 new_string 少一个换行就是语法错误**，
`tsc` 这一层必须跑（这次的代价只是两分钟）。

验证：`tsc` 两个工程过、**15 条闸门全绿**、`build` 过（产物 CSS 里确有 `prefers-color-scheme` 段）；
隔离实例实测主题注入三条分支；临时 D1 状态目录、日志与探针脚本已清，8898 上的 workerd 按端口收干净。

## 21. 发布前审查（第四轮）后的修复：R1–R3 + H1 + S1 + S2 + F1 + F3

他说"对项目进行最终审查"，我这轮换了视角：不看 diff，而按**"现在推上去会不会炸"**组织四路只读审查
（部署路径与远程数据兼容 / 从未审过的文件 / 公开站质量面 / 上一提交的自我复核）。
结论是没有阻断项，`push` 会先 build 再 deploy、不存在"新 Worker 配旧资产"的窗口，唯一硬前提仍是先跑 `0014` 的远程迁移。
他随后点名修下面七条。

- **R1 指南自相矛盾**：迁移风险表把 site_settings / 项目的**写路径**缺列一律写成"报 500"，
  而 `1507010` 早已把它翻成 400 并点名该列（0005/0006/0009/0011/0013/0014 六行 + 0008 的 PUT 说法）。
  逐行改正，并在表前补一句总规则："**写路径 400 点名、读路径仍是 500**"。同一段"反序表现"里那句
  "管理端保存项目直接 500" 一并改成"被拒（400 点名该列）"。
- **R2 `_headers` 注释仍写着 Pages**（我上一轮 commit 只改了第 1 行、第 30 行漏了，如实记）：改成 Workers 口径，
  并写明首页不设长缓存的**真正原因**——Worker 每次改写正文都会摘掉 ETag（头与正文必须同源）。
- **R3 点名拒绝的承诺不一致**：`writeColumnErrorResponse` 原先只接在 PUT 两处，**新建项目（POST）与逐仓库导入**
  仍是裸 500（"Create failed"）；同步的逐行 catch 更糟——它把缺列错误说成"这一行请求失败（GitHub 或网络异常）"，
  暗示重试就好。三处都接上/改成遇缺列即整单 400 点名。
- **H1 详情页把"我们坏了"说成"这件标本不存在"**：`fetchPublicProjectById` 过去把 404、5xx、断网**全都吞成 null**，
  于是断网时访客看到"未找到标本 SPEC—001"。现在只有 404 返回 null，其余抛出；`ProjectRoute` 多一个 `error` 态
  （`role="alert"` + 重试 + 返回馆藏），重试按钮把 `attempt` 加一、effect 依赖它所以真的会再拉。
  隔离实例实测两条分支：断网桩 → "暂时取不到标本"；恢复网络点重试 → 真的 404 → "未找到标本"。
- **S1 首页地标**：外层是 `<main>`，把站点 `<header>`/`<footer>` 包在里面 ⇒ banner/contentinfo 不成立。
  改为外层 `<div>` + 只包四段正文的 `<main>`（脚本重排 + 缩进，`tsc` 过）。实测：`main` 里只剩四个 `section`，
  `header.site-header` 与 `.site-footer` 都在它外面，全页仍只有一个 `main`。
- **S2 首页没有 h1**（10 个 h1 全在详情页与管理端）：ambient-mark 里那个站点名由 `<strong>` 改成 `<h1 class="ambient-title">`，
  CSS 里四处 `.ambient-mark strong` 同步改名（值一字未动，无裸 `h1` 全局规则，所以是零视觉变化）。实测首页 h1 = 1 个。
- **F1 `frontend/AGENTS.md` 在误导协作者**：它写着"Vite dev server 已在 `$PORT` 跑着、不用自己起"，
  而本仓库的 `/api` 只有 Worker 提供。文件顶部加了指向 README 的说明（这条是 Figma Make 环境的情况）。
- **F3 markdown 的超长行会把页面冻住**：行内正则与去标签正则对"一长串没有闭合符的 `[` / `<`"是平方级扫描，
  实测 20 万字符一行里 35.5 秒（同步渲染）。上限与判据放进可测的 `markdownLines.ts`
  （`MD_TEXT_PARSE_MAX = 12000` + `exceedsInlineParseLimit`），两处解析前先过守卫、超长按纯文本原样呈现；
  `markdown` 闸门补 5 条用例（边界 + 两个调用点的源码钉子）。

**没有改的**（等他拍的那批原样留着）：手机端无折叠菜单（S3）、触摸目标偏小（S4）、`100vh` 无 `dvh`（S5）、
详情封面破图无占位（S6）、单包 107KB gzip 未拆管理端（P1）、字体 `@import` 与 `<link>` 并存（P2）、
`og:image`/`twitter:*` 缺失（P3）、`alt="预览"` 写死中文（P4）、fallback 与种子双语不一致（F2）、
`.figma/make/deploy*` 与品牌脚本的半成品风险（F5）。

**顺带发现并记一笔**（未改）：列表已载入时详情请求失败会继续用**列表投影**渲染（没有 README/Compose 的"空文档"），
这是既有行为、不是这轮引入；要不要在这种情形下也提示"文档暂时取不到（重试）"是另一个决定。

验证：`tsc` 两个工程过、15 条闸门全绿、`build` 过；浏览器里实测 S1/S2 的 DOM 结构、H1 的两条分支；
探针 dev 已收（8898 无残留）。

## 22. "全面修复"：安全纵深、数据一致性与公开站质量项（第四轮清单的剩余部分）

我上一条消息把四轮审查的遗留项分了类（S1 安全纵深 / P1–P4 / S1–S6 移动端与触摸 / F2 / F5），他回「进行全面修复」。
这轮把**能安全做的都做了**，两条明确不做的写在末尾。

**安全与健壮性**

- **S1 防跨站写入的纵深**：管理端写操作现在要求 `Content-Type: application/json`，否则 `415`。
  起因：控制台在"已被 Access 放行、没输过口令"时走**纯 Cookie 认证**，而跨站页面能发出的 `text/plain`
  请求属于 CORS 免预检类型，会带上 `CF_Authorization`；要求 JSON 之后跨站表单发不出这个类型。
  这条是否必需取决于 `CF_Authorization` 的 `SameSite`（代码里看不到、CF 文档也没列），所以一直开着。
  闸门 case 23 是**真跑**的：把 Worker 当 Hono app 请求（DB 桩只回 `changes=0`）——`text/plain` → 415、
  `application/json` → 404（放行到处理器），并钉住客户端一直带这个头。
- **设置读侧的类型加固**：`mergeSiteSettings` 以前有 `else { target[key] = value }`，D1/SQLite 是动态类型，
  列里被写成数字（手工改库、老写入方）时 `statsSinceYear` 会原样变成 number ⇒ 下游 `.trim()` 抛 TypeError
  **整站白屏**。现在非字符串一律不采纳、回退内置默认；`section_copy` 闸门补 1 条用例（26 条）。

**数据一致性**

- **F2 种子与内置回退是两套内容**（新迁移 `0015_fill_seed_narrative.sql`，纯数据）：0002 把挑战/方案写进
  **旧单列**（英文），0011 之后读侧优先 JSON 列，于是全新部署的中文视图只能回退英文并标「原文」，
  而 `fallbackProjects.ts` 里同一批标本是成对双语的 —— 同一件标本两套内容，取决于接口通不通。
  0015 把成对文案补进 JSON 列，两条自我约束：**只在列为空时填**（库值优先）、**只认种子行**
  （`repository LIKE 'github.com/nestspace/%'`）。文案由脚本从 `fallbackProjects.ts` 生成，不手抄。
  本地已执行（002–004 补上）。**本地 001 的两列还存着"英文写在 zh 槽"的旧值**（非空所以迁移按设计跳过），
  这是那份数据的老毛病、不是迁移该管的，我用一次性 `--local` UPDATE 把它修成正确的双语对（保留英文原文，不删内容）。
  远端不受影响：那几个 id 上是真实项目（且迁移只填空白）。

**公开站质量（零或近零视觉变化）**

- **P2 字体**：四个字族从 `index.css` 的 `@import` 挪进 `index.html` 的 `<link>`（此前 JetBrains Mono 两处声明、
  且 `@import` 要等样式表下载完才发请求）。浏览器实测四族都加载；构建产物 CSS 里已无 `fonts.googleapis`。
- **P4 图片文案**：详情封面 `alt` 随语言（原来英文界面也是「预览」）；标头 logo 在"图文模式"下改成
  `alt=""`（下面就是同一段文字，它是装饰图），只有"仅图片"模式才靠 alt 读站名。
- **S6 封面破图**：`onError` 后退回"没有封面"那套版式（原来的表现是浏览器默认裂图图标）。
  实测：临时建了一件封面指到不存在文件的标本 → `.plate-cover` 消失、`has-cover` 摘掉、`SpecimenSvg` 顶上；随后删掉该标本。
- **S4 触摸目标**：放大层那一排 32×32 的按钮加了一层不可见的 `::after`（`inset:-6px`）把命中区扩到 44×44，
  视觉仍是 32×32、同排 gap 恰好不重叠。**侧栏（标本轨道）那组没动**：它在螺旋段里、旁边还有拖拽手势，
  扩大命中区有抢拖拽的风险，等真机上试过再说。
- **S5 移动端视口**：`spiral-scroll`/`spiral-sticky`/`.section`/`.detail-page` 在 `@supports (height: 100dvh)` 里
  换成 `dvh`（旧浏览器整块跳过）。**刻意不含 `.detail-hero`**：它在 ≤760 被改成 `min-height:auto`，
  放进这个块（位置在媒体查询之后）会把它顶回去。
- **L3-14**：目录里的标本名加 `overflow-wrap: anywhere` + `min-width: 0`，超长单词不再被裁掉还看不到滚动条。
- **P1 的部分**：`vite.config.ts` 用 rolldown 认的**函数形式** `manualChunks` 把 React 单独成 chunk
  （对象形式在 Vite 8 直接报错）。效果：回访访客只需重下应用那份（**49KB gzip**），框架那 60KB 留在缓存里。
  管理端整套仍与前台同包——要拆必须把它整体移出 `App.tsx`，那是结构重构，另开一轮。

**F5 脚手架**：`.figma/make/deploy` 与 `deploy-preview` 顶部加了说明，指明本仓库真实部署走 Cloudflare
（原来只有一句 `figma make deploy`，容易让人以为那是发版方式）。

**刻意不做的两条**：① 手机端顶栏在 ≤760 隐藏导航这件事没改——补一个折叠菜单是**新功能与视觉决定**，
页脚已有一份章节清单可达；② 缺 `og:image` 不补——现有品牌图不是 1200×630 的分享卡，
硬塞一张尺寸不对的图属于替他做设计决定（指南里已写明怎么加）。

验证：两套 `tsc`、15 条闸门（含新 case 23）、`build` 全绿；浏览器实测字体四族加载、破图回退、构建产物里
无 `@import`、`dvh` 与命中区规则都在；临时标本与 scratch 目录已清、8898 无残留。

## 23. "修复所有安全问题"：三条按 IP 限流 + 无 Access 环境的口令单层警示

上一轮我把"安全侧仍开着"的四条摊开后，他说「修复所有安全问题」。可修的落成下面两件事，
不可修的（边缘语义与跨机房）如实标出来，不假装修了。

- **三个公开端点补上按 IP 限流**（`worker/index.ts` 新增可测的 `createRateLimiter`）：
  `/api/projects` 与 `/api/site-settings` 共用 240/分钟（429 + `Retry-After: 60`）、
  `/api/img` 300/分钟（图片一页十来张，给得更宽；429 的表现就是那张图裂掉，客户端本来就有 `imgfail` 兜着）、
  `/api/usage` 沿用 120/分钟（超出静默 204，不打扰访客）——顺手把它原有的桶逻辑抽成同一个工厂，
  不再有两份 `Map` 计数。阈值都留了十倍以上余量：一次页面浏览是 2 条读请求，24 小时里正常访客碰不到。
  **共同前提写进指南了**：计数只活在当前 isolate，Cloudflare 会散请求到很多 isolate 与机房，
  它挡的是"同一来源的脚本化连打"，分布式压力只能靠边缘的速率限制规则（第三节第 3 条）——
  那条也顺手改成诚实口径："免费版是否包含这条规则各账号/时期不一致，控制台看得到就配，看不到不必为此升级套餐"。
  验证：`preview_rules` 闸门补 3 条用例（边界 / 窗口重置 / 容量满只清过期桶不清全表 + 三个端点接线的源码钉子），
  另在隔离实例上真打：读接口 500 连打 → 234×200 + 266×429；图片端点 400 连打 → **恰好 300×400 + 100×429**，
  429 带 `Retry-After: 60`；正常单发四个端点全 200。顺带确认 `AbortSignal.timeout` 在图片代理上游也在（`worker/index.ts:311`）。
- **登录页警示"只剩口令一层"**：在没有 `admin.` 兄弟域的环境（本地 / IP 直连 / `*.workers.dev` 预览域）
  就地开后台时，登录卡上多一条 `role="note"` 的警示——页眉那句「EDGE PROTECTED / CLOUDFLARE ZERO TRUST」
  在那些环境里是空话，必须当面说清。判据复用 `siteHost.ts` 的 `isAdminHost()`/`hasAdminSibling()`：
  管理端子域上不会显示（那里的 Access 是真的在场）。浏览器实测（127.0.0.1）：警示出现、`role=note`、
  内嵌 `<code>admin.</code>`、配色走警示色。
- **不可修、只如实标注的两条**：① 鉴权失败限流与新增的三条一样是 isolate 内存态，跨机房不共享——
  要做到全局限流得引入 KV/DO 或依赖边缘规则，指南里已经给出边缘规则的做法；② `CF_Authorization` 与
  `CF_Binding` 的 `SameSite` 由边缘下发（CF 文档：两者都是 `None`，后者在网络层被剥掉），
  代码层看不到也改不了——这正是写操作强制 JSON 的理由，两层互补。

验证：两套 `tsc`、15 条闸门（`preview_rules` 17→20 条）、`build` 全绿；dev 起得来（新增的是**函数**导出，
不触发"标量导出打死 workerd"那条）；hammer 与浏览器两条实测如上；探针 dev 已收、8898 无残留。

**补（同日，第六轮审查时发现）**：`/api/projects/:id`（详情）一开始漏接了限流——它和列表是同一类便宜读接口，
等于给脚本留了个不设防的口。现在三条读接口（列表 / 详情 / 站点文案）共用同一个 240/分钟 的桶，
闸门从"至少一处"改成"至少三处"并写明理由；指南也点明桶覆盖哪几条路径。
隔离实例实测：详情 300 连打 → 236×200 + 64×429（前 4 个 token 是浏览器浏览用掉的），且同桶的列表接口**同时**被限。

## 24. 线上截图反馈的两处版面缺陷（卡片内容溢出 / 简介不换行）

他贴了一张生产首页截图：`SPEC—005 / OmniNest` 那张卡片的**内容压到了卡片下边框上**（按钮几乎贴着 40px 页脚行）；
另一处是**详情页的项目简介不换行**。两处都在"我改过的那些文件之外"，属于此前几轮审查没覆盖的版面问题。

- **卡片内容溢出**：`.specimen-card` 是固定高度的 grid（`52px 1fr 40px`），而 `1fr` 的**自动下限**是 `auto`——
  右列内容一旦比正文行高，行就被顶大，40px 的页脚（手写署名 + 协议）整行被挤出卡框。算下来各档都差一点：
  基础档（卡 540）内容约 473px 对正文 448px、2K 档（卡 638）约 552 对 532、4K 档（卡 780）约 697 对 654
  ——**旧注释里"实测 4K 档溢出 43px"就是同一个坑**，当时只给简介加了行数裁剪，没动行的下限。
  修法三层：① 行改成 `minmax(0, 1fr)`（行不再被内容顶大）；② 右列改 flex 列、**简介是唯一能收缩的那一项**
  （真放不下时先缩简介，按钮永远留在卡内——这是"内容挤走 CTA"那一族问题的通解）；③ 基础/2K/4K 三档的
  非内容间距各收紧约 20px，把上面量出的差值补掉。移动端两档（≤760/≤1100）也跟着拿到了①的结构保证。
- **简介不换行**：简介是 `<textarea>` 录入的（管理员按回车就是分段意图），而详情页把它当普通 `<p>` 文本渲染，
  HTML 把换行整个折叠掉了。`.detail-intro` 加 `white-space: pre-line`——单行简介的渲染与改动前逐字一致。

**这两条只能"算术 + 源码钉"，不能实测**：本机内嵌浏览器的视口是 0×0，`vh` 恒为 0、rect 全为 0，
测不出真实版面（`shell_guards` 因此只钉结构判据：`minmax(0,1fr)`、flex 列 + 可收缩简介、`pre-line`）。
验证靠的是：算出的三档差值 → 收紧量；隔离实例上建了一件带四段中文简介的临时标本，
实测 `.project-copy` 是 flex 列、`.description` 是 `flex: 0 1 auto`、`.detail-intro` 的 `white-space` 为 `pre-line`
且文本节点里确实有 4 个换行；随后删掉该标本（库里回到 4 件）。
