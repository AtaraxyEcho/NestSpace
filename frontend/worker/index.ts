import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getCookie } from 'hono/cookie'

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
  try {
    // 强制参数化查询，绝不 SELECT *，坚决排除 internal_notes 等敏感管理字段
    const query = `
      SELECT
        id, date, status, name, cn, latin, habitat, type, language,
        stars, year, shape, version, updated, repository, challenge, solution,
        demo_url, demo_enabled,
        description_json, features_json, metrics_json, timeline_json
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
        // 演示入口：未上线时不下发地址，避免未公开的演示链接外泄
        demoEnabled,
        demoUrl: demoEnabled ? row.demo_url || '' : '',
        challenge: row.challenge || '',
        solution: row.solution || '',
        description: safeJsonParse(row.description_json, { en: '', zh: '' }),
        features: safeJsonParse(row.features_json, []),
        metrics: safeJsonParse(row.metrics_json, []),
        timeline: safeJsonParse(row.timeline_json, []),
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
  try {
    const row: any = await c.env.DB.prepare(`
      SELECT
        id, date, status, name, cn, latin, habitat, type, language,
        stars, year, shape, version, updated, repository, challenge, solution,
        demo_url, demo_enabled,
        description_json, features_json, metrics_json, timeline_json,
        readme_zh, readme_en, compose_dev, compose_prod, docs_synced_at
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
      // 与列表接口同口径：未上线时不下发演示地址
      demoEnabled,
      demoUrl: demoEnabled ? row.demo_url || '' : '',
      challenge: row.challenge || '',
      solution: row.solution || '',
      description: safeJsonParse(row.description_json, { en: '', zh: '' }),
      features: safeJsonParse(row.features_json, []),
      metrics: safeJsonParse(row.metrics_json, []),
      timeline: safeJsonParse(row.timeline_json, []),
      readmeZh: row.readme_zh ?? '',
      readmeEn: row.readme_en ?? '',
      composeDev: row.compose_dev ?? '',
      composeProd: row.compose_prod ?? '',
      docsSyncedAt: row.docs_synced_at ?? '',
    })
  } catch (err: any) {
    return c.json({ error: 'Failed to retrieve project detail' }, 500)
  }
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

function clientKey(c: any): string {
  return (
    c.req.header('CF-Connecting-IP') ||
    String(c.req.header('X-Forwarded-For') ?? '').split(',')[0]?.trim() ||
    'unknown'
  )
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

  // 防线 1：Bearer 密钥（常量时间比较）
  const authHeader = c.req.header('Authorization') ?? ''
  const providedSecret = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  const expectedSecret = c.env.ADMIN_SECRET_KEY ?? ''
  if (providedSecret && expectedSecret && timingSafeEqual(providedSecret, expectedSecret)) {
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

// 管理端：获取全量项目（含草稿、归档、内部笔记）
adminApp.get('/projects', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT * FROM projects ORDER BY sort_order ASC, date DESC LIMIT ${QUERY_ROW_LIMIT}
    `).all()

    const formatted = results.map((row: any) => ({
      ...row,
      // 管理端要原值供编辑；前端类型是布尔，D1 读回的是 0/1，必须在此转换
      demoEnabled: row.demo_enabled === 1,
      demoUrl: row.demo_url || '',
      description: safeJsonParse(row.description_json, {}),
      features: safeJsonParse(row.features_json, []),
      metrics: safeJsonParse(row.metrics_json, []),
      timeline: safeJsonParse(row.timeline_json, []),
    }))

    return c.json(formatted)
  } catch (err: any) {
    console.error('Admin fetch error:', err)
    return c.json({ error: 'Failed to fetch admin projects' }, 500)
  }
})

// 管理端：新增项目
adminApp.post('/projects', async (c) => {
  try {
    const body = await c.req.json()
    if (!body.id || !body.name || !body.status) {
      return c.json({ error: 'Missing required fields: id, name, status' }, 400)
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
    // 与 PUT 同判据：开关与地址是一对约束。这里不能静默降级为 0，
    // 否则管理端会显示"已上线"而库里是 0（假状态）。
    if (body.demoEnabled === true && !demoUrl) {
      return c.json({ error: '开启演示入口前必须先填写演示地址' }, 400)
    }
    const demoEnabled = body.demoEnabled === true ? 1 : 0

    await c.env.DB.prepare(`
      INSERT INTO projects (
        id, date, status, name, cn, latin, habitat, type, language, stars, year, shape, version, updated, repository,
        demo_url, demo_enabled,
        challenge, solution, description_json, features_json, metrics_json, timeline_json, internal_notes, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      body.challenge || '',
      body.solution || '',
      JSON.stringify(body.description || {}),
      JSON.stringify(body.features || []),
      JSON.stringify(body.metrics || []),
      JSON.stringify(body.timeline || []),
      body.internal_notes || '',
      body.sort_order || 0,
    ).run()

    return c.json({ success: true, message: '项目创建成功' }, 201)
  } catch (err: any) {
    console.error('Admin create error:', err)
    return c.json({ error: 'Create failed' }, 500)
  }
})

