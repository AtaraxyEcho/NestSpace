import type { Project } from '../types/project'
import type { SiteSettings } from '../types/siteSettings'
import { mergeSiteSettings } from '../data/defaultSiteSettings'
import { readSession, writeSession, clearSession } from '../utils/safeStorage'

const TOKEN_KEY = 'nestspace_admin_secret'
// 本次标签页的内存副本：sessionStorage 被禁用时，登录成功的口令仍然要能用于后续请求。
// 否则"验证成功→立刻 403"（getAdminToken 读回空串），管理端在隐私模式/企业策略下完全不可用。
let memoryToken = ''

export function getAdminToken(): string {
  if (memoryToken) return memoryToken
  const stored = readSession(TOKEN_KEY)
  if (stored) memoryToken = stored
  return stored
}

export function setAdminToken(token: string) {
  memoryToken = token
  if (token) {
    writeSession(TOKEN_KEY, token)
  } else {
    clearSession(TOKEN_KEY)
  }
}

/**
 * 401/403 说明当前口令不可用：清掉存储的口令。
 * 否则每次挂载都会拿同一份失效口令重试，徒增 Worker 侧的失败计数（连续 10 次即被 429 锁定）。
 */
function clearTokenIfUnauthorized(status: number) {
  if (status === 401 || status === 403) setAdminToken('')
}

function getAuthHeaders(): HeadersInit {
  const token = getAdminToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

/**
 * 验证管理员凭证并获取全量项目（含草稿/审核状态）
 */
export async function verifyAndFetchAdminProjects(customToken?: string): Promise<{ success: boolean; data?: Project[]; error?: string }> {
  const tokenToUse = customToken !== undefined ? customToken : getAdminToken()
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  }
  if (tokenToUse) {
    headers['Authorization'] = `Bearer ${tokenToUse}`
  }

  try {
    const res = await fetch('/api/admin/projects', {
      headers,
    })

    if (res.status === 401 || res.status === 403) {
      clearTokenIfUnauthorized(res.status)
      const errJson = await res.json().catch(() => ({}))
      return {
        success: false,
        error: (errJson as any).error || '权限不足：口令无效或未被 Cloudflare 授权',
      }
    }

    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After')
      return {
        success: false,
        error: `鉴权失败次数过多，已被临时限制，请稍后再试${retryAfter ? `（约 ${retryAfter} 秒后）` : ''}`,
      }
    }

    if (!res.ok) {
      return { success: false, error: `服务器响应异常: ${res.status}` }
    }

    const data = await res.json()
    if (customToken !== undefined) {
      setAdminToken(customToken)
    }
    return { success: true, data: data as Project[] }
  } catch (err: any) {
    return { success: false, error: `网络连接失败: ${err.message}` }
  }
}

/**
 * 取单件完整记录。管理端列表为控制响应体积不带四份长文档，抽屉打开时用这个接口取全文。
 */
export async function fetchAdminProject(
  id: string,
): Promise<{ success: boolean; data?: Project; error?: string }> {
  const token = getAdminToken()
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  try {
    const res = await fetch(`/api/admin/projects/${encodeURIComponent(id)}`, { headers })
    if (res.status === 401 || res.status === 403) {
      clearTokenIfUnauthorized(res.status)
      const errJson = await res.json().catch(() => ({}))
      return {
        success: false,
        error: (errJson as any).error || '权限不足：口令无效或未被 Cloudflare 授权',
      }
    }
    if (res.status === 429) {
      return { success: false, error: '鉴权失败次数过多，已被临时限制，请稍后再试' }
    }
    if (res.status === 404) {
      return { success: false, error: '这件标本已不存在（可能刚被删除）' }
    }
    if (!res.ok) {
      return { success: false, error: `服务器响应异常: ${res.status}` }
    }
    return { success: true, data: (await res.json()) as Project }
  } catch (err: any) {
    return { success: false, error: `网络连接失败: ${err.message}` }
  }
}

/**
 * 管理端保存或更新项目到 D1 数据库
 */
