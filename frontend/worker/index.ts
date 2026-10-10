import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getCookie } from 'hono/cookie'
// 相册判据的唯一来源。用带 .ts 后缀的说明符是刻意的：闸门测试在 Node 里直接 import 本文件
// （type stripping），无后缀的说明符在 Node ESM 下解析不到；worker/tsconfig.json 因此开了
// allowImportingTsExtensions。管理端表单的即时校验必须走同一份规则，否则会出现
// "前端说不违法、保存却 400"——那是本项目在后台明令禁止的假状态。
// 本文件仍再导出 sanitizeImageUrl，闸门测试既有的 import 路径因此不必改。
import { PREVIEW_IMAGE_LIMIT, sanitizeImageUrl } from '../src/utils/previewRules.ts'
// 双语字段（挑战/方案）的读侧规则，与前台/管理端共用同一份（旧单列只读兜底）
import { asBilingual, pairFromSingleText } from '../src/utils/bilingual.ts'

// 环境变量与 D1 数据库绑定定义
type Env = {
  Bindings: {
    DB: D1Database
    // 管理员 Bearer 密钥（经 wrangler secret 注入，绝不写入代码）
    ADMIN_SECRET_KEY?: string
    // Cloudflare Zero Trust 团队名（即 <team>.cloudflareaccess.com 的 <team> 部分）。
    // 与 ACCESS_AUD_TAG 成对配置后，管理端将额外校验 Cloudflare Access 签发的 JWT。
    ACCESS_TEAM_NAME?: string
    // Zero Trust Access 应用详情页中的 AUD Tag
    ACCESS_AUD_TAG?: string
    // 可选：公开 API 跨域白名单（逗号分隔的完整 origin，如 "https://example.com"）
    ALLOWED_ORIGINS?: string
    // 可选：允许经 Access JWT 进入管理端的身份白名单（逗号分隔的邮箱或 sub）。
    // 配置后，Access 政策放行的其他身份一律拒绝；未配置则仅依赖 Access 应用自身策略。
    ACCESS_ALLOWED_EMAILS?: string
    // 静态资产绑定（wrangler.toml [assets].binding）：用于取回首页 HTML 做 SEO 注入
    ASSETS: Fetcher
    // 匿名使用度量（Analytics Engine 数据集 nestspace_usage，见 wrangler.toml）。
    // 声明为可选：本地精简配置或绑定缺失时埋点整条降级为 no-op，不能因此让请求 500。
    METRICS?: AnalyticsEngineDataset
  }
}

// 项目状态白名单：防止写入垃圾状态导致项目从公开接口静默消失
const ALLOWED_STATUSES = ['LIVE', 'BETA', 'DRAFT', 'ARCHIVED']

// 列表类查询统一上限：当前馆藏规模远低于此值，仅作为 Worker 内存与响应体量的安全阀
const QUERY_ROW_LIMIT = 500

// API 子应用（挂在 /api 下）
const app = new Hono<Env>()

// ==========================================
// 0. 全局安全响应头
// 静态资产的 _headers 不覆盖 Worker 响应，
// 因此在此统一为 /api 响应补齐基础防护头。
// ==========================================
const API_SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
}

app.use('*', async (c, next) => {
  await next()
  for (const [name, value] of Object.entries(API_SECURITY_HEADERS)) {
    c.res.headers.set(name, value)
  }
})

// 处理函数抛错时 Hono 会直接产出错误响应，上面的收尾逻辑不会执行，
// 因此在 onError 里补上同一套防护头，避免异常响应缺少安全头。
app.onError((err, c) => {
  console.error('Unhandled API error:', err)
  return c.json({ error: 'Internal Server Error' }, 500, API_SECURITY_HEADERS)
})

// ==========================================
// 1. 公开端接口（只读，数据严格脱敏，防投毒防泄密）
// ==========================================

// CORS：站点自身为同源相对路径请求，默认无需跨域头；
// 需要开放第三方调用时，通过 ALLOWED_ORIGINS 环境变量配置白名单。
// 管理端路由（/api/admin/*）不注册 CORS，仅允许同源调用。
const publicCors = cors({
  origin: (origin, c) => {
    const allowList = String(
      (c.env as unknown as Record<string, string | undefined>).ALLOWED_ORIGINS ?? '',
    )
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
    return allowList.includes(origin) ? origin : undefined
  },
  allowMethods: ['GET', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
  maxAge: 600,
})
app.use('/projects', publicCors)
app.use('/projects/*', publicCors)

// 获取公开项目列表（仅已发布的 LIVE 和 BETA）
app.get('/projects', async (c) => {
  if (!allowPublicRead(clientIpOf(c), Date.now())) {
    return c.json({ error: '请求过于频繁，请稍后再试' }, 429, { 'Retry-After': '60' })
  }
  try {
    // 强制参数化查询，绝不 SELECT *，坚决排除 internal_notes 等敏感管理字段
    const query = `
      SELECT
        id, date, status, name, cn, latin, habitat, type, language,
        stars, year, shape, version, updated, repository, license, challenge, solution,
        challenge_json, solution_json,
        demo_url, demo_enabled,
        description_json, features_json, metrics_json, timeline_json, preview_image_url, preview_images_json
      FROM projects
      WHERE status IN ('LIVE', 'BETA')
      ORDER BY sort_order ASC, date DESC
      LIMIT ${QUERY_ROW_LIMIT}
    `
    const { results } = await c.env.DB.prepare(query).all()

    const formatted = results.map((row: any) => {
      const demoEnabled = row.demo_enabled === 1
      return {
        id: row.id,
        date: row.date,
        status: row.status,
        name: row.name,
        cn: row.cn,
        latin: row.latin || '',
        habitat: row.habitat,
        type: row.type,
        language: row.language,
        stars: row.stars || '0',
        year: row.year,
        shape: row.shape,
        version: row.version,
        updated: row.updated,
        repository: row.repository || '',
        // 开源协议：管理端填写（GitHub 同步只填空），留空则前台不显示任何协议字样
        license: row.license || '',
        // 演示入口：未上线时不下发地址，避免未公开的演示链接外泄
        demoEnabled,
        demoUrl: demoEnabled ? row.demo_url || '' : '',
        challenge: asBilingual(row.challenge_json, row.challenge),
        solution: asBilingual(row.solution_json, row.solution),
        description: asBilingual(row.description_json),
        features: safeJsonParse(row.features_json, []),
        metrics: safeJsonParse(row.metrics_json, []),
        timeline: safeJsonParse(row.timeline_json, []),
        // 列表也带相册：ProjectRoute 会先拿列表项当初始值渲染详情页，
        // 只给封面会让相册在详情到达前短暂只显示一张（无导航）
        ...publicGallery(row),
      }
    })

    return c.json(formatted)
  } catch (err: any) {
    console.error('Error fetching public projects:', err)
    return c.json({ error: 'Failed to retrieve projects' }, 500)
  }
})

// 查询单个公开项目详情
app.get('/projects/:id', async (c) => {
  const id = c.req.param('id')
  // 与列表同一个桶：一次浏览 = 列表 + 站点文案 + 详情 三条，240/分钟留了八十次浏览的余量
  if (!allowPublicRead(clientIpOf(c), Date.now())) {
    return c.json({ error: '请求过于频繁，请稍后再试' }, 429, { 'Retry-After': '60' })
  }
  try {
    const row: any = await c.env.DB.prepare(`
      SELECT
        id, date, status, name, cn, latin, habitat, type, language,
        stars, year, shape, version, updated, repository, license, challenge, solution,
        challenge_json, solution_json,
        demo_url, demo_enabled,
        description_json, features_json, metrics_json, timeline_json,
        readme_zh, readme_en, compose_dev, compose_prod, docs_synced_at, preview_image_url, preview_images_json
      FROM projects
      WHERE id = ? AND status IN ('LIVE', 'BETA')
    `).bind(id).first()

    if (!row) {
      return c.json({ error: 'Project not found' }, 404)
    }

    const demoEnabled = row.demo_enabled === 1

    return c.json({
      id: row.id,
      date: row.date,
      status: row.status,
      name: row.name,
      cn: row.cn,
      latin: row.latin || '',
      habitat: row.habitat,
      type: row.type,
      language: row.language,
      stars: row.stars || '0',
      year: row.year,
      shape: row.shape,
      version: row.version,
      updated: row.updated,
      repository: row.repository || '',
      // 开源协议：管理端填写（GitHub 同步只填空），留空则前台不显示任何协议字样
      license: row.license || '',
      // 与列表接口同口径：未上线时不下发演示地址
      demoEnabled,
      demoUrl: demoEnabled ? row.demo_url || '' : '',
      challenge: asBilingual(row.challenge_json, row.challenge),
      solution: asBilingual(row.solution_json, row.solution),
      description: asBilingual(row.description_json),
      features: safeJsonParse(row.features_json, []),
      metrics: safeJsonParse(row.metrics_json, []),
      timeline: safeJsonParse(row.timeline_json, []),
      readmeZh: row.readme_zh ?? '',
      readmeEn: row.readme_en ?? '',
      composeDev: row.compose_dev ?? '',
      composeProd: row.compose_prod ?? '',
      docsSyncedAt: row.docs_synced_at ?? '',
      ...publicGallery(row),
    })
  } catch (err: any) {
    return c.json({ error: 'Failed to retrieve project detail' }, 500)
  }
})

// ==========================================
// 1.5 图片代理（同源 /api/img）
// ==========================================
// 相册里的图都在站外（GitHub raw 等），原图常见几百 KB 的 PNG；而 Workers 运行时装不了
// 图片解码器、Cloudflare 自带的 Image Resizing 又要付费。这里借免费的转换服务把图压成 webp
// 再回给浏览器，并把结果留在边缘缓存：每个「源图 × 宽度」在每个边缘节点只真的转换一次。
// 只代理白名单图源，名单外一律 404（不是 302 转发——那等于多开一条开放重定向，也就会被拿去当图床）；
// 白名单内的图若转换服务抖动/限流/超时，才 302 回原图作为兜底。
const IMG_WIDTH_MIN = 64
const IMG_WIDTH_MAX = 2000
const IMG_WIDTH_DEFAULT = 1600
const IMG_SRC_MAX_LENGTH = 2048
const IMG_UPSTREAM_TIMEOUT_MS = 15_000
// 源图 URL 用的是分支（内容可能变），所以给有界 TTL 而不是 immutable。
// 不写 stale-while-revalidate：Cache API 的 put/match 不支持它，写了也是空承诺。
const IMG_CACHE_CONTROL = 'public, max-age=604800'
/** 允许经代理**同源直出**的图片类型（栅格）。SVG 等矢量是活动内容，不能同源返回 */
const RASTER_IMAGE_TYPE_RE = /^image\/(png|jpe?g|webp|gif|avif|bmp)$/i

// 只代理真实的图源主机。**绝不要把转换服务自身（wsrv.nl）列进来**：
// 那等于开放 `/api/img?src=https://wsrv.nl/?url=<任意地址>`，白名单会被绕开，
// 还会把任意内容缓存到我们自己的边缘缓存里。
const IMG_ALLOWED_HOSTS = new Set([
  'raw.githubusercontent.com',
  'user-images.githubusercontent.com',
  'camo.githubusercontent.com',
  'objects.githubusercontent.com',
  'github.com',
  'cdn.jsdelivr.net',
])

/** 宽度参数规范化：缺失或非法用默认值，并夹到 [MIN, MAX] */
export function normalizeImageWidth(raw: unknown): number {
  const value = Number(Array.isArray(raw) ? raw[0] : raw)
  if (!Number.isFinite(value)) return IMG_WIDTH_DEFAULT
  return Math.min(IMG_WIDTH_MAX, Math.max(IMG_WIDTH_MIN, Math.round(value)))
}

/** 是否允许经转换服务代理的图源主机 */
export function isProxyableImageHost(host: unknown): boolean {
  return IMG_ALLOWED_HOSTS.has(String(host ?? '').trim().toLowerCase())
}

/** 构造免费转换服务的地址（统一压成 webp + 指定宽度） */
export function buildWeservUrl(src: string, width: number): string {
  const params = new URLSearchParams({ url: src, w: String(width), output: 'webp', q: '82' })
  return `https://wsrv.nl/?${params.toString()}`
}

app.get('/img', async (c) => {
  // 未命中缓存时每次都要 Worker 去上游取图并转码，是本站最贵的一个端点——先按 IP 粗拦一层
  if (!allowImageRequest(clientIpOf(c), Date.now())) {
    return c.text('Too Many Requests', 429, { 'Retry-After': '60' })
  }
  const rawSrc = c.req.query('src') ?? ''
  if (!rawSrc || rawSrc.length > IMG_SRC_MAX_LENGTH) {
    return c.text('Invalid image source', 400)
  }
  let target: URL
  try {
    target = new URL(rawSrc)
  } catch {
    return c.text('Invalid image source', 400)
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return c.text('Invalid image source', 400)
  }
  // 非白名单图源：拒绝，而不是 302 到调用方给的目标——那会把本站变成开放重定向
  // （钓鱼与绕过过滤器的常见跳板）。前端也只对本名单内的主机走这个代理。
  if (!isProxyableImageHost(target.hostname)) {
    return c.text('Image host not allowed', 404)
  }

  const width = normalizeImageWidth(c.req.query('w'))
  const upstream = buildWeservUrl(target.toString(), width)
  const cache = typeof caches === 'undefined' ? undefined : caches.default
  const cacheKey = new Request(upstream, { method: 'GET' })
  if (cache) {
    const cached = await cache.match(cacheKey)
    // 缓存命中的响应头是只读的，直接返回会让全局安全头中间件设置失败（500），
    // 因此这里重新包一层可写头部的 Response
    if (cached) {
      return new Response(cached.body, {
        status: cached.status,
        headers: new Headers(cached.headers),
      })
    }
  }

  try {
    const res = await fetch(upstream, {
      headers: { accept: 'image/webp,image/*,*/*' },
      signal: AbortSignal.timeout(IMG_UPSTREAM_TIMEOUT_MS),
    })
    const contentType = res.headers.get('Content-Type') ?? ''
    // 只放行**栅格**类型：上游若回 image/svg+xml 而我们同源直出，那就是同源 XSS。
    // 非栅格、或上游非 200，一律兜底回原图（跨源加载所以安全；目标已过白名单，不是开放重定向）。
    const raster = RASTER_IMAGE_TYPE_RE.test(contentType.split(';')[0].trim())
    if (!res.ok || !raster) {
      return c.redirect(target.toString(), 302)
    }
    const response = new Response(res.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': IMG_CACHE_CONTROL,
        'X-Image-Source': 'wsrv',
      },
    })
    if (cache) {
      try {
        c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()))
      } catch {
        // 某些运行环境没有 executionCtx（此时缓存写入静默跳过，不影响本次响应）
      }
    }
    return response
  } catch {
    return c.redirect(target.toString(), 302)
  }
})

