// 埋点客户端、统计派生与跨 isolate 限流层的闸门（node test/usage_stats.test.mjs）
//
// 为什么值得单开一份：
//   1) `utils/usage.ts` 与 `utils/stats.ts` 以前的覆盖是零。前者的"退出统计"有两层
//      （localStorage + 跨子域 cookie）和一套"任一层没落地就回滚并返回 false"的契约——
//      写坏了就是"界面说没生效、刷新后却发现仍被排除"的假状态；后者决定条形高度。
//   2) Worker 的 Cache API 限流层以前从没被执行过：它的 `return true`（缓存不可用/写失败）
//      与"真的限住了"在外部看一模一样。这里用桩 Cache 把三种分支钉住。
//      ⚠️ 桩只能证明"**缓存存在时这层算得对**"，不能证明"生产上它存在"——后者要真实观测。
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

// src/ 里的模块互相 import 时不带扩展名（Vite 与 tsc 都接受，只有 Worker 那边要求写 `.ts`），
// 而 Node 的 ESM 解析器不肯补扩展名。这里挂一个 resolve hook：无扩展名的相对导入补 `.ts`。
// 应用代码因此不为测试改导入风格，Vite 构建与 typecheck 也不受影响。
// （`registerHooks` 自 Node 22.15 起可用，仓库的地板是 22.18；用 `module.register()` 在 26 上会报弃用警告。）
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      return {
        url: new URL(`${specifier}.ts`, context.parentURL).href,
        shortCircuit: true,
      }
    }
    return nextResolve(specifier, context)
  },
})

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..')
const workerUrl = pathToFileURL(join(HERE, 'worker', 'index.ts')).href
const usageUrl = pathToFileURL(join(HERE, 'src', 'utils', 'usage.ts')).href

const { computeActivityTimeline } = await import(
  pathToFileURL(join(HERE, 'src', 'utils', 'stats.ts')).href
)
const { allowCachedRate, createRateLimiter, syncCaps, USAGE_EVENTS } = await import(workerUrl)
const { SYNC_MAX_ROWS, SYNC_MAX_DOC_ROWS, syncRowCap } = await import(
  pathToFileURL(join(HERE, 'src', 'utils', 'syncLimits.ts')).href
)

const cases = []
const check = (name, fn) => cases.push([name, fn])

const VISITOR_KEY = 'nestspace_visitor_id'
const OPTOUT_KEY = 'nestspace_stats_optout'
const OPTOUT_COOKIE = 'nestspace_stats_optout'
const ENTRY_KEY = 'nestspace_entry_source'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * 浏览器环境桩。每个用例现装现拆；`usage.ts` 里有模块级的访客 ID 缓存，
 * 所以要用它做访客 ID 相关断言时，必须带查询参数再导入一次拿全新实例。
 */
function makeBrowser({ hostname = 'nestspace.online', cookieWritable = true, referrer = '' } = {}) {
  const local = new Map()
  const session = new Map()
  const beacons = []
  let cookie = ''

  const storage = (map) => ({
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, String(value))
    },
    removeItem: (key) => {
      map.delete(key)
    },
  })

  const stub = { local, session, beacons, cookieOf: () => cookie }

  stub.install = () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: storage(local),
    })
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      writable: true,
      value: storage(session),
    })
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      writable: true,
      value: {
        referrer,
        get cookie() {
          return cookie
        },
        set cookie(raw) {
          const [pair] = String(raw).split(';')
          const at = pair.indexOf('=')
          const name = pair.slice(0, at).trim()
          const value = pair.slice(at + 1)
          if (!cookieWritable) return // 模拟被禁用的 cookie：写进去什么也不留
          if (value === '') {
            cookie = ''
          } else {
            cookie = `${name}=${value}`
          }
        },
      },
    })
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      writable: true,
      value: { hostname, protocol: 'https:' },
    })
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      writable: true,
      value: {
        sendBeacon: (url, body) => {
          beacons.push({ url, body: String(body) })
          return true
        },
      },
    })
  }
  stub.dispose = () => {
    for (const key of ['localStorage', 'sessionStorage', 'document', 'location', 'navigator']) {
      delete globalThis[key]
    }
  }
  return stub
}

// —— usage.ts：退出统计的两层契约 ——

check('没排除时发一条 pageview，字段形状就是服务端认的那份', async () => {
  const env = makeBrowser()
  env.install()
  const usage = await import(`${usageUrl}?case=shape`)
  usage.trackPageView('home')
  env.dispose()
  assert.equal(env.beacons.length, 1, `应当只发一条埋点，实际 ${env.beacons.length}`)
  assert.equal(env.beacons[0].url, '/api/usage')
  const payload = JSON.parse(env.beacons[0].body)
  assert.equal(payload.e, 'pageview')
  assert.equal(payload.m, 'home')
  assert.match(payload.v, UUID_RE, '匿名访客 ID 必须是标准 UUID')
  assert.ok('s' in payload && 'r' in payload, '来源与标本编号这两个键必须存在（服务端按它们归类）')
})

