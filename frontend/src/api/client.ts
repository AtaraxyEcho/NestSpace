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
/**
 * 获取单个公开项目详情。
 * **只有 404 返回 null**（那才是"这件标本不存在"）；网络失败与非 404 的 HTTP 错误一律抛出，
 * 交给调用方显示"暂时取不到 + 重试"——以前这两种情况都吞成 null，于是断网或接口 500 时
 * 访客看到的是"未找到标本 SPEC—001"，把"我们坏了"说成"这件东西不存在"。
 */
export async function fetchPublicProjectById(id: string): Promise<Project | null> {
  const res = await fetch(`/api/projects/${encodeURIComponent(id)}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return (await res.json()) as Project
}