// ==========================================
// 1b. 匿名使用度量（Analytics Engine）
// ==========================================
// 为什么要这一条：本轮改版（观察台 + 批量导入）此前没有任何度量，"有没有让人多看几张图"
// "批量导入是否真的减少了手工粘贴"都无法回答。这里只收三类聚合事件，**不落 D1、不需要迁移、
// 不存 IP/UA/cookie/项目 id 以外的任何个人数据**，免费额度每天 10 万个数据点（约合每月 300 万）远够用。
// 查询：npx wrangler analytics query nestspace_usage（或在 Cloudflare 控制台 Analytics Engine 看）。
// 绑定缺失时整条降级为 no-op——埋点永远不该让一次页面访问失败。

/** 事件名 → 允许的 m（方式）取值。不在表里的组合一律 400，避免脏数据把数据集写花 */
export const USAGE_EVENTS: Record<string, readonly string[]> = {
  // 观察台：一次相册首屏 + 每次翻页（按触发方式区分，用来判断缩略图索引是否真的有用）
  // plate = 点侧牌选张，thumb = 点索引条缩略图跳张
  deck: ['view', 'thumb', 'plate', 'arrow', 'drag', 'key', 'zoom'],
  // 代理取图失败（h 为图源主机名）：分母用 deck view，回答"图片加载失败率"
  imgfail: [],
  // 后台按目录批量导入的结果
  dirimport: ['ok', 'ratelimited', 'notfound', 'error'],
  // 转化漏斗三问（本轮产品审查补的：以前连"有没有人点进仓库"都答不了）
  // 看了哪个页面
  pageview: ['home', 'detail', 'admin'],
  // 从哪个位置打开某件标本（r=标本编号）：回答"哪一段在带量"
  specimen_open: ['card', 'index', 'related', 'footer'],
  // 真的走出站了吗（r=标本编号）：分子，配 specimen_open 得出转化率
  outbound: ['github', 'demo'],
}

/** 允许随事件带的项目引用形态（标本编号，如 001 / my-tool）；不符就当没给 */
const REFERENCE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/

const USAGE_RATE_LIMIT = 120
const USAGE_RATE_WINDOW_MS = 60 * 1000
const USAGE_STORE_MAX = 2000
const USAGE_BODY_MAX = 1024

/**
 * 公开端点的按 IP 限流（**尽力而为**）。
 *
 * 计数只活在当前 isolate 里：Cloudflare 会把请求散到很多 isolate 与机房，所以它挡的是
 * "同一来源的脚本化连打"，不是分布式压力——那种只能靠 Cloudflare 侧的速率限制规则（见部署指南）。
 * 仍然值得有的理由：`/api/img` 每次缓存未命中都要 Worker 去上游取图并转码，被脚本刷就是直接烧配额；
 * 公开读接口也一样（每次都是 D1 查询）。窗口一到整桶重置，不做滑动窗口：简单、可解释、可测。
 */
type RateBucket = { count: number; firstAt: number }

export function createRateLimiter(options: {
  limit: number
  windowMs: number
  storeMax: number
}): (key: string, now: number) => boolean {
  const buckets = new Map<string, RateBucket>()

  /** 只清过期桶；以前是超容量就 clear() 全清，等于让攻击者用新 IP 把所有人的计数一起抹掉 */
  const evictExpired = (now: number) => {
    for (const [key, bucket] of buckets) {
      if (now - bucket.firstAt > options.windowMs) buckets.delete(key)
    }
  }

  return function allow(key: string, now: number): boolean {
    const bucket = buckets.get(key)
    if (!bucket || now - bucket.firstAt > options.windowMs) {
      if (buckets.size >= options.storeMax) evictExpired(now)
      // 淘汰后仍然满（极端并发）：放行这一条但不再记账，宁可不限流也不无界增长
      if (buckets.size < options.storeMax) buckets.set(key, { count: 1, firstAt: now })
      return true
    }
    bucket.count += 1
    return bucket.count <= options.limit
  }
}

const allowUsageEvent = createRateLimiter({
  limit: USAGE_RATE_LIMIT,
  windowMs: USAGE_RATE_WINDOW_MS,
  storeMax: USAGE_STORE_MAX,
})

// 两个公开读接口共用一个桶：一次页面浏览就是两条（列表 + 站点文案），
// 240/分钟 ≈ 每分钟 120 次浏览，正常访客碰不到，脚本连打几百次就会撞上
const PUBLIC_READ_RATE_LIMIT = 240
const PUBLIC_READ_WINDOW_MS = 60 * 1000
const allowPublicRead = createRateLimiter({
  limit: PUBLIC_READ_RATE_LIMIT,
  windowMs: PUBLIC_READ_WINDOW_MS,
  storeMax: USAGE_STORE_MAX,
})

// 图片：一页相册要十来张，给得更宽；被限的效果就是那张图裂掉，客户端本来就有 imgfail 埋点兜着
const IMG_RATE_LIMIT = 300
const IMG_RATE_WINDOW_MS = 60 * 1000
const allowImageRequest = createRateLimiter({
  limit: IMG_RATE_LIMIT,
  windowMs: IMG_RATE_WINDOW_MS,
  storeMax: USAGE_STORE_MAX,
})

const clientIpOf = (c: any): string => c.req.header('CF-Connecting-IP') ?? 'unknown'

const HOSTNAME_RE = /^[a-z0-9.-]{1,63}$/

app.post('/usage', async (c) => {
  if (!allowUsageEvent(clientIpOf(c), Date.now())) {
    // 静默丢弃：埋点被刷不该变成给访客的错误，也不该占满数据集
    return c.body(null, 204)
  }

  // 这是个公开无鉴权端点，不能让人用大 body 把 CPU/内存买走：
  // 有 Content-Length 就直接按声明拒（连读都不读），没声明才退回按真实字节数判断
  const declaredLength = Number(c.req.header('Content-Length') ?? '')
  if (Number.isFinite(declaredLength) && declaredLength > USAGE_BODY_MAX) {
    return c.json({ error: `请求体过大（上限 ${USAGE_BODY_MAX} 字节）` }, 413)
  }
  const text = await c.req.text()
  if (new TextEncoder().encode(text).byteLength > USAGE_BODY_MAX) {
    return c.json({ error: `请求体过大（上限 ${USAGE_BODY_MAX} 字节）` }, 413)
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return c.json({ error: '请求体不是合法的 JSON' }, 400)
  }
  const event = (raw as Record<string, unknown>)?.e
  // hasOwnProperty 而不是直接取下标：USAGE_EVENTS 是普通对象字面量，
  // 用下标判白名单会让 __proto__ / constructor / toString 这类原型键混进来（后者.includes 还会抛 500）
  if (typeof event !== 'string' || !Object.prototype.hasOwnProperty.call(USAGE_EVENTS, event)) {
    return c.json({ error: `未知事件：${String(event).slice(0, 32)}` }, 400)
  }
  const method = (raw as Record<string, unknown>)?.m
  if (method !== undefined && method !== '') {
    if (typeof method !== 'string' || !USAGE_EVENTS[event].includes(method)) {
      return c.json({ error: `事件 ${event} 不接受方式：${String(method).slice(0, 32)}` }, 400)
    }
  }
  const subject = (raw as Record<string, unknown>)?.h
  let host = ''
  if (typeof subject === 'string') {
    // 只收小写字母数字点横杠的主机名形态，其余（带路径 / 带查询 / 超长）当没给，不进数据集
    const lower = subject.trim().toLowerCase()
    if (HOSTNAME_RE.test(lower)) host = lower
  }
  // r = 项目引用（标本编号）。不是个人数据，且只收安全形态；不给就是空串，绝不收任意字符串
  const refInput = (raw as Record<string, unknown>)?.r
  const reference = typeof refInput === 'string' && REFERENCE_RE.test(refInput.trim()) ? refInput.trim() : ''

  try {
    c.env.METRICS?.writeDataPoint({
      blobs: [event, typeof method === 'string' ? method : '', host, reference],
      doubles: [1],
      indexes: [event],
    })
  } catch {
    // 写入失败不影响响应：度量丢一条比给前端报错好
  }
  return c.body(null, 204)
})

// ==========================================
// 2. 管理端安全接口（全量 CRUD，默认 fail-closed）
// ==========================================
// 鉴权模型（两条防线满足其一即可，均为代码层可信判定）：
//   防线 1：Bearer ADMIN_SECRET_KEY，常量时间比较，防时序侧信道；
//   防线 2（可选）：校验 Cloudflare Access 签发的 JWT（RS256 签名 + iss/aud/exp 核验）。
//
// 安全红线：Cf-Access-Authenticated-User-Email 等明文身份头可被客户端伪造，
// 在未被 Zero Trust 应用覆盖的入口（workers.dev / preview 域名等）完全不可信，
// 一律不作为鉴权凭据；身份只能来自经过签名验证的 Cf-Access-Jwt-Assertion
// 或 CF_Authorization Cookie 中的 JWT。
const adminApp = new Hono<Env>()

// 管理端响应绝不落入任何缓存
adminApp.use('*', async (c, next) => {
  await next()
  c.res.headers.set('Cache-Control', 'no-store')
})

// 管理端鉴权失败限流：同一来源连续失败过多则短暂封锁，抑制在线口令爆破与探测。
// 注意：计数器存活于当前 Worker isolate 内存中，属于"尽力而为"的抑制手段，
// 不能替代强口令；Cloudflare 侧仍建议叠加 WAF / Rate limiting 规则。
const AUTH_FAILURE_LIMIT = 10
const AUTH_FAILURE_WINDOW_MS = 10 * 60 * 1000
const AUTH_FAILURE_STORE_MAX = 500
const authFailures = new Map<string, { count: number; firstAt: number }>()

/**
 * 鉴权失败限流的键。只用 CF 边缘写入的 `CF-Connecting-IP`：
 * `X-Forwarded-For` 是客户端可伪造的，拿它当键 = 允许攻击者轮换键值绕过锁定、
 * 或把失败计数怼到别人头上。取不到就统一落一个桶（宁可少限流，也不给人可控的键）。
 */
function clientKey(c: any): string {
  return c.req.header('CF-Connecting-IP') || 'unknown'
}

function isLockedOut(key: string, now: number): boolean {
  const record = authFailures.get(key)
  if (!record) return false
  if (now - record.firstAt > AUTH_FAILURE_WINDOW_MS) {
    authFailures.delete(key)
    return false
  }
  return record.count >= AUTH_FAILURE_LIMIT
}

function noteAuthFailure(key: string, now: number) {
  const record = authFailures.get(key)
  if (!record || now - record.firstAt > AUTH_FAILURE_WINDOW_MS) {
    if (authFailures.size >= AUTH_FAILURE_STORE_MAX) {
      const oldest = [...authFailures.entries()].sort((a, b) => a[1].firstAt - b[1].firstAt)[0]
      if (oldest) authFailures.delete(oldest[0])
    }
    authFailures.set(key, { count: 1, firstAt: now })
    return
  }
  record.count += 1
}

/** 读取（已通过签名校验的）Access JWT 载荷，仅用于身份名单比对 */
function readJwtIdentity(jwt: string): { email?: string; sub?: string } | null {
  const parts = jwt.split('.')
  if (parts.length !== 3) return null
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])))
  } catch {
    return null
  }
}

/**
 * Access JWT 身份白名单校验。
 * 未配置白名单时返回 true（信任 Access 应用自身的策略）；配置后只放行名单内的邮箱或 sub。
 */
export function isAccessIdentityAllowed(
  identity: { email?: string; sub?: string } | null | undefined,
  allowedEmails: string | undefined,
): boolean {
  const allowList = String(allowedEmails ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
  // 名单未配置时**放行**：这条防线是"可选收紧"，不是主闸门——主闸门是 Access 应用策略，
  // 而 JWT 的 RS256 签名 + aud 已经保证身份确实来自**本应用**（伪造不了）。
  // 只有当 Access 应用比管理端更宽（一份政策盖多个应用 ⇒ 同一个 aud 下还有非管理员）时才需要填名单；
  // 否则填了只是同一份名单写两处，还多一个能把自己锁在外面的开关。
  if (allowList.length === 0) return true
  const email = String(identity?.email ?? '').trim().toLowerCase()
  const sub = String(identity?.sub ?? '').trim().toLowerCase()
  return Boolean((email && allowList.includes(email)) || (sub && allowList.includes(sub)))
}

adminApp.use('*', async (c, next) => {
  const key = clientKey(c)
  const now = Date.now()
  if (isLockedOut(key, now)) {
    return c.json(
      { error: '429 Too Many Requests: 鉴权失败次数过多，请稍后再试' },
      429,
      { 'Retry-After': String(Math.ceil(AUTH_FAILURE_WINDOW_MS / 1000)) },
    )
  }

  // CSRF 纵深：控制台在"已被 Access 放行、没输过口令"时是**纯 Cookie 认证**，
  // 此时一个跨站页面发出的简单请求（text/plain 属于 CORS 免预检类型）也会带上 CF_Authorization。
  // 要求写操作显式声明 application/json：跨站表单发不出这个类型，text/plain 的 JSON 走私也一并失效。
  // 带 Authorization 头的调用天然免疫 CSRF（跨站 JS 设不了这个头），所以两条防线互补。
  const method = c.req.method.toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') {
    const contentType = (c.req.header('Content-Type') ?? '').split(';')[0].trim().toLowerCase()
    if (contentType !== 'application/json') {
      return c.json({ error: '写操作需要 Content-Type: application/json' }, 415)
    }
  }

  // 防线 1：Bearer 密钥（常量时间比较）
  const authHeader = c.req.header('Authorization') ?? ''
  const providedSecret = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  const expectedSecret = c.env.ADMIN_SECRET_KEY ?? ''
  if (
    providedSecret &&
    expectedSecret &&
    (await timingSafeEqual(providedSecret, expectedSecret))
  ) {
    authFailures.delete(key)
    await next()
    return
  }

  // 防线 2：Cloudflare Access JWT（签名验证通过才放行）
  const teamName = c.env.ACCESS_TEAM_NAME
  const audTag = c.env.ACCESS_AUD_TAG
  if (teamName && audTag) {
    const jwt =
      c.req.header('Cf-Access-Jwt-Assertion') ?? getCookie(c, 'CF_Authorization') ?? ''
    if (jwt) {
      let verdict: { valid: boolean; reason?: string }
      try {
        verdict = await verifyAccessJwt(jwt, teamName, audTag)
      } catch (err) {
        console.error('Access JWT validation error:', err)
        verdict = { valid: false, reason: 'validation_error' }
      }
      if (verdict.valid) {
        const identity = readJwtIdentity(jwt)
        if (!isAccessIdentityAllowed(identity, c.env.ACCESS_ALLOWED_EMAILS)) {
          console.warn('Admin auth rejected: identity not in allowlist:', identity?.email)
          noteAuthFailure(key, now)
          return c.json({ error: '403 Forbidden: 该身份不在管理端允许名单内' }, 403)
        }
        authFailures.delete(key)
        await next()
        return
      }
      console.warn('Admin auth rejected via Access JWT:', verdict.reason)
    }
  }

  noteAuthFailure(key, now)
  return c.json({ error: '403 Forbidden: 管理端接口未授权访问' }, 403)
})

