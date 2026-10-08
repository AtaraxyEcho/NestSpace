import type { Project } from '../types/project'
import type { SiteSettings } from '../types/siteSettings'
import { mergeSiteSettings } from '../data/defaultSiteSettings'

/**
 * 获取公开项目列表 (只读取 LIVE / BETA 状态且脱敏数据)
 */
export async function fetchPublicProjects(): Promise<Project[]> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 8000)

  try {
    const res = await fetch('/api/projects', {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    })

    if (!res.ok) {
      throw new Error(`API error: ${res.status} ${res.statusText}`)
    }

    const data = await res.json()
    return data as Project[]
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * 获取站点文案设置 (空字段自动回退内置默认值；接口异常时同样返回默认值，不影响展示)
 */
export async function fetchSiteSettings(): Promise<SiteSettings> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 8000)

  try {
    const res = await fetch('/api/site-settings', {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    })

    if (!res.ok) {
      return mergeSiteSettings(null)
    }
    const data = (await res.json()) as Partial<SiteSettings>
    return mergeSiteSettings(data)
  } catch {
    return mergeSiteSettings(null)
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * 获取单个公开项目详情
 */
export async function fetchPublicProjectById(id: string): Promise<Project | null> {
  try {
    const res = await fetch(`/api/projects/${encodeURIComponent(id)}`)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    return (await res.json()) as Project
  } catch (error) {
    console.error(`Failed to fetch project ${id}:`, error)
    return null
  }
}