// 管理端：更新项目（部分更新：仅覆盖请求体中出现的字段，避免漏传字段被写成 NULL）
// 可编辑列白名单：键为请求体字段名，值为数据库列名，杜绝任意列注入
const EDITABLE_COLUMNS: Record<string, string> = {
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
  challenge: 'challenge',
  solution: 'solution',
  internal_notes: 'internal_notes',
  sort_order: 'sort_order',
  readme_zh: 'readme_zh',
  readme_en: 'readme_en',
  compose_dev: 'compose_dev',
  compose_prod: 'compose_prod',
}
const EDITABLE_JSON_COLUMNS: Record<string, string> = {
  description: 'description_json',
  features: 'features_json',
  metrics: 'metrics_json',
  timeline: 'timeline_json',
}

adminApp.put('/projects/:id', async (c) => {
  const id = c.req.param('id')
  try {
    const body = await c.req.json()
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
        values.push(JSON.stringify(body[field]))
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

/** 解析 GitHub 仓库地址，兼容完整 HTTPS、HTTP、SSH、无协议格式以及缺冒号格式（如 https//github.com/owner/repo） */
function parseGithubRepo(rawUrl: string | null | undefined): { owner: string; repo: string } | null {
  if (!rawUrl) return null
  const cleaned = rawUrl
    .trim()
    .replace(/^git@github\.com:/i, '')
    .replace(/^https?:\/\/?/i, '')
    .replace(/^https?\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '')
  const match = /^(?:github\.com\/)?([^/\s#?]+)\/([^/\s#?]+)/i.exec(cleaned)
  if (!match) return null
  return { owner: match[1], repo: match[2] }
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
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      { headers: { ...headers, Accept: 'application/vnd.github.raw' } },
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

function nowStamp(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

// 管理端：GitHub 指标同步——按各项目的 repository 地址拉取最新 stars / 最近推送时间 / 最新 Release 版本并写回 D1
// body.fetchDocs 为真时同时抓取 README 与 Compose 文档（只填充空白字段，不覆盖手工维护的内容）
adminApp.post('/github-sync', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}))
    const ghHeaders = getGithubHeaders(c, body?.token)
    const fetchDocs = body?.fetchDocs === true

    const { results } = await c.env.DB.prepare(
      `SELECT id, name, repository, description_json,
              (readme_zh <> '') AS has_readme_zh,
              (readme_en <> '') AS has_readme_en,
              (compose_dev <> '') AS has_compose_dev,
              (compose_prod <> '') AS has_compose_prod
       FROM projects ORDER BY sort_order ASC LIMIT ${QUERY_ROW_LIMIT}`,
    ).all()

    const outcomes: Record<string, unknown>[] = []
    // GitHub 一旦返回 403（频率超限）就立即停止后续请求：
    // 继续跑只会把配额与 Worker 时间浪费在必然失败的调用上。
    // 另：此处刻意保持串行（不并发），避免匿名 API 上的突发压力触发更严格的限流。
    let rateLimited = false
    for (const row of results as unknown as {
      id: string
      name: string
      repository: string
      description_json: string
      has_readme_zh: number
      has_readme_en: number
      has_compose_dev: number
      has_compose_prod: number
    }[]) {
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
        outcomes.push({ id: row.id, name: row.name, status: 'skipped', note: '仓库地址为空或非有效 GitHub 格式' })
        continue
      }
      const { owner, repo } = parsed
      try {
        const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
          headers: ghHeaders,
        })
        if (!repoRes.ok) {
          if (repoRes.status === 403) rateLimited = true
          const errNote =
            repoRes.status === 403
              ? 'GitHub 访问频次超限 (403)，可在设置中填入 GitHub Token'
              : repoRes.status === 404
              ? '仓库未找到或为私有仓库 (404)'
              : `GitHub API 响应 ${repoRes.status}`
          outcomes.push({ id: row.id, name: row.name, status: 'error', note: errNote })
          continue
        }
        const data: any = await repoRes.json()
        const starsCount = typeof data.stargazers_count === 'number' ? data.stargazers_count : 0
        const stars = starsCount >= 1000 ? `${(starsCount / 1000).toFixed(1)}k` : String(starsCount)
        const updated = String(data.pushed_at || '').slice(0, 10).replace(/-/g, '.')
        let version: string | null = null
        try {
          const relRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, {
            headers: ghHeaders,
          })
          if (relRes.ok) {
            const relData: any = await relRes.json()
            version = relData.tag_name ?? null
          }
        } catch {
          // Release 信息获取失败不阻断整体同步
        }

        const descText = (data.description || '').trim()
        const repoLang = (data.language || '').trim()

        const sets = ['stars = ?']
        const values: (string | number)[] = [stars]
        if (updated) {
          sets.push('updated = ?')
          values.push(updated)
        }
        if (version) {
          sets.push('version = ?')
          values.push(version)
        }
        if (repoLang) {
          sets.push('language = ?')
          values.push(repoLang)
        }
        // 描述只在标本完全没有文案时做首次填充：后台手写的中英文简介一律不覆盖
        let descNote: string | undefined
        if (descText) {
          const current = safeJsonParse(row.description_json, {}) as {
            en?: string
            zh?: string
          }
          const hasOwnCopy = Boolean(
            (current.en ?? '').trim() || (current.zh ?? '').trim(),
          )
          if (hasOwnCopy) {
            descNote = '描述已保留，未覆盖后台手写文案'
          } else {
            sets.push('description_json = ?')
            values.push(JSON.stringify({ en: descText, zh: descText }))
            descNote = '描述已按仓库信息首次填充'
          }
        }
        // 文档抓取同样只填充空白字段：后台手工整理过的 README / Compose 一律不覆盖
        let docNote: string | undefined
        if (fetchDocs) {
          const docs = await fetchProjectDocs(owner, repo, ghHeaders)
          const candidates: Array<[string, string, boolean]> = [
            ['readme_zh', docs.readmeZh, row.has_readme_zh === 1],
            ['readme_en', docs.readmeEn, row.has_readme_en === 1],
            ['compose_dev', docs.composeDev, row.has_compose_dev === 1],
            ['compose_prod', docs.composeProd, row.has_compose_prod === 1],
          ]
          const filled: string[] = []
          for (const [column, content, exists] of candidates) {
            if (content && !exists) {
              sets.push(`${column} = ?`)
              values.push(content)
              filled.push(column)
            }
          }
          const fetchedAny = Boolean(
            docs.readmeZh || docs.readmeEn || docs.composeDev || docs.composeProd,
          )
          if (filled.length > 0) {
            sets.push('docs_synced_at = ?')
            values.push(nowStamp())
            docNote = `文档已填充 ${filled.join(' / ')}`
          } else if (!fetchedAny) {
            // 一个文件都没抓到：仓库里没有对应文件，或已触发 GitHub 频率限制
            docNote = '未抓到文档（仓库无对应文件，或已达到 GitHub 频率限制）'
          } else {
            docNote = '文档均已存在，未覆盖'
          }
        }
        sets.push('updated_at = CURRENT_TIMESTAMP')
        values.push(row.id)
        await c.env.DB.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run()

        outcomes.push({
          id: row.id,
          name: data.full_name || row.name,
          status: 'synced',
          stars,
          version: version || '',
          updated: updated || '',
          language: repoLang || undefined,
          description: descText || undefined,
          note: [descNote, docNote].filter(Boolean).join('；') || undefined,
        })
      } catch (e: any) {
        console.error('GitHub sync row error:', row.id, e)
        outcomes.push({ id: row.id, name: row.name, status: 'error', note: '请求失败（GitHub 或网络异常）' })
      }
    }

    return c.json({ success: true, results: outcomes })
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
      username = 'AtaraxyEcho'
    }

    // 逐页取回仓库列表（每页 100，最多 3 页）；超出上限时明确告知，而不是静默丢弃
    const REPO_PAGE_SIZE = 100
    const REPO_PAGE_MAX = 3
    const ghRepos: any[] = []
    for (let page = 1; page <= REPO_PAGE_MAX; page++) {
      const res = await fetch(
        `https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=updated&per_page=${REPO_PAGE_SIZE}&page=${page}`,
        { headers: ghHeaders },
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

    return c.json({ success: true, username, repos: list, truncated })
  } catch (err: any) {
    console.error('GitHub repos fetch error:', err)
    return c.json({ error: 'Failed to fetch repositories' }, 500)
  }
})

