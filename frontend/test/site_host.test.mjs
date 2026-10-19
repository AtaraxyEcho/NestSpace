// 前后台互跳地址推导 + 「出货源码里不写死作者域名/账号」的闸门
// 运行：node site_host.test.mjs
//
// 为什么要钉住：这些字面量以前是硬编码的（admin.nestspace.online、GitHub 账号兜底到作者本人）。
// 换成别人部署时，后台按钮会跳到**别人的站点**、仓库扫描会列出**别人的仓库**——
// 而且没有任何报错，所以只能靠源码钉子来挡回归。
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const FRONTEND = join(dirname(fileURLToPath(import.meta.url)), '..')
const siteHost = await import(
  pathToFileURL(join(FRONTEND, 'src', 'utils', 'siteHost.ts')).href
)
const { adminSiteOrigin, hasAdminSibling, isAdminHostname, isSiteHostname, publicSiteOrigin, sharedCookieDomain } =
  siteHost

const parts = (hostname, protocol = 'https:', port = '') => ({ protocol, hostname, port })

const cases = []
const check = (name, fn) => cases.push([name, fn])

check('公开站上跳到 admin 兄弟域', () => {
  assert.equal(adminSiteOrigin(parts('nestspace.online')), 'https://admin.nestspace.online')
})

check('admin 子域上跳回主域（剥掉前缀）', () => {
  assert.equal(publicSiteOrigin(parts('admin.nestspace.online')), 'https://nestspace.online')
})

check('已在 admin 子域时，管理端地址就是自己（不叠前缀）', () => {
  assert.equal(adminSiteOrigin(parts('admin.nestspace.online')), 'https://admin.nestspace.online')
})

check('非 admin 域时，公开地址就是自己', () => {
  assert.equal(publicSiteOrigin(parts('example.com')), 'https://example.com')
})

check('端口原样带过去（本地 wrangler dev 靠这条）', () => {
  assert.equal(publicSiteOrigin(parts('example.com', 'http:', '8787')), 'http://example.com:8787')
  assert.equal(
    adminSiteOrigin(parts('example.com', 'http:', '8787')),
    'http://admin.example.com:8787',
  )
})

check('多层子域只剥最左边的 admin.', () => {
  assert.equal(publicSiteOrigin(parts('admin.blog.example.co.uk')), 'https://blog.example.co.uk')
  assert.equal(adminSiteOrigin(parts('blog.example.co.uk')), 'https://admin.blog.example.co.uk')
})

check('前缀大小写不敏感', () => {
  assert.ok(isAdminHostname('ADMIN.nestspace.online'))
  assert.equal(publicSiteOrigin(parts('ADMIN.nestspace.online')), 'https://nestspace.online')
})

check('末尾根点与两侧空白不影响判定', () => {
  assert.ok(isAdminHostname(' admin.nestspace.online. '))
  assert.equal(publicSiteOrigin(parts('admin.nestspace.online.')), 'https://nestspace.online')
})

check('裸 admin / 空 hostname 拼不出地址：返回空而不是半个 URL', () => {
  assert.equal(publicSiteOrigin(parts('')), '')
  assert.equal(adminSiteOrigin(parts('')), '')
  assert.equal(adminSiteOrigin(parts('admin.')), '')
  assert.equal(adminSiteOrigin(parts('admin')), '')
})

check('admin. 后面必须是一个像站点的主机，否则那是站点自己的名字', () => {
  // admin.com / admin.localhost 是有人真的会用的公开域名：认成管理端，整站就只剩登录页
  assert.equal(isAdminHostname('admin.com'), false)
  assert.equal(isAdminHostname('admin.localhost'), false)
  assert.equal(publicSiteOrigin(parts('admin.com')), 'https://admin.com')
  assert.ok(isAdminHostname('admin.example.com'))
  // 它自己仍是"站点主机"，所以按同一约定去找它自己的兄弟域（admin.admin.com），不是当成控制台
  assert.equal(hasAdminSibling('admin.com'), true)
  assert.equal(adminSiteOrigin(parts('admin.com')), 'https://admin.admin.com')
})

check('没有 admin 兄弟域的环境：本地 / IP / 托管预览域都返回空（据此不跳转）', () => {
  for (const host of [
    'localhost',
    'foo.localhost',
    '127.0.0.1',
    '192.168.1.9',
    'nestspace.acme.workers.dev',
    'nestspace.pages.dev',
    'admin',
  ]) {
    assert.equal(hasAdminSibling(host), false, `${host} 不该被认为有 admin 兄弟域`)
    assert.equal(adminSiteOrigin(parts(host, 'http:', '8787')), '', `${host} 不该拼出管理端地址`)
  }
  for (const host of ['example.com', 'blog.example.co.uk']) {
    assert.equal(hasAdminSibling(host), true)
  }
})

check('isSiteHostname 只认"可部署的站点主机"', () => {
  assert.equal(isSiteHostname('example.com'), true)
  assert.equal(isSiteHostname('a.b.c.example.co.uk'), true)
  assert.equal(isSiteHostname('localhost'), false)
  assert.equal(isSiteHostname(''), false)
  assert.equal(isSiteHostname('intranet'), false)
  assert.equal(isSiteHostname('10.0.0.7'), false)
  assert.equal(isSiteHostname('x.workers.dev'), false)
})

