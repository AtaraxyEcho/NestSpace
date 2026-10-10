# 首页栏目文案可配置 · 实施方案 002（审查后的修正版）
> ⚠️ **行号是快照**：本文的 `App.tsx:NNNN` 一类引用是写作当时抓的位置，Phase 4 的 `refactor(admin)` 之后已整体位移（`App.tsx` 增删约 300 行）。定位请搜符号名／字符串，不要照着行号跳。

> **已被 `SECTION_CONFIG_PLAN_003.md` 取代（2026-10-10，最终版）**：本版的 D1（描述塞进 `navItems`）被推翻——纳入详情页槽位后要存的文案不属于导航，
> 塞进导航数组是假结构且与标签共享 5000 整串预算；003 改用 `section_copy_json` 一列。本文件保留作为审查过程记录，**不要按它执行**。
>
> 状态：方案成文，本轮未改动任何代码。本版取代 `SECTION_CONFIG_PLAN_001.md` 的 §1(D2/D8)、§2、§3、§4、§5、§7、§8、§9、§11；
> 取代原因见 §0（一处阻塞级矛盾）。裁定 D1/D3/D4/D5/D6/D7 维持，新增 D9–D12。等他放行后按 Phase 执行。
> 依据：两轮只读审查（第一轮全栈工程、第二轮产品）+ 一次消费者全量清点 + 本地 D1 实测。

---

## 0. 本版修正了什么（先说结论）

001 的核心裁定 **D2「标题 = 导航标签优先，不内置标题默认」与「前台零视觉变化」互相矛盾**，我当时没验到底：

- `App.tsx:807` 的 `<em>` 槽是**语言判据**：zh 显示「馆藏统计」，en 显示 `Collection record`（全仓仅此一处用语言判据做副标，见 `grep '<em>'`）。
- `App.tsx:968` 的 Index 标题是 `Index of Specimens / 馆藏目录`，而导航标签只是 `Index`。

⇒ 标题若真按标签取，en 模式的 Catalogue 副标会不见、Index 标题会缩短。**"零视觉变化"这个承诺是假的**，我在 001 里把它写在 D3（描述默认留空）上，却漏了标题这一半。

修正后的裁定见 D2′。

---

## 1. 裁定表（D2′/D8 已重写，新增 D9–D12）

| # | 裁定 | 取值 | 推翻它的代价 |
|---|---|---|---|
| D1 | 描述存哪 | 塞进 `navItems`（零迁移、零 worker 改动、`sync_update` case 18b/c/d 不触发）+ 客户端预算闸门 | 独立 `section_copy_json` 列要 1 条迁移 + worker JSON 列映射 + `settingsPayloadFromRow` 形状兜底（该函数对新列回退 `[]`，对象形会被打歪）+ `mergeSiteSettings` 特例，共 5 处 |
| **D2′** | 栏目标题口径 | **标题就是导航标签，不加覆盖字段**；四段统一渲染 `labelEn <em>/ labelZh</em>`（`App.tsx:805-808`、`967-968` 两处硬编码字面量删除） | 明记代价：① en 模式 Catalogue 不再显示 `Collection record`；② Index 标题由 `Index of Specimens` 缩为 `Index`。两者都可用**把导航标签本身写全**恢复（顶栏在 `≤760px` 整条隐藏，`index.css:1185-1187`，长标签只吃桌面宽度）。要"导航短、标题长"才需要覆盖字段 ⇒ 见 D9 |
| **D9** | 覆盖字段本轮不做 | `titleEn/titleZh` 留作后续入口。**真要做时必须配「已被覆盖，不跟随导航名称」指示 + 一键清空** | 没有指示器就是新的假状态：他改导航名，标题被静默覆盖顶掉，看起来像原 bug 复发（这正是 001 的 D2 会制造的第二次困惑） |
| D3 | 描述默认值 | 内置默认**全为空串** ⇒ 描述行默认不出现，他填了才有。我不替他定首页文案 | 若想保留 `Collection record` 作为 catalogue 的 `descEn` 默认，就是我在改版式；这个选择摊给他（见 §6 P1） |
| D4 | eyebrow | 不配置化（项目既定：结构标签刻意单语）；只把 `CABINET RECORD / 02` 的字面量序号改为按渲染位置派生 | 默认顺序下算出来仍是 `02` ⇒ 此项零视觉变化（已核算，不同于 D2′） |
| D5 | 本轮范围 | 只修首页 Catalogue + Index | 详情页副标（`App.tsx:1498` `Core capabilities / 标本特征`、`5421` `Inside the specimen / 项目预览`）与统计卡标签不动 |
| D6 | Catalogue → Statistics | 改 `DEFAULT_NAV_ITEMS` 的 `labelEn`（只对空库安装生效）；**现网那行由他在后台改一次** | `id:'catalogue'` 是锚点，不可改名：`SECTION_ANCHORS`(`App.tsx:296`)、`HomeSectionId`(`navOrder.ts:10`)、`homeStatsVisible` 过滤(`App.tsx:5947-5954`) 三处依赖它 |
| D7 | 管理端按页面重排 | 独立 Phase 4，可停 | `view` 只有 `useState`(`App.tsx:2251`)、无 localStorage ⇒ 重排无旧链接失效风险（已核） |
| **D10** | 取文必须单源 | 抽出 `navLabel(item, lang)` 进 `src/utils/`，四个消费者全部改调它：顶栏(`531-535`)、页脚章节列(`1045-1053`)、后台页脚预览(`1850-1852`)、新增的栏目标题 | 现状是三份**行为相同但各写一遍**的内联判据（预览还额外用 `pick`，`1836-1837`）。不抽函数，第五次分叉只是时间问题 |
| **D11** | 不用 `pickSiteHeading` 取标签 | `pickSiteHeading`(`utils/bilingual.ts`) 会 `.trim()` 且**跨语言回退**，与导航标签的 `zh→en/en→zh` 判据不同口径，只能用于描述这类正文 | 混用会让后台预览与前台给出不同字符串（假状态的一种） |
| **D12** | 不加 maxLength | 用「计数器 + 保存前点名拒绝」，仿抽屉里 `galleryRowIssues` 的坏行即时点名模式(`App.tsx:2563-2569`) | `maxLength` 粘贴即静默截断 = 本仓明令禁止的"静默 sanitize 后回成功"。现状三个导航输入框也都没有 `maxLength`(`3206/3224`) |

