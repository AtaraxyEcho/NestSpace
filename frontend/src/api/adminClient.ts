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
      return { success: false, error: '权限不足：口令无效或未被 Cloudflare 授权' }
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
): Promise<{
  success: boolean
  results?: Array<Record<string, unknown>>
  error?: string
}> {
  try {
    const headers = getAuthHeaders() as Record<string, string>
    if (token) headers['X-GitHub-Token'] = token
    const res = await fetch('/api/admin/github-sync', {
      method: 'POST',
      headers,
      body: JSON.stringify({ token, fetchDocs }),
    })
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}))
      return { success: false, error: (errJson as any).error || `同步失败: HTTP ${res.status}` }
    }
    const data = await res.json()
    return { success: true, results: data.results }
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
    }
  } catch (err: any) {
    return { success: false, error: `网络异常: ${err.message}` }
  }
}

/**
 * 从 GitHub 远程仓库一键导入为标本
 */
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

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}))
      return { success: false, error: (errJson as any).error || `删除失败: HTTP ${res.status}` }
    }

    return { success: true }
  } catch (err: any) {
    return { success: false, error: `网络异常: ${err.message}` }
  }
}