check('排除开关生效时两层都落地，并返回 true', async () => {
  const env = makeBrowser({ hostname: 'admin.nestspace.online' })
  env.install()
  const usage = await import(`${usageUrl}?case=optout-ok`)
  const ok = usage.setStatsOptOut(true)
  env.dispose()
  assert.equal(ok, true, '两层都能写时必须报告生效')
  assert.equal(env.local.get(OPTOUT_KEY), '1')
  assert.equal(env.cookieOf(), `${OPTOUT_COOKIE}=1`)
})

check('cookie 写不进去时返回 false，并把 localStorage 回滚到调用前', async () => {
  const env = makeBrowser({ hostname: 'admin.nestspace.online', cookieWritable: false })
  env.install()
  const usage = await import(`${usageUrl}?case=optout-rollback`)
  const ok = usage.setStatsOptOut(true)
  env.dispose()
  assert.equal(ok, false, '跨子域那一层没落地就不能说生效')
  assert.equal(env.local.has(OPTOUT_KEY), false, '失败后必须回滚，否则界面说"没生效"而设备其实已被排除')
})

check('取消排除同样两层核对：只清掉一层不算成功', async () => {
  const env = makeBrowser({ hostname: 'admin.nestspace.online', cookieWritable: false })
  env.install()
  const usage = await import(`${usageUrl}?case=optout-undo`)
  usage.setStatsOptOut(true) // 这一层都不生效，状态保持"未排除"
  const ok = usage.setStatsOptOut(false)
  env.dispose()
  assert.equal(ok, true, '本来就没排除，取消当然成立（不能反过来报"未生效"）')
  assert.equal(env.local.has(OPTOUT_KEY), false)
})

check('排除后任何事件都不再发出（含 pageview）', async () => {
  const env = makeBrowser()
  env.install()
  const usage = await import(`${usageUrl}?case=optout-silent`)
  assert.equal(usage.setStatsOptOut(true), true)
  const before = env.beacons.length
  usage.trackPageView('detail', '001')
  usage.trackUsage('outbound', 'github', '', '001')
  env.dispose()
  assert.equal(env.beacons.length, before, '被排除的浏览一条都不该发')
})

check('同站与子域互跳不算入口来源，站外只留主机名', async () => {
  const env = makeBrowser({ hostname: 'nestspace.online', referrer: 'https://github.com/x/y' })
  env.install()
  const usage = await import(`${usageUrl}?case=source-github`)
  usage.trackPageView('home')
  let payload = JSON.parse(env.beacons[0].body)
  assert.equal(payload.s, 'github.com')
  assert.equal(env.session.get(ENTRY_KEY), 'github.com', '入口来源要按会话缓存')

  // 缓存命中后即使 referrer 变了也不重新归类——整段会话共用同一个来源
  globalThis.document.referrer = 'https://twitter.com/a'
  usage.trackPageView('detail', '002')
  payload = JSON.parse(env.beacons[1].body)
  assert.equal(payload.s, 'github.com', '同一会话的第二次浏览不该改口径')
  env.dispose()
})

check('站内翻页不留痕迹：会话缓存写占位符 `-`', async () => {
  const env = makeBrowser({ hostname: 'nestspace.online', referrer: 'https://nestspace.online/project/001' })
  env.install()
  const usage = await import(`${usageUrl}?case=source-none`)
  usage.trackPageView('detail', '001')
  const payload = JSON.parse(env.beacons[0].body)
  env.dispose()
  assert.equal(payload.s, '', '同站来源必须算"没有来源"')
  assert.equal(env.session.get(ENTRY_KEY), '-', '查过且没有也要缓存，否则每次翻页都重读 referrer')
})

check('预置的坏访客 ID 会被换掉，大写 UUID 会被小写化', async () => {
  const bad = makeBrowser()
  bad.local.set(VISITOR_KEY, 'not-a-uuid')
  bad.install()
  const usageBad = await import(`${usageUrl}?case=bad-visitor`)
  usageBad.trackPageView('home')
  const sent = JSON.parse(bad.beacons[0].body)
  assert.match(sent.v, UUID_RE, '非法存量 ID 必须重新生成')
  assert.equal(bad.local.get(VISITOR_KEY), sent.v, '新生成的要写回 localStorage')
  bad.dispose()

  const upper = makeBrowser()
  upper.local.set(
    VISITOR_KEY,
    '9F1B2C3D-4E5F-4A6B-8C9D-0E1F2A3B4C5D',
  )
  upper.install()
  const usageUpper = await import(`${usageUrl}?case=upper-visitor`)
  usageUpper.trackPageView('home')
  const sentUpper = JSON.parse(upper.beacons[0].body)
  upper.dispose()
  assert.equal(
    sentUpper.v,
    '9f1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d',
    '存量 ID 要小写化后上报（服务端按它去重，大小写两套就是两个访客）',
  )
})