// 管理端：从 GitHub 仓库一键导入为馆藏标本
adminApp.post('/github-import', async (c) => {
  try {
    const body = await c.req.json()
    const repoFullName = (body.repoFullName || '').trim()
    const customToken = body.token
    if (!repoFullName || !repoFullName.includes('/')) {
      return c.json({ error: '请提供正确的仓库全名（如 AtaraxyEcho/NestSpace）' }, 400)
    }

    // 仓库全名只接受 owner/repo 两段且字符集受限：避免 `../` 之类拼出路径，
    // 把请求带到 api.github.com 的其他端点上去
    const segments = repoFullName.split('/')
    const owner = segments[0]?.trim() ?? ''
    const repo = segments[1]?.trim() ?? ''
    const isSafeSegment = (value: string) =>
      /^[A-Za-z0-9._-]+$/.test(value) && value !== '.' && value !== '..'
    if (segments.length !== 2 || !isSafeSegment(owner) || !isSafeSegment(repo)) {
      return c.json({ error: '仓库全名格式不合法，应形如 AtaraxyEcho/NestSpace' }, 400)
    }
    const ghHeaders = getGithubHeaders(c, customToken)

    const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers: ghHeaders })
    if (!repoRes.ok) {
      return c.json({ error: `无法获取 GitHub 仓库信息 (${repoRes.status})` }, 400)
    }
    const repoData: any = await repoRes.json()

    // 检查是否已收录
    const existing: any = await c.env.DB.prepare('SELECT id FROM projects WHERE repository LIKE ?').bind(`%${owner}/${repo}%`).first()
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
    const stars = starsCount >= 1000 ? `${(starsCount / 1000).toFixed(1)}k` : String(starsCount)
    const updated = String(repoData.pushed_at || '').slice(0, 10).replace(/-/g, '.') || new Date().toISOString().slice(0, 10).replace(/-/g, '.')
    const createdDate = String(repoData.created_at || '').slice(0, 7).replace(/-/g, '.') || updated.slice(0, 7)
    const year = createdDate.slice(0, 4) || String(new Date().getFullYear())

    // 轮转几何形态
    const shapes = ['aperture', 'lumen', 'fjord', 'meridian']
    const shape = shapes[maxNum % shapes.length]

    // 提取 Release 版本号
    let version = 'v1.0.0'
    try {
      const relRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, { headers: ghHeaders })
      if (relRes.ok) {
        const relData: any = await relRes.json()
        if (relData.tag_name) version = relData.tag_name
      }
    } catch {
      // 忽略 Release 获取失败
    }

    const name = repoData.name
    const cnName = repoData.name
    const descText = repoData.description || `${name} — 开源工程实践`
    const language = repoData.language || 'TypeScript'
    const repository = `https://github.com/${repoData.full_name}`

    const description = JSON.stringify({ en: descText, zh: descText })
    const features = JSON.stringify(
      Array.isArray(repoData.topics) && repoData.topics.length > 0
        ? repoData.topics.slice(0, 4)
        : ['Open Source', language, 'Automated CI', 'Production Ready']
    )
    const metrics = JSON.stringify([
      { label: 'STARS', value: String(starsCount) },
      { label: 'FORKS', value: String(repoData.forks_count || 0) },
      { label: 'OPEN ISSUES', value: String(repoData.open_issues_count || 0) },
    ])
    const timeline = JSON.stringify([
      { date: createdDate, title: 'Repository created', note: `Initialized as ${repoData.full_name} on GitHub.` },
      { date: updated.slice(0, 7), title: 'Latest update', note: 'Recent activities synced from remote.' },
    ])

    // 导入时同步抓取 README / Compose，让新标本开箱即有完整文档
    const docs = await fetchProjectDocs(owner, repo, ghHeaders)

    await c.env.DB.prepare(`
      INSERT INTO projects (
        id, date, status, name, cn, latin, habitat, type, language, stars, year, shape, version, updated, repository,
        challenge, solution, description_json, features_json, metrics_json, timeline_json, internal_notes, sort_order,
        readme_zh, readme_en, compose_dev, compose_prod, docs_synced_at
      ) VALUES (?, ?, 'LIVE', ?, ?, ?, 'GitHub Field', 'Tool', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?)
    `).bind(
      newId,
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
      'Automated curation from GitHub remote repository.',
      'Continuous development and field maintenance.',
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
    ).run()

    return c.json({
      success: true,
      message: `标本 SPEC—${newId} (${name}) 导入成功`,
      id: newId,
      docs: {
        readmeZh: docs.readmeZh.length,
        readmeEn: docs.readmeEn.length,
        composeDev: docs.composeDev.length,
        composeProd: docs.composeProd.length,
      },
    })
  } catch (err: any) {
    console.error('GitHub import error:', err)
    return c.json({ error: '导入失败，请稍后重试（服务器内部错误）' }, 500)
  }
})