export async function saveAdminProject(project: Project, isNew = false): Promise<{ success: boolean; error?: string }> {
  try {
    const url = isNew ? '/api/admin/projects' : `/api/admin/projects/${encodeURIComponent(project.id)}`
    const method = isNew ? 'POST' : 'PUT'

    const res = await fetch(url, {
      method,
      headers: getAuthHeaders(),
      body: JSON.stringify(project),
    })

    clearTokenIfUnauthorized(res.status)
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}))
      return { success: false, error: (errJson as any).error || `保存失败: HTTP ${res.status}` }
    }

    return { success: true }
  } catch (err: any) {
    return { success: false, error: `网络异常: ${err.message}` }
  }
}

/**
 * 管理端获取站点文案设置（与默认值合并，空字段以默认文案呈现便于编辑）。
 * `updatedAt` 是单行表的版本戳，不进 SiteSettings（mergeSiteSettings 只遍历内置默认有的键），
 * 单独返回给保存路径当乐观锁用。
 */
export async function fetchAdminSiteSettings(): Promise<{
  success: boolean
  data?: SiteSettings
  updatedAt?: string
  error?: string
}> {
  try {
    const res = await fetch('/api/admin/site-settings', {
      headers: getAuthHeaders(),
    })

    clearTokenIfUnauthorized(res.status)
    if (!res.ok) {
      return { success: false, error: `服务器响应异常: ${res.status}` }
    }
    const raw = (await res.json()) as Partial<SiteSettings> & { updatedAt?: string }
    return { success: true, data: mergeSiteSettings(raw), updatedAt: raw.updatedAt ?? '' }
  } catch (err: any) {
    return { success: false, error: `网络连接失败: ${err.message}` }
  }
}

/**
 * 管理端保存站点文案设置到 D1 数据库。
 * 这个接口本来就是**部分更新**（只写请求体里出现、且在白名单映射里的字段），
 * 所以调用方传"改动的那几列"即可——不要图省事传整份，那会把内置默认抄进库（见 App.tsx saveSettings）。
 * `expectedUpdatedAt` 是读取时拿到的版本戳；服务端发现库里已被别处写过就返回 409（conflict），
 * 避免两个标签页互相把对方的改动写回旧值。
 */
export async function saveAdminSiteSettings(
  settings: Partial<SiteSettings>,
  expectedUpdatedAt?: string,
): Promise<{ success: boolean; error?: string; conflict?: boolean; updatedAt?: string }> {
  try {
    const res = await fetch('/api/admin/site-settings', {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(
        expectedUpdatedAt ? { ...settings, expectedUpdatedAt } : settings,
      ),
    })

    clearTokenIfUnauthorized(res.status)
    const json: any = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        success: false,
        conflict: res.status === 409 || json?.conflict === true,
        error: json?.error || `保存失败: HTTP ${res.status}`,
      }
    }

    return { success: true, updatedAt: json?.updatedAt ?? '' }
  } catch (err: any) {
    return { success: false, error: `网络异常: ${err.message}` }
  }
}

export type RemoteGithubRepo = {
  id: number
  name: string
  full_name: string
  description: string
  stars: number
  language: string
  updated_at: string
  created_at: string
  html_url: string
  is_fork: boolean
  already_imported: boolean
  specimen_id: string | null
}

/**
 * 管理端触发 GitHub 指标同步：按各项目仓库地址拉取最新 stars / 推送时间 / Release 版本
 * fetchDocs 为真时同时抓取 README 与 Compose 文档（仅填充空白字段）
 */
export async function syncGithubRepos(
  token?: string,
  fetchDocs = false,
  /** 只同步这些标本；省略 = 全表（老语义）。空数组不发出去，见调用方的注释 */
  ids?: string[],
): Promise<{
  success: boolean
  results?: Array<Record<string, unknown>>
  /** GitHub 剩余请求额度（读到 X-RateLimit-Remaining 时给出） */
  rateLimitRemaining?: number | null
  error?: string
}> {
  try {
    const headers = getAuthHeaders() as Record<string, string>
    if (token) headers['X-GitHub-Token'] = token
    const payload: Record<string, unknown> = { token, fetchDocs }
    if (ids && ids.length) payload.ids = ids
    const res = await fetch('/api/admin/github-sync', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })
    clearTokenIfUnauthorized(res.status)
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}))
      return { success: false, error: (errJson as any).error || `同步失败: HTTP ${res.status}` }
    }
    const data = await res.json()
    return {
      success: true,
      results: data.results,
      rateLimitRemaining: typeof data.rateLimitRemaining === 'number' ? data.rateLimitRemaining : null,
    }
  } catch (err: any) {
    return { success: false, error: `网络异常: ${err.message}` }
  }
}