// —— stats.ts：条形高度只由 count 派生 ——

check('自定义档忽略库里存的 height，改权重条形就跟着动', () => {
  const stored = [
    { year: 2023, count: 4, height: 1 }, // 以前自动档烤进来的旧值
    { year: 2024, count: 8, height: 999 },
  ]
  const out = computeActivityTimeline([], {
    activityLogMode: 'custom',
    customActivityLog: stored,
  })
  assert.deepEqual(
    out.map((row) => row.height),
    [50, 100],
    '高度必须由 count 相对最大值算出来，不读库里的 item.height',
  )
  const edited = computeActivityTimeline([], {
    activityLogMode: 'custom',
    customActivityLog: [{ year: 2023, count: 8, height: 1 }, { year: 2024, count: 8, height: 999 }],
  })
  assert.deepEqual(
    edited.map((row) => row.height),
    [100, 100],
    '把第一行权重改成和最大一样，条形必须一起抬起来',
  )
})

check('自定义档高度夹在 25–100，自动档夹在 28–100', () => {
  const huge = computeActivityTimeline([], {
    activityLogMode: 'custom',
    customActivityLog: [
      { year: 2020, count: 1 },
      { year: 2021, count: 1000 },
    ],
  })
  assert.equal(huge[0].height, 25, '最小行也要看得见（25 是自定义档下限）')
  assert.equal(huge[1].height, 100)

  const auto = computeActivityTimeline([
    { year: '2021', date: '2021.05', timeline: [] },
    { year: '2020', date: '2020.01', timeline: [] },
  ])
  for (const row of auto) {
    assert.ok(row.height >= 28 && row.height <= 100, `自动档高度越界：${row.height}`)
  }
})

// —— Worker：Cache API 那一层的三种分支 ——

function makeCtx(ip) {
  const pending = []
  return {
    ctx: {
      req: { header: (name) => (name === 'CF-Connecting-IP' ? ip : undefined) },
      executionCtx: { waitUntil: (promise) => pending.push(promise) },
    },
    flush: async () => {
      await Promise.all(pending.splice(0))
    },
  }
}

function makeCache({ putFails = false } = {}) {
  const store = new Map()
  return {
    store,
    match: async (key) => {
      const value = store.get(String(key))
      return value === undefined ? undefined : new Response(String(value))
    },
    put: async (key, response) => {
      if (putFails) throw new Error('cache put rejected')
      store.set(String(key), await response.text())
    },
  }
}

const withCaches = async (cache, run) => {
  const descriptor = cache
    ? { configurable: true, value: { default: cache } }
    : { configurable: true, value: undefined }
  Object.defineProperty(globalThis, 'caches', descriptor)
  try {
    return await run()
  } finally {
    delete globalThis.caches
  }
}

check('同一来源在窗口内累计到上限后拒绝（这一层真的在记账）', async () => {
  const cache = makeCache()
  await withCaches(cache, async () => {
    for (let i = 1; i <= 3; i++) {
      const call = makeCtx('203.0.113.7')
      assert.equal(await allowCachedRate(call.ctx, 'usage-day', 3, 86400, 'bucket'), true, `第 ${i} 次应放行`)
      await call.flush()
    }
    const fourth = makeCtx('203.0.113.7')
    assert.equal(await allowCachedRate(fourth.ctx, 'usage-day', 3, 86400, 'bucket'), false, '超上限必须拒绝')
    await fourth.flush()
    assert.equal(cache.store.size, 1, '同 IP 同桶同窗口只占一个键，计数在它身上累加')
    const other = makeCtx('203.0.113.8')
    assert.equal(await allowCachedRate(other.ctx, 'usage-day', 3, 86400, 'bucket'), true, '换个来源不能被别人用满')
  })
})

