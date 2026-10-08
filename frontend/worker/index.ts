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
  }
}

// 项目状态白名单：防止写入垃圾状态导致项目从公开接口静默消失
const ALLOWED_STATUSES = ['LIVE', 'BETA', 'DRAFT', 'ARCHIVED']

const app = new Hono<Env>().basePath('/api')

// ==========================================
// 0. 全局安全响应头
// 静态资产的 _headers 不覆盖 Worker 响应，
// 因此在此统一为 /api 响应补齐基础防护头。
// ==========================================
app.use('*', async (c, next) => {
  await next()
  c.res.headers.set('X-Content-Type-Options', 'nosniff')
  c.res.headers.set('X-Frame-Options', 'DENY')
  c.res.headers.set('Referrer-Policy', 'no-referrer')
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
        description_json, features_json, metrics_json, timeline_json
      FROM projects
      WHERE status IN ('LIVE', 'BETA')
      ORDER BY sort_order ASC, date DESC
    `
    const { results } = await c.env.DB.prepare(query).all()

    const formatted = results.map((row: any) => ({
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
      challenge: row.challenge || '',
      solution: row.solution || '',
      description: safeJsonParse(row.description_json, { en: '', zh: '' }),
      features: safeJsonParse(row.features_json, []),
      metrics: safeJsonParse(row.metrics_json, []),
      timeline: safeJsonParse(row.timeline_json, []),
    }))

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
        description_json, features_json, metrics_json, timeline_json
      FROM projects
      WHERE id = ? AND status IN ('LIVE', 'BETA')
    `).bind(id).first()

    if (!row) {
      return c.json({ error: 'Project not found' }, 404)
    }

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
      challenge: row.challenge || '',
      solution: row.solution || '',
      description: safeJsonParse(row.description_json, { en: '', zh: '' }),
      features: safeJsonParse(row.features_json, []),
      metrics: safeJsonParse(row.metrics_json, []),
      timeline: safeJsonParse(row.timeline_json, []),
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

adminApp.use('*', async (c, next) => {
  // 防线 1：Bearer 密钥（常量时间比较）
  const authHeader = c.req.header('Authorization') ?? ''
  const providedSecret = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  const expectedSecret = c.env.ADMIN_SECRET_KEY ?? ''
  if (providedSecret && expectedSecret && timingSafeEqual(providedSecret, expectedSecret)) {
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
        await next()
        return
      }
    }
  }

  return c.json({ error: '403 Forbidden: 管理端接口未授权访问' }, 403)
})

// 管理端：获取全量项目（含草稿、归档、内部笔记）
adminApp.get('/projects', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT * FROM projects ORDER BY sort_order ASC, date DESC
    `).all()

    const formatted = results.map((row: any) => ({
      ...row,
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

    await c.env.DB.prepare(`
      INSERT INTO projects (
        id, date, status, name, cn, latin, habitat, type, language, stars, year, shape, version, updated, repository,
        challenge, solution, description_json, features_json, metrics_json, timeline_json, internal_notes, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

/** 解析 GitHub 仓库地址，兼容完整 HTTPS、HTTP、SSH 及无协议格式（如 github.com/owner/repo） */
function parseGithubRepo(rawUrl: string | null | undefined): { owner: string; repo: string } | null {
  if (!rawUrl) return null
  const cleaned = rawUrl
    .trim()
    .replace(/^git@github\.com:/i, '')
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '')
  const match = /^github\.com\/([^/\s#?]+)\/([^/\s#?]+)/i.exec(cleaned)
  if (!match) return null
  return { owner: match[1], repo: match[2] }
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

// 管理端：GitHub 指标同步——按各项目的 repository 地址拉取最新 stars / 最近推送时间 / 最新 Release 版本并写回 D1
adminApp.post('/github-sync', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}))
    const ghHeaders = getGithubHeaders(c, body?.token)

    const { results } = await c.env.DB.prepare(
      'SELECT id, name, repository FROM projects ORDER BY sort_order ASC',
    ).all()

    const outcomes: Record<string, unknown>[] = []
    for (const row of results as unknown as { id: string; name: string; repository: string }[]) {
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
        if (descText) {
          // 增量同步英文与中文描述（若已有自定义描述则保留兼容）
          const descObj = { en: descText, zh: descText }
          sets.push('description_json = ?')
          values.push(JSON.stringify(descObj))
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
        })
      } catch (e: any) {
        outcomes.push({ id: row.id, name: row.name, status: 'error', note: `请求失败: ${e.message}` })
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
    const customToken = c.req.query('token')
    const ghHeaders = getGithubHeaders(c, customToken)

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

    const res = await fetch(
      `https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=updated&per_page=100`,
      { headers: ghHeaders },
    )

    if (!res.ok) {
      const note =
        res.status === 404
          ? `未找到 GitHub 用户: ${username}`
          : res.status === 403
          ? 'GitHub API 访问速率超限 (403)，可提供 GitHub Token 提高限额'
          : `GitHub 响应异常 (${res.status})`
      return c.json({ error: note }, res.status >= 500 ? 500 : 400)
    }

    const ghRepos: any[] = await res.json()

    // 拉取所有已有标本以供比对
    const { results: existing } = await c.env.DB.prepare('SELECT id, name, repository FROM projects').all()
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

    return c.json({ success: true, username, repos: list })
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

    const [owner, repo] = repoFullName.split('/')
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
    const { results: allProjects } = await c.env.DB.prepare('SELECT id, sort_order FROM projects').all()
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

    await c.env.DB.prepare(`
      INSERT INTO projects (
        id, date, status, name, cn, latin, habitat, type, language, stars, year, shape, version, updated, repository,
        challenge, solution, description_json, features_json, metrics_json, timeline_json, internal_notes, sort_order
      ) VALUES (?, ?, 'LIVE', ?, ?, ?, 'GitHub Field', 'Tool', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?)
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
    ).run()

    return c.json({
      success: true,
      message: `标本 SPEC—${newId} (${name}) 导入成功`,
      id: newId,
    })
  } catch (err: any) {
    console.error('GitHub import error:', err)
    return c.json({ error: `导入失败: ${err.message}` }, 500)
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
  payload.icpEnabled = row.icp_enabled === 1
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
    if (typeof body.icpEnabled === 'boolean') {
      insertColumns.push('icp_enabled')
      insertValues.push(body.icpEnabled ? 1 : 0)
      updateAssignments.push('icp_enabled = excluded.icp_enabled')
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

export default app
