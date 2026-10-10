// 相册判据（前端即时校验 vs Worker 写侧）与「未保存改动」判定的闸门测试
// 运行：node preview_rules.test.mjs（Node ≥22.18 的原生 type stripping 直接吃 .ts 源码）
//
// 为什么值得单开一份：管理端现在会在点保存之前就点名坏行。判据只要和服务端漂开，
// 就会出现「前端说没问题、保存却 400」或反过来——后者正是本项目在后台明令禁止的假状态。
// 所以这里不是各测一遍规则，而是**把同一批输入喂给两边，要求结论一致**。
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const FRONTEND = join(dirname(fileURLToPath(import.meta.url)), '..')

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..')
const url = (...parts) => pathToFileURL(join(HERE, ...parts)).href

const rules = await import(url('src', 'utils', 'previewRules.ts'))
const diff = await import(url('src', 'utils', 'projectDiff.ts'))
const settingsData = await import(url('src', 'data', 'defaultSiteSettings.ts'))
const worker = await import(url('worker', 'index.ts'))

const { PREVIEW_IMAGE_LIMIT, galleryRowIssues, sanitizeImageUrl } = rules
const { changedColumns } = diff
const { mergeSiteSettings, DEFAULT_SITE_SETTINGS } = settingsData
const { validatePreviewInput, USAGE_EVENTS, createRateLimiter } = worker

/** 抽屉的关闭判断就是"改动集是否非空"，这里包一层只为把断言写得像人话 */
const dirty = (baseline, draft) => Object.keys(changedColumns(baseline, draft)).length > 0

const cases = []
const check = (name, fn) => cases.push([name, fn])

const OK1 = 'https://raw.githubusercontent.com/o/r/main/imgs/a.png'
const OK2 = 'https://user-images.githubusercontent.com/1/2.png'

// —— 单条地址判据：两侧必须是同一个函数（不是两份实现） ——
check('sanitizeImageUrl 就是 src/utils/previewRules 那一份（Worker 只做再导出）', () => {
  assert.equal(worker.sanitizeImageUrl, sanitizeImageUrl, '同一个函数引用')
})

check('上限两侧行为一致：13 张必须被服务端 400，话术里的数字就是那一个常量', () => {
  const thirteen = Array.from({ length: PREVIEW_IMAGE_LIMIT + 1 }, (_, i) => `https://a.example/${i}.png`)
  const server = validatePreviewInput(JSON.stringify(thirteen), undefined)
  assert.equal(server.ok, false, '13 张不能收')
  assert.equal(
    server.error.includes(`最多 ${PREVIEW_IMAGE_LIMIT} 张，当前 ${thirteen.length} 张`),
    true,
    `服务端话术要用同一个常量（实际：${server.error}）`,
  )
})

check('协议白名单：只认带主机名的 http(s) 绝对地址', () => {
  assert.equal(sanitizeImageUrl(OK1), OK1)
  assert.equal(sanitizeImageUrl('  ' + OK2 + '  '), OK2, '首尾空白先去掉')
  assert.equal(sanitizeImageUrl('ftp://a.example/x'), '', '非 http(s)')
  assert.equal(sanitizeImageUrl('a.example/x.png'), '', '缺协议')
  assert.equal(sanitizeImageUrl('/imgs/a.png'), '', '相对路径')
  assert.equal(sanitizeImageUrl('data:image/png;base64,AAA'), '', '内联资源')
  assert.equal(sanitizeImageUrl('https://'), '', '只有协议的空壳')
  assert.equal(sanitizeImageUrl(null), '', 'null')
  assert.equal(sanitizeImageUrl([OK1]), '', '数组不是字符串')
})

// —— 前后端 parity：核心断言 ——
const corpus = [
  [],
  [OK1],
  [OK1, OK2],
  ['', OK1],
  ['notaurl'],
  [OK1, OK1],
  [OK1, 'http://'],
  [` ${OK1} `],
  [OK1, 'ftp://a.example/x', OK2],
  [OK1, OK2, OK1],
  Array.from({ length: PREVIEW_IMAGE_LIMIT }, (_, i) => `https://a.example/${i}.png`),
  Array.from({ length: PREVIEW_IMAGE_LIMIT + 3 }, (_, i) => `https://a.example/${i}.png`),
  [Array(PREVIEW_IMAGE_LIMIT + 1).fill(OK1).join(',')],
]

