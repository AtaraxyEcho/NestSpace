import type { Project } from '../types/project'
import type { SiteSettings } from '../types/siteSettings'
import { mergeSiteSettings } from '../data/defaultSiteSettings'

const TOKEN_KEY = 'nestspace_admin_secret'

export function getAdminToken(): string {
  return sessionStorage.getItem(TOKEN_KEY) || ''
}

export function setAdminToken(token: string) {
  if (token) {
    sessionStorage.setItem(TOKEN_KEY, token)
  } else {
    sessionStorage.removeItem(TOKEN_KEY)
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
 * 管理端获取站点文案设置（与默认值合并，空字段以默认文案呈现便于编辑）
 */
export async function fetchAdminSiteSettings(): Promise<{ success: boolean; data?: SiteSettings; error?: string }> {
  try {
    const res = await fetch('/api/admin/site-settings', {
      headers: getAuthHeaders(),
    })

    clearTokenIfUnauthorized(res.status)
    if (!res.ok) {
      return { success: false, error: `服务器响应异常: ${res.status}` }
    }
    const raw = (await res.json()) as Partial<SiteSettings>
    return { success: true, data: mergeSiteSettings(raw) }
  } catch (err: any) {
    return { success: false, error: `网络连接失败: ${err.message}` }
  }
}

/**
 * 管理端保存站点文案设置到 D1 数据库
 */
export async function saveAdminSiteSettings(settings: SiteSettings): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('/api/admin/site-settings', {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(settings),
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
