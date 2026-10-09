/**
 * 预览图/相册的判定规则：Worker（写侧最终裁决）与管理端表单（即时提示）**共用这一份**。
 *
 * 为什么要在 src/ 下而不是只写在 worker 里：管理端需要「填的时候就说哪一行不对」，
 * 而判据一旦在两处各写一遍，就会出现「前端说不违法、保存却 400」或反过来——
 * 那是本项目在管理端明令禁止的假状态。frontend/preview_rules.test.mjs 会逐条比对
 * 这里与 worker 的 validatePreviewInput 是否在同一批输入上给出同样的结论。
 */

/** 相册上限：详情页没必要展示更多，也避免同步把整篇 README 的装饰图都搬进来 */
export const PREVIEW_IMAGE_LIMIT = 12

/** 只放行带主机名的 http(s) 绝对地址；其余（含 data:、相对路径、`https://` 这种空壳、数组/对象）一律丢弃 */
export function sanitizeImageUrl(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const url = raw.trim()
  if (!/^https?:\/\//i.test(url)) return ''
  try {
    return new URL(url).hostname ? url : ''
  } catch {
    return ''
  }
}

export type GalleryRowIssue = {
  /** 1 起始的行号，与 worker 的错误文案同一口径（用户能对着文本框数行） */
  row: number
  /** 短代号，测试与埋点用它而不是靠中文串匹配 */
  code: 'invalid' | 'duplicate' | 'over-limit'
  /** 直接可展示的原因，措辞与 worker 的 400 保持一致 */
  reason: string
}

/**
 * 逐行诊断相册文本框的内容（只做服务端会做的那几项检查，不额外发明规则）：
 * 非法地址、与前面重复、超过 12 张。空行由调用方先剔除。
 */
export function galleryRowIssues(lines: readonly string[]): GalleryRowIssue[] {
  const issues: GalleryRowIssue[] = []
  const seen = new Set<string>()

  if (lines.length > PREVIEW_IMAGE_LIMIT) {
    // 服务端会整份拒绝，所以超限从第 13 行起每行都标出来，而不是只标一次
    for (let i = PREVIEW_IMAGE_LIMIT; i < lines.length; i += 1) {
      issues.push({
        row: i + 1,
        code: 'over-limit',
        reason: `预览相册最多 ${PREVIEW_IMAGE_LIMIT} 张，第 ${i + 1} 行已超出`,
      })
    }
  }

  for (let i = 0; i < Math.min(lines.length, PREVIEW_IMAGE_LIMIT); i += 1) {
    const url = sanitizeImageUrl(lines[i])
    if (!url) {
      issues.push({
        row: i + 1,
        code: 'invalid',
        reason: '不是有效的 http/https 绝对地址（需带协议与主机名）',
      })
      continue
    }
    if (seen.has(url)) {
      issues.push({ row: i + 1, code: 'duplicate', reason: '与前面的行重复：同一地址不能出现两次' })
      continue
    }
    seen.add(url)
  }

  return issues
}
