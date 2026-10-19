// 访问统计分类判据的闸门（node test/visit_stats.test.mjs）
//
// 这些函数决定"设备/语言/来源/国家"落进统计库的值。判据一旦漂移，
// 管理端看到的分布就是错的，而且不会有任何报错——所以按边界值钉住。
import { strict as assert } from 'node:assert'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..')
const { beijingDayHour, shiftDay, deviceOf, languageOf, sourceOf, countryOf, entrySourceOf } =
  await import(pathToFileURL(join(HERE, 'src', 'utils', 'visitStats.ts')).href)

const cases = []
const check = (name, fn) => cases.push([name, fn])

check('日/时按 +8 切，跨零点不出错', () => {
  assert.deepEqual(beijingDayHour(Date.UTC(2026, 9, 18, 15, 59, 59)), {
    day: '2026-10-18',
    hour: 23,
  })
  assert.deepEqual(beijingDayHour(Date.UTC(2026, 9, 18, 16, 0, 0)), {
    day: '2026-10-19',
    hour: 0,
  })
})

check('shiftDay 跨月/跨年正确', () => {
  assert.equal(shiftDay('2026-03-01', -1), '2026-02-28')
  assert.equal(shiftDay('2026-01-01', -1), '2025-12-31')
  assert.equal(shiftDay('2026-10-19', 0), '2026-10-19')
})

check('设备分档：爬虫优先于移动端，平板不落成手机', () => {
  assert.equal(deviceOf('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'), 'bot')
  assert.equal(deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148'), 'mobile')
  assert.equal(deviceOf('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)'), 'tablet')
  assert.equal(deviceOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0'), 'desktop')
  assert.equal(deviceOf(''), 'other')
})

check('设备分档不误伤含 BOT 字样的真机（CUBOT）', () => {
  assert.equal(
    deviceOf(
      'Mozilla/5.0 (Linux; Android 12; CUBOT X30) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36',
    ),
    'mobile',
  )
})

check('语言只看首选项', () => {
  assert.equal(languageOf('zh-CN,zh;q=0.9,en;q=0.8'), 'zh')
  assert.equal(languageOf('en-US,en;q=0.9'), 'en')
  assert.equal(languageOf('fr-FR,fr;q=0.9'), 'other')
  assert.equal(languageOf(''), 'unknown')
})

check('来源只归类，不保留未知域名', () => {
  assert.equal(sourceOf(''), 'direct')
  assert.equal(sourceOf('www.google.com'), 'search')
  assert.equal(sourceOf('google.co.uk'), 'search', '带国家后缀的 Google 也是搜索')
  assert.equal(sourceOf('cn.bing.com'), 'search')
  assert.equal(sourceOf('github.com'), 'github')
  assert.equal(sourceOf('gist.github.com'), 'github')
  assert.equal(sourceOf('www.linkedin.com'), 'linkedin')
  assert.equal(sourceOf('x.com'), 'social')
  assert.equal(sourceOf('some-private-blog.example'), 'other')
})

check('来源不被冒名主机骗过（google.evil.com 不是搜索）', () => {
  assert.equal(sourceOf('google.evil.com'), 'other')
  assert.equal(sourceOf('bing.com.evil.com'), 'other')
  assert.equal(sourceOf('github.com.evil.com'), 'other')
})

check('国家码只认两位字母', () => {
  assert.equal(countryOf('cn'), 'CN')
  assert.equal(countryOf(' US '), 'US')
  assert.equal(countryOf('CHN'), 'unknown')
  assert.equal(countryOf(''), 'unknown')
})

// 整段会话的每次 pageview 都带同一个入口来源。做成"只有第一次带"会把站内翻页
// 全部落进 direct，于是"从 GitHub 来的人看了 5 张图"在报表里变成 1 个 github + 4 个 direct。
check('入口来源：站外保留、同站与子域互跳都不算来源', () => {
  assert.equal(entrySourceOf('https://github.com/AtaraxyEcho/x', 'example.com'), 'github.com')
  assert.equal(entrySourceOf('https://example.com/project/001', 'example.com'), '', '同主机翻页不是来源')
  assert.equal(entrySourceOf('https://admin.example.com/edit', 'example.com'), '', '子域互跳不是来源')
  assert.equal(entrySourceOf('https://example.com/', 'admin.example.com'), '', '反方向同理')
  assert.equal(entrySourceOf('', 'example.com'), '', '直接访问没有 referrer')
  assert.equal(entrySourceOf('javascript:void(0)', 'example.com'), '', '解析不出主机名当没给')
})

check('入口来源不被形似本站的外部主机放过', () => {
  assert.equal(entrySourceOf('https://example.com.evil.net/a', 'example.com'), 'example.com.evil.net')
  assert.equal(entrySourceOf('https://notexample.com/a', 'example.com'), 'notexample.com')
  assert.equal(entrySourceOf('https://evil.example.com/a', 'example.com'), '', '真子域仍算内部')
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
  console.error(`visit_stats：${failed}/${cases.length} 个用例失败`)
  process.exit(1)
}
console.log(
  `visit_stats：全部 ${cases.length} 个用例通过（+8 切日 / 设备与语言分档 / 来源只归类 / 入口来源同站不算 / 国家码校验）✓`,
)