/**
 * 扫描指定 GitHub 用户/组织的所有公开仓库
 */
export async function fetchGithubUserRepos(
  username?: string,
  token?: string,
): Promise<{
  success: boolean
  username?: string
  repos?: RemoteGithubRepo[]
  /** 仓库数量超过分页上限（3 页 300 个）时为真 */
  truncated?: boolean
  /** GitHub 剩余请求额度 */
  rateLimitRemaining?: number | null
  error?: string
}> {
  try {
    // Token 只走 X-GitHub-Token 头，绝不放进 URL：查询串会留在浏览器历史与边缘访问日志
    const params = new URLSearchParams()
    if (username) params.set('username', username)
    const headers = getAuthHeaders() as Record<string, string>
    if (token) headers['X-GitHub-Token'] = token

    const res = await fetch(`/api/admin/github-repos?${params.toString()}`, {
      headers,
    })
    clearTokenIfUnauthorized(res.status)
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}))
      return { success: false, error: (errJson as any).error || `扫描失败: HTTP ${res.status}` }
    }
    const data = await res.json()
    return {
      success: true,
      username: data.username,
      repos: data.repos,
      truncated: Boolean(data.truncated),
      rateLimitRemaining: typeof data.rateLimitRemaining === 'number' ? data.rateLimitRemaining : null,
    }
  } catch (err: any) {
    return { success: false, error: `网络异常: ${err.message}` }
  }
}

/**
 * 从 GitHub 远程仓库一键导入为标本
 */
/**
 * 按目录批量读取预览图候选（只返回地址列表，不写库；写库仍要点「保存项目」）
 */
export async function fetchPreviewImagesFromDir(
  dir: string,
  token?: string,
): Promise<{
  success: boolean
  dir?: string
  images?: string[]
  found?: number
  truncated?: boolean
  skippedNonBitmap?: number
  skippedBadge?: number
  subDirectories?: number
  rateLimitRemaining?: number | null
  error?: string
}> {
  try {
    const headers = getAuthHeaders() as Record<string, string>
    if (token) headers['X-GitHub-Token'] = token

    const res = await fetch('/api/admin/preview-import', {
      method: 'POST',
      headers,
      body: JSON.stringify({ dir }),
    })
    clearTokenIfUnauthorized(res.status)
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}))
      return { success: false, error: (errJson as any).error || `读取失败: HTTP ${res.status}` }
    }
    return await res.json()
  } catch (err: any) {
    return { success: false, error: `网络异常: ${err.message}` }
  }
}

export async function importGithubRepo(
  repoFullName: string,
  token?: string,
): Promise<{
  success: boolean
  id?: string
  message?: string
  error?: string
  /** 导入时各文档抓到的字符数（0 = 没抓到），用于在提示里如实说明 */
  docs?: { readmeZh: number; readmeEn: number; composeDev: number; composeProd: number }
}> {
  try {
    const headers = getAuthHeaders() as Record<string, string>
    if (token) headers['X-GitHub-Token'] = token

    const res = await fetch('/api/admin/github-import', {
      method: 'POST',
      headers,
      body: JSON.stringify({ repoFullName, token }),
    })
    clearTokenIfUnauthorized(res.status)
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}))
      return { success: false, error: (errJson as any).error || `导入失败: HTTP ${res.status}` }
    }
    const data = await res.json()
    return { success: true, id: data.id, message: data.message }
  } catch (err: any) {
    return { success: false, error: `网络异常: ${err.message}` }
  }
}

/**
 * 管理端从 D1 数据库删除项目
 */
export async function deleteAdminProject(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/admin/projects/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })

    clearTokenIfUnauthorized(res.status)
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}))
      return { success: false, error: (errJson as any).error || `删除失败: HTTP ${res.status}` }
    }

    return { success: true }
  } catch (err: any) {
    return { success: false, error: `网络异常: ${err.message}` }
  }
}

export type VisitStatBucket = { value: string; pv: number }

export type VisitStats = {
  generatedAt: string
  range: { days: number; since: string; today: string }
  totals: {
    pv: number
    uv: number
    todayPv: number
    todayUv: number
    rangePv: number
    rangeUv: number
    adminPv: number
  }
  daily: { day: string; pv: number; uv: number }[]
  pages: { surface: string; ref: string; pv: number }[]
  dims: {
    country: VisitStatBucket[]
    device: VisitStatBucket[]
    lang: VisitStatBucket[]
    source: VisitStatBucket[]
  }
  hours: { hour: number; pv: number }[]
  events: {
    event: string
    total: number
    items: { method: string; host: string; ref: string; count: number }[]
  }[]
}

