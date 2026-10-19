// 同步范围 ids 入参的闸门（node sync_scope.test.mjs）
// 关键红线：**空数组不能被当成"没选"退化成全表同步**——那是"界面显示选了 0 个、实际刷了全部"的假状态。
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const ROUTE_URL = pathToFileURL(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'worker', 'index.ts'),
).href

const { parseSyncIds, syncRowCost, syncCaps } = await import(ROUTE_URL)

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

check('数量上限存在（D1 单条语句最多 100 个绑定参数）', () => {
  const tooMany = Array.from({ length: 101 }, (_, i) => String(i))
  assert.match(parseSyncIds(tooMany).error, /最多同步 100/)
})

// 免费版 Workers 每次调用 50 个子请求（GitHub fetch 与 D1 查询都计入），D1 同样每次调用 50 次查询。
// 批次上限必须从这条预算算出来，否则调用会在循环中途报错：已经写了几行、后面的行没有结果，
// 界面显示"同步失败"而库里却已半更新——那是最糟的形态。
// +2 是给 SELECT 与 Access 取证书留的余量。
const SUBREQUEST_BUDGET_FREE = 50
check('不开文档的批次不超子请求预算', () => {
  const caps = syncCaps()
  assert.equal(syncRowCost(false), 3)
  assert.ok(
    caps.rows * syncRowCost(false) + 2 <= SUBREQUEST_BUDGET_FREE,
    `${caps.rows} 行 × ${syncRowCost(false)} = ${caps.rows * syncRowCost(false)} 已超预算`,
  )
})

check('抓文档的批次不超子请求预算（候选路径是上界）', () => {
  const caps = syncCaps()
  assert.equal(syncRowCost(true), 20)
  assert.ok(
    caps.docRows * syncRowCost(true) + 2 <= SUBREQUEST_BUDGET_FREE,
    `${caps.docRows} 行 × ${syncRowCost(true)} 已超预算，请下调 SYNC_MAX_DOC_ROWS`,
  )
})

// Workers 入口模块的具名导出只允许"函数或 ExportedHandler"：导出一个数字/字符串，
// workerd 会在启动时报 `Incorrect type for map entry 'X'` 并整体起不来（踩过两次，
// 而且 tsc / vite build / 闸门全都不会红，只有真跑 Worker 才暴露）。
check('入口模块没有标量具名导出（会让 workerd 起不来）', () => {
  const source = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'worker', 'index.ts'),
    'utf8',
  )
  const scalar = /^\s*export\s+(?:const|let|var)\s+\w+(?::[^=]+)?=\s*(?:-?\d|["'`]|true\b|false\b|null\b)/gm
  const bad = [...source.matchAll(scalar)].map((m) => m[0].trim())
  assert.deepEqual(bad, [], `这些具名导出是标量：${bad.join(' / ')}`)
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
console.log(
  `sync_scope：全部 ${cases.length} 个用例通过（省略=全表 / 空数组=拒绝 / 形态与上限 / 去重 / 批次不超子请求预算 / 入口导出形状）✓`,
)
