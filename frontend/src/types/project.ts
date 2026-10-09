export type Language = 'en' | 'zh'

// 双语文本的形状与读侧规则都在 utils/bilingual.ts，类型也从那里来（同一个概念一种写法）
import type { BilingualText } from '../utils/bilingual'

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
  description: BilingualText
  shape: ProjectShape
  version: string
  updated: string
  repository: string
  /** 项目演示入口：地址已是 http/https 规范化形式；开关关闭时公开接口不下发地址 */
  demoUrl: string
  demoEnabled: boolean
  /** 挑战 / 解决方案：双语。库里旧单列（纯文本）按中文只读兜底，见 utils/bilingual.ts */
  challenge: BilingualText
  solution: BilingualText
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
  /** 管理端同样是 snake_case；公开详情/列表见下方 camelCase 版本 */
  preview_image_url?: string
  /** 管理端原始值：JSON 字符串数组，抽屉按行解析编辑；写回时序列化 */
  preview_images_json?: string
  // 标本文档：公开详情接口 GET /api/projects/:id 返回（列表接口不携带，避免列表体积膨胀）
  readmeZh?: string
  readmeEn?: string
  composeDev?: string
  composeProd?: string
  docsSyncedAt?: string
  /** 详情页预览图封面（自动提取或管理端填写） */
  previewImageUrl?: string
  /** 详情页预览相册（有序绝对地址；缺失时退化为单张封面） */
  previewImages?: string[]
}