/** 读取 JSON 请求体：不可解析时返回 null，由调用方给 400，而不是抛错变成 500 */
async function readJsonBody(c: any): Promise<Record<string, any> | null> {
  try {
    const parsed = await c.req.json()
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, any>)
      : null
  } catch {
    return null
  }
}

// 管理端：获取全量项目（含草稿、归档、内部笔记）
adminApp.get('/projects', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT * FROM projects ORDER BY sort_order ASC, date DESC LIMIT ${QUERY_ROW_LIMIT}
    `).all()

    const formatted = results.map(adminProjectRow)

    return c.json(formatted)
  } catch (err: any) {
    console.error('Admin fetch error:', err)
    return c.json({ error: 'Failed to fetch admin projects' }, 500)
  }
})

// 管理端：新增项目
adminApp.post('/projects', async (c) => {
  try {
    const body = await readJsonBody(c)
    if (body === null) {
      return c.json({ error: '请求体不是合法的 JSON 对象' }, 400)
    }
    if (!body.id || !body.name || !body.status) {
      return c.json({ error: 'Missing required fields: id, name, status' }, 400)
    }
    // id 是主键、也是公开详情的路径参数：只判"存在"不够，限定字符集与长度（与仓库名同等对待）
    if (!/^[A-Za-z0-9._-]{1,32}$/.test(String(body.id))) {
      return c.json({ error: 'id 只允许字母/数字/点/下划线/连字符，长度 1–32' }, 400)
    }
    if (!ALLOWED_STATUSES.includes(body.status)) {
      return c.json(
        { error: `Invalid status, must be one of: ${ALLOWED_STATUSES.join(', ')}` },
        400,
      )
    }

    const demoUrl = normalizeDemoUrl(body.demoUrl)
    if (demoUrl === null) {
      return c.json({ error: '演示地址无效：仅支持 http/https 地址或域名' }, 400)
    }
    // 与 PUT 同判据：开关必须是布尔值。不能靠 `=== true` 把 "true" 之类静默降级成 0，
    // 那会一边回 201 一边在库里写 0（管理端显示"已上线"而库里是 0 的假状态）；
    // 且开关与地址是一对约束，开启前必须先有地址。
    if (body.demoEnabled !== undefined && typeof body.demoEnabled !== 'boolean') {
      return c.json({ error: 'demoEnabled 必须是布尔值' }, 400)
    }
    if (body.demoEnabled === true && !demoUrl) {
      return c.json({ error: '开启演示入口前必须先填写演示地址' }, 400)
    }
    const demoEnabled = body.demoEnabled === true ? 1 : 0

    // 预览图/相册：与 PUT 共用 validatePreviewInput 同一条规则，非法条目直接 400；
    // 两种拼写同时出现且内容不一致时先被 previewFieldsFromBody 挡下（不再猜哪一个）
    const previewFields = previewFieldsFromBody(body)
    if (previewFields.error) {
      return c.json({ error: previewFields.error }, 400)
    }
    const previewChecked = validatePreviewInput(previewFields.gallery, previewFields.cover)
    if (!previewChecked.ok) {
      return c.json({ error: previewChecked.error }, 400)
    }
    const previewImages = previewChecked.gallery
    const previewImageUrl = previewChecked.cover

    await c.env.DB.prepare(`
      INSERT INTO projects (
        id, date, status, name, cn, latin, habitat, type, language, stars, year, shape, version, updated, repository,
        demo_url, demo_enabled,
        challenge_json, solution_json, description_json, features_json, metrics_json, timeline_json, internal_notes, sort_order,
        preview_image_url, preview_images_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      body.id,
      body.date || new Date().toISOString().slice(0, 7).replace('-', '.'),
      body.status,
      body.name,
      body.cn || '',
      body.latin || '',
      body.habitat || 'Standard',
      body.type || 'App',
      body.language || 'TypeScript',
      body.stars || '0',
      body.year || new Date().getFullYear().toString(),
      body.shape || 'aperture',
      body.version || 'v1.0.0',
      body.updated || new Date().toISOString().slice(0, 10).replace(/-/g, '.'),
      body.repository || '',
      demoUrl,
      demoEnabled,
      normalizeJsonValue('challenge', body.challenge),
      normalizeJsonValue('solution', body.solution),
      normalizeJsonValue('description', body.description),
      // 与 PUT 共用同一份判据（列表列缺失/非数组都落成 "[]"，两条写路径不再落不同 JSON）
      normalizeJsonValue('features', body.features),
      normalizeJsonValue('metrics', body.metrics),
      normalizeJsonValue('timeline', body.timeline),
      body.internal_notes || '',
      body.sort_order || 0,
      previewImageUrl,
      JSON.stringify(previewImages),
    ).run()

    return c.json({ success: true, message: '项目创建成功' }, 201)
  } catch (err: any) {
    const typed = writeColumnErrorResponse(err)
    if (typed) return typed
    console.error('Admin create error:', err)
    return c.json({ error: 'Create failed' }, 500)
  }
})

// 管理端：更新项目（部分更新：仅覆盖请求体中出现的字段，避免漏传字段被写成 NULL）
// 可编辑列白名单：键为请求体字段名，值为数据库列名，杜绝任意列注入
/**
 * 管理端列表的行投影（唯一实现点，纯函数便于闸门测试）。
 *
 * 关键点：**必须保留 D1 的原始列名**（readme_zh / compose_dev / internal_notes / sort_order /
 * preview_image_url / preview_images_json …），因为编辑抽屉绑的就是这些名字；
 * 只加 camel 别名是不够的——公开列表接口返回的是 camel 投影，一旦管理端误用它，
 * 抽屉会整片空掉、README/Compose/相册看着"没数据"（本项目踩过）。
 * 因此 preview_frames/sync_update 测试里断言：本函数的输出键集 ⊇ EDITABLE_COLUMNS(+json 列+相册两列)。
 */
export function adminProjectRow(row: any) {
  return {
    ...row,
    // 管理端要原值供编辑；前端类型是布尔，D1 读回的是 0/1，必须在此转换
    demoEnabled: row.demo_enabled === 1,
    demoUrl: row.demo_url || '',
    // 管理端同样拿到 {en, zh} 完整形状（旧写法默认值是 {}，于是 description.en 可能是 undefined）
    description: asBilingual(row.description_json),
    // 挑战 / 方案：双语列优先，旧单列按中文兜底（与公开投影同一份规则）
    challenge: asBilingual(row.challenge_json, row.challenge),
    solution: asBilingual(row.solution_json, row.solution),
    features: safeJsonParse(row.features_json, []),
    metrics: safeJsonParse(row.metrics_json, []),
    timeline: safeJsonParse(row.timeline_json, []),
  }
}

export const EDITABLE_COLUMNS: Record<string, string> = {
  date: 'date',
  status: 'status',
  name: 'name',
  cn: 'cn',
  latin: 'latin',
  habitat: 'habitat',
  type: 'type',
  language: 'language',
  stars: 'stars',
  year: 'year',
  shape: 'shape',
  version: 'version',
  updated: 'updated',
  repository: 'repository',
  license: 'license',
  internal_notes: 'internal_notes',
  sort_order: 'sort_order',
  readme_zh: 'readme_zh',
  readme_en: 'readme_en',
  compose_dev: 'compose_dev',
  compose_prod: 'compose_prod',
}
export const EDITABLE_JSON_COLUMNS: Record<string, string> = {
  description: 'description_json',
  challenge: 'challenge_json',
  solution: 'solution_json',
  features: 'features_json',
  metrics: 'metrics_json',
  timeline: 'timeline_json',
}

/**
 * JSON 列落库前的归一化。**POST 与 PUT 必须共用它**——两条路径不一致就是本项目那条红线
 * （同一请求体在两条路径落库不同）。双语两列尤其不能直接 stringify：
 * 脚本/curl 传一个纯字符串过来时，原样存成 `"abc"`，下次读出来会带着一对引号进 UI。
 */
/** 列表型 JSON 列：合法值必须是数组，其余（undefined / null / 标量）一律落成空数组 */
const LIST_JSON_FIELDS = new Set(['features', 'metrics', 'timeline'])

export function normalizeJsonValue(field: string, value: unknown): string {
  if (field === 'challenge' || field === 'solution' || field === 'description') {
    return JSON.stringify(asBilingual(value))
  }
  // 与 POST 同一份判据：列表列不允许落成 "null"（读侧 JSON.parse 出来是 null 会让前端 .length 崩）
  if (LIST_JSON_FIELDS.has(field)) {
    return JSON.stringify(Array.isArray(value) ? value : [])
  }
  return JSON.stringify(value ?? null)
}

adminApp.put('/projects/:id', async (c) => {
  const id = c.req.param('id')
  try {
    const body = await readJsonBody(c)
    if (body === null) {
      return c.json({ error: '请求体不是合法的 JSON 对象' }, 400)
    }
    if (body.status !== undefined && !ALLOWED_STATUSES.includes(body.status)) {
      return c.json(
        { error: `Invalid status, must be one of: ${ALLOWED_STATUSES.join(', ')}` },
        400,
      )
    }

    const assignments: string[] = []
    const values: (string | number)[] = []
    for (const [field, column] of Object.entries(EDITABLE_COLUMNS)) {
      if (body[field] !== undefined) {
        assignments.push(`${column} = ?`)
        values.push(body[field])
      }
    }
    for (const [field, column] of Object.entries(EDITABLE_JSON_COLUMNS)) {
      if (body[field] !== undefined) {
        assignments.push(`${column} = ?`)
        values.push(normalizeJsonValue(field, body[field]))
      }
    }
    // 演示入口：地址规范化 + 开关与地址的一致性校验
    let demoUrlPatch: string | undefined
    if (body.demoUrl !== undefined) {
      const normalized = normalizeDemoUrl(body.demoUrl)
      if (normalized === null) {
        return c.json({ error: '演示地址无效：仅支持 http/https 地址或域名' }, 400)
      }
      demoUrlPatch = normalized
    }
    let demoEnabledPatch: number | undefined
    if (body.demoEnabled !== undefined) {
      if (typeof body.demoEnabled !== 'boolean') {
        return c.json({ error: 'demoEnabled 必须是布尔值' }, 400)
      }
      demoEnabledPatch = body.demoEnabled ? 1 : 0
    }
    if (demoUrlPatch !== undefined || demoEnabledPatch !== undefined) {
      // 部分更新：开关与地址是一对约束，需与当前行合成后再判定
      const current: any = await c.env.DB.prepare(
        'SELECT demo_url, demo_enabled FROM projects WHERE id = ?',
      ).bind(id).first()
      if (!current) {
        return c.json({ error: 'Project not found' }, 404)
      }
      const effectiveUrl = demoUrlPatch ?? (current.demo_url || '')
      const effectiveEnabled = demoEnabledPatch ?? (current.demo_enabled === 1 ? 1 : 0)
      if (effectiveEnabled === 1 && !effectiveUrl) {
        return c.json({ error: '开启演示入口前必须先填写演示地址' }, 400)
      }
    }
    if (demoUrlPatch !== undefined) {
      assignments.push('demo_url = ?')
      values.push(demoUrlPatch)
    }
    if (demoEnabledPatch !== undefined) {
      assignments.push('demo_enabled = ?')
      values.push(demoEnabledPatch)
    }
    // 预览图/相册：任一非法条目都要 400，绝不静默丢条后回成功（否则后台会出现假状态）。
    // 两列各自只在"请求体里出现"时才写，否则只改相册会把项目图片抹掉（部分更新语义）。
    // 两种拼写同时出现且内容不一致 → previewFieldsFromBody 直接 400，不再由服务端挑一个。
    const previewFields = previewFieldsFromBody(body)
    if (previewFields.error) {
      return c.json({ error: previewFields.error }, 400)
    }
    const galleryInBody = previewFields.gallery !== undefined
    const coverInBody = previewFields.cover !== undefined
    if (galleryInBody || coverInBody) {
      const checked = validatePreviewInput(
        galleryInBody ? previewFields.gallery : undefined,
        coverInBody ? previewFields.cover : undefined,
      )
      if (!checked.ok) {
        return c.json({ error: checked.error }, 400)
      }
      if (galleryInBody) {
        assignments.push('preview_images_json = ?')
        values.push(JSON.stringify(checked.gallery))
      }
      if (coverInBody) {
        assignments.push('preview_image_url = ?')
        values.push(checked.cover)
      }
    }
    if (assignments.length === 0) {
      return c.json({ error: 'No editable fields provided' }, 400)
    }
    assignments.push('updated_at = CURRENT_TIMESTAMP')
    values.push(id)

    const result = await c.env.DB.prepare(
      `UPDATE projects SET ${assignments.join(', ')} WHERE id = ?`,
    ).bind(...values).run()

    if ((result.meta.changes ?? 0) === 0) {
      return c.json({ error: 'Project not found' }, 404)
    }
    return c.json({ success: true, message: '项目更新成功' })
  } catch (err: any) {
    const typed = writeColumnErrorResponse(err)
    if (typed) return typed
    console.error('Admin update error:', err)
    return c.json({ error: 'Update failed' }, 500)
  }
})

// 管理端：删除项目
adminApp.delete('/projects/:id', async (c) => {
  const id = c.req.param('id')
  try {
    const result = await c.env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(id).run()
    if ((result.meta.changes ?? 0) === 0) {
      return c.json({ error: 'Project not found' }, 404)
    }
    return c.json({ success: true, message: '项目已删除' })
  } catch (err: any) {
    console.error('Admin delete error:', err)
    return c.json({ error: 'Delete failed' }, 500)
  }
})

// ==========================================
// GitHub 出网统一封装
// ==========================================
const GITHUB_FETCH_TIMEOUT_MS = 10_000

// 最近一次 GitHub 响应读到的剩余额度：用于界面提示，也让 403 的归因更准确
let lastRateLimitRemaining: number | null = null

/** 所有 GitHub 请求都走这里：带超时，并记录 X-RateLimit-Remaining */
async function ghFetch(url: string, headers: Record<string, string>): Promise<Response> {
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(GITHUB_FETCH_TIMEOUT_MS),
  })
  const remaining = res.headers.get('X-RateLimit-Remaining')
  if (remaining !== null && remaining !== '') {
    const parsed = Number(remaining)
    if (Number.isFinite(parsed)) lastRateLimitRemaining = parsed
  }
  return res
}

/** 区分"频率限制"与"该仓库被拒绝"：403 之外还看配额头与响应体，避免误报原因 */
async function isRateLimited(res: Response): Promise<boolean> {
  if (res.status === 429) return true
  if (res.status !== 403) return false
  if (lastRateLimitRemaining === 0) return true
  try {
    return /rate limit|abuse|secondary/i.test(await res.clone().text())
  } catch {
    return false
  }
}

/**
 * 仓库查重用的 LIKE 模式：**只转义 owner/repo 里的通配符，两端留作通配**。
 * 把两端的 % 也一起转义会得到字面量 `\%owner/repo\%`，命中 0 行、查重彻底失效
 * （踩过一次：重复导入检测形同虚设）。frontend/test/sync_update.test.mjs 有闸门盯着这个形状。
 */