check('往返一致：X → admin.X → X', () => {
  for (const host of ['example.com', 'foo.example.co.uk']) {
    const p = parts(host)
    const admin = adminSiteOrigin(p)
    const back = publicSiteOrigin({ ...p, hostname: `admin.${host}` })
    assert.equal(admin, `https://admin.${host}`)
    assert.equal(back, `https://${host}`)
  }
})

// ——— 源码钉子 ———

const read = (...p) => readFileSync(join(FRONTEND, ...p), 'utf8')
const SHIPPED = [
  ['src', 'App.tsx'],
  ['src', 'utils', 'siteHost.ts'],
  ['worker', 'index.ts'],
  ['index.html'],
]
// src/data/defaultSiteSettings.ts 与 .figma/make/site.json 刻意不在名单里：那两份是"演示文案本体"
// （站名、宣言、GitHub 地址、构建期 <title>），部署者用后台替换它；把里面的名字抹掉等于把示例站点清空。
// 除这两份之外的出货源码都不该再出现某个人的域名或账号。

check('出货源码里不写死作者域名与账号（任何大小写）', () => {
  for (const path of SHIPPED) {
    const src = read(...path)
    const label = path.join('/')
    assert.ok(!/nestspace\.online/i.test(src), `${label} 里出现了写死的主域`)
    assert.ok(!/ataraxyecho/i.test(src), `${label} 里出现了作者的 GitHub 账号`)
  }
})

check('构建输入的 HTML 里不含任何 canonical / og:url（只有注入标记）', () => {
  const html = read('index.html')
  assert.ok(!/<link\b[^>]*rel="canonical"/i.test(html), 'canonical 应由 Worker 注入，不该写死在构建输入里')
  assert.ok(!/<meta\b[^>]*property="og:url"/i.test(html), 'og:url 应由 Worker 注入')
})

check('Worker 与 index.html 用的是同一个标记（改名必须两边一起改）', () => {
  const worker = read('worker', 'index.ts')
  const html = read('index.html')
  const declared = worker.match(/const SEO_ORIGIN_MARKER = '([^']+)'/)?.[1]
  assert.ok(declared, 'Worker 里没有 SEO_ORIGIN_MARKER 常量')
  assert.ok(html.includes(declared), `index.html 里没有那个标记（Worker 就会无处注入）：${declared}`)
})

check('Worker 无条件改写 HTML 正文并摘掉条件请求头', () => {
  const worker = read('worker', 'index.ts')
  assert.match(worker, /out\.replace\(\s*SEO_ORIGIN_MARKER/, '标记没被替换，canonical 永远不会出现')
  // 构建产物里是标记、浏览器里必须是绝对地址，所以正文一定会被改写：
  // 条件请求头不摘掉的话，资产层拿旧 ETag 回 304，客户端留着的还是标记那份
  assert.match(worker, /assetRequest\.headers\.delete\('if-none-match'\)/)
  assert.ok(
    !/hasOverrides/.test(worker),
    '改写正文已无条件，不该再按"有没有覆写"分支决定是否摘条件请求头',
  )
})

check('管理端扫描 GitHub 缺账号时点名报错，不兜底到任何人', () => {
  const worker = read('worker', 'index.ts')
  assert.match(
    worker,
    /if \(!username\) \{\s*\/\/[\s\S]*?return c\.json\(\s*\{ error: '未指定 GitHub 账号/,
    '缺账号应 400 点名，而不是拿某个默认账号扫下去',
  )
})

check('App 的 #admin 分派用同一份判据（别再退回 localhost 白名单）', () => {
  const app = read('src', 'App.tsx')
  assert.match(app, /canSwitchToAdminHost\(\)/, '没有用 hasAdminSibling 的包装判据')
  assert.ok(
    !/\["localhost", "127\.0\.0\.1"\]\.includes/.test(app),
    '又出现了"只排除 localhost"的老写法：IP 直连与 *.workers.dev 会跳去不存在的域名',
  )
})

check('退出统计偏好 cookie：admin.X 与 X 共用 X，本地/托管预览退回同源 localStorage', () => {
  assert.equal(sharedCookieDomain('admin.nestspace.online'), 'nestspace.online')
  assert.equal(sharedCookieDomain('nestspace.online'), 'nestspace.online')
  assert.equal(sharedCookieDomain('admin.sub.example.com'), 'sub.example.com', '多层子域剥一层 admin')
  assert.equal(sharedCookieDomain('127.0.0.1'), '', 'IP 直连没有可共享的 Domain')
  assert.equal(sharedCookieDomain('localhost'), '', '单标签主机没有 Domain')
  assert.equal(sharedCookieDomain('demo.workers.dev'), '', '托管预览域不该写 Domain cookie')
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
  console.error(`site_host：${failed}/${cases.length} 个用例失败`)
  process.exit(1)
}
console.log(
  `site_host：全部 ${cases.length} 个用例通过（admin.X ↔ X 推导 / 端口与多层子域 / 不写死域名与账号 / canonical 按 origin 补全）✓`,
)