/** 管理端读取访问统计；`days` 只影响曲线与分布窗口，累计值始终是全量 */
export async function fetchVisitStats(
  days = 30,
): Promise<{ success: boolean; data?: VisitStats; error?: string }> {
  try {
    const params = new URLSearchParams({ days: String(days) })
    const res = await fetch(`/api/admin/visits?${params.toString()}`, {
      headers: getAuthHeaders(),
    })

    clearTokenIfUnauthorized(res.status)
    const json: any = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { success: false, error: json?.error || `加载失败: HTTP ${res.status}` }
    }
    // 2xx 不代表形状正确（204、代理 HTML、半截 JSON 都会走到这里）。
    // 面板会直接解引用 totals/dims/daily/pages/events，先校验再交出去，
    // 否则一次异常响应就把整个管理端白屏。
    const dims = json?.dims
    if (
      !json ||
      typeof json !== 'object' ||
      !json.totals ||
      typeof json.totals !== 'object' ||
      !json.range ||
      typeof json.range !== 'object' ||
      !dims ||
      !Array.isArray(dims.country) ||
      !Array.isArray(dims.device) ||
      !Array.isArray(dims.lang) ||
      !Array.isArray(dims.source) ||
      !Array.isArray(json.daily) ||
      !Array.isArray(json.pages) ||
      !Array.isArray(json.hours) ||
      !Array.isArray(json.events)
    ) {
      return { success: false, error: '访问统计返回了无法识别的数据（迁移或代理异常）' }
    }

    // 顶层数组存在不代表每一项都能解引用：daily:[null] 之类的半截响应会让面板白屏。
    // 这里统一归一化，坏项被过滤/补默认值，渲染层拿到的始终是完整形状。
    const raw = json as any
    const num = (value: unknown): number =>
      typeof value === 'number' && Number.isFinite(value) ? value : 0
    const text = (value: unknown): string => (typeof value === 'string' ? value : '')
    const objects = (value: unknown): Record<string, any>[] =>
      (Array.isArray(value) ? value : []).filter(
        (entry): entry is Record<string, any> =>
          Boolean(entry) && typeof entry === 'object',
      )
    const data: VisitStats = {
      generatedAt: text(raw.generatedAt),
      range: {
        days: num(raw.range.days) || days,
        since: text(raw.range.since),
        today: text(raw.range.today),
      },
      totals: {
        pv: num(raw.totals.pv),
        uv: num(raw.totals.uv),
        todayPv: num(raw.totals.todayPv),
        todayUv: num(raw.totals.todayUv),
        rangePv: num(raw.totals.rangePv),
        rangeUv: num(raw.totals.rangeUv),
        adminPv: num(raw.totals.adminPv),
      },
      daily: objects(raw.daily).map((entry) => ({
        day: text(entry.day),
        pv: num(entry.pv),
        uv: num(entry.uv),
      })),
      pages: objects(raw.pages).map((entry) => ({
        surface: text(entry.surface),
        ref: text(entry.ref),
        pv: num(entry.pv),
      })),
      dims: {
        country: objects(raw.dims.country).map((entry) => ({
          value: text(entry.value),
          pv: num(entry.pv),
        })),
        device: objects(raw.dims.device).map((entry) => ({
          value: text(entry.value),
          pv: num(entry.pv),
        })),
        lang: objects(raw.dims.lang).map((entry) => ({
          value: text(entry.value),
          pv: num(entry.pv),
        })),
        source: objects(raw.dims.source).map((entry) => ({
          value: text(entry.value),
          pv: num(entry.pv),
        })),
      },
      hours: objects(raw.hours).map((entry) => ({
        hour: num(entry.hour),
        pv: num(entry.pv),
      })),
      events: objects(raw.events).map((entry) => ({
        event: text(entry.event),
        total: num(entry.total),
        items: objects(entry.items).map((item) => ({
          method: text(item.method),
          host: text(item.host),
          ref: text(item.ref),
          count: num(item.count),
        })),
      })),
    }
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: `网络连接失败: ${err.message}` }
  }
}