export function buildRepoLikePattern(owner: string, repo: string): string {
  const escaped = `${owner}/${repo}`.replace(/[\\%_]/g, (ch) => `\\${ch}`)
  return `%${escaped}%`
}

/** 星数展示口径的唯一实现点：≥1000 用一位小数的 k，否则原样 */
export function formatStarCount(count: unknown): string {
  const value = typeof count === 'number' && Number.isFinite(count) && count > 0 ? count : 0
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value)
}

/** 仓库地址里带了主机名但不是 github.com（如 gitlab.com/owner/repo） */
export function isNonGithubHost(rawUrl: string | null | undefined): boolean {
  const cleaned = String(rawUrl ?? '')
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
  const host = cleaned.split('/')[0]?.toLowerCase() ?? ''
  return host.includes('.') && host !== 'github.com' && host !== 'www.github.com'
}

/** 解析 GitHub 仓库地址，兼容完整 HTTPS、HTTP、SSH、无协议格式以及缺冒号格式（如 https//github.com/owner/repo） */
export function parseGithubRepo(rawUrl: string | null | undefined): { owner: string; repo: string } | null {
  if (!rawUrl) return null
  const cleaned = rawUrl
    .trim()
    .replace(/^git@github\.com:/i, '')
    .replace(/^https?:\/\/?/i, '')
    .replace(/^https?\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '')
  // 带主机名时只认 github.com：其它站点（gitlab.com 等）返回 null，由调用方如实说明
  if (isNonGithubHost(cleaned)) return null
  const segments = cleaned.split('/').filter(Boolean)
  const hostLike = (segments[0] ?? '').toLowerCase() === 'github.com'
  const owner = hostLike ? segments[1] : segments[0]
  const repo = hostLike ? segments[2] : segments[1]
  if (!owner || !repo || !/^[A-Za-z0-9._-]+$/.test(owner) || !/^[A-Za-z0-9._-]+$/.test(repo)) {
    return null
  }
  if (owner === '.' || owner === '..' || repo === '.' || repo === '..') return null
  return { owner, repo }
}

/**
 * 规范化项目演示地址：无协议按 https 补全，仅放行 http/https；非法输入返回 null。
 * 返回值会进入公开页面的 href，因此必须在这里挡掉 javascript: / data: 等协议。
 * （导出仅供本地单元测试使用）
 */
export function normalizeDemoUrl(raw: unknown): string | null {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) return ''
  // 显式带了非 http/https 协议头（javascript: / data: / ftp: …）一律拒绝
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) return null
  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed.replace(/^\/+/, '')}`
  try {
    const parsed = new URL(candidate)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    if (!parsed.hostname) return null
    // 拒绝 "abc" 这类无点裸词，但保留 localhost 以便本地演示调试
    if (!parsed.hostname.includes('.') && parsed.hostname !== 'localhost') return null
    return parsed.toString()
  } catch {
    return null
  }
}

function getGithubHeaders(c: any, customToken?: string): Record<string, string> {
  const token =
    customToken ||
    c.req.header('X-GitHub-Token') ||
    (c.env as any).GITHUB_TOKEN
  const headers: Record<string, string> = {
    'User-Agent': 'NestSpace-Curator/1.0',
    Accept: 'application/vnd.github+json',
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

// 标本文档抓取：README 与 Docker Compose 编排。
// 单份内容截断到 MAX_DOC_CHARS，避免单行过大触及 D1 单行上限；文件缺失返回 null，不算错误。
const MAX_DOC_CHARS = 100000

const DOC_SOURCES = {
  readmeEn: [
    'README.en.md',
    'README_EN.md',
    'README.en-US.md',
    'README_en-US.md',
    'README_EN-US.md',
  ],
  readmeZh: [
    'README.zh.md',
    'README.zh-CN.md',
    'README_CN.md',
    'README.zh_CN.md',
    'README_zh-CN.md',
  ],
  composeDev: ['deploy/dev/docker-compose.yml', 'docker-compose.yml'],
  composeProd: ['deploy/prod/docker-compose.yml', 'docker-compose.prod.yml'],
} as const

// 通用 README 文件名：按内容是否含中文决定归属，避免把英文说明写进中文字段
const GENERIC_README_FILES = ['README.md', 'readme.md', 'Readme.md'] as const

/** 采样前 2000 字符统计中文字符数，用于判断 README 主体语言 */
function looksChinese(text: string): boolean {
  const cjk = text.slice(0, 2000).match(/[\u4e00-\u9fff]/g)
  return (cjk?.length ?? 0) >= 20
}

/** 以 raw 方式读取仓库内文本文件；不存在、为空或请求失败时返回 null */
async function fetchGithubRawFile(
  owner: string,
  repo: string,
  path: string,
  headers: Record<string, string>,
): Promise<string | null> {
  try {
    const res = await ghFetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      { ...headers, Accept: 'application/vnd.github.raw' },
    )
    if (!res.ok) return null
    const text = await res.text()
    if (!text.trim()) return null
    return text.length > MAX_DOC_CHARS
      ? `${text.slice(0, MAX_DOC_CHARS)}\n\n…（内容过长，已截断）`
      : text
  } catch {
    return null
  }
}

type ProjectDocs = {
  readmeZh: string
  readmeEn: string
  composeDev: string
  composeProd: string
}

/** 抓取一个仓库的 README（中/英）与 dev/prod Compose 编排 */
async function fetchProjectDocs(
  owner: string,
  repo: string,
  headers: Record<string, string>,
): Promise<ProjectDocs> {
  const docs: ProjectDocs = { readmeZh: '', readmeEn: '', composeDev: '', composeProd: '' }

  for (const path of DOC_SOURCES.readmeEn) {
    const text = await fetchGithubRawFile(owner, repo, path, headers)
    if (text) {
      docs.readmeEn = text
      break
    }
  }
  for (const path of DOC_SOURCES.readmeZh) {
    const text = await fetchGithubRawFile(owner, repo, path, headers)
    if (text) {
      docs.readmeZh = text
      break
    }
  }
  for (const path of GENERIC_README_FILES) {
    const text = await fetchGithubRawFile(owner, repo, path, headers)
    if (!text) continue
    if (looksChinese(text)) {
      if (!docs.readmeZh) docs.readmeZh = text
    } else if (!docs.readmeEn) {
      docs.readmeEn = text
    }
    break
  }
  for (const path of DOC_SOURCES.composeDev) {
    const text = await fetchGithubRawFile(owner, repo, path, headers)
    if (text) {
      docs.composeDev = text
      break
    }
  }
  for (const path of DOC_SOURCES.composeProd) {
    const text = await fetchGithubRawFile(owner, repo, path, headers)
    if (text) {
      docs.composeProd = text
      break
    }
  }
  return docs
}

// 预览图/相册：从 README 文本里取真实截图（跳过 shields.io 之类徽章与 SVG 图标）
const PREVIEW_BADGE_HINTS = [
  'shields.io',
  'badge',
  'badgen',
  'travis-ci',
  'codecov',
  'coveralls',
  'cirrus-ci',
  'appveyor',
  'buymeacoffee',
]

// 相册上限与单条地址判据的唯一来源是 src/utils/previewRules.ts（管理端表单即时校验用同一份）。
// 这里只再导出**函数**：workerd 不把数字常量当合法入口导出，实测启动即失败
// （"Incorrect type for map entry 'PREVIEW_IMAGE_LIMIT': the provided value is not of type
// function or ExportedHandler"）。上限的一致性改由闸门测试做行为断言（13 张必须被 400）。
export { sanitizeImageUrl }
/** 把 README 里的相对路径解析成 raw.githubusercontent 绝对地址；已是绝对 URL 的原样返回 */
export function resolveRepoAssetUrl(
  raw: string,
  owner: string,
  repo: string,
  defaultBranch?: string | null,
): string {
  const url = String(raw ?? '').trim()
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url
  if (/^\/\//.test(url)) return `https:${url}`
  // 内联/协议型资源一律不当作预览图
  if (/^(data|javascript|mailto|blob):/i.test(url) || url.startsWith('#')) return ''
  const branch = String(defaultBranch ?? '').trim() || 'main'
  const path = url.replace(/^\.\//, '').replace(/^\//, '')
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`
}

/**
 * 相册列的解析（读侧与写侧共用）：接受 JSON 字符串或数组，坏数据退化为空数组；
 * 顺带做 http(s) 白名单、去重与限量，保证非法地址不会进入公开接口或 <img src>。
 */
export function parsePreviewImages(raw: unknown): string[] {
  let source: unknown = raw
  if (typeof raw === 'string') {
    const text = raw.trim()
    if (!text) return []
    source = safeJsonParse(text, [])
  }
  if (!Array.isArray(source)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of source) {
    const url = sanitizeImageUrl(item)
    if (!url || seen.has(url)) continue
    seen.add(url)
    out.push(url)
    if (out.length >= PREVIEW_IMAGE_LIMIT) break
  }
  return out
}

/**
 * 从 README 提取全部真实截图（有序、去重、上限 PREVIEW_IMAGE_LIMIT）：
 * 位图优先于矢量图，徽章与内联资源一律排除；找不到时返回空数组（不编造占位图）。
 */
export function extractPreviewImages(
  markdown: string | null | undefined,
  owner: string,
  repo: string,
  defaultBranch?: string | null,
): string[] {
  const text = String(markdown ?? '')
  const candidates: string[] = []
  for (const match of text.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)) candidates.push(match[1])
  for (const match of text.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) candidates.push(match[1])

  const isBadge = (url: string) => {
    const lower = url.toLowerCase()
    return PREVIEW_BADGE_HINTS.some((hint) => lower.includes(hint))
  }
  const isVector = (url: string) => /\.svg(\?|#|$)/i.test(url)
  // 先位图、后矢量，徽章一律排除；顺序保持不变
  const ordered = [
    ...candidates.filter((url) => !isBadge(url) && !isVector(url)),
    ...candidates.filter((url) => !isBadge(url)),
  ]
  return parsePreviewImages(
    ordered.map((url) => resolveRepoAssetUrl(url, owner, repo, defaultBranch)),
  )
}

/** 封面与相册对外统一口径：相册缺失时退化为单张封面，封面缺失时退化为相册第一张 */
export function publicGallery(row: { preview_image_url?: unknown; preview_images_json?: unknown }): {
  previewImageUrl: string
  previewImages: string[]
} {
  const images = parsePreviewImages(row.preview_images_json)
  const cover = sanitizeImageUrl(row.preview_image_url) || images[0] || ''
  return {
    previewImageUrl: cover,
    previewImages: images.length > 0 ? images : cover ? [cover] : [],
  }
}

/**
 * 管理端写入预览图时的校验：任一非法条目都直接拒绝，而不是静默丢弃。
 * 静默丢弃会让后台显示"已成功保存"而库里实际少图——与演示入口同一条红线（宁 400 不降级）。
 * 读取侧（publicGallery）仍保持宽容：绕过 Worker 直接写库的脏值不能变成 500。
 *
 * POST 与 PUT 共用这一条规则——分成两处写就会出现同一请求体在两条路径落库不同
 * （本仓库为 demoUrl 踩过一次）。项目图片与相册是两件事，这里不做任何相互补齐。
 */
export function validatePreviewInput(
  rawGallery: unknown,
  rawCover: unknown,
): { ok: true; gallery: string[]; cover: string } | { ok: false; error: string } {
  const galleryProvided = rawGallery !== undefined && rawGallery !== null
  let list: unknown[] = []
  if (galleryProvided && rawGallery !== '') {
    if (Array.isArray(rawGallery)) {
      list = rawGallery
    } else if (typeof rawGallery === 'string') {
      let parsed: unknown
      try {
        parsed = JSON.parse(rawGallery)
      } catch {
        return { ok: false, error: '预览相册格式无效：需要 URL 数组或其 JSON 字符串' }
      }
      if (!Array.isArray(parsed)) {
        return { ok: false, error: '预览相册格式无效：需要 URL 数组' }
      }
      list = parsed
    } else {
      return { ok: false, error: '预览相册格式无效：需要 URL 数组' }
    }
  }
  if (list.length > PREVIEW_IMAGE_LIMIT) {
    return { ok: false, error: `预览相册最多 ${PREVIEW_IMAGE_LIMIT} 张，当前 ${list.length} 张` }
  }

  const gallery: string[] = []
  const seen = new Set<string>()
  for (let i = 0; i < list.length; i += 1) {
    const url = sanitizeImageUrl(list[i])
    if (!url) {
      return {
        ok: false,
        error: `预览相册第 ${i + 1} 行不是有效的 http/https 绝对地址（需带协议与主机名）`,
      }
    }
    if (seen.has(url)) {
      return { ok: false, error: `预览相册第 ${i + 1} 行与前面重复：同一地址不能出现两次` }
    }
    seen.add(url)
    gallery.push(url)
  }

  let cover = ''
  if (rawCover !== undefined && rawCover !== null) {
    if (typeof rawCover !== 'string') {
      return { ok: false, error: '项目图片地址必须是字符串' }
    }
    const trimmed = rawCover.trim()
    if (trimmed) {
      cover = sanitizeImageUrl(trimmed)
      if (!cover) {
        return { ok: false, error: '项目图片地址无效：仅支持 http/https 绝对地址' }
      }
    }
  }

  // 项目图片（封面）与相册是两件事：这里不再用「相册第一张」替用户补封面。
  // 需要自动补齐的地方只有 README 同步（buildProjectSyncUpdate 的「只填空白」），
  // 保存请求里补会让后台显示"项目图片为空"而库里却存了首张，属于假状态。
  // 对外读取仍由 publicGallery 在两者皆缺时退化到相册第一张。
  return { ok: true, gallery, cover }
}

/**
 * 从请求体里取相册/项目图片，并挡掉「同一列两种拼写」的悄悄覆盖。
 *
 * 管理端与公开接口用的是两套字段名（snake 原始列名 / camel 投影名）。
 * 一旦客户端把公开投影当成管理端行提交，两种拼写会同时出现在同一个体里，
 * 服务端只能挑一个——挑错就是"界面显示 A、库里存了 B"。这里不再猜：
 * 两者都在且规范化后不一致 → 400 点名；一致则按管理端口径（snake）写。
 */
/** 视为"没提供"的写法：undefined 与 null（null 若当"提供了空值"会静默清空整列，与部分更新语义冲突） */
const fieldProvided = (value: unknown) => value !== undefined && value !== null

