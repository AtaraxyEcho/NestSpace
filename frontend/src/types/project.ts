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
  challenge: string
  solution: string
  features: string[]
  metrics: { label: string; value: string }[]
  timeline: { date: string; title: string; note: string }[]
}
