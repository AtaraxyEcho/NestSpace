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

// 栏目/页面文案的槽位键：'<page>.<slot>'，与 migrations/0014 的 JSON 形状一一对应。
// home.* 是新增的描述行（内置默认为空 = 不渲染）；detail.* 替换原先写死在组件里的标题。
export type SectionSlotKey =
  | 'home.catalogue'
  | 'home.index'
  | 'detail.preview'
  | 'detail.anatomy'
  | 'detail.related'

export interface SectionSlotPair {
  en: string
  zh: string
}

// 槽位表允许只写其中几个键：库里没写过的槽位走内置默认
export type SectionSlotMap = Partial<Record<SectionSlotKey, SectionSlotPair>>

// 页脚占位符由渲染时替换：{since} 取馆藏起始年份，{year} 取当前年份
// 公开站点底部栏文案（中英文各一份，跟随前台语言切换）
export interface FooterCopy {
  footerKickerEn: string
  footerKickerZh: string
  footerBlurbEn: string
  footerBlurbZh: string
  footerColSpecimensEn: string
  footerColSpecimensZh: string
  footerColCollectionEn: string
  footerColCollectionZh: string
  footerColLinksEn: string
  footerColLinksZh: string
  footerGithubLabelEn: string
  footerGithubLabelZh: string
  footerContactLabelEn: string
  footerContactLabelZh: string
  footerColophonLinkEn: string
  footerColophonLinkZh: string
  footerColophonLineEn: string
  footerColophonLineZh: string
  footerCopyrightEn: string
  footerCopyrightZh: string
}

// 展示偏好取值
export type DefaultLanguagePreference = 'auto' | 'zh' | 'en'
export type DefaultThemePreference = 'auto' | 'light' | 'dark'

// 站点文案、导航与合规配置（存储于 D1 site_settings 表）
export interface SiteSettings extends FooterCopy {
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

  // 馆长手记（Curator）栏目文案（管理端「05 首页 · 手记」可编辑；headline 支持多行）
  curatorEyebrowEn: string
  curatorEyebrowZh: string
  curatorHeadlineEn: string
  curatorHeadlineZh: string
  curatorQuoteEn: string
  curatorQuoteZh: string
  curatorHabitat: string
  curatorField: string

  // 详情页「挑战 / 方案」小标题（管理端「07 详情页」可编辑；zh 留空回退英文）
  challengeHeadlineEn: string
  challengeHeadlineZh: string
  solutionHeadlineEn: string
  solutionHeadlineZh: string

  // 栏目/页面文案槽位（迁移 0014，管理端「栏目与页面文案」可编辑）。
  // 空槽位 = 回退内置默认；首页栏目标题不在这里，它就是导航标签本身。
  sectionCopy: SectionSlotMap

  // 展示偏好（管理端「11 站点设置」，公开站点真实消费）
  defaultLanguage: DefaultLanguagePreference // 无手动切换时前台初始语言
  defaultTheme: DefaultThemePreference // 无手动切换时前台初始主题
  homeStatsVisible: boolean // 是否展示首页统计栏目（开关在「04 首页 · 统计」；导航项 id 仍是 catalogue）
  themeToggleEnabled: boolean // 是否展示前台深浅色切换按钮
  languageToggleEnabled: boolean // 是否展示前台语言切换按钮
}