export function previewFieldsFromBody(body: Record<string, any>): {
  gallery: unknown
  cover: unknown
  error?: string
} {
  const camelGallery = fieldProvided(body.previewImages) ? body.previewImages : undefined
  const snakeGallery = fieldProvided(body.preview_images_json) ? body.preview_images_json : undefined
  const camelCover = fieldProvided(body.previewImageUrl) ? body.previewImageUrl : undefined
  const snakeCover = fieldProvided(body.preview_image_url) ? body.preview_image_url : undefined

  if (camelGallery !== undefined && snakeGallery !== undefined) {
    // 逐项严格比（用与落库同一条 validatePreviewInput）：
    // 之前我用宽松的 parsePreviewImages 归一化，会把"13 张 vs 12 张""含非法项"抹平成相同数组，
    // 于是坏的那一份被静默丢掉、好的那份悄悄落库——正是本项目禁止的降级路径。
    const camelChecked = validatePreviewInput(camelGallery, undefined)
    const snakeChecked = validatePreviewInput(snakeGallery, undefined)
    if (!camelChecked.ok) {
      return { gallery: undefined, cover: undefined, error: `previewImages：${camelChecked.error}` }
    }
    if (!snakeChecked.ok) {
      return { gallery: undefined, cover: undefined, error: `preview_images_json：${snakeChecked.error}` }
    }
    if (camelChecked.gallery.join('\n') !== snakeChecked.gallery.join('\n')) {
      return {
        gallery: undefined,
        cover: undefined,
        error:
          '预览相册同时收到 previewImages 与 preview_images_json 两种写法且内容不一致，已拒绝写入。' +
          '请先刷新后台列表（管理端应只提交一种写法）再保存。',
      }
    }
  }
  if (camelCover !== undefined && snakeCover !== undefined) {
    const camelChecked = validatePreviewInput(undefined, camelCover)
    const snakeChecked = validatePreviewInput(undefined, snakeCover)
    if (!camelChecked.ok) {
      return { gallery: undefined, cover: undefined, error: `previewImageUrl：${camelChecked.error}` }
    }
    if (!snakeChecked.ok) {
      return { gallery: undefined, cover: undefined, error: `preview_image_url：${snakeChecked.error}` }
    }
    if (camelChecked.cover !== snakeChecked.cover) {
      return {
        gallery: undefined,
        cover: undefined,
        error:
          '项目图片同时收到 previewImageUrl 与 preview_image_url 两种写法且内容不一致，已拒绝写入。' +
          '请先刷新后台列表再保存。',
      }
    }
  }

  return {
    gallery: snakeGallery !== undefined ? snakeGallery : camelGallery,
    cover: snakeCover !== undefined ? snakeCover : camelCover,
  }
}

function nowStamp(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

// 同步时的字段归属规则（唯一实现点，纯函数便于测试）：
//   GitHub 权威 → 每次覆盖：stars / updated / version / language / date / year / metrics / features
//   编辑所有   → 只在空白时填充：description / README / Compose / license（协议＝作者的授权声明，
//                由管理端配置，同步不得覆盖手工值）
export type SyncSourceRow = {
  id: string
  name: string
  repository: string
  description_json: string
  has_readme_zh: number
  has_readme_en: number
  has_compose_dev: number
  has_compose_prod: number
  has_preview: number
  has_preview_images: number
  has_license: number
  /** README 开头片段：文档已齐时不必再抓取，也能从头部拿到首图 */
  readme_head_en: string
  readme_head_zh: string
}

export type RepoMeta = {
  default_branch?: string
  stargazers_count?: number
  forks_count?: number
  open_issues_count?: number
  pushed_at?: string
  created_at?: string
  language?: string
  description?: string
  topics?: unknown
  full_name?: string
  /** GitHub 的 license 对象；没有 LICENSE 文件时为 null，识别不出时为 spdx_id: "NOASSERTION" */
  license?: { spdx_id?: string | null; name?: string | null } | null
}

export type ReleaseInfo = { tag_name?: string; name?: string; published_at?: string }

// 时间线（FIELD NOTES）只由 GitHub 事实生成：仓库建档、Release、最近推送。
// 按月粒度、倒序、去重（创建月与推送月相同不再重复一条），最多 8 条。
const TIMELINE_MAX_EVENTS = 8
const TIMELINE_MAX_RELEASES = 4

export function buildTimelineEvents(
  meta: Pick<RepoMeta, 'created_at' | 'pushed_at' | 'full_name'>,
  releases: ReleaseInfo[],
): Array<{ date: string; title: string; note: string }> {
  const month = (raw: unknown) => String(raw ?? '').slice(0, 7).replace(/-/g, '.')
  const events: Array<{ date: string; title: string; note: string }> = []
  const releaseList: ReleaseInfo[] = Array.isArray(releases) ? releases : []

  const created = month(meta.created_at)
  if (created) {
    events.push({
      date: created,
      title: 'Repository created',
      note: meta.full_name
        ? `Initialized as ${meta.full_name} on GitHub.`
        : 'Initialized on GitHub.',
    })
  }

  for (const release of releaseList.slice(0, TIMELINE_MAX_RELEASES)) {
    const tag = String(release.tag_name ?? '').trim()
    const published = month(release.published_at)
    if (!tag || !published) continue
    events.push({
      date: published,
      title: `Release ${tag}`,
      note: String(release.name ?? '').trim() || `Tagged ${tag} on GitHub.`,
    })
  }

  const pushed = month(meta.pushed_at)
  if (pushed && pushed !== created) {
    events.push({
      date: pushed,
      title: 'Latest push',
      note: 'Most recent commit pushed to the default branch.',
    })
  }

  return events
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, TIMELINE_MAX_EVENTS)
}

export function buildProjectSyncUpdate(
  row: SyncSourceRow,
  meta: RepoMeta,
  releases: ReleaseInfo[],
  docs: ProjectDocs | null,
): { columns: Record<string, string | number>; notes: string[] } {
  const columns: Record<string, string | number> = {}
  const notes: string[] = []
  // 入参来自 GitHub 响应，可能是 null / 非数组：这里兜底，避免整条同步崩掉
  const releaseList: ReleaseInfo[] = Array.isArray(releases) ? releases : []

  const starsCount = typeof meta.stargazers_count === 'number' ? meta.stargazers_count : 0
  columns.stars = formatStarCount(starsCount)

  const pushed = String(meta.pushed_at || '').slice(0, 10).replace(/-/g, '.')
  if (pushed) columns.updated = pushed

  const latestRelease = String(releaseList[0]?.tag_name ?? '').trim()
  if (latestRelease) columns.version = latestRelease

  const language = String(meta.language || '').trim()
  if (language) columns.language = language

  const created = String(meta.created_at || '').slice(0, 7).replace(/-/g, '.')
  if (created) {
    columns.date = created
    columns.year = created.slice(0, 4)
  }

  // 时间线由 GitHub 事实生成（与字段归属一致：权威字段每次覆盖）
  const timeline = buildTimelineEvents(meta, releaseList)
  if (timeline.length > 0) columns.timeline_json = JSON.stringify(timeline)

  // 指标卡与 stars 共用同一口径，避免出现"2.8k"与"2800"并存的矛盾
  const metricValue = (raw: unknown) =>
    raw === starsCount ? formatStarCount(raw) : String(typeof raw === 'number' ? raw : 0)
  columns.metrics_json = JSON.stringify([
    { label: 'STARS', value: metricValue(starsCount) },
    { label: 'FORKS', value: metricValue(meta.forks_count) },
    { label: 'OPEN ISSUES', value: metricValue(meta.open_issues_count) },
  ])

  // 开源协议：**只填空白**（与文档字段同一规则）。协议是作者的授权声明、由管理端配置，
  // 一次同步不该替作者改口；数据取自同一个仓库响应（license.spdx_id），不额外发请求。
  // "NOASSERTION" 是 GitHub 识别不出协议时的占位，不算协议，不写。
  const licenseId = String(meta.license?.spdx_id ?? '').trim()
  if (licenseId && licenseId !== 'NOASSERTION' && row.has_license !== 1) {
    columns.license = licenseId
    notes.push(`协议已填充 ${licenseId}`)
  }

  const topics = Array.isArray(meta.topics)
    ? meta.topics.filter((topic): topic is string => typeof topic === 'string' && topic.trim() !== '')
    : []
  if (topics.length > 0) {
    columns.features_json = JSON.stringify(topics.slice(0, 4))
  }

  const descText = String(meta.description || '').trim()
  if (descText) {
    const current = asBilingual(row.description_json)
    if (current.en || current.zh) {
      notes.push('描述已保留，未覆盖后台手写文案')
    } else {
      // 按内容猜一种语言填入，另一种留空 → 读侧回退时会如实标注「原文」
      columns.description_json = JSON.stringify(pairFromSingleText(descText))
      notes.push('描述已按仓库信息首次填充')
    }
  }

  // 预览图/相册：编辑所有 → 只在「空」时从 README 提取。
  // 注意语义：空 = 待填。管理员若主动清空项目图片或相册，下次同步会重新自动填充；
  // 想永久不用自动图，请在字段里填一个自己的地址，而不是留空。
  if (row.has_preview !== 1 || row.has_preview_images !== 1) {
    const parsed = parseGithubRepo(row.repository)
    const readmeText = docs?.readmeEn || docs?.readmeZh || row.readme_head_en || row.readme_head_zh
    if (parsed && readmeText) {
      const images = extractPreviewImages(readmeText, parsed.owner, parsed.repo, meta.default_branch)
      if (images.length > 0) {
        const filled: string[] = []
        if (row.has_preview !== 1) {
          columns.preview_image_url = images[0]
          // 与抽屉里的字段名一致（同一个概念只有一种叫法）；这里补的是「相册第一张」
          filled.push('项目图片')
        }
        if (row.has_preview_images !== 1) {
          columns.preview_images_json = JSON.stringify(images)
          filled.push(`相册 ${images.length} 张`)
        }
        notes.push(`预览图已从 README 提取（${filled.join(' / ')}）`)
      }
    }
  }

  if (docs) {
    const candidates: Array<[string, string, boolean]> = [
      ['readme_zh', docs.readmeZh, row.has_readme_zh === 1],
      ['readme_en', docs.readmeEn, row.has_readme_en === 1],
      ['compose_dev', docs.composeDev, row.has_compose_dev === 1],
      ['compose_prod', docs.composeProd, row.has_compose_prod === 1],
    ]
    const filled: string[] = []
    for (const [column, content, exists] of candidates) {
      if (content && !exists) {
        columns[column] = content
        filled.push(column)
      }
    }
    // 抓取过就刷新时间戳，哪怕这次一个字都没写（原来的实现只在填充时更新，界面会显示旧时间）
    columns.docs_synced_at = nowStamp()
    const fetchedAny = Boolean(docs.readmeZh || docs.readmeEn || docs.composeDev || docs.composeProd)
    if (filled.length > 0) notes.push(`文档已填充 ${filled.join(' / ')}`)
    else if (!fetchedAny) notes.push('未抓到文档（仓库无对应文件，或已达到 GitHub 频率限制）')
    else notes.push('文档均已存在，未覆盖')
  }

  return { columns, notes }
}

// 管理端：GitHub 指标同步——按各项目的 repository 地址拉取最新 stars / 最近推送时间 / 最新 Release 版本并写回 D1
// body.fetchDocs 为真时同时抓取 README 与 Compose 文档（只填充空白字段，不覆盖手工维护的内容）
/**
 * 同步范围的 id 过滤（纯函数，闸门测试直接打它）。
 * - 不给 ids / 给 null → undefined：保持"全表同步"的老语义；
 * - 给了但形态不对（非数组、空数组、超长、含空白或超长 id）→ error：
 *   绝不能把"空数组"当成"没选"而退化成全表——那是"界面显示选了 0 个、实际刷了全部"的假状态；
 * - 合法 id 去重后交给参数化 IN 列表（值本身不进 SQL 文本，未知 id 只是匹配不到，不报错）。
 */
export function parseSyncIds(
  raw: unknown,
): { ids?: string[]; error?: string } {
  if (raw === undefined || raw === null) return {}
  if (!Array.isArray(raw)) return { error: 'ids 需要是标本编号数组' }
  if (raw.length === 0) {
    return { error: '没有勾选任何标本：要么至少选一个，要么不要提交 ids 字段' }
  }
  if (raw.length > QUERY_ROW_LIMIT) {
    return { error: `一次最多同步 ${QUERY_ROW_LIMIT} 个标本` }
  }
  const ids: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string' || item.trim() === '' || item.trim().length > 32) {
      return { error: 'ids 里每一项都必须是非空字符串（≤32 字符）' }
    }
    const id = item.trim()
    if (!ids.includes(id)) ids.push(id)
  }
  return { ids }
}

