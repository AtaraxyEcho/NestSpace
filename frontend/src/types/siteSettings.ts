// 站点文案与合规配置（与管理端"内容管理 / 站点设置"对应，存储于 D1 site_settings 表）
export interface SiteSettings {
  heroEn: string
  heroZh: string
  subtitleEn: string
  subtitleZh: string
  aboutEn: string
  aboutZh: string
  githubUrl: string
  contactEmail: string
  seoTitle: string
  seoDescription: string
  icpEnabled: boolean
  icpNumber: string
  icpUrl: string
}
