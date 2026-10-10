// 栏目/页面文案读侧判据的闸门（node test/section_copy.test.mjs）
// 覆盖：导航标签同源、栏目标题取文、两类槽位两套判据（并排 vs 单显）、缺项兜底、
//       内置默认不被烤进 merge、长度点名。
import { strict as assert } from 'node:assert'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const load = (relative) => import(pathToFileURL(join(here, '..', relative)).href)

const { navLabel, sectionHeading, findNavItem, slotHeading, slotProse, sectionSlotIssues, SECTION_SLOT_KEYS } =
  await load('src/utils/sectionCopy.ts')
const { BUILT_IN_SECTION_SLOTS, DEFAULT_SITE_SETTINGS, DEFAULT_NAV_ITEMS, SECTION_SLOT_TEXT_MAX, mergeSiteSettings } =
  await load('src/data/defaultSiteSettings.ts')
const { SECTION_SLOT_SERIALIZED_MAX } = await load('src/utils/sectionCopy.ts')
// Worker 的 SITE_SETTINGS_TEXT_MAX 刻意不导出（workerd 把入口模块的标量具名导出当 handler 映射，
// 标量会打死运行时），所以阈值从它的拒绝话术里反推——这也顺带验"错误消息里的数字就是真阈值"。
const { buildSiteSettingsWrite } = await load('worker/index.ts')
const WORKER_LIMIT_MATCH = buildSiteSettingsWrite({
  sectionCopy: { 'home.index': { en: 'x'.repeat(6000), zh: '' } },
}).error?.match(/超过 (\d+) 字符上限/)
const { orderHomeSections } = await load('src/utils/navOrder.ts')

const cases = []
const check = (name, fn) => cases.push([name, fn])

// ---------- 导航标签：四处消费者的唯一判据 ----------
check('navLabel：中文优先，空则回退英文', () => {
  const item = { id: 'catalogue', labelEn: 'Statistics', labelZh: '统计', visible: true }
  assert.equal(navLabel(item, 'zh'), '统计')
  assert.equal(navLabel(item, 'en'), 'Statistics')
})

check('navLabel：中文留空回退英文（不是渲染空白）', () => {
  const item = { id: 'index', labelEn: 'Index', labelZh: '', visible: true }
  assert.equal(navLabel(item, 'zh'), 'Index')
})

check('navLabel：纯空白按 trim 后算未填（Worker 存的是原样字符串）', () => {
  const item = { id: 'index', labelEn: 'Index', labelZh: '   ', visible: true }
  assert.equal(navLabel(item, 'zh'), 'Index', "只敲空格不该顶掉标签")
})

// ---------- 栏目标题 = 导航标签（本轮修的就是它以前写死在 JSX 里）----------
check('sectionHeading：直接吃导航标签，改名必然传播', () => {
  const items = [
    { id: 'catalogue', labelEn: 'Statistics', labelZh: '统计', visible: true },
    { id: 'index', labelEn: 'Index of Specimens', labelZh: '馆藏目录', visible: true },
  ]
  assert.deepEqual(sectionHeading(items, 'catalogue'), { en: 'Statistics', zh: '统计', pair: true })
  assert.equal(sectionHeading(items, 'index').en, 'Index of Specimens')
})

check('sectionHeading：中英同串时 pair=false，避免出现 "Statistics / Statistics"', () => {
  const items = [{ id: 'curator', labelEn: 'About', labelZh: 'About', visible: true }]
  assert.deepEqual(sectionHeading(items, 'curator'), { en: 'About', zh: 'About', pair: false })
})

check('sectionHeading：库里缺这一段（老数据/被展示偏好摘掉）落内置默认，不抛错', () => {
  const heading = sectionHeading([{ id: 'cabinet', labelEn: 'Cabinet', labelZh: '陈列', visible: true }], 'catalogue')
  assert.equal(heading.en, DEFAULT_NAV_ITEMS.find((i) => i.id === 'catalogue').labelEn)
  assert.equal(heading.pair, true)
})

check('sectionHeading：null / 空数组 / 脏元素都不炸', () => {
  assert.equal(sectionHeading(null, 'index').en, 'Index')
  assert.equal(sectionHeading([], 'index').en, 'Index')
  assert.equal(sectionHeading([null, {}], 'index').en, 'Index')
})

