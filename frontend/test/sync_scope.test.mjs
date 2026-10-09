// 同步范围 ids 入参的闸门（node sync_scope.test.mjs）
// 关键红线：**空数组不能被当成"没选"退化成全表同步**——那是"界面显示选了 0 个、实际刷了全部"的假状态。
import { strict as assert } from 'node:assert'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const ROUTE_URL = pathToFileURL(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'worker', 'index.ts'),
).href

const { parseSyncIds } = await import(ROUTE_URL)

const cases = []
const check = (name, fn) => cases.push([name, fn])

check('不给 ids 保持老语义（全表同步，且不加 WHERE）', () => {
  assert.deepEqual(parseSyncIds(undefined), {}, '省略 → 无 ids、无错误')
  assert.deepEqual(parseSyncIds(null), {}, 'null 同义于省略')
})

check('给了范围就照单执行', () => {
  assert.deepEqual(parseSyncIds(['001', '005']), { ids: ['001', '005'] })
})

check('空数组是错误，不是"全表"', () => {
  const res = parseSyncIds([])
  assert.equal(typeof res.error, 'string', '必须报错')
  assert.equal(res.ids, undefined, '报错时绝不能带出 ids')
})

check('非法形态一律拒绝并说明原因', () => {
  assert.match(parseSyncIds('001').error, /数组/)
  assert.match(parseSyncIds([123]).error, /字符串/)
  assert.match(parseSyncIds(['']).error, /非空/)
  assert.match(parseSyncIds(['   ']).error, /非空/, '纯空白等同空')
  assert.match(parseSyncIds(['a'.repeat(40)]).error, /32/, '超长 id 拒绝')
})

check('去重、去首尾空白，并保持提交顺序', () => {
  assert.deepEqual(parseSyncIds([' 005 ', '005', '001']), { ids: ['005', '001'] })
})

check('数量上限存在（防一次提交把 Worker 时间与 GitHub 配额打满）', () => {
  const tooMany = Array.from({ length: 501 }, (_, i) => String(i))
  assert.match(parseSyncIds(tooMany).error, /最多同步 500/)
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
  console.error(`sync_scope：${failed}/${cases.length} 个用例失败`)
  process.exit(1)
}
console.log(`sync_scope：全部 ${cases.length} 个用例通过（省略=全表 / 空数组=拒绝 / 形态与上限 / 去重）✓`)
