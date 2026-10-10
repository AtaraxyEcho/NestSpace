import type {
  SiteSettings,
  NavItemConfig,
  SectionSlotKey,
  SectionSlotPair,
  SectionSlotMap,
} from '../types/siteSettings'

export const DEFAULT_NAV_ITEMS: NavItemConfig[] = [
  { id: 'cabinet', labelEn: 'Cabinet', labelZh: '标本陈列', visible: true },
  { id: 'catalogue', labelEn: 'Statistics', labelZh: '馆藏统计', visible: true },
  { id: 'curator', labelEn: 'Curator', labelZh: '馆长手记', visible: true },
  { id: 'index', labelEn: 'Index', labelZh: '馆藏目录', visible: true },
]

// 栏目/页面文案的内置默认：管理端留空时回退到这里，**渲染期才用，绝不写进库**
// （写进库＝把默认烤成历史值，以后改默认再也传不下去）。
// home.* 的默认是空串：这两行是新增的，不填就不渲染，前台视觉与改造前一致。
export const BUILT_IN_SECTION_SLOTS: Record<SectionSlotKey, SectionSlotPair> = {
  'home.catalogue': { en: '', zh: '' },
  'home.index': { en: '', zh: '' },
  'detail.preview': { en: 'Inside the specimen', zh: '项目预览' },
  'detail.anatomy': { en: 'Core capabilities', zh: '标本特征' },
  'detail.related': { en: 'Continue observing', zh: '' },
}

// 单格字符上限：内置默认最长 19 字符，160 已是十倍余量，只挡"把整段 README 粘进标题框"。
// 真正的兜底在 Worker（整列序列化 5000 上限），这里先把超限的那一格点名出来。
export const SECTION_SLOT_TEXT_MAX = 160

/** 按 id 取内置导航项（mergeSiteSettings 补回缺失段落时用它，避免再抄一份字面量） */
export function defaultNavItem(id: string): NavItemConfig {
  const found = DEFAULT_NAV_ITEMS.find((item) => item.id === id)
  return found ? { ...found } : { id, labelEn: id, labelZh: id, visible: true }
}

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
  // 留空 = 用内置的深浅两版徽章（public/brand/，见 scripts/make-brand-logos.py）；填了就两个主题共用它
  logoImageUrl: '',
  // 默认「图标 + 文字」：内置图是**不带字的徽章**，站点名仍由排印给出。
  // 注意：库里已存过 'text' 的话以库为准（内置默认只在为空时兜底），要在后台把显示模式改一次。
  logoType: 'both',

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
  // 版权行只留署名：曾写「· OPEN SOURCE UNDER MIT」/「· 以 MIT 协议开源」，
  // 但仓库里并没有 LICENSE，那等于无凭的许可声明（法律上默认"保留所有权利"）。
  // 补上 LICENSE 之后再考虑加回。
  footerCopyrightEn: '© {year} NESTSPACE',
  footerCopyrightZh: '© {year} NESTSPACE',

  // 馆藏数据与活跃度配置
  statsSinceYear: '',
  statsAsOfDate: '',
  customCitations: '',
  activityLogMode: 'auto',
  customActivityLog: [],

  // 馆长手记栏目文案（默认等于改造前写死在组件里的文案）
  curatorEyebrowEn: "CURATOR'S NOTE",
  curatorEyebrowZh: '馆长手记',
  curatorHeadlineEn: 'Build things\nthat take root',
  curatorHeadlineZh: '把复杂的事做简单',
  curatorQuoteEn:
    'A good tool does not ask for attention. It takes root quietly, then makes room for other things to grow.',
  curatorQuoteZh: '好的工具不应索取注意力。它应当安静地扎根，然后让别的事物生长。',
  curatorHabitat: 'Shanghai / Remote',
  curatorField: 'Design & Engineering',

  // 详情页小标题：默认等于改造前写死在组件里的两句英文；中文默认留空（前台回退英文）
  challengeHeadlineEn: 'Why it needed to exist.',
  challengeHeadlineZh: '',
  solutionHeadlineEn: 'A narrow tool, carefully shaped.',
  solutionHeadlineZh: '',

  // 栏目/页面文案槽位：内置默认**不在这里**（见 BUILT_IN_SECTION_SLOTS，渲染期才合），
  // 否则每次保存都会把默认文案烤进库，以后改内置默认再也传不下去。
  sectionCopy: {},

  // 展示偏好：默认值等于既有行为（跟随浏览器/系统，统计与两个切换按钮全部开启）
  defaultLanguage: 'auto',
  defaultTheme: 'auto',
  homeStatsVisible: true,
  themeToggleEnabled: true,
  languageToggleEnabled: true,
}

/** 将服务端返回的设置与默认值合并：字符串空/纯空白回退默认，布尔值及数组直接生效 */
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
          const catalogueItem = defaultNavItem('catalogue')
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
    } else if (key === 'sectionCopy') {
      // 只认纯对象：空列会被 Worker 的 JSON 兜底回吐成 []，数组形状不能顶掉默认表。
      // 这里刻意**不**把 BUILT_IN_SECTION_SLOTS 合进来——默认只在渲染期用，
      // 一旦合进 merged，保存时的 changedColumns 就会把整份默认写回库（烤默认）。
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        target[key] = value as SectionSlotMap
      }
    } else if (key === 'customActivityLog') {
      if (Array.isArray(value)) {
        target[key] = value
      }
    } else if (typeof value === 'boolean') {
      target[key] = value
    } else if (typeof value === 'string') {
      // "空"按 trim 后判定：Worker 存的是原样字符串（不裁空白），管理端只敲一个空格就会
      // 存成 '  '，按老判据它算"已填写"，前台于是渲染一个空白文案而不是回退默认。
      if (value.trim() !== '') {
        target[key] = value
      }
    }
    // 其余类型一律**不采纳**，留着内置默认值：D1/SQLite 是动态类型，列里被写成数字
    // （手工改库、老写入方）时传进来的就是 number，取它会让下游 `statsSinceYear.trim()`
    // 抛 TypeError 把整站打白。宁可回退默认文案——这里以前是 `else { target[key] = value }`。
  }

  return merged
}