check('findNavItem：只按 id 匹配，未知 id 走内置默认', () => {
  const items = [{ id: 'blog', labelEn: 'Blog', labelZh: '博客', visible: true }]
  assert.equal(findNavItem(items, 'blog').labelEn, 'Blog', '非四段的导航项也照常返回（不影响首页排版）')
  assert.equal(findNavItem(items, 'curator').labelZh, DEFAULT_NAV_ITEMS.find((i) => i.id === 'curator').labelZh)
})

// ---------- D14：并排式与单显式是两套判据 ----------
check('slotHeading（并排式）：只填英文时中文侧仍回退**该语言**的内置默认', () => {
  const map = { 'detail.anatomy': { en: 'What is inside', zh: '' } }
  assert.deepEqual(slotHeading(map, 'detail.anatomy'), { en: 'What is inside', zh: '标本特征', pair: true })
})

check('slotHeading：不填 = 与改造前写死的原句逐字相同（内置默认即被替换的那句原文）', () => {
  assert.deepEqual(slotHeading({}, 'detail.preview'), { en: 'Inside the specimen', zh: '项目预览', pair: true })
  assert.deepEqual(slotHeading({}, 'detail.anatomy'), { en: 'Core capabilities', zh: '标本特征', pair: true })
})

check('slotHeading：内置默认本身没有中文侧时不渲染 <em>', () => {
  assert.deepEqual(slotHeading({}, 'detail.related'), { en: 'Continue observing', zh: '', pair: false })
})

check('slotProse（单显式）：两边都空返回空串 = 不渲染这一行', () => {
  assert.equal(slotProse({}, 'home.catalogue', 'zh'), '')
  assert.equal(slotProse({ 'home.catalogue': { en: '', zh: '' } }, 'home.catalogue', 'en'), '')
})

check('slotProse：一侧空着回退另一种语言（同一句话不必两种都填）', () => {
  const map = { 'home.index': { en: 'Every specimen, listed.', zh: '' } }
  assert.equal(slotProse(map, 'home.index', 'zh'), 'Every specimen, listed.')
})

check('槽位表不是纯对象（空列会被 Worker 回吐成 []）时按未填写处理', () => {
  assert.equal(slotHeading([], 'detail.anatomy').en, 'Core capabilities')
  assert.equal(slotProse([], 'home.index', 'zh'), '')
})

// ---------- 不许把内置默认烤进库 ----------
check('mergeSiteSettings：sectionCopy 原样透传，绝不合入 BUILT_IN_SECTION_SLOTS', () => {
  const merged = mergeSiteSettings({ sectionCopy: { 'home.index': { en: 'Hi', zh: '' } } })
  assert.deepEqual(Object.keys(merged.sectionCopy), ['home.index'])
  assert.equal(merged.sectionCopy['home.index'].zh, '', '未填的格子必须仍是空串，保存时才不会被写进库')
})

check('mergeSiteSettings：空列回吐的 [] 不顶掉默认表（落到 {}）', () => {
  assert.deepEqual(mergeSiteSettings({ sectionCopy: [] }).sectionCopy, {})
  assert.deepEqual(mergeSiteSettings({}).sectionCopy, {})
})

check('DEFAULT_SITE_SETTINGS.sectionCopy 是空表：默认值只活在 BUILT_IN_SECTION_SLOTS（渲染期）', () => {
  assert.deepEqual(DEFAULT_SITE_SETTINGS.sectionCopy, {})
  assert.ok(BUILT_IN_SECTION_SLOTS['detail.anatomy'].en, '内置默认表必须带原文，否则不填就没有标题')
})

// ---------- 序号：默认顺序下与改造前的字面量一致 ----------
check('默认导航顺序里 catalogue 仍是第 02 段（序号派生不改现有版式）', () => {
  const order = orderHomeSections(DEFAULT_NAV_ITEMS)
  assert.equal(order.indexOf('catalogue') + 1, 2)
})

check('拖序后序号跟着走（以前 CABINET RECORD / 02 是写死的）', () => {
  const moved = [{ id: 'index' }, { id: 'catalogue' }, { id: 'cabinet' }, { id: 'curator' }]
  assert.equal(orderHomeSections(moved).indexOf('catalogue') + 1, 2)
  const last = [{ id: 'cabinet' }, { id: 'curator' }, { id: 'index' }, { id: 'catalogue' }]
  assert.equal(orderHomeSections(last).indexOf('catalogue') + 1, 4)
})

