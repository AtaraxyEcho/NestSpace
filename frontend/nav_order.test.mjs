// 首页栏目顺序 = 管理端导航顺序 的纯函数闸门（node nav_order.test.mjs）
// 覆盖：按 navItems 排序、导航里没有的段落排末尾、重复 id 去重、非段落 id 不干扰、空/异常输入兜底。
import { strict as assert } from 'node:assert'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const ROUTE_URL = pathToFileURL(
  join(dirname(fileURLToPath(import.meta.url)), 'src', 'utils', 'navOrder.ts'),
).href

const { HOME_SECTION_IDS, orderHomeSections } = await import(ROUTE_URL)

const cases = []
const check = (name, fn) => cases.push([name, fn])
const ids = (...list) => list.map((id) => ({ id }))

check('默认顺序与段落定义一致', () => {
  assert.deepEqual(orderHomeSections(ids('cabinet', 'catalogue', 'curator', 'index')), [
    'cabinet',
    'catalogue',
    'curator',
    'index',
  ])
})

check('导航拖序后段落跟着走（这正是本轮修的问题）', () => {
  assert.deepEqual(orderHomeSections(ids('index', 'cabinet', 'curator', 'catalogue')), [
    'index',
    'cabinet',
    'curator',
    'catalogue',
  ])
})

check('导航里缺项时，剩下段落排末尾而不是消失', () => {
  assert.deepEqual(orderHomeSections(ids('curator')), ['curator', 'cabinet', 'catalogue', 'index'])
  assert.deepEqual(orderHomeSections([]), [...HOME_SECTION_IDS], '空导航 = 原顺序')
})

check('导航里的外链 / 未知 id 不影响首页排版', () => {
  assert.deepEqual(orderHomeSections(ids('blog', 'cabinet', 'github', 'index')), [
    'cabinet',
    'index',
    'catalogue',
    'curator',
  ])
})

check('重复 id 只取第一次出现', () => {
  assert.deepEqual(orderHomeSections(ids('index', 'index', 'cabinet')).slice(0, 2), ['index', 'cabinet'])
  assert.equal(orderHomeSections(ids('index', 'index', 'cabinet')).length, 4, '总数仍是四段，不重复')
})

check('visible=false 不改变顺序也不删段落（导航显隐与段落是两件事）', () => {
  assert.deepEqual(
    orderHomeSections([
      { id: 'index', visible: false },
      { id: 'cabinet', visible: true },
    ]),
    ['index', 'cabinet', 'catalogue', 'curator'],
  )
})

check('缺字段 / null / 非数组输入一律退化成默认顺序（渲染不该因为脏配置崩掉）', () => {
  assert.deepEqual(orderHomeSections(null), [...HOME_SECTION_IDS])
  assert.deepEqual(orderHomeSections(undefined), [...HOME_SECTION_IDS])
  assert.deepEqual(orderHomeSections([{}, { id: 1 }, { id: 'curator' }]), [
    'curator',
    'cabinet',
    'catalogue',
    'index',
  ])
})

check('输出永远是四段各一次（防未来加第五段时漏掉兜底）', () => {
  const out = orderHomeSections(ids('index', 'cabinet', 'curator', 'catalogue'))
  assert.equal(out.length, 4)
  assert.equal(new Set(out).size, 4)
  assert.deepEqual([...out].sort(), [...HOME_SECTION_IDS].sort())
})

let failed = 0
for (const [name, fn] of cases) {
  try {
    fn()
  } catch (err) {
    failed += 1
    console.error(`  ✗ ${name}\n    ${err.message}`)
  }
}
if (failed) {
  console.error(`nav_order：${failed}/${cases.length} 个用例失败`)
  process.exit(1)
}
console.log(`nav_order：全部 ${cases.length} 个用例通过（导航顺序驱动栏目顺序 / 缺项兜底 / 脏输入退化）✓`)
