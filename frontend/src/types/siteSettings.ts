// 站点导航项配置
export interface NavItemConfig {
  id: string // "cabinet" | "curator" | "index" 等
  labelEn: string
  labelZh: string
  visible: boolean
}

// 活跃度统计项
export interface ActivityLogItem {
  year: number
  count: number
  height?: number
  note?: string
}

// 站点文案、导航与合规配置（存储于 D1 site_settings 表）
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

  // 标头与品牌 Logo 设置
  logoText: string
  logoSubtext: string
  logoImageUrl: string
  logoType: 'text' | 'image' | 'both'

  // 顶部导航栏配置（控制顺序与名称，默认已调换 Curator 与 Index）
  navItems: NavItemConfig[]

  // 馆藏数据与活跃度配置
  statsSinceYear: string // 起始年份，空表示自动从项目推算
  statsAsOfDate: string // 截止统计年月，空表示自动取最新项目更新月
  customCitations: string // 自定义总引用量，空表示自动累加所有项目 stars
  activityLogMode: 'auto' | 'custom' // "auto" 为按项目历史聚合，"custom" 为手动设置
  customActivityLog: ActivityLogItem[]
}