// ==========================================
// 3. 站点文案设置接口
// ==========================================

// 公开端：获取站点文案与配置（空字段由前端回退到内置默认值，无敏感信息）
app.get('/site-settings', async (c) => {
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
const SITE_SETTINGS_COLUMNS: Record<string, string> = {
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

const SITE_SETTINGS_JSON_COLUMNS: Record<string, string> = {
  navItems: 'nav_items_json',
  customActivityLog: 'activity_log_json',
}

// 布尔型站点设置（D1 中以 0/1 存储）
const SITE_SETTINGS_BOOLEAN_COLUMNS: Record<string, string> = {
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
    payload[field] = field === 'navItems' ? safeJsonParse(row[column], null) : safeJsonParse(row[column], [])
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
    return c.json(settingsPayloadFromRow(row))
  } catch (err: any) {
    console.error('Admin fetch site settings error:', err)
    return c.json({ error: 'Failed to fetch site settings' }, 500)
  }
})

// 管理端：部分更新站点设置（UPSERT，容忍迁移未插入默认行的情况）
adminApp.put('/site-settings', async (c) => {
  try {
    const body = await c.req.json()

    const insertColumns: string[] = []
    const insertValues: (string | number)[] = [1]
    const updateAssignments: string[] = []
    for (const [field, column] of Object.entries(SITE_SETTINGS_COLUMNS)) {
      if (body[field] !== undefined) {
        insertColumns.push(column)
        insertValues.push(String(body[field]))
        updateAssignments.push(`${column} = excluded.${column}`)
      }
    }
    for (const [field, column] of Object.entries(SITE_SETTINGS_JSON_COLUMNS)) {
      if (body[field] !== undefined) {
        insertColumns.push(column)
        insertValues.push(JSON.stringify(body[field]))
        updateAssignments.push(`${column} = excluded.${column}`)
      }
    }
    for (const [field, column] of Object.entries(SITE_SETTINGS_BOOLEAN_COLUMNS)) {
      if (typeof body[field] === 'boolean') {
        insertColumns.push(column)
        insertValues.push(body[field] ? 1 : 0)
        updateAssignments.push(`${column} = excluded.${column}`)
      }
    }
    if (insertColumns.length === 0) {
      return c.json({ error: 'No editable fields provided' }, 400)
    }

    await c.env.DB.prepare(
      `INSERT INTO site_settings (id, ${insertColumns.join(', ')})
       VALUES (?, ${insertColumns.map(() => '?').join(', ')})
       ON CONFLICT(id) DO UPDATE SET ${updateAssignments.join(', ')}, updated_at = CURRENT_TIMESTAMP`,
    ).bind(...insertValues).run()

    return c.json({ success: true, message: '站点设置已保存' })
  } catch (err: any) {
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

/** 常量时间字符串比较（仅在长度一致时执行全长度异或比对） */
function timingSafeEqual(a: string, b: string): boolean {
  const bufA = new TextEncoder().encode(a)
  const bufB = new TextEncoder().encode(b)
  if (bufA.byteLength !== bufB.byteLength) return false
  let diff = 0
  for (let i = 0; i < bufA.byteLength; i++) {
    diff |= bufA[i] ^ bufB[i]
  }
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
  const res = await fetch(`https://${teamName}.cloudflareaccess.com/cdn-cgi/access/certs`)
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
type SeoOverrides = { title: string; description: string }

const SEO_CACHE_TTL_MS = 60 * 1000
let seoOverridesCache: { value: SeoOverrides; expiresAt: number } | null = null

async function loadSeoOverrides(db: D1Database): Promise<SeoOverrides> {
  const now = Date.now()
  if (seoOverridesCache && seoOverridesCache.expiresAt > now) {
    return seoOverridesCache.value
  }
  const row: any = await db
    .prepare('SELECT seo_title, seo_description FROM site_settings WHERE id = 1')
    .first()
  const value: SeoOverrides = {
    title: String(row?.seo_title ?? ''),
    description: String(row?.seo_description ?? ''),
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

function injectSeoOverrides(html: string, seo: SeoOverrides): string {
  let out = html
  if (seo.title) {
    const title = escapeHtmlAttribute(seo.title)
    out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`)
    out = out.replace(
      /<meta property="og:title"[^>]*>/i,
      `<meta property="og:title" content="${title}" />`,
    )
  }
  if (seo.description) {
    const description = escapeHtmlAttribute(seo.description)
    out = out.replace(
      /<meta name="description"[^>]*>/i,
      `<meta name="description" content="${description}" />`,
    )
    out = out.replace(
      /<meta property="og:description"[^>]*>/i,
      `<meta property="og:description" content="${description}" />`,
    )
  }
  return out
}

async function serveIndexWithSeo(c: any) {
  try {
    // 先读覆写（60s 缓存）：只有存在覆写时才需要改写正文，
    // 也才有必要摘掉条件请求头——否则资产层会用旧 ETag 直接回 304，
    // 客户端就永远拿不到注入后的头部
    const seo = await loadSeoOverrides(c.env.DB).catch(() => null)
    const hasOverrides = Boolean(seo && (seo.title || seo.description))

    const assetRequest = new Request(c.req.raw.url, {
      method: 'GET',
      headers: new Headers(c.req.raw.headers),
    })
    if (hasOverrides) {
      assetRequest.headers.delete('if-none-match')
      assetRequest.headers.delete('if-modified-since')
    }

    const assetRes = await c.env.ASSETS.fetch(assetRequest)
    if (
      !hasOverrides ||
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
    return new Response(injectSeoOverrides(html, seo as SeoOverrides), {
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