---

## 2. 取文契约

```
navLabel(item, lang)  = lang === 'zh' ? (item.labelZh.trim() || item.labelEn.trim())
                            : (item.labelEn.trim() || item.labelZh.trim())
                        → 顶栏 / 页脚 / 后台预览 / 栏目标题 共用这一份

sectionTitle(id, lang) = navLabel(findItem(navItems, id) ?? DEFAULT_NAV_ITEMS[id], lang)
sectionHeading(id)     = `<h2>{navLabel(item,'en')} <em>/ {navLabel(item,'zh')}</em></h2>`
                         （中文侧为空时不渲染 <em>，避免 "Statistics / Statistics"）
sectionDesc(id, lang)  = pickSiteHeading({en:item.descEn, zh:item.descZh}, lang)
                         → 空则整行不渲染（D3）
ordinal(id)            = shownSections.indexOf(id) + 1，两位补零
```

- 取 item 必须从**未过滤**的 `siteSettings.navItems` 查：`effectiveSettings` 在 `homeStatsVisible=false` 时会把 catalogue 从数组里剔掉（`App.tsx:5947-5954`）。该段此时不渲染，但 util 要能兜住（列为测试用例）。
- `desc` 是纯文本节点，**不走 markdown**（与详情页正文那条 markdown→React 节点的硬约束区分开；短副标不需要格式）。

---

## 3. Phase 1 · 数据面（零迁移）

1. `src/types/siteSettings.ts:2-7` — `NavItemConfig` 增 **2 个**可选键：`descEn? descZh?`（覆盖字段按 D9 移出本轮）
2. `src/data/defaultSiteSettings.ts` — 新增 `DEFAULT_SECTION_DESC: Record<HomeSectionId, {en,zh}>`，四条全空串；导出 `SECTION_DESC_MAX = 160`（放前端，**不放 worker**：workerd 把入口模块标量具名导出当 handler 映射，会打死运行时）
3. `src/data/defaultSiteSettings.ts:118-133` — 补回 catalogue 用的 `labelEn:'Catalogue'` 是 `DEFAULT_NAV_ITEMS:5` 的第二份字面量，改为按 id 查，消除双份（否则 D6 改名必漏）
4. `mergeSiteSettings` 不动 item 内部，只加注释说明原因：`saveSettings`(`App.tsx:2359-2386`) 用 `changedColumns`(`projectDiff.ts:28-40`) 按顶层 key 比，`navItems` 一旦被判定改动就**整列重写**；在 merge 里填默认 = 每次保存把文案烤进库 ⇒ 以后改内置默认再也传不下去。实测本地库 `nav_items_json` 已是整份默认数组（长度 277，见 §8）
5. `src/utils/` 新增 `navLabel` + `sectionCopy` 两个纯函数（同一文件即可），供前台与后台共用（D10）

## 4. Phase 2 · 前台接线

