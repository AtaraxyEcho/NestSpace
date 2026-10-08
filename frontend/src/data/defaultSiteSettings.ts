import type { SiteSettings } from '../types/siteSettings'

// 站点文案内置默认值：D1 中对应字段为空时回退到这里；
// 修改默认文案后需重新构建部署（管理端改动则即时生效、无需重新部署）。
export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  heroEn: 'The open-source collection of AtaraxyEcho',
  heroZh: 'AtaraxyEcho 的开源项目标本馆',
  subtitleEn: 'OPEN-SOURCE COLLECTION · BY ATARAXYECHO',
  subtitleZh: '个人开源项目 · 收藏与展示',
  aboutEn:
    "NestSpace is a living index of experiments in software, systems, and interface. Each specimen records not only what was built, but the conditions that allowed it to survive.",
  aboutZh:
    '这里收藏的不是完美成品，而是持续生长的开源实践。每一件作品都有自己的栖息地、形态和演化路径。',
  githubUrl: 'https://github.com/AtaraxyEcho',
  contactEmail: 'field@nestspace.dev',
  seoTitle: 'NestSpace — AtaraxyEcho 的开源项目标本馆',
  seoDescription:
    "AtaraxyEcho's personal open-source showcase: curated tools, experiments and long-lived systems with docs, tech stack and evolution notes. · github.com/AtaraxyEcho",
  icpEnabled: false,
  icpNumber: '',
  icpUrl: 'https://beian.miit.gov.cn/',
}

/** 将服务端返回的设置与默认值合并：字符串空值回退默认，布尔值直接生效 */
export function mergeSiteSettings(data: Partial<SiteSettings> | null | undefined): SiteSettings {
  const merged: SiteSettings = { ...DEFAULT_SITE_SETTINGS }
  if (!data) return merged
  const target = merged as unknown as Record<string, string | boolean>
  const source = data as unknown as Record<string, string | boolean | undefined>
  for (const key of Object.keys(DEFAULT_SITE_SETTINGS)) {
    const value = source[key]
    if (typeof value === 'boolean') {
      target[key] = value
    } else if (typeof value === 'string' && value) {
      target[key] = value
    }
  }
  return merged
}
