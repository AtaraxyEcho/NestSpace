// 访问台账的本地实测（由 scripts/usage-probe.sh 调用，跑在 8898 的 wrangler dev 上）。
//
// 必须用真实 Worker + 真实 D1（哪怕是本地库）：写入走 waitUntil + D1 batch，
// 表结构/冲突子句/UV 去重都只在真正执行时才会暴露。
//
// 断言全部是"相对基线"的：本地库可能已经有前几次探针的数据，不能写死绝对值。
import { randomUUID } from 'node:crypto'

const [port, token] = process.argv.slice(2)
if (!port || !token) {
  console.error('用法：node scripts/probe-visit-ledger.mjs <port> <admin-token>')
  process.exit(2)
}

const base = `http://127.0.0.1:${port}`
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const BOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'

const checks = []
const expect = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail })
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function readStats(withAuth = true) {
  const res = await fetch(`${base}/api/admin/visits?days=30`, {
    headers: withAuth
      ? { Authorization: `Bearer ${token}`, Accept: 'application/json' }
      : { Accept: 'application/json' },
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

async function send(payload, ip, userAgent = DESKTOP_UA, extraHeaders = {}) {
  const res = await fetch(`${base}/api/usage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      'CF-Connecting-IP': ip,
      'User-Agent': userAgent,
      'Accept-Language': 'zh-CN,zh;q=0.9',
      ...extraHeaders,
    },
    body: JSON.stringify(payload),
  })
  return res.status
}

/** waitUntil 的 D1 写入可能比 204 晚一点：轮询到条件成立或超时 */
async function waitFor(predicate, timeout = 6000) {
  const started = Date.now()
  let last = null
  while (Date.now() - started < timeout) {
    last = await readStats()
    if (last.status === 200 && predicate(last.json)) return last.json
    await sleep(200)
  }
  return last?.json ?? {}
}

const pageOf = (json, surface, ref = '') =>
  (json.pages ?? []).find((page) => page.surface === surface && page.ref === ref)?.pv ?? 0
const dimTotal = (json, dim, value) =>
  (json.dims?.[dim] ?? []).find((entry) => entry.value === value)?.pv ?? 0
const eventTotal = (json, event) =>
  (json.events ?? []).find((group) => group.event === event)?.total ?? 0

const anonymous = await readStats(false)
expect('无凭据读取要 401', anonymous.status === 401, `实际 ${anonymous.status}`)

const baselineRes = await readStats()
expect('鉴权读取要 200', baselineRes.status === 200, `实际 ${baselineRes.status}`)
if (baselineRes.status !== 200) {
  report()
  process.exit(1)
}
const baseline = baselineRes.json
expect('返回累计/PV/UV 字段', typeof baseline.totals?.pv === 'number' && typeof baseline.totals?.uv === 'number')

// 第三方页面用 sendBeacon 往公开端点灌数据：必须静默 204，且不落台账
const crossSite = await send(
  { e: 'pageview', m: 'home', v: randomUUID() },
  '203.0.113.12',
  DESKTOP_UA,
  { Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site' },
)
expect('跨站来源要 204（静默拒绝）', crossSite === 204, `实际 ${crossSite}`)
await sleep(700)
const afterCrossSite = await readStats()
expect('跨站来源不写台账 PV', (afterCrossSite.json.totals?.pv ?? 0) === (baseline.totals?.pv ?? 0))
expect('跨站来源不写台账 UV', (afterCrossSite.json.totals?.uv ?? 0) === (baseline.totals?.uv ?? 0))

const visitor = randomUUID()
const first = await send(
  { e: 'pageview', m: 'home', v: visitor, s: 'github.com' },
  '203.0.113.10',
)
expect('首页 pageview 要 204', first === 204, `实际 ${first}`)

const afterFirst = await waitFor((json) => (json.totals?.pv ?? 0) === (baseline.totals?.pv ?? 0) + 1)
expect('首页浏览：PV +1', (afterFirst.totals?.pv ?? 0) === (baseline.totals?.pv ?? 0) + 1)
expect('首页浏览：累计 UV +1（新匿名 ID）', (afterFirst.totals?.uv ?? 0) === (baseline.totals?.uv ?? 0) + 1)
expect('首页浏览：今日 PV +1', (afterFirst.totals?.todayPv ?? 0) === (baseline.totals?.todayPv ?? 0) + 1)
expect('首页浏览：今日 UV +1', (afterFirst.totals?.todayUv ?? 0) === (baseline.totals?.todayUv ?? 0) + 1)
expect('首页浏览：窗口 UV +1', (afterFirst.totals?.rangeUv ?? 0) === (baseline.totals?.rangeUv ?? 0) + 1)
expect('首页计数进入热门页面', pageOf(afterFirst, 'home') === pageOf(baseline, 'home') + 1)
expect('来源归类为 GitHub', dimTotal(afterFirst, 'source', 'github') === dimTotal(baseline, 'source', 'github') + 1)
expect('设备归类为桌面', dimTotal(afterFirst, 'device', 'desktop') === dimTotal(baseline, 'device', 'desktop') + 1)
expect('语言归类为中文', dimTotal(afterFirst, 'lang', 'zh') === dimTotal(baseline, 'lang', 'zh') + 1)

// 同一个匿名 ID 同一天再看一个详情：PV 要涨，UV 不能涨
const second = await send(
  { e: 'pageview', m: 'detail', r: '001', v: visitor },
  '203.0.113.10',
)
expect('详情 pageview 要 204', second === 204, `实际 ${second}`)
const afterSecond = await waitFor((json) => (json.totals?.pv ?? 0) === (afterFirst.totals?.pv ?? 0) + 1)
expect('同访客再看一页：PV +1', (afterSecond.totals?.pv ?? 0) === (afterFirst.totals?.pv ?? 0) + 1)
expect('同访客再看一页：累计 UV 不变', (afterSecond.totals?.uv ?? 0) === (afterFirst.totals?.uv ?? 0))
expect('同访客再看一页：今日 UV 不变', (afterSecond.totals?.todayUv ?? 0) === (afterFirst.totals?.todayUv ?? 0))
expect('同访客再看一页：窗口 UV 不变', (afterSecond.totals?.rangeUv ?? 0) === (afterFirst.totals?.rangeUv ?? 0))
expect('详情页带上标本编号', pageOf(afterSecond, 'detail', '001') === pageOf(afterFirst, 'detail', '001') + 1)

// 爬虫的 pageview 不进受众口径
const bot = await send({ e: 'pageview', m: 'home', v: randomUUID() }, '203.0.113.11', BOT_UA)
expect('爬虫 pageview 仍返回 204', bot === 204, `实际 ${bot}`)
await sleep(800)
const afterBot = await readStats()
expect('爬虫 pageview 不计入 PV', (afterBot.json.totals?.pv ?? 0) === (afterSecond.totals?.pv ?? 0))
expect('爬虫 pageview 不计入 UV', (afterBot.json.totals?.uv ?? 0) === (afterSecond.totals?.uv ?? 0))

// 管理端自己的浏览单独记，不进受众口径
const adminView = await send(
  { e: 'pageview', m: 'admin', v: randomUUID() },
  '203.0.113.10',
)
expect('管理端 pageview 要 204', adminView === 204, `实际 ${adminView}`)
const afterAdmin = await waitFor(
  (json) => (json.totals?.adminPv ?? 0) === (afterSecond.totals?.adminPv ?? 0) + 1,
)
expect('管理端浏览：adminPv +1', (afterAdmin.totals?.adminPv ?? 0) === (afterSecond.totals?.adminPv ?? 0) + 1)
expect('管理端浏览：受众 PV 不变', (afterAdmin.totals?.pv ?? 0) === (afterSecond.totals?.pv ?? 0))
expect('管理端浏览：受众 UV 不变', (afterAdmin.totals?.uv ?? 0) === (afterSecond.totals?.uv ?? 0))

// 行为事件计入事件表，但不抬高 PV
const outbound = await send({ e: 'outbound', m: 'github', r: '001', v: visitor }, '203.0.113.10')
expect('出站事件要 204', outbound === 204, `实际 ${outbound}`)
const afterOutbound = await waitFor(
  (json) => eventTotal(json, 'outbound') === eventTotal(afterAdmin, 'outbound') + 1,
)
expect('出站事件计数 +1', eventTotal(afterOutbound, 'outbound') === eventTotal(afterAdmin, 'outbound') + 1)
expect('出站事件不抬高 PV', (afterOutbound.totals?.pv ?? 0) === (afterAdmin.totals?.pv ?? 0))
expect(
  '出站事件保留标本引用',
  (afterOutbound.events ?? [])
    .find((group) => group.event === 'outbound')
    ?.items.some((item) => item.method === 'github' && item.ref === '001') ?? false,
)

function report() {
  let failed = 0
  for (const check of checks) {
    if (check.ok) {
      console.log(`  ✓ ${check.name}`)
    } else {
      failed += 1
      console.log(`  ✗ ${check.name}${check.detail ? `（${check.detail}）` : ''}`)
    }
  }
  console.log(`  访问台账：${checks.length - failed}/${checks.length} 项通过`)
  return failed
}

const failed = report()
process.exit(failed ? 1 : 0)
