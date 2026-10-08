export type Language = 'en' | 'zh'

export type ProjectShape = 'aperture' | 'lumen' | 'fjord' | 'meridian'

export type ProjectStatus = 'LIVE' | 'BETA' | 'DRAFT' | 'ARCHIVED'

export type Project = {
  id: string
  date: string
  status: ProjectStatus
  name: string
  cn: string
  latin: string
  habitat: string
  type: string
  language: string
  stars: string
  year: string
  description: { en: string; zh: string }
  shape: ProjectShape
  version: string
  updated: string
  repository: string
  /** 项目演示入口：地址已是 http/https 规范化形式；开关关闭时公开接口不下发地址 */
  demoUrl: string
  demoEnabled: boolean
  challenge: string
  solution: string
  features: string[]
  metrics: { label: string; value: string }[]
  timeline: { date: string; title: string; note: string }[]
  // 以下字段仅管理端接口返回（原样透出 D1 行，snake_case；公开接口按显式列脱敏移除）
  internal_notes?: string
  sort_order?: number
  /** 文档字段在管理端同样是 snake_case（抽屉直接编辑）；公开详情接口见下方 camelCase 版本 */
  readme_zh?: string
  readme_en?: string
  compose_dev?: string
  compose_prod?: string
  docs_synced_at?: string
  // 标本文档：公开详情接口 GET /api/projects/:id 返回（列表接口不携带，避免列表体积膨胀）
  readmeZh?: string
  readmeEn?: string
  composeDev?: string
  composeProd?: string
  docsSyncedAt?: string
}