6. `App.tsx:805-808`、`967-968` — 删除两处硬编码，改 `<h2>{en} <em>/ {zh}</em></h2>`；D6 生效后 zh 模式读起来是 `Statistics / 馆藏统计`
7. `App.tsx:804` — `CABINET RECORD / {ordinal}`，序号来自新 prop `sectionIndex`
8. `App.tsx:945-1000` + `6153` — `SpecimenIndex` 补 `settings`/`sectionIndex` props（唯一调用点已核）；`SYSTEMATIC REGISTER / {件数}` 保持（那是件数不是序号）
9. `App.tsx:531-535`、`1045-1053`、`1850-1852` — 三处内联判据改调 `navLabel`（行为不变，纯去重；这一步是回归重点，必须实机对比改前改后）
10. 描述行：`<p className="section-desc">` 仅在 `sectionDesc` 非空时渲染
11. `src/index.css` — 新增 `.section-heading .section-desc`（现 `304-307` 只有 eyebrow/h2/as-of，无 `<p>` 规则）+ 移动端一条（对照 `1216-1218`）。**注意** `.section-heading` 是 `align-items:flex-end`，多一行会把 `.as-of` 的下沿也拉下去 ⇒ 实机看是否需要给 `.as-of` 单独定位
12. `App.tsx:715` `CABINET NO. 01 · …` 不动（柜号是装饰，不与段落序号联动）

## 5. Phase 3 · 管理端编辑面（仍在「02 导航与标头」）

13. `App.tsx:3155-3260` — 每行加第二子行：描述 EN/ZH（textarea rows=2）。现网格 `80px 1fr 1fr 90px 70px`（`index.css:1072-1092`）容不下 ⇒ 加 `.nav-config-copy{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr}`
14. `placeholder` 用既有「留空自动…」写法（先例 `App.tsx:3436`）；**不预填 value**
15. 预算闸门 `sectionCopyIssues(navItems)`：逐条点名「哪个栏目 / 哪一栏 / 几个字」，并算整列序列化是否逼近 5000。话术与 worker 拒绝口径对齐（真实 400 形如 `「navItems」有 N 字符，超过 5000 字符上限`，`worker/index.ts:2351/2361-2363` + `api/adminClient.ts:151` + `App.tsx:2384`）
16. `App.tsx:3274-3282` 重置按钮：现在它会把描述一起清掉，而按钮只说"重置为推荐顺序" ⇒ 文案必须改成「重置导航顺序与名称、清空栏目描述」，否则按钮说的和做的不一致
17. 三处 admin 文案里的 "Catalogue" 字样跟随 D6：`App.tsx:3393`、`4447`（「关闭后首页隐藏 Catalogue 统计区块…」）、`3282`；文档 `docs/DEPLOYMENT_GUIDE.md:373/398-400/§八(733-768)`
18. `App.tsx:3146-3152` 说明段改写：这里的名称同时决定顶栏、页脚章节列、**首页栏目标题**三处（D10 之后这是结构性保证，不是巧合）

## 6. 放行时要他选的两项（我不代定）

- **P1** `Collection record` 这句英文副标：随 D2′ 删掉 ／ 挪进 catalogue 的 `DEFAULT_SECTION_DESC.en`（代价：en 模式 Catalogue 段会多出一行小字，版式变化）
- **P2** 本轮要不要一并做详情页副标（`App.tsx:1498`、`5421`、`1720`）：不做 ⇒ "每个页面都有自己的配置" 只完成首页两段的标题同源；做 ⇒ 改动面约再翻一倍（详情页有 6 处 eyebrow/h2）

## 7. Phase 4 · 管理端按页面重排（独立一轮，可停）

| 新侧栏 | 来源（现视图） |
|---|---|
| 01 总览 | 不变 |
| 02 全局 · 标头与导航 | 02 的 HEADER & LOGO + 导航顺序/名称/显示 |
| 03 首页栏目 · 陈列 | 04 的 HERO 卡 |
| 04 首页栏目 · 统计 | 03 整卡 + 该段描述 + `homeStatsVisible`（从 07 搬来） |
| 05 首页栏目 · 手记 | 04 的 CURATOR + CURATOR COPY |
| 06 首页栏目 · 目录 | 新卡：该段描述 |
| 07 详情页 | 04 的 DETAIL / FIELD NOTES |
| 08 页脚 / 09 项目 / 10 同步 / 11 站点设置 | 现 08 / 05 / 06 / 07（去掉 `homeStatsVisible`） |