adminApp.post('/github-sync', async (c) => {
  try {
    // 该接口的请求体可选（不传即按默认方式同步），所以缺失/不可解析都退化成空对象，而不是 400
    const body = (await readJsonBody(c)) ?? {}
    const ghHeaders = getGithubHeaders(c, body?.token)
    const fetchDocs = body?.fetchDocs === true
    const scope = parseSyncIds(body?.ids)
    if (scope.error) {
      return c.json({ error: scope.error }, 400)
    }
    // 只在**真正选了范围**时才加 WHERE：不带 ids 的旧客户端必须继续走原来的全表索引路径
    const where = scope.ids ? `WHERE id IN (${scope.ids.map(() => '?').join(', ')})` : ''

    const { results } = await c.env.DB.prepare(
      `SELECT id, name, repository, description_json,
              (readme_zh <> '') AS has_readme_zh,
              (readme_en <> '') AS has_readme_en,
              (compose_dev <> '') AS has_compose_dev,
              (compose_prod <> '') AS has_compose_prod,
              (preview_image_url <> '') AS has_preview,
              (preview_images_json <> '' AND preview_images_json <> '[]') AS has_preview_images,
              (license <> '') AS has_license,
              substr(readme_en, 1, 2000) AS readme_head_en,
              substr(readme_zh, 1, 2000) AS readme_head_zh
       FROM projects ${where} ORDER BY sort_order ASC LIMIT ${QUERY_ROW_LIMIT}`,
    )
      .bind(...(scope.ids ?? []))
      .all()

    const outcomes: Record<string, unknown>[] = []
    // GitHub 一旦返回 403（频率超限）就立即停止后续请求：
    // 继续跑只会把配额与 Worker 时间浪费在必然失败的调用上。
    // 另：此处刻意保持串行（不并发），避免匿名 API 上的突发压力触发更严格的限流。
    let rateLimited = false
    for (const row of results as unknown as SyncSourceRow[]) {
      if (rateLimited) {
        outcomes.push({
          id: row.id,
          name: row.name,
          status: 'skipped',
          note: 'GitHub 访问频次超限，已跳过剩余标本',
        })
        continue
      }
      const parsed = parseGithubRepo(row.repository)
      if (!parsed) {
        outcomes.push({
          id: row.id,
          name: row.name,
          status: 'skipped',
          note: isNonGithubHost(row.repository)
            ? '仓库地址不是 GitHub 地址（仅支持 github.com）'
            : '仓库地址为空或非有效 GitHub 格式',
        })
        continue
      }
      const { owner, repo } = parsed
      try {
        const repoRes = await ghFetch(`https://api.github.com/repos/${owner}/${repo}`, ghHeaders)
        if (!repoRes.ok) {
          const limited = await isRateLimited(repoRes)
          if (limited) rateLimited = true
          const errNote = limited
            ? 'GitHub 访问频次超限，可在设置中填入 GitHub Token'
            : repoRes.status === 404
              ? '仓库未找到或为私有仓库 (404)'
              : `GitHub 请求被拒绝（${repoRes.status}）`
          outcomes.push({ id: row.id, name: row.name, status: 'error', note: errNote })
          continue
        }
        const data: any = await repoRes.json()

        let releases: ReleaseInfo[] = []
        try {
          const relRes = await ghFetch(
            `https://api.github.com/repos/${owner}/${repo}/releases?per_page=5`,
            ghHeaders,
          )
          if (relRes.ok) {
            const relData: any = await relRes.json()
            if (Array.isArray(relData)) releases = relData
          }
        } catch {
          // Release 信息获取失败不阻断整体同步
        }

        // 四个文档都已齐备时跳过抓取：原来是无条件跑一遍候选路径（最多约 11 个请求/项目）
        const needsDocs =
          row.has_readme_zh !== 1 ||
          row.has_readme_en !== 1 ||
          row.has_compose_dev !== 1 ||
          row.has_compose_prod !== 1
        const docs = fetchDocs && needsDocs ? await fetchProjectDocs(owner, repo, ghHeaders) : null

        const { columns, notes } = buildProjectSyncUpdate(row, data, releases, docs)
        if (fetchDocs && !needsDocs) notes.push('文档均已存在，跳过抓取')
        const entries = Object.entries(columns)
        const sets = entries.map(([column]) => `${column} = ?`)
        const values: (string | number)[] = entries.map(([, value]) => value)
        sets.push('updated_at = CURRENT_TIMESTAMP')
        values.push(row.id)
        await c.env.DB.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`)
          .bind(...values)
          .run()

        outcomes.push({
          id: row.id,
          name: data.full_name || row.name,
          status: 'synced',
          stars: columns.stars,
          version: String(columns.version ?? ''),
          updated: columns.updated ?? '',
          language: data.language || undefined,
          description: (data.description || '').trim() || undefined,
          note: notes.join('；') || undefined,
        })
      } catch (e: any) {
        // 缺列这类"服务端坏了"的错误不能被说成"这一行请求失败"——那暗示重试就好
        const typed = writeColumnErrorResponse(e)
        if (typed) return typed
        console.error('GitHub sync row error:', row.id, e)
        outcomes.push({ id: row.id, name: row.name, status: 'error', note: '请求失败（GitHub 或网络异常）' })
      }
    }

    return c.json({ success: true, results: outcomes, rateLimitRemaining: lastRateLimitRemaining })
  } catch (err: any) {
    console.error('GitHub sync error:', err)
    return c.json({ error: 'Sync failed' }, 500)
  }
})

// 管理端：扫描指定 GitHub 用户/组织的所有公开仓库，并标注哪些已在馆藏中
adminApp.get('/github-repos', async (c) => {
  try {
    let username = (c.req.query('username') || '').trim()
    // Token 只从 X-GitHub-Token 头读取：放进 URL 查询串会留在浏览器历史、
    // Referer 与 Cloudflare 边缘访问日志里
    const ghHeaders = getGithubHeaders(c)

    if (!username) {
      const settingsRow: any = await c.env.DB.prepare('SELECT github_url FROM site_settings WHERE id = 1').first()
      if (settingsRow?.github_url) {
        const match = /github\.com\/([^/\s#?]+)/i.exec(settingsRow.github_url)
        if (match) username = match[1]
      }
    }

    if (!username) {
      // 以前这里兜底到仓库作者本人的账号：换个人部署，扫描就会列出别人的仓库。
      // 现在要么显式带上账号，要么在站点文案里配好 GitHub 地址，否则点名报错。
      return c.json(
        { error: '未指定 GitHub 账号：请填写账号，或先在「03 首页栏目」配置 GitHub 地址' },
        400,
      )
    }

    // 逐页取回仓库列表（每页 100，最多 3 页）；超出上限时明确告知，而不是静默丢弃
    const REPO_PAGE_SIZE = 100
    const REPO_PAGE_MAX = 3
    const ghRepos: any[] = []
    for (let page = 1; page <= REPO_PAGE_MAX; page++) {
      const res = await ghFetch(
        `https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=updated&per_page=${REPO_PAGE_SIZE}&page=${page}`,
        ghHeaders,
      )

      if (!res.ok) {
        if (page > 1) break
        const note =
          res.status === 404
            ? `未找到 GitHub 用户: ${username}`
            : res.status === 403
            ? 'GitHub API 访问速率超限 (403)，可提供 GitHub Token 提高限额'
            : `GitHub 响应异常 (${res.status})`
        return c.json({ error: note }, res.status >= 500 ? 500 : 400)
      }

      const batch: any[] = await res.json()
      if (!Array.isArray(batch) || batch.length === 0) break
      ghRepos.push(...batch)
      if (batch.length < REPO_PAGE_SIZE) break
    }
    const truncated = ghRepos.length >= REPO_PAGE_SIZE * REPO_PAGE_MAX

    // 拉取所有已有标本以供比对
    const { results: existing } = await c.env.DB.prepare(
      `SELECT id, name, repository FROM projects LIMIT ${QUERY_ROW_LIMIT}`,
    ).all()
    const importedMap = new Map<string, string>()
    for (const p of existing as unknown as { id: string; name: string; repository: string }[]) {
      const parsed = parseGithubRepo(p.repository)
      if (parsed) {
        importedMap.set(`${parsed.owner.toLowerCase()}/${parsed.repo.toLowerCase()}`, p.id)
      }
    }

    const list = ghRepos.map((repo) => {
      const key = (repo.full_name || '').toLowerCase()
      const existingId = importedMap.get(key)
      return {
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        description: repo.description || '',
        stars: repo.stargazers_count || 0,
        language: repo.language || '',
        updated_at: String(repo.pushed_at || repo.updated_at || '').slice(0, 10).replace(/-/g, '.'),
        created_at: String(repo.created_at || '').slice(0, 7).replace(/-/g, '.'),
        html_url: repo.html_url,
        is_fork: Boolean(repo.fork),
        already_imported: Boolean(existingId),
        specimen_id: existingId || null,
      }
    })

    return c.json({ success: true, username, repos: list, truncated, rateLimitRemaining: lastRateLimitRemaining })
  } catch (err: any) {
    console.error('GitHub repos fetch error:', err)
    return c.json({ error: 'Failed to fetch repositories' }, 500)
  }
})

// 管理端：从 GitHub 仓库一键导入为馆藏标本
// ==========================================
// 管理端：按目录批量导入预览图
// ==========================================
// 截图通常成批放在仓库的固定目录里（imgs/desktop、imgs/mobile…）。逐个粘 URL 太繁琐，
// 这里给一个目录地址，由 Worker 用 GitHub Contents API 列出目录内的位图并拼成 raw 地址。
// 只返回候选列表，**不写库**——写库仍然走保存时的 validatePreviewInput 同一条严格规则。
const PREVIEW_BITMAP_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'bmp']

/**
 * 解析「预览图所在目录」，返回按顺序尝试的 (ref, path) 候选。
 * 接受：raw.githubusercontent.com/owner/repo/分支/路径、github.com/owner/repo/{tree|blob}/分支/路径，
 * 也接受省略协议与省略域名（owner/repo/分支/路径）。
 * 分支名里带 `/` 时第一段切法会不准，因此再给一个「整段当路径 + 用默认分支」的候选兜底。
 */
export function parsePreviewDirUrl(raw: unknown): {
  owner: string
  repo: string
  candidates: { ref: string; path: string }[]
} | null {
  const cleaned = String(raw ?? '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
  if (!cleaned) return null
  const segments = cleaned.split('/').filter(Boolean)
  const host = (segments[0] ?? '').toLowerCase()
  const hostLike = host.includes('.')
  // 带主机名时只认 GitHub 两个形态；gitlab 等站点如实拒绝（Contents API 是 GitHub 的）
  if (hostLike && host !== 'raw.githubusercontent.com' && host !== 'github.com') return null
  let rest = hostLike ? segments.slice(1) : segments
  // github.com 的 tree/blob 形态：owner/repo/{tree|blob}/ref/path → 抹掉动词，与 raw 形态同构
  if (rest[2] && /^(tree|blob)$/i.test(rest[2])) rest = [rest[0], rest[1], ...rest.slice(3)]
  const [owner, repo, ...tail] = rest
  if (!owner || !repo || tail.length < 2) return null
  // tail 只有一段时无法区分「分支」还是「目录」（owner/repo/main 与 owner/repo/imgs 同形），
  // 猜错会去打仓库根目录，返回一堆非图片条目；宁可要求写全 owner/repo/分支/目录
  if (!/^[A-Za-z0-9._-]+$/.test(owner) || !/^[A-Za-z0-9._-]+$/.test(repo)) return null
  // owner/repo 与路径段里都不允许 . / ..：它们会匹配上面的字符集，却能把 API 路径拼歪
  if (owner === '.' || owner === '..' || repo === '.' || repo === '..') return null
  if (tail.some((segment) => segment === '.' || segment === '..')) return null
  const candidates: { ref: string; path: string }[] = []
  if (tail.length >= 2) candidates.push({ ref: tail[0], path: tail.slice(1).join('/') })
  candidates.push({ ref: '', path: tail.join('/') })
  return { owner, repo, candidates }
}

/** 从 Contents API 的目录条目里挑出位图，并按仓库路径拼成 raw 地址（名字排序保证顺序稳定） */
export function pickBitmapEntries(
  entries: unknown,
  owner: string,
  repo: string,
  ref: string,
): {
  images: string[]
  skippedNonBitmap: number
  skippedBadge: number
  subDirectories: number
} {
  const list = Array.isArray(entries) ? (entries as any[]) : []
  const isObject = (e: any) => e && typeof e === 'object'
  const files = list.filter((e) => isObject(e) && e.type === 'file')
  const subDirectories = list.filter((e) => isObject(e) && e.type === 'dir').length
  const nameOf = (e: any) => String(e.name ?? '').toLowerCase()
  const bitmaps = files.filter((e) =>
    PREVIEW_BITMAP_EXTS.some((ext) => nameOf(e).endsWith(`.${ext}`)),
  )
  const skippedNonBitmap = files.length - bitmaps.length
  const kept = bitmaps.filter(
    (e) => !PREVIEW_BADGE_HINTS.some((hint) => nameOf(e).includes(hint) || String(e.path ?? '').toLowerCase().includes(hint)),
  )
  const skippedBadge = bitmaps.length - kept.length
  const branch = String(ref ?? '').trim()
  // GitHub 返回的 path 是解码后的真实文件名（可能含空格）：逐段编码后再拼 URL，
  // 库里存的就是可直接访问的规范化地址，去重也不会被 "a b.png" / "a%20b.png" 两种写法骗过
  const encodePath = (value: string) => value.split('/').map(encodeURIComponent).join('/')
  const imageHostAllowed = (value: unknown) => {
    if (typeof value !== 'string') return ''
    const url = sanitizeImageUrl(value)
    if (!url) return ''
    try {
      // 只接受 raw.githubusercontent.com：GitHub 响应里的 download_url 不由我们支配，
      // 直接回显等于让第三方响应决定前台 <img src> 指向哪
      return new URL(url).hostname.toLowerCase() === 'raw.githubusercontent.com' ? url : ''
    } catch {
      return ''
    }
  }
  const images = kept
    .slice()
    .sort((a, b) => String(a.name ?? a.path).localeCompare(String(b.name ?? b.path)))
    .map((e) => {
      const relPath = String(e.path ?? e.name ?? '').replace(/^\/+/, '')
      // 空路径会拼出以 / 结尾的死地址；带 . / .. 的路径不能信（GitHub 正常不会给，防御性挡掉）
      if (!relPath || relPath.split('/').some((s) => s === '.' || s === '..')) return ''
      if (!branch) {
        // 没指定分支这一路：GitHub 的 download_url 自带仓库默认分支，
        // 自己拼 'main' 会在默认分支非 main 的仓库上整批 404（入库看着正常、前台图挂死）
        return imageHostAllowed(e.download_url) || ''
      }
      return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${encodePath(relPath)}`
    })
    .map((url) => sanitizeImageUrl(url))
    .filter(Boolean)
  return { images, skippedNonBitmap, skippedBadge, subDirectories }
}

adminApp.post('/preview-import', async (c) => {
  const body = await readJsonBody(c)
  if (body === null) {
    return c.json({ error: '请求体不是合法的 JSON 对象' }, 400)
  }
  const parsed = parsePreviewDirUrl(body.dir)
  if (!parsed) {
    return c.json(
      {
        error:
          '目录地址无法识别：需要 raw.githubusercontent.com/owner/repo/分支/路径 或 github.com/owner/repo/tree/分支/路径（当前只支持 GitHub）',
      },
      400,
    )
  }
  const headers = getGithubHeaders(c)
  let lastError = ''
  for (const candidate of parsed.candidates) {
    if (!candidate.path) {
      lastError = '目录路径为空'
      continue
    }
    const encodedPath = encodeURIComponent(candidate.path).replace(/%2F/g, '/')
    const refQuery = candidate.ref ? `?ref=${encodeURIComponent(candidate.ref)}` : ''
    try {
      const res = await ghFetch(
        `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/contents/${encodedPath}${refQuery}`,
        headers,
      )
      if (!res.ok) {
        if (await isRateLimited(res)) {
          return c.json(
            {
              error: `GitHub 接口触发频率限制（剩余配额 ${lastRateLimitRemaining ?? '未知'}）。可以稍后再试，或先在相册里手工粘贴地址。`,
              rateLimited: true,
            },
            429,
          )
        }
        lastError = candidate.ref
          ? `分支「${candidate.ref}」下没有找到目录「${candidate.path}」（HTTP ${res.status}）`
          : `没有找到目录「${candidate.path}」（HTTP ${res.status}）`
        continue
      }
      const json = await res.json()
      if (!Array.isArray(json)) {
        return c.json({ error: `「${candidate.path}」是一个文件而不是目录，请填所在目录` }, 400)
      }
      const picked = pickBitmapEntries(json, parsed.owner, parsed.repo, candidate.ref)
      const images = picked.images.slice(0, PREVIEW_IMAGE_LIMIT)
      return c.json({
        success: true,
        dir: `${parsed.owner}/${parsed.repo}/${candidate.ref || '默认分支'}/${candidate.path}`,
        images,
        found: picked.images.length,
        truncated: picked.images.length > images.length,
        skippedNonBitmap: picked.skippedNonBitmap,
        skippedBadge: picked.skippedBadge,
        subDirectories: picked.subDirectories,
        rateLimitRemaining: lastRateLimitRemaining,
      })
    } catch (err: any) {
      lastError = `GitHub 请求失败：${err?.message ?? String(err)}`
    }
  }
  return c.json({ error: lastError || '没有读到该目录' }, 404)
})

adminApp.post('/github-import', async (c) => {
  try {
    const body = await readJsonBody(c)
    if (body === null) {
      return c.json({ error: '请求体不是合法的 JSON 对象' }, 400)
    }
    const repoFullName = (body.repoFullName || '').trim()
    const customToken = body.token
    if (!repoFullName || !repoFullName.includes('/')) {
      return c.json({ error: '请提供正确的仓库全名（形如 owner/repo）' }, 400)
    }

    // 仓库全名只接受 owner/repo 两段且字符集受限：避免 `../` 之类拼出路径，
    // 把请求带到 api.github.com 的其他端点上去
    const segments = repoFullName.split('/')
    const owner = segments[0]?.trim() ?? ''
    const repo = segments[1]?.trim() ?? ''
    const isSafeSegment = (value: string) =>
      /^[A-Za-z0-9._-]+$/.test(value) && value !== '.' && value !== '..'
    if (segments.length !== 2 || !isSafeSegment(owner) || !isSafeSegment(repo)) {
      return c.json({ error: '仓库全名格式不合法，应形如 owner/repo' }, 400)
    }
    const ghHeaders = getGithubHeaders(c, customToken)

    const repoRes = await ghFetch(`https://api.github.com/repos/${owner}/${repo}`, ghHeaders)
    if (!repoRes.ok) {
      const limited = await isRateLimited(repoRes)
      return c.json(
        { error: limited ? 'GitHub 访问频次超限，请稍后重试或填入 Token' : `无法获取 GitHub 仓库信息 (${repoRes.status})` },
        400,
      )
    }
    const repoData: any = await repoRes.json()

    // 检查是否已收录（模式构造见 buildRepoLikePattern：两端留通配、只转义中间的通配符）
    const likePattern = buildRepoLikePattern(owner, repo)
    const existing: any = await c.env.DB.prepare(
      `SELECT id FROM projects WHERE repository LIKE ? ESCAPE '\\'`,
    )
      .bind(likePattern)
      .first()
    if (existing) {
      return c.json({ error: `该仓库已作为标本 SPEC—${existing.id} 收录，无需重复导入` }, 400)
    }

    // 计算下一个新编号（如 SPEC—005）
    const { results: allProjects } = await c.env.DB.prepare(
      `SELECT id, sort_order FROM projects LIMIT ${QUERY_ROW_LIMIT}`,
    ).all()
    let maxNum = 0
    let maxOrder = 0
    for (const p of allProjects as any[]) {
      const num = parseInt(p.id, 10)
      if (!isNaN(num) && num > maxNum) maxNum = num
      if (p.sort_order > maxOrder) maxOrder = p.sort_order
    }
    const newId = String(maxNum + 1).padStart(3, '0')
    const sortOrder = maxOrder + 1

    const starsCount = repoData.stargazers_count || 0
    const stars = formatStarCount(starsCount)
    const updated = String(repoData.pushed_at || '').slice(0, 10).replace(/-/g, '.') || new Date().toISOString().slice(0, 10).replace(/-/g, '.')
    const createdDate = String(repoData.created_at || '').slice(0, 7).replace(/-/g, '.') || updated.slice(0, 7)
    const year = createdDate.slice(0, 4) || String(new Date().getFullYear())

    // 轮转几何形态
    const shapes = ['aperture', 'lumen', 'fjord', 'meridian']
    const shape = shapes[maxNum % shapes.length]

    // 拉取最近的 Release：同时用于版本号与时间线事件
    let releases: ReleaseInfo[] = []
    try {
      const relRes = await ghFetch(
        `https://api.github.com/repos/${owner}/${repo}/releases?per_page=5`,
        ghHeaders,
      )
      if (relRes.ok) {
        const relData: any = await relRes.json()
        if (Array.isArray(relData)) releases = relData
      }
    } catch {
      // 忽略 Release 获取失败
    }
    // 没有 Release 就留空，不再编造 'v1.0.0'（前台会省略版本位），同步拿到 tag 后会自动补上
    const version = String(releases[0]?.tag_name ?? '').trim()

    const name = repoData.name
    // 中文名不再拿英文仓库名顶替：留空由管理员填写（抽屉里是必填项），
    // 否则中文模式会直接显示英文名，像是"没同步/串位"
    const cnName = ''
    const descText = repoData.description || ''
    const language = repoData.language || 'TypeScript'
    const repository = `https://github.com/${repoData.full_name}`

    // 同理：英文描述不再写进中文字段，留空由管理员填写；前台缺中文时会回退英文
    const description = JSON.stringify(pairFromSingleText(descText))
    // 只认真实 topics；没有就留空（不再塞 'Production Ready' 这类凑数文案），后续同步会自动补齐
    const features = JSON.stringify(
      Array.isArray(repoData.topics) && repoData.topics.length > 0
        ? repoData.topics.slice(0, 4)
        : []
    )
    const metrics = JSON.stringify([
      { label: 'STARS', value: formatStarCount(starsCount) },
      { label: 'FORKS', value: String(repoData.forks_count || 0) },
      { label: 'OPEN ISSUES', value: String(repoData.open_issues_count || 0) },
    ])
    const timeline = JSON.stringify(
      buildTimelineEvents(
        { created_at: repoData.created_at, pushed_at: repoData.pushed_at, full_name: repoData.full_name },
        releases,
      ),
    )

    // 导入时同步抓取 README / Compose，让新标本开箱即有完整文档
    const docs = await fetchProjectDocs(owner, repo, ghHeaders)
    // 预览图/相册：从 README 提取全部真实截图（相对路径按默认分支解析），封面取第一张
    const previewImages = extractPreviewImages(
      docs.readmeEn || docs.readmeZh,
      owner,
      repo,
      repoData.default_branch,
    )

    const insertProject = (id: string) =>
      c.env.DB.prepare(`
      INSERT INTO projects (
        id, date, status, name, cn, latin, habitat, type, language, stars, year, shape, version, updated, repository,
        challenge_json, solution_json, description_json, features_json, metrics_json, timeline_json, internal_notes, sort_order,
        readme_zh, readme_en, compose_dev, compose_prod, docs_synced_at, preview_image_url, preview_images_json
      ) VALUES (?, ?, 'LIVE', ?, ?, ?, 'GitHub Field', 'Tool', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      createdDate,
      name,
      cnName,
      `Specimen ${name}`,
      language,
      stars,
      year,
      shape,
      version,
      updated,
      repository,
      '',
      '',
      description,
      features,
      metrics,
      timeline,
      sortOrder,
      docs.readmeZh,
      docs.readmeEn,
      docs.composeDev,
      docs.composeProd,
      nowStamp(),
      // 项目图片留空：写侧一律不拿相册首张代替用户选择（对外读取时 publicGallery 才退化到首张）
      '',
      JSON.stringify(previewImages),
    ).run()

    // 编号是"先查最大号再插入"推出来的：并发导入可能算出同一个号，
    // 撞主键时重算一次再试，而不是把 500 丢给用户
    let finalId = newId
    try {
      await insertProject(finalId)
    } catch (err: any) {
      if (!/UNIQUE|constraint/i.test(String(err?.message ?? err))) throw err
      finalId = String(parseInt(finalId, 10) + 1).padStart(3, '0')
      await insertProject(finalId)
    }

    return c.json({
      success: true,
      message: `标本 SPEC—${finalId} (${name}) 导入成功`,
      id: finalId,
      docs: {
        readmeZh: docs.readmeZh.length,
        readmeEn: docs.readmeEn.length,
        composeDev: docs.composeDev.length,
        composeProd: docs.composeProd.length,
      },
    })
  } catch (err: any) {
    const typed = writeColumnErrorResponse(err)
    if (typed) return typed
    console.error('GitHub import error:', err)
    return c.json({ error: '导入失败，请稍后重试（服务器内部错误）' }, 500)
  }
})

// ==========================================
// 3. 站点文案设置接口
// ==========================================

// 公开端：获取站点文案与配置（空字段由前端回退到内置默认值，无敏感信息）
app.get('/site-settings', async (c) => {
  if (!allowPublicRead(clientIpOf(c), Date.now())) {
    return c.json({ error: '请求过于频繁，请稍后再试' }, 429, { 'Retry-After': '60' })
  }
  try {
    const row: any = await c.env.DB.prepare(`
      SELECT * FROM site_settings WHERE id = 1
    `).first()

    if (!row) return c.json({})

    return c.json(settingsPayloadFromRow(row))
  } catch (err: any) {
    // 出错时返回空对象：公开端文案回退到前端内置默认值，不影响站点展示
    console.error('Error fetching site settings:', err)
    return c.json({})
  }
})

// 管理端可编辑的站点设置列白名单：键为请求体字段名，值为数据库列名
// 三份清单都导出给 test/sync_update.test.mjs 做对齐闸门（字段 ↔ 映射 ↔ migrations 列）。
export const SITE_SETTINGS_COLUMNS: Record<string, string> = {
  heroEn: 'hero_en',
  heroZh: 'hero_zh',
  subtitleEn: 'subtitle_en',
  subtitleZh: 'subtitle_zh',
  aboutEn: 'about_en',
  aboutZh: 'about_zh',
  githubUrl: 'github_url',
  contactEmail: 'contact_email',
  seoTitle: 'seo_title',
  seoDescription: 'seo_description',
  icpNumber: 'icp_number',
  icpUrl: 'icp_url',
  logoText: 'logo_text',
  logoSubtext: 'logo_subtext',
  logoImageUrl: 'logo_image_url',
  logoType: 'logo_type',
  statsSinceYear: 'stats_since_year',
  statsAsOfDate: 'stats_as_of_date',
  customCitations: 'custom_citations',
  activityLogMode: 'activity_log_mode',
  curatorEyebrowEn: 'curator_eyebrow_en',
  curatorEyebrowZh: 'curator_eyebrow_zh',
  curatorHeadlineEn: 'curator_headline_en',
  curatorHeadlineZh: 'curator_headline_zh',
  curatorQuoteEn: 'curator_quote_en',
  curatorQuoteZh: 'curator_quote_zh',
  curatorHabitat: 'curator_habitat',
  curatorField: 'curator_field',
  challengeHeadlineEn: 'challenge_headline_en',
  challengeHeadlineZh: 'challenge_headline_zh',
  solutionHeadlineEn: 'solution_headline_en',
  solutionHeadlineZh: 'solution_headline_zh',
  defaultLanguage: 'default_language',
  defaultTheme: 'default_theme',
  footerKickerEn: 'footer_kicker_en',
  footerKickerZh: 'footer_kicker_zh',
  footerBlurbEn: 'footer_blurb_en',
  footerBlurbZh: 'footer_blurb_zh',
  footerColSpecimensEn: 'footer_col_specimens_en',
  footerColSpecimensZh: 'footer_col_specimens_zh',
  footerColCollectionEn: 'footer_col_collection_en',
  footerColCollectionZh: 'footer_col_collection_zh',
  footerColLinksEn: 'footer_col_links_en',
  footerColLinksZh: 'footer_col_links_zh',
  footerGithubLabelEn: 'footer_github_label_en',
  footerGithubLabelZh: 'footer_github_label_zh',
  footerContactLabelEn: 'footer_contact_label_en',
  footerContactLabelZh: 'footer_contact_label_zh',
  footerColophonLinkEn: 'footer_colophon_link_en',
  footerColophonLinkZh: 'footer_colophon_link_zh',
  footerColophonLineEn: 'footer_colophon_line_en',
  footerColophonLineZh: 'footer_colophon_line_zh',
  footerCopyrightEn: 'footer_copyright_en',
  footerCopyrightZh: 'footer_copyright_zh',
}

export const SITE_SETTINGS_JSON_COLUMNS: Record<string, string> = {
  navItems: 'nav_items_json',
  customActivityLog: 'activity_log_json',
  // 栏目/页面文案槽位（迁移 0014）。形状是"键→{en,zh}"的对象表，空列回吐 {}（见 settingsPayloadFromRow）；
  // 前端 mergeSiteSettings 也再挡一次非纯对象，库里被手改成数组/字符串时不会顶掉默认表。
  sectionCopy: 'section_copy_json',
}

// 布尔型站点设置（D1 中以 0/1 存储）
export const SITE_SETTINGS_BOOLEAN_COLUMNS: Record<string, string> = {
  icpEnabled: 'icp_enabled',
  homeStatsVisible: 'home_stats_visible',
  themeToggleEnabled: 'theme_toggle_enabled',
  languageToggleEnabled: 'language_toggle_enabled',
}

/**
 * 把 D1 单行记录还原成前端 SiteSettings 载荷。
 * 空字符串保持原样返回，由前端 mergeSiteSettings 回退到内置默认文案。
 */
function settingsPayloadFromRow(row: any): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  for (const [field, column] of Object.entries(SITE_SETTINGS_COLUMNS)) {
    payload[field] = row[column] ?? ''
  }
  for (const [field, column] of Object.entries(SITE_SETTINGS_JSON_COLUMNS)) {
    // 兜底形状按字段给：navItems 空=未配置（null 让前端落内置导航），
    // sectionCopy 是对象表（给 [] 会把"空"伪装成数组值，前端还得再挡一次）
    payload[field] =
      field === 'navItems'
        ? safeJsonParse(row[column], null)
        : field === 'sectionCopy'
          ? safeJsonParse(row[column], {})
          : safeJsonParse(row[column], [])
  }
  for (const [field, column] of Object.entries(SITE_SETTINGS_BOOLEAN_COLUMNS)) {
    payload[field] = row[column] === 1
  }
  return payload
}

// 管理端：获取站点设置原始值
adminApp.get('/site-settings', async (c) => {
  try {
    const row: any = await c.env.DB.prepare(`
      SELECT * FROM site_settings WHERE id = 1
    `).first()
    if (!row) {
      return c.json({})
    }
    // updatedAt 是**写侧的乐观锁版本戳**，不属于可编辑字段（所以不在三份白名单里，
    // 也不会被前端 mergeSiteSettings 当成文案字段）。只给管理端，不给公开端。
    return c.json({ ...settingsPayloadFromRow(row), updatedAt: String(row.updated_at ?? '') })
  } catch (err: any) {
    console.error('Admin fetch site settings error:', err)
    return c.json({ error: 'Failed to fetch site settings' }, 500)
  }
})

/**
 * 把"代码引用的列在库里不存在"从 500 `Update failed` 翻成能行动的 400。
 * 这条不是猜测：本仓库的部署顺序要求先跑迁移再 push（Worker 引用新列而远程还没加列时，
 * 保存会整条失败），而操作者看到的原文只有 `Update failed`，既不知道缺哪列也不知道跑什么。
 */
function writeColumnErrorResponse(err: any): Response | null {
  const message = String(err?.message || err || '')
  const missing = message.match(/no such column:\s*([A-Za-z0-9_]+)/i)
  if (missing) {
    return new Response(
      JSON.stringify({
        error:
          `数据库里没有列 ${missing[1]}：这条代码已部署、对应迁移还没在远程执行。` +
          `请在仓库根目录跑 bash scripts/d1-migrate.sh remote 后重试。`,
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }
  return null
}

/**
 * 站点设置写侧：把请求体折成"列 + 值"，并在写入边界做两件事——裁首尾空白、按上限拒绝超长值。
 * 为什么裁：库里存的是原样字符串，管理端只敲一个空格就会存成 '  '，
 * 而前台的"空 = 回退内置默认"判据（mergeSiteSettings）是按 trim 后判定的；两侧同一口径。
 * 为什么是拒绝而不是截断：静默截断后再回"已保存"就是假状态（本仓库的老规矩，报错要点名字段和数字）。
 * 上限取值：正常最长的是 about / 页脚段落（当前库里最长 277 字符），5000 已是十倍余量，
 * 只挡"把整份 README 粘进输入框"这类误操作，离 D1 单值上限还差两个数量级。
 *
 * 注意 SITE_SETTINGS_TEXT_MAX **不能 export**：Workers 运行时把入口模块的每个具名导出当成
 * handler 映射，函数与对象可以，标量会直接把 workerd 打死
 * （`Uncaught TypeError: Incorrect type for map entry 'SITE_SETTINGS_TEXT_MAX'`，dev 与生产同一个 runtime）。
 * 闸门要的那个数字从错误话术里反推（见 sync_update.test.mjs case 21），比共享符号更严：它验的正是"话术里的数字就是真阈值"。
 */
const SITE_SETTINGS_TEXT_MAX = 5000

export function buildSiteSettingsWrite(
  body: Record<string, unknown>,
): { columns: string[]; values: (string | number)[]; error?: string } {
  const columns: string[] = []
  const values: (string | number)[] = []
  const problems: string[] = []

  const push = (column: string, text: string, field: string) => {
    if (text.length > SITE_SETTINGS_TEXT_MAX) {
      problems.push(`「${field}」有 ${text.length} 字符，超过 ${SITE_SETTINGS_TEXT_MAX} 字符上限`)
      return
    }
    columns.push(column)
    values.push(text)
  }

  for (const [field, column] of Object.entries(SITE_SETTINGS_COLUMNS)) {
    if (body[field] !== undefined) push(column, String(body[field]).trim(), field)
  }
  for (const [field, column] of Object.entries(SITE_SETTINGS_JSON_COLUMNS)) {
    if (body[field] !== undefined) push(column, JSON.stringify(body[field]), field)
  }
  for (const [field, column] of Object.entries(SITE_SETTINGS_BOOLEAN_COLUMNS)) {
    // 只认真布尔：'0' / false / '' 这类"看着像否"的值一律不写，保持与原实现一致
    if (typeof body[field] === 'boolean') {
      columns.push(column)
      values.push(body[field] ? 1 : 0)
    }
  }

  return {
    columns,
    values,
    error: problems.length > 0 ? problems.join('；') : undefined,
  }
}

// 管理端：部分更新站点设置（UPSERT，容忍迁移未插入默认行的情况）
adminApp.put('/site-settings', async (c) => {
  try {
    const body = await readJsonBody(c)
    if (body === null) {
      return c.json({ error: '请求体不是合法的 JSON 对象' }, 400)
    }

    // 乐观锁：`site_settings` 是单行表，而管理端在挂载时读一次、把基线冻结在内存里，
    // 保存发的是"与基线不同的整份改动集"。两个标签页各存一次，后存的一方会把自己载入时的
    // 旧值当改动写回去（不可见，提示还是"已保存"）。带戳就能拒掉这次写入。
    const expected = typeof body.expectedUpdatedAt === 'string' ? body.expectedUpdatedAt.trim() : ''
    const before: any = await c.env.DB
      .prepare('SELECT updated_at FROM site_settings WHERE id = 1')
      .first()
    const currentStamp = String(before?.updated_at ?? '')
    if (expected && currentStamp && expected !== currentStamp) {
      return c.json(
        {
          error:
            '站点设置在这一页打开之后被别处保存过（另一个标签页或另一次保存）。已拒绝本次写入，' +
            '否则会把对方那一份悄悄回退成旧值。请点「重新载入」取最新值，再在新页面上重做这次修改。',
          conflict: true,
        },
        409,
      )
    }

    const { columns, values, error } = buildSiteSettingsWrite(body)
    if (error) {
      return c.json({ error }, 400)
    }
    if (columns.length === 0) {
      return c.json({ error: 'No editable fields provided' }, 400)
    }

    await c.env.DB.prepare(
      `INSERT INTO site_settings (id, ${columns.join(', ')})
       VALUES (?, ${columns.map(() => '?').join(', ')})
       ON CONFLICT(id) DO UPDATE SET ${columns.map((column) => `${column} = excluded.${column}`).join(', ')}, updated_at = CURRENT_TIMESTAMP`,
    ).bind(1, ...values).run()

    // 回带新戳：连续两次保存之间不重新 GET，客户端得跟着更新手上的版本
    const after: any = await c.env.DB
      .prepare('SELECT updated_at FROM site_settings WHERE id = 1')
      .first()
    return c.json({
      success: true,
      message: '站点设置已保存',
      updatedAt: String(after?.updated_at ?? ''),
    })
  } catch (err: any) {
    const typed = writeColumnErrorResponse(err)
    if (typed) return typed
    console.error('Admin update site settings error:', err)
    return c.json({ error: 'Update failed' }, 500)
  }
})

// 挂载管理组
app.route('/admin', adminApp)

// ==========================================
// 辅助安全函数
// ==========================================
function safeJsonParse(jsonStr: string | null | undefined, fallback: any) {
  if (!jsonStr) return fallback
  try {
    return JSON.parse(jsonStr)
  } catch {
    return fallback
  }
}

/**
 * 常量时间字符串比较：先各自 SHA-256 再逐字节异或。
 * 不能"长度不等就提前 return"——那会让攻击者用响应时间量出口令长度（长度旁路）。
 * 摘要长度固定 32 字节，比较循环长度恒定，长度信息被抹平。
 */
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder()
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ])
  const va = new Uint8Array(da)
  const vb = new Uint8Array(db)
  let diff = 0
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i]
  return diff === 0
}

const ACCESS_CERTS_TTL_MS = 60 * 60 * 1000
const ACCESS_CERTS_FORCE_REFRESH_MIN_INTERVAL_MS = 5 * 60 * 1000
let accessCertsCache: { jwks: Record<string, any>; fetchedAt: number } | null = null
let accessCertsLastForcedRefresh = 0

/** 拉取（并按 1 小时缓存）团队 Access 公钥集合，兼容数组与按 kid 索引两种返回形态 */
async function fetchAccessCerts(teamName: string, forceRefresh = false): Promise<Record<string, any>> {
  if (
    !forceRefresh &&
    accessCertsCache &&
    Date.now() - accessCertsCache.fetchedAt < ACCESS_CERTS_TTL_MS
  ) {
    return accessCertsCache.jwks
  }
  const res = await fetch(`https://${teamName}.cloudflareaccess.com/cdn-cgi/access/certs`, {
    signal: AbortSignal.timeout(GITHUB_FETCH_TIMEOUT_MS),
  })
  if (!res.ok) {
    throw new Error(`Access certs endpoint responded ${res.status}`)
  }
  const data: any = await res.json()
  const jwks: Record<string, any> = Array.isArray(data?.keys)
    ? Object.fromEntries(data.keys.map((key: any) => [key.kid, key]))
    : data?.keys ?? {}
  accessCertsCache = { jwks, fetchedAt: Date.now() }
  return jwks
}

function base64UrlDecode(input: string): Uint8Array {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/**
 * 校验 Cloudflare Access 签发的 JWT：
 * RS256 签名 + iss / aud / exp / iat 核验，全部通过才视为有效。
 * （导出仅供本地单元测试使用，运行时通过默认导出的 app 暴露 HTTP 入口）
 */
export async function verifyAccessJwt(
  jwt: string,
  teamName: string,
  audience: string,
): Promise<{ valid: boolean; reason?: string }> {
  const parts = jwt.split('.')
  if (parts.length !== 3) return { valid: false, reason: 'malformed' }

  let header: any
  let payload: any
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])))
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])))
  } catch {
    return { valid: false, reason: 'malformed' }
  }

  if (header.alg !== 'RS256' || typeof header.kid !== 'string') {
    return { valid: false, reason: 'unsupported_alg' }
  }

  const now = Math.floor(Date.now() / 1000)
  if (payload.iss !== `https://${teamName}.cloudflareaccess.com`) {
    return { valid: false, reason: 'bad_iss' }
  }
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
  if (!audiences.includes(audience)) {
    return { valid: false, reason: 'bad_aud' }
  }
  // 允许 30 秒时钟偏移
  if (typeof payload.exp !== 'number' || payload.exp + 30 < now) {
    return { valid: false, reason: 'expired' }
  }
  if (typeof payload.iat !== 'number' || payload.iat > now + 60) {
    return { valid: false, reason: 'bad_iat' }
  }
  // nbf（not-before，可选声明）：出现且明显领先于当前时间时拒绝，同样留 30 秒时钟偏移
  if (typeof payload.nbf === 'number' && payload.nbf > now + 30) {
    return { valid: false, reason: 'not_yet_valid' }
  }

  let jwks = await fetchAccessCerts(teamName)
  let jwk = jwks[header.kid]
  if (!jwk) {
    // 证书可能刚刚轮换：强制刷新一次后重查，把误拒窗口从最长 1 小时缩到分钟级。
    // 每 5 分钟最多强制刷新一次，防止攻击者用随机 kid 打出对证书端点的请求放大。
    if (
      Date.now() - accessCertsLastForcedRefresh >
      ACCESS_CERTS_FORCE_REFRESH_MIN_INTERVAL_MS
    ) {
      accessCertsLastForcedRefresh = Date.now()
      jwks = await fetchAccessCerts(teamName, true)
      jwk = jwks[header.kid]
    }
  }
  if (!jwk) return { valid: false, reason: 'unknown_kid' }

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const signatureValid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    base64UrlDecode(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  )
  return signatureValid ? { valid: true } : { valid: false, reason: 'bad_signature' }
}