check('判据 parity：本地不报错的，服务端一定收；本地报错的行，服务端点名同一行', () => {
  for (const lines of corpus) {
    const issues = galleryRowIssues(lines)
    const server = validatePreviewInput(JSON.stringify(lines), undefined)
    const label = JSON.stringify(lines).slice(0, 60)
    if (issues.length === 0) {
      assert.equal(server.ok, true, `${label} → 本地放行，服务端也必须放行`)
      assert.deepEqual(server.gallery, lines.map((s) => s.trim()).filter(Boolean), '落库内容一致')
      continue
    }
    assert.equal(server.ok, false, `${label} → 本地拒绝，服务端也必须拒绝`)
    for (const issue of issues) {
      if (issue.code === 'over-limit') {
        // 服务端对超限是整份拒绝并给出总数，不逐行点名
        assert.match(server.error, /最多 \d+ 张/, `${label} → 超限话术在服务端`)
        continue
      }
      assert.ok(
        server.error.includes(`第 ${issue.row} 行`),
        `${label} → 服务端必须点名第 ${issue.row} 行（实际：${server.error}）`,
      )
    }
  }
})

check('坏行号是 1 起始、可对上文本框里的那一行', () => {
  const issues = galleryRowIssues([OK1, 'bad', OK2, 'bad'])
  assert.deepEqual(
    issues.map((i) => `${i.row}:${i.code}`),
    ['2:invalid', '4:invalid'],
    '第 2、4 行非法；重复只在第二次出现以后才算',
  )
})

check('重复只在有效地址之间比较（规范化后再比）', () => {
  assert.deepEqual(galleryRowIssues([` ${OK1} `, OK1]).map((i) => i.code), ['duplicate'])
  assert.deepEqual(
    galleryRowIssues(['x', 'x']).map((i) => `${i.row}:${i.code}`),
    ['1:invalid', '2:invalid'],
    '两行都非法时各自报协议问题，不叠一条"重复"（重复只对合法地址有意义）',
  )
})

check('超限行逐条标出，行号从 13 开始', () => {
  const lines = Array.from({ length: PREVIEW_IMAGE_LIMIT + 2 }, (_, i) => `https://a.example/${i}.png`)
  const issues = galleryRowIssues(lines)
  assert.deepEqual(
    issues.map((i) => `${i.row}:${i.code}`),
    [`${PREVIEW_IMAGE_LIMIT + 1}:over-limit`, `${PREVIEW_IMAGE_LIMIT + 2}:over-limit`],
  )
})

check('上限就是服务端那一个常量', () => {
  assert.equal(PREVIEW_IMAGE_LIMIT, 12, '详情页相册上限')
})

// —— changedColumns：保存与"未保存改动"共用 ——
const baseline = {
  id: '001',
  name: 'Fjord',
  features: ['a', 'b'],
  preview_images_json: '["https://a.example/1.png","https://a.example/2.png"]',
  demoUrl: 'https://demo.example',
}

check('原样回读不产生任何改动列', () => {
  assert.deepEqual(changedColumns(baseline, { ...baseline }), {}, '整行相等')
  assert.equal(dirty(baseline, { ...baseline }), false)
})

check('库里 JSON 带空格也不误判为"有改动"', () => {
  const draft = { ...baseline, preview_images_json: '["https://a.example/1.png", "https://a.example/2.png"]' }
  assert.deepEqual(changedColumns(baseline, draft), {}, '只有空白差异 → 不算改动')
  const real = { ...baseline, preview_images_json: '["https://a.example/1.png"]' }
  assert.deepEqual(Object.keys(changedColumns(baseline, real)), ['preview_images_json'], '真的少一张 → 算改动')
})