同步改：`AdminView`(`App.tsx:1746`)、`viewNames`(`2326-2335`)、侧栏按钮(`2897-2952`)，并清掉页内 eyebrow 与侧栏编号的错位（`EDITORIAL CONTENT / 02` 实为侧栏 04、`SITE CONFIGURATION / 03` 实为 07、`SPECIMEN REGISTER / 02` 实为 05、`REMOTE COLLECTION / 06` 实为 06 巧合对上）。
硬约束：只动 JSX 归属与编号，不动 state 字段与写路径；`homeStatsVisible` 与导航 `visible` 保持两个开关（`App.tsx:6125-6128` 注释就是那次"隐藏链接不该顺手删段落"留下的）。

## 8. 数字口径（最坏路径重算）

- 实测本地 D1 `site_settings.nav_items_json` = **277 字符**（4 项齐全，默认已被烤进库）。上限 5000 作用在**序列化后的整串**（`worker/index.ts:2372-2374` 的 `JSON.stringify` + `push` 判据）。
- 最坏（4 项描述全填满 160 中英各一）：每项约 320 内容 + 约 40 键名标点 ≈ 360，×4 ≈ 1.4KB，加现有 277 ⇒ **约 1.7KB < 5000**，余量 3.3K。⇒ D1 成立的前提是 §5.15 的闸门；没有它，一句粘长的描述会让整列写失败，连带锁死标签/顺序/显隐。

## 9. 已知且刻意（写下来，免得下轮当漏洞重修）

1. **worker 对 nav item 内容无任何键白名单/校验**：`2372-2374` 原样 `JSON.stringify`，未知键会 round-trip 进库并回吐（`2314`）；顶层陌生键才被丢（`2369-2374`，测试 `sync_update.test.mjs:907-911`）。保持现状的理由：与今天一致，且值只作 React 文本子节点渲染，无注入面（全站零 `dangerouslySetInnerHTML` 是硬约束）。
2. **多标签并发是整列 last-write-wins**：后保存的覆盖前者全部导航内容。今天已如此，本轮不改（乐观锁对 4 行的配置页是过度设计）。
3. 无 body 大小限制在管理路由上（`readJsonBody:584-593` 无 cap，唯一 413 是 `/api/usage`）⇒ 仓库内第一道闸就是 5000。
4. `desc` 存原样字符串不裁首尾（写侧 JSON 列不 trim，与文本列不同）；**显示**侧按 trim 判"填没填"，与 `mergeSiteSettings` 口径一致（`sync_update.test.mjs:837-861`）。

## 10. 验证

1. 新闸门 `frontend/test/section_copy.test.mjs` 接进 `package.json:11` 的 test 链，用例：`navLabel` 三消费者与标题同源 / 空白=未填 / 缺 id 落 `DEFAULT_NAV_ITEMS` 兜底 / `effectiveSettings` 过滤后仍能取到 / 中文侧空则不渲染 `<em>` / 描述超 160 点名 / 整列逼近 5000 点名 / 序号随 `orderHomeSections` 结果派生。
2. `pnpm build && pnpm test && pnpm typecheck` 全绿；确认 case 18b/c/d(`sync_update.test.mjs:815-832`) 与 `nav_order.test.mjs` 未触发（只跑一次即证，不是推断）。
3. 起 dev（探针走 **8898，勿用 8787**）实机：
   - 后台改导航名 → 顶栏、页脚章节列、栏目标题**三处同时变**（zh 与 en 各看一遍）
   - 填描述 → 行出现且 `.as-of` 不错位；清空 → 行消失
   - 段落拖序 → `/ 02` 跟着走；默认顺序下不变
   - `homeStatsVisible=false` → 段落消失、导航项同步移除
   - Network 核对 PUT body **只含 `navItems`**（证明没把默认抄进库）
   - 移动端：`≤760px` 顶栏本就隐藏；注意 0×0 视口下 `vw/vh` 恒为 0 的老坑，别据此判断布局
4. 提交：Phase 1–3 一个 commit（`feat(copy): drive home section headlines from nav labels and make blurbs configurable`），Phase 4 单独一个；**不 push**（部署由他 push）。
5. 上线后他要做的两次点击（否则前台看不到变化，D3 的必然结果）：① 后台把 Catalogue 的英文名改成 `Statistics`；② 想要标题长就把 Index 写成 `Index of Specimens`。

## 11. 证据缺口（未验证，勿当已核）

1. **远程生产库那行没查**（只测本地 `.wrangler` D1）。放行后先跑一条只读 SELECT，确认线上标签没被手改过长文本；若很长，§8 余量要重算。
2. 本方案**未实跑** test/typecheck/dev —— 全部是读代码判断，落地后按 §10 补。
3. 新增 `<p>` 在 `.section-heading`（`align-items:flex-end`）里的实际排版，未经浏览器验证。
4. Phase 4 里「展示偏好」搬走 `homeStatsVisible` 后剩两个开关，分组文案未定。