// ==========================================
// 独立于 API 的首页 HTML 处理（根路由）
// 管理端配置的 SEO 标题/描述只在浏览器里生效，爬虫与社交平台抓取的是构建产物，
// 因此在边缘取回首页 HTML 并把 <title> / description / og 标签替换为 D1 中的最新值。
// 取不到静态首页或注入失败时一律回退为原始响应，绝不影响主站可用性。
// ==========================================
type SeoOverrides = { title: string; description: string; theme: string }

// index.html 里的占位标记：Worker 用它换取按请求 origin 生成的 canonical / og:url
const SEO_ORIGIN_MARKER = '<!-- seo:origin-tags -->'

const SEO_CACHE_TTL_MS = 60 * 1000
let seoOverridesCache: { value: SeoOverrides; expiresAt: number } | null = null

async function loadSeoOverrides(db: D1Database): Promise<SeoOverrides> {
  const now = Date.now()
  if (seoOverridesCache && seoOverridesCache.expiresAt > now) {
    return seoOverridesCache.value
  }
  const row: any = await db
    .prepare('SELECT seo_title, seo_description, default_theme FROM site_settings WHERE id = 1')
    .first()
  const value: SeoOverrides = {
    // 按 trim 判定：库里存的是原样字符串，管理端只敲一个空格就会让下面的 `if (seo.title)` 成立，
    // 于是把构建期写好的 <title>/og 整个换成空白。空 = 不覆写，才对。
    title: String(row?.seo_title ?? '').trim(),
    description: String(row?.seo_description ?? '').trim(),
    // 只有显式 'dark' / 'light' 才往 <html> 上打标记；'' / 'system' 表示跟随访客系统
    theme: String(row?.default_theme ?? '').trim(),
  }
  seoOverridesCache = { value, expiresAt: now + SEO_CACHE_TTL_MS }
  return value
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function injectSeoOverrides(html: string, seo: SeoOverrides, origin: string): string {
  let out = html
  // 一律用替换函数、不用替换串：文案里出现 $& / $' / $1 时，替换串会把它当成"引用匹配到的内容"改写坏
  if (seo.title) {
    const title = escapeHtmlAttribute(seo.title)
    out = out.replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${title}</title>`)
    out = out.replace(
      /<meta property="og:title"[^>]*>/i,
      () => `<meta property="og:title" content="${title}" />`,
    )
  }
  if (seo.description) {
    const description = escapeHtmlAttribute(seo.description)
    out = out.replace(
      /<meta name="description"[^>]*>/i,
      () => `<meta name="description" content="${description}" />`,
    )
    out = out.replace(
      /<meta property="og:description"[^>]*>/i,
      () => `<meta property="og:description" content="${description}" />`,
    )
  }
  // 规范地址与社交卡片：构建产物里只有一个标记、不含任何域名（见 index.html），
  // 这里按当前请求的 origin 注入——换域名、上 preview 子域都不必重新构建。
  if (origin && out.includes(SEO_ORIGIN_MARKER)) {
    const root = escapeHtmlAttribute(`${origin}/`)
    out = out.replace(
      SEO_ORIGIN_MARKER,
      () =>
        `<link rel="canonical" href="${root}" />\n    <meta property="og:url" content="${root}" />`,
    )
  }
  // 显式设成"日/夜"的站点：把主题打在 <html> 上，第一帧就是对的（不必等 JS 起来）。
  // 跟随系统时这里不注入，交给 index.css 的 prefers-color-scheme 兜底。
  const theme = seo.theme === 'dark' || seo.theme === 'light' ? seo.theme : ''
  if (theme) {
    out = out.replace(/<html\b[^>]*>/i, (tag) =>
      tag.replace(/\/?>$/, (close) => ` data-theme="${theme}"${close}`),
    )
  }
  return out
}

async function serveIndexWithSeo(c: any) {
  try {
    // 先读覆写（60s 缓存）；读不到库就当作没有覆写，正文里的构建期标签照旧
    const seo = (await loadSeoOverrides(c.env.DB).catch(() => null)) ?? {
      title: '',
      description: '',
      theme: '',
    }
    let origin = ''
    try {
      origin = new URL(c.req.raw.url).origin
    } catch {
      origin = ''
    }

    const assetRequest = new Request(c.req.raw.url, {
      method: 'GET',
      headers: new Headers(c.req.raw.headers),
    })
    // 正文总会被改写（注入按请求 origin 生成的 canonical / og:url），条件请求头一律摘掉：
    // 否则资产层用旧 ETag 直接回 304，客户端拿到的还是构建期那一份。
    assetRequest.headers.delete('if-none-match')
    assetRequest.headers.delete('if-modified-since')

    const assetRes = await c.env.ASSETS.fetch(assetRequest)
    if (
      !assetRes.ok ||
      !(assetRes.headers.get('Content-Type') ?? '').includes('text/html')
    ) {
      return assetRes
    }

    const html = await assetRes.text()
    // 正文已改写，必须丢弃原资产的 Content-Length、校验符与编码头：
    // 否则长度不符会截断响应、条件请求会拿旧 ETag 命中 304、压缩头会与实际正文不符
    const headers = new Headers(assetRes.headers)
    headers.delete('content-length')
    headers.delete('etag')
    headers.delete('last-modified')
    headers.delete('content-encoding')
    return new Response(injectSeoOverrides(html, seo, origin), {
      status: assetRes.status,
      headers,
    })
  } catch (err) {
    console.error('SEO injection failed, serving asset as-is:', err)
    try {
      return await c.env.ASSETS.fetch(c.req.raw)
    } catch {
      return c.text('Service Unavailable', 503)
    }
  }
}

// 根应用：/api 交给上面的 API 子应用，根路径与 index.html 走 SEO 注入
const root = new Hono<Env>()
root.route('/api', app)
root.get('/', serveIndexWithSeo)
root.get('/index.html', serveIndexWithSeo)

export default root