check('只提交变化的那一列', () => {
  const changed = changedColumns(baseline, { ...baseline, name: 'Fjord II', features: ['a'] })
  assert.deepEqual(Object.keys(changed).sort(), ['features', 'name'])
  assert.equal(dirty(baseline, { ...baseline, demoUrl: '' }), true)
})

check('id 永远不进改动集（它是定位用的，不是内容）', () => {
  assert.deepEqual(changedColumns(baseline, { ...baseline, id: '002' }), {})
})

check('新建项目的基线就是空白模板：没动过不算改动，动过一字才算', () => {
  // "没有基线行 → 按有内容处理"这条规则在 App 的 dirtyColumnCount 里（不在纯函数里），
  // 这里锁住的是它依赖的比对语义：模板 vs 模板 = 无改动，模板 vs 改过 = 有改动。
  const template = { id: '004', name: '未命名标本', features: [] }
  assert.deepEqual(changedColumns(template, template), {}, '与空白模板一致 → 不算改动')
  assert.equal(dirty(template, { ...template, name: '真名' }), true)
  assert.equal(dirty(template, { ...template, features: ['x'] }), true)
})

// —— 站点设置的改动集：以前保存 PUT 的是整份 mergeSiteSettings 结果，
// 于是任何一次保存都会把当时的内置默认抄进 site_settings 那一行，之后改默认值再也传不到线上。
check('载入后原样点保存 = 零改动（内置默认不允许被抄进库）', () => {
  // 库里一片空白：管理端看到的是套了默认值的那一份
  const blankRow = mergeSiteSettings({})
  assert.equal(blankRow.heroEn, DEFAULT_SITE_SETTINGS.heroEn, '空库里读到的是内置默认')
  assert.deepEqual(changedColumns(blankRow, { ...blankRow }), {}, '没动过 → 一列都不发')
  // 库里已有值：套默认后原样回读同样不该产生改动
  const realRow = mergeSiteSettings({ heroEn: 'Stored copy', icpEnabled: true, navItems: [{ id: 'curator', labelEn: 'C', labelZh: '中', visible: true }] })
  assert.deepEqual(changedColumns(realRow, { ...realRow }), {}, '已有配置原样回读 → 零改动')
})

check('动过的列才发，清空的列发空串（清空=回退默认要能落库）', () => {
  const loaded = mergeSiteSettings({ heroEn: 'Stored copy' })
  const changed = changedColumns(loaded, { ...loaded, heroEn: '', subtitleZh: '新副标题' })
  assert.deepEqual(Object.keys(changed).sort(), ['heroEn', 'subtitleZh'])
  assert.equal(changed.heroEn, '', "清空要写成空串，不能因为「空」被当成没改动")
})

