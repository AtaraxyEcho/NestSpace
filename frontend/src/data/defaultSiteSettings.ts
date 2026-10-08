import type { SiteSettings, NavItemConfig } from '../types/siteSettings'

export const DEFAULT_NAV_ITEMS: NavItemConfig[] = [
  { id: 'cabinet', labelEn: 'Cabinet', labelZh: '标本陈列', visible: true },
  { id: 'catalogue', labelEn: 'Catalogue', labelZh: '馆藏统计', visible: true },
  { id: 'curator', labelEn: 'Curator', labelZh: '馆长手记', visible: true },
  { id: 'index', labelEn: 'Index', labelZh: '馆藏目录', visible: true },
]

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

  // 标头与品牌 Logo 设置
  logoText: 'NESTSPACE',
  logoSubtext: 'ATARAXYECHO',
  logoImageUrl: '',
  logoType: 'text',

  // 顶部导航栏配置（默认调换 Curator 与 Index）
  navItems: DEFAULT_NAV_ITEMS,

  // 公开站点底部栏文案：{name} 取 Logo 副标题署名，{since} 取馆藏起始年份，{year} 取当前年份
  footerKickerEn: 'AN OPEN CABINET',
  footerKickerZh: '开放标本柜',
  footerBlurbEn: 'The open-source collection of {name}.',
  footerBlurbZh: '{name} 的开源项目标本馆。',
  footerColSpecimensEn: 'SPECIMENS',
  footerColSpecimensZh: '馆藏标本',
  footerColCollectionEn: 'COLLECTION',
  footerColCollectionZh: '馆藏章节',
  footerColLinksEn: 'FIELD NOTES',
  footerColLinksZh: '联系入口',
  footerGithubLabelEn: 'GitHub ↗',
  footerGithubLabelZh: 'GitHub ↗',
  footerContactLabelEn: 'Contact ↗',
  footerContactLabelZh: '联系邮箱 ↗',
  footerColophonLinkEn: 'Colophon',
  footerColophonLinkZh: '版本信息',
  footerColophonLineEn: 'Collected with care, since {since}',
  footerColophonLineZh: '自 {since} 年起，悉心收藏',
  footerCopyrightEn: '© {year} NESTSPACE · OPEN SOURCE UNDER MIT',
  footerCopyrightZh: '© {year} NESTSPACE · 以 MIT 协议开源',

  // 馆藏数据与活跃度配置
  statsSinceYear: '',
  statsAsOfDate: '',
  customCitations: '',
  activityLogMode: 'auto',
  customActivityLog: [],

  // 展示偏好：默认值等于既有行为（跟随浏览器/系统，统计与两个切换按钮全部开启）
  defaultLanguage: 'auto',
  defaultTheme: 'auto',
  homeStatsVisible: true,
  themeToggleEnabled: true,
  languageToggleEnabled: true,
}

/** 将服务端返回的设置与默认值合并：字符串空值回退默认，布尔值及数组直接生效 */
export function mergeSiteSettings(data: Partial<SiteSettings> | null | undefined): SiteSettings {
  const merged: SiteSettings = {
    ...DEFAULT_SITE_SETTINGS,
    navItems: [...DEFAULT_NAV_ITEMS],
    customActivityLog: [],
  }
  if (!data) return merged

  const target = merged as unknown as Record<string, unknown>
  const source = data as unknown as Record<string, unknown>

  for (const key of Object.keys(DEFAULT_SITE_SETTINGS)) {
    const value = source[key]
    if (value === undefined || value === null) continue

    if (key === 'navItems') {
      if (Array.isArray(value) && value.length > 0) {
        const list = value as NavItemConfig[]
        const hasCatalogue = list.some((item) => item.id === 'catalogue')
        if (!hasCatalogue) {
          const catalogueItem: NavItemConfig = {
            id: 'catalogue',
            labelEn: 'Catalogue',
            labelZh: '馆藏统计',
            visible: true,
          }
          const copy = [...list]
          const cabinetIdx = copy.findIndex((i) => i.id === 'cabinet')
          if (cabinetIdx !== -1) {
            copy.splice(cabinetIdx + 1, 0, catalogueItem)
          } else {
            copy.unshift(catalogueItem)
          }
          target[key] = copy
        } else {
          target[key] = value
        }
      }
    } else if (key === 'customActivityLog') {
      if (Array.isArray(value)) {
        target[key] = value
      }
    } else if (typeof value === 'boolean') {
      target[key] = value
    } else if (typeof value === 'string') {
      if (value !== '') {
        target[key] = value
      }
    } else {
      target[key] = value
    }
  }

  return merged
}
