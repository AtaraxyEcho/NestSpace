// 闸门注册链与 test/ 目录必须一一对应
// 运行：node test_chain.test.mjs
//
// 为什么值得单开一份：`pnpm test` 是一条手写的 `&&` 链，CI 只跑 `pnpm test`。
// 新加一个 .test.mjs 却忘了登记，它会**永远不参与 CI 且不报错**——比测试失败更糟，
// 因为看绿的人以为它过了。（本仓库真的发生过：闸门从 11 加到 12 时要手改 package.json。）
import { strict as assert } from 'node:assert'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const FRONTEND = join(dirname(fileURLToPath(import.meta.url)), '..')

const pkg = JSON.parse(readFileSync(join(FRONTEND, 'package.json'), 'utf8'))
const chain = [...pkg.scripts.test.matchAll(/node (test\/[A-Za-z0-9_]+\.test\.mjs)/g)].map(
  (m) => m[1],
)
const onDisk = readdirSync(join(FRONTEND, 'test'))
  .filter((name) => name.endsWith('.test.mjs'))
  .map((name) => `test/${name}`)
  .sort()

const cases = []
const check = (name, fn) => cases.push([name, fn])

check('链上没有不存在的文件（写错名字时 node 会以 "Cannot find module" 炸掉整条链）', () => {
  for (const entry of chain) {
    assert.ok(onDisk.includes(entry), `${entry} 在链上，但目录里没有`)
  }
})

check('目录里没有未登记的闸门', () => {
  const missing = onDisk.filter((entry) => !chain.includes(entry))
  assert.deepEqual(missing, [], `未登记进 pnpm test：${missing.join(', ')}`)
})

check('不重复登记', () => {
  assert.equal(new Set(chain).size, chain.length)
})

check('链的顺序就是 package.json 里的书写顺序（失败时按此定位）', () => {
  assert.ok(chain.length > 0, '一条闸门都没抓到，多半是 scripts.test 的写法变了')
})

check('CI 跑的就是这条链（而不是另抄一份清单）', () => {
  const ci = readFileSync(join(FRONTEND, '..', '.github', 'workflows', 'ci.yml'), 'utf8')
  assert.match(ci, /run: pnpm test/, 'CI 应调用 pnpm test，闸门清单只在 package.json 一处维护')
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
  console.error(`test_chain：${failed}/${cases.length} 个用例失败`)
  process.exit(1)
}
console.log(`test_chain：全部 ${cases.length} 个用例通过（${chain.length} 条闸门与 test/ 目录一一对应）✓`)