// —— 埋点事件白名单：客户端只可能发这些，其余服务端 400 ——
check('埋点白名单覆盖六个事件与各自的方式', () => {
  assert.deepEqual(Object.keys(USAGE_EVENTS).sort(), [
    'deck',
    'dirimport',
    'imgfail',
    'outbound',
    'pageview',
    'specimen_open',
  ])
  // 转化漏斗那三条的方式集合就是"能回答的问题"的边界，改任何一个都要同步改前端调用点
  assert.deepEqual([...USAGE_EVENTS.pageview].sort(), ['admin', 'detail', 'home'])
  assert.deepEqual([...USAGE_EVENTS.specimen_open].sort(), ['card', 'footer', 'index', 'related'])
  assert.deepEqual([...USAGE_EVENTS.outbound].sort(), ['demo', 'github'])
  // 客户端的 UsageEvent 联合类型必须与服务端白名单同名：
  // 两侧各写一遍迟早分叉（前端发了白名单外的事件名会被 400 静默吞掉，等于没埋点）
  const usageSrc = readFileSync(join(FRONTEND, 'src', 'utils', 'usage.ts'), 'utf8')
  const unionLine = usageSrc
    .split('\n')
    .find((line) => line.startsWith('export type UsageEvent ='))
  assert.ok(unionLine, 'usage.ts 里找不到 UsageEvent 联合类型，钉子本身失效了')
  const clientEvents = unionLine
    .slice(unionLine.indexOf('=') + 1)
    .split('|')
    .map((part) => part.trim().replace(/'/g, ''))
    .sort()
  assert.deepEqual(clientEvents, Object.keys(USAGE_EVENTS).sort(), '客户端事件类型与服务端白名单不一致')
  for (const m of ['view', 'thumb', 'plate', 'arrow', 'drag', 'key', 'zoom']) {
    assert.equal(USAGE_EVENTS.deck.includes(m), true, `deck 接受方式 ${m}`)
  }
  assert.deepEqual([...USAGE_EVENTS.imgfail], [], 'imgfail 只带主机名，不带方式')
  assert.deepEqual(USAGE_EVENTS.dirimport.slice().sort(), ['error', 'notfound', 'ok', 'ratelimited'])
})

check('方式取值不重复、都为小写字母串', () => {
  for (const [name, methods] of Object.entries(USAGE_EVENTS)) {
    assert.equal(new Set(methods).size, methods.length, `${name} 的方式列表不能有重复`)
    for (const m of methods) assert.match(m, /^[a-z]+$/, `${name} 的方式 ${m} 必须是小写单词`)
  }
})

// —— 公开端点的按 IP 限流：判据抽成纯函数，靠传 now 而不是靠数真实请求 ——
check('限流器：第 limit 次放行、第 limit+1 次拒绝，窗口一过整桶重置', () => {
  const allow = createRateLimiter({ limit: 3, windowMs: 1000, storeMax: 10 })
  const t = 1_000_000
  assert.deepEqual([allow('a', t), allow('a', t), allow('a', t)], [true, true, true])
  assert.equal(allow('a', t), false, '第 4 次必须被拦')
  assert.equal(allow('b', t), true, '另一个来源不受影响')
  assert.equal(allow('a', t + 1001), true, '窗口一过就重置（刻意不做滑动窗口）')
})

check('限流器：容量满只清过期桶，不把所有人的计数一起抹掉', () => {
  const allow = createRateLimiter({ limit: 1, windowMs: 1000, storeMax: 2 })
  assert.equal(allow('a', 0), true)
  assert.equal(allow('b', 0), true)
  assert.equal(allow('a', 0), false, 'a 已用满')
  assert.equal(allow('c', 500), true, '容量满时新来源放行，但不清空全表')
  assert.equal(allow('a', 500), false, 'a 的计数没被新来源清掉')
  assert.equal(allow('d', 2000), true, '过期之后新来源正常记账')
})

check('三个公开端点都接了限流（源码钉子）', () => {
  const workerSrc = readFileSync(join(FRONTEND, 'worker', 'index.ts'), 'utf8')
  // 读接口是"列表 + 详情 + 站点文案"三条：共用同一个桶，少接一条就是给脚本留了个不设防的口子
  const readHits = workerSrc.match(/allowPublicRead\(clientIpOf\(c\), Date\.now\(\)\)/g) ?? []
  assert.ok(readHits.length >= 3, `公开读接口只接了 ${readHits.length} 处（列表/详情/站点文案都要）`)
  assert.match(workerSrc, /allowImageRequest\(clientIpOf\(c\), Date\.now\(\)\)/, '图片端点没接限流')
  assert.match(workerSrc, /allowUsageEvent\(clientIpOf\(c\), Date\.now\(\)\)/, '埋点端点没接限流')
})

let failed = 0
for (const [name, fn] of cases) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
  } catch (err) {
    failed += 1
    console.error(`  ✗ ${name}\n    ${err.message}`)
  }
}
if (failed) {
  console.error(`preview_rules：${failed}/${cases.length} 个用例失败`)
  process.exit(1)
}
console.log(`preview_rules：全部 ${cases.length} 个用例通过（地址判据同源 / 前后端结论一致 / 坏行行号 / 改动列判定 / 埋点白名单 / 三个公开端点的限流）✓`)