// ---------- 长度点名 ----------
check('sectionSlotIssues：超单格上限时点名是哪个槽位哪一栏', () => {
  const long = 'x'.repeat(SECTION_SLOT_TEXT_MAX + 5)
  const issues = sectionSlotIssues({ 'detail.anatomy': { en: long, zh: '正常' } })
  assert.equal(issues.length, 1, `只该有一格超限，实际：${JSON.stringify(issues)}`)
  assert.ok(issues[0].includes('detail.anatomy'), '必须点名槽位')
  assert.ok(issues[0].includes('英文'), '必须点名语言')
})

check('sectionSlotIssues：正常填写不报错，空表也不报错', () => {
  assert.deepEqual(sectionSlotIssues({ 'home.index': { en: 'Short.', zh: '简短。' } }), [])
  assert.deepEqual(sectionSlotIssues({}), [])
  assert.deepEqual(sectionSlotIssues(null), [])
})

check('闸门自检：槽位表与管理端标签表必须同键（加槽位漏登记会在这里红）', () => {
  for (const key of SECTION_SLOT_KEYS) {
    assert.ok(key in BUILT_IN_SECTION_SLOTS, `BUILT_IN_SECTION_SLOTS 缺 ${key}`)
  }
  assert.ok(SECTION_SLOT_KEYS.length >= 5, `槽位数只剩 ${SECTION_SLOT_KEYS.length}，闸门本身失效了`)
})

// ---------- 审查后补的三条（都是实跑出来的洞）----------
check('标签只填一种语言时，标题必须跟着导航走（不许被同语言内置默认顶住）', () => {
  const items = [{ id: 'catalogue', labelEn: '', labelZh: '数据看板', visible: true }]
  const h = sectionHeading(items, 'catalogue')
  assert.equal(h.en, '数据看板', '英文侧为空要用同一条标签，而不是回内置 "Statistics"')
  assert.equal(h.zh, '数据看板')
  assert.equal(h.pair, false, '两串相同就不该渲染 "X / X"')
  // 与导航条同判据：顶栏在这种情况下显示的也是「数据看板」
  assert.equal(navLabel(items[0], 'en'), h.en)
})

check('槽位形状被手改成字符串 / 数组时，回退内置默认且不抛错', () => {
  assert.deepEqual(slotHeading({ 'detail.anatomy': '标本特征' }, 'detail.anatomy'), {
    en: 'Core capabilities',
    zh: '标本特征',
    pair: true,
  })
  assert.deepEqual(slotHeading({ 'detail.anatomy': ['x'] }, 'detail.anatomy'), {
    en: 'Core capabilities',
    zh: '标本特征',
    pair: true,
  })
  assert.equal(slotProse({ 'home.index': 42 }, 'home.index', 'zh'), '')
})

check('前端整串上限必须低于服务端上限（阈值从 Worker 的真实话术里取）', () => {
  const limit = Number(WORKER_LIMIT_MATCH[1])
  assert.ok(limit > 0, `没从 Worker 报错话术里读到上限：${WORKER_LIMIT_MATCH && WORKER_LIMIT_MATCH[0]}`)
  assert.ok(SECTION_SLOT_SERIALIZED_MAX < limit, `前端 ${SECTION_SLOT_SERIALIZED_MAX} 必须低于服务端 ${limit}`)
  assert.ok(SECTION_SLOT_TEXT_MAX * 2 * 5 + 400 < limit, '最坏填满（5 槽中英各 160）也必须留在服务端上限之下')
})

let failed = 0
for (const [name, fn] of cases) {
  try {
    await fn()
  } catch (err) {
    failed += 1
    console.error(`  ✗ ${name}\n    ${err.message}`)
  }
}
if (failed) {
  console.error(`section_copy：${failed}/${cases.length} 个用例失败`)
  process.exit(1)
}
console.log(`section_copy：全部 ${cases.length} 个用例通过（标签同源 / 标题取文 / 两类槽位 / 不烤默认 / 长度点名）✓`)
