# 栏目与页面文案可配置 · 最终方案 003
> ⚠️ **行号是快照**：本文的 `App.tsx:NNNN` 一类引用是写作当时抓的位置，Phase 4 的 `refactor(admin)` 之后已整体位移（`App.tsx` 增删约 300 行）。定位请搜符号名／字符串，不要照着行号跳。

> 状态：**Phase 1–4 全部落地并本地实测通过**（2026-10-10，`feat(copy)` + `refactor(admin)`）。
> **唯一未完成**：迁移 0014 只跑在本地，**远程未执行**——push 前必须先 `bash scripts/d1-migrate.sh remote`。
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

> **已执行（2026-10-10）**，落地就是下表。三处与本文不同的地方记在这里：
> ① 序号不再逐处手写，改成 `ADMIN_NAV` + `adminNavNo(key)` 一处维护（本文只说"清掉错位"，没规定怎么做）；
> ② 中 / EN 语言页签抽成 `ContentLanguageTabs`——Hero、手记、详情页三栏都要它，以前那段 JSX 只有一份；
> ③ 「关于与联系」卡（about + GitHub + 邮箱）随手记放 05，并把它的 eyebrow 从 `CURATOR / 馆长手记` 改成
>   `ABOUT & CONTACT`（同栏页标题也叫 CURATOR，两个同名会指不清）。
> 另外修掉四处会误导人的跨栏指称：抽屉里"入口在「04 内容管理」"、页脚 hint 里的三个旧视图名、
> 以及本文自己写错的两句提示——**手记段的大标题用的是 headline，并不跟随导航名称**，
> 提示里说"这里就是首页各栏目的大标题"会让他以为改导航名能改掉那句宣言。

| 新侧栏 | 来源（现视图） |
|---|---|
| 01 总览 | 不变 |
| 02 全局 · 标头与导航 | 02 的 HEADER & LOGO + 导航顺序/名称/显示 |
| 03 首页 · 陈列 | 04 的 HERO 卡 |
| 04 首页 · 统计 | 03 整卡（指标/年鉴）+ `home.catalogue` + `homeStatsVisible`（从 07 搬来） |
| 05 首页 · 手记 | 04 的 CURATOR + CURATOR COPY |
| 06 首页 · 目录 | `home.index` |
| 07 详情页 | 04 的 DETAIL / FIELD NOTES + `detail.preview/anatomy/related` |
| 08 页脚 / 09 项目 / 10 同步 / 11 站点设置 | 现 08 / 05 / 06 / 07（去掉 `homeStatsVisible`） |

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
**未做**：Phase 4。

**验证结果**：12 个闸门全绿（`sync_update` case 18 的三份清单双向对齐在新列下仍过）、两个 typecheck 过、build 过；
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
| 10 | 三份方案文档共 109 处 `文件:行号` 引用，Phase 4 后整体位移 | grep 计数 41/35/33；`DEPLOYMENT_GUIDE` 为 0 处 | 三份都挂"行号是快照，按符号名定位"的横幅；指南不受影响。CI 侧核实：`pnpm test` 链上 12 条闸门 = `test/` 下 12 个文件，指南"十二个闸门"的说法准确 |

**审查里发现但刻意没动的两处**（都先于本轮存在，改它们要挪字段、属另一轮决定）：
`contactEmail` 在「05 首页 · 手记」与「11 站点设置 · 站点信息」各有一个编辑口；
`seoTitle` / `seoDescription` 在「站点信息」与「搜索与分享」两张卡里重复。
两处写的都是同一个键，不会分叉，但**同一字段两个入口**与他"别放与既有控制重复的控件"的偏好相抵——留作下一轮清理项。
