// 路径 ↔ 路由的闸门（node test/route_path.test.mjs）
//
// 这份判据前后端共用：前端拿它决定渲染哪一屏，Worker 拿它决定 canonical 指向哪条路径。
// 出错的表现很隐蔽——前端认领了 Worker 不认的地址（canonical 指向别人不当回事的路径），
// 或者旧分享链接（`#project/005`）不再能打开，所以整张表都钉住。
import { strict as assert } from 'node:assert'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..')
const { routeFromPath, pathForRoute, legacyRouteFromHash, canonicalPathFor, PROJECT_ID_RE } =
  await import(pathToFileURL(join(HERE, 'src', 'utils', 'siteRoute.ts')).href)

const cases = []
const check = (name, fn) => cases.push([name, fn])

check('路径 → 路由：三条真路由 + 未知路径回首页', () => {
  assert.equal(routeFromPath('/'), 'home')
  assert.equal(routeFromPath(''), 'home')
  assert.equal(routeFromPath('/admin'), 'admin')
  assert.equal(routeFromPath('/project/005'), 'project/005')
  assert.equal(routeFromPath('/garbage'), 'home')
  assert.equal(routeFromPath('/project'), 'home', '只有 /project 没有编号 ⇒ 首页')
  assert.equal(routeFromPath('/project/'), 'home', '编号为空 ⇒ 首页')
  assert.equal(routeFromPath('/project/a/b'), 'home', '编号里不许有斜杠')
  assert.equal(routeFromPath('/admin/panel'), 'home', '管理端只认 /admin 一条路径')
})

check('结尾斜杠与大小写路径不额外认领新地址', () => {
  assert.equal(routeFromPath('/project/005/'), 'project/005')
  assert.equal(routeFromPath('/project/005//'), 'project/005')
  assert.equal(routeFromPath('/PROJECT/005'), 'home', '路径不区分大小写是服务器的事，前端不猜')
})

check('编号字符集：与 Worker 写侧同一套（非法编号回首页，不发起请求）', () => {
  assert.ok(PROJECT_ID_RE.test('005') && PROJECT_ID_RE.test('my-tool_1'))
  assert.equal(routeFromPath('/project/%2E%2E'), 'home', '`..` 不是合法编号')
  assert.equal(routeFromPath('/project/%20x'), 'home', '前导空格不是合法编号')
  assert.equal(routeFromPath('/project/' + 'a'.repeat(33)), 'home', '超过 32 字符')
  assert.equal(routeFromPath('/project/%E4%B8%AD'), 'home', '中文编号不在字符集内')
})

check('路由 → 路径：与 routeFromPath 互逆', () => {
  for (const path of ['/project/005', '/project/my-tool', '/admin', '/']) {
    const route = routeFromPath(path)
    assert.equal(pathForRoute(route), path === '/' ? '/' : path)
  }
  assert.equal(pathForRoute('project/..'), '/', '非法编号不拼出可跳转的路径')
})

check('旧哈希地址：只有 #project/<id> 与 #admin 是路由，章节锚点不是', () => {
  assert.equal(legacyRouteFromHash('#project/005'), 'project/005')
  assert.equal(legacyRouteFromHash('#project/005/'), 'project/005')
  assert.equal(legacyRouteFromHash('#admin'), 'admin')
  assert.equal(legacyRouteFromHash('#cabinet'), null, '章节锚点交给浏览器滚动，不能当路由')
  assert.equal(legacyRouteFromHash('#'), null)
  assert.equal(legacyRouteFromHash(''), null)
  assert.equal(legacyRouteFromHash('#project/..'), null, '非法编号不认领')
})

check('canonical 只给真路由，其余一律站点根', () => {
  assert.equal(canonicalPathFor('/project/005'), '/project/005')
  assert.equal(canonicalPathFor('/project/005/'), '/project/005')
  assert.equal(canonicalPathFor('/'), '/')
  assert.equal(canonicalPathFor('/admin'), '/', '管理端不是给爬虫的公开页')
  assert.equal(canonicalPathFor('/typo-path'), '/', '拼错的地址不能声称自己就是首页内容')
  assert.equal(canonicalPathFor('/project/nope nope'), '/')
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
  console.error(`route_path：${failed}/${cases.length} 个用例失败`)
  process.exit(1)
}
console.log(
  `route_path：全部 ${cases.length} 个用例通过（路径↔路由双向 / 非法编号不认领 / 旧哈希兼容 / canonical 只给真路由）✓`,
)