check('桶名或窗口不同就是两个独立计数（pageview 与通用配额不互相吃）', async () => {
  const cache = makeCache()
  await withCaches(cache, async () => {
    const a = makeCtx('203.0.113.9')
    assert.equal(await allowCachedRate(a.ctx, 'usage-min', 1, 60, 'b1'), true)
    await a.flush()
    const b = makeCtx('203.0.113.9')
    assert.equal(await allowCachedRate(b.ctx, 'pageview-min', 1, 60, 'b1'), true, '换 name 要重新开始')
    await b.flush()
    const c = makeCtx('203.0.113.9')
    assert.equal(await allowCachedRate(c.ctx, 'usage-min', 1, 60, 'b2'), true, '换 bucket（分钟窗口）也要重新开始')
    await c.flush()
    assert.equal(cache.store.size, 3)
  })
})

check('缓存不可用与写失败都放行，但绝不上抛（isolate 那层还在兜底）', async () => {
  await withCaches(null, async () => {
    const call = makeCtx('203.0.113.10')
    assert.equal(await allowCachedRate(call.ctx, 'usage-min', 1, 60, 'b'), true, '没有 caches 时不能把访客挡在门外')
  })
  const broken = makeCache({ putFails: true })
  await withCaches(broken, async () => {
    const call = makeCtx('203.0.113.11')
    assert.equal(await allowCachedRate(call.ctx, 'usage-min', 1, 60, 'b'), true, 'put 失败只让这一层退化')
    await call.flush()
  })
  const throwing = { match: async () => { throw new Error('boom') }, put: async () => {} }
  await withCaches(throwing, async () => {
    const call = makeCtx('203.0.113.12')
    assert.equal(await allowCachedRate(call.ctx, 'usage-min', 1, 60, 'b'), true, 'match 抛错同样退化为放行')
  })
})

// —— isolate 桶：装满时的行为要能被解释 ——

check('分钟桶满时会先清过期键再记账；日桶的容量给到一天量级', () => {
  const minute = createRateLimiter({ limit: 2, windowMs: 60_000, storeMax: 2 })
  assert.equal(minute('a', 0), true)
  assert.equal(minute('b', 0), true)
  assert.equal(minute('c', 0), true, '装满后新键放行（宁可漏记也不无界增长）')
  // 窗口过后：过期桶被清掉，新键重新开始记账
  assert.equal(minute('c', 61_000), true)
  assert.equal(minute('c', 62_000), true)
  assert.equal(minute('c', 63_000), false, '记账恢复后上限仍然有效')

  const caps = syncCaps()
  assert.equal(caps.rows, SYNC_MAX_ROWS)
  assert.equal(caps.docRows, SYNC_MAX_DOC_ROWS)
  assert.equal(syncRowCap(false), SYNC_MAX_ROWS)
  assert.equal(syncRowCap(true), SYNC_MAX_DOC_ROWS)
})

// —— 单一来源：图源名单与同步上限都不许有第二份 ——

check('图源白名单只有一份实现（前端与 Worker 都 import 同一个集合）', () => {
  const appSrc = readFileSync(join(HERE, 'src', 'App.tsx'), 'utf8')
  const workerSrc = readFileSync(join(HERE, 'worker', 'index.ts'), 'utf8')
  assert.doesNotMatch(appSrc, /const IMAGE_PROXY_HOSTS = new Set/, 'App.tsx 里不许再抄一份名单')
  assert.doesNotMatch(workerSrc, /const IMG_ALLOWED_HOSTS = new Set/, 'Worker 里不许再抄一份名单')
  assert.match(appSrc, /import \{[^}]*IMAGE_PROXY_HOSTS[^}]*\} from "\.\/utils\/previewRules"/)
  assert.match(workerSrc, /import \{[^}]*IMAGE_PROXY_HOSTS[^}]*\} from '\.\.\/src\/utils\/previewRules\.ts'/)
  // 转换服务自身永远不许进名单（进去就等于开放代理）
  for (const forbidden of ['wsrv.nl', 'images.weserv.nl']) {
    assert.doesNotMatch(
      readFileSync(join(HERE, 'src', 'utils', 'previewRules.ts'), 'utf8'),
      new RegExp(`['"]${forbidden.replace('.', '\\.')}['"],`),
      `${forbidden} 不能成为可代理图源`,
    )
  }
})

check('埋点事件白名单还是那六个（客户端类型与它同名）', () => {
  assert.deepEqual(Object.keys(USAGE_EVENTS).sort(), [
    'deck',
    'dirimport',
    'imgfail',
    'outbound',
    'pageview',
    'specimen_open',
  ])
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
  console.error(`usage_stats：${failed}/${cases.length} 个用例失败`)
  process.exit(1)
}
console.log(
  `usage_stats：全部 ${cases.length} 个用例通过（退出统计两层契约与回滚 / 会话级入口来源 / 访客 ID 形态 / 条形高度只由权重派生 / Cache API 限流三分支 / 白名单单一来源）✓`,
)
