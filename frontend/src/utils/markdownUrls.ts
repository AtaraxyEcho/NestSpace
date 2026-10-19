// Markdown 链接的协议判据（纯函数，Node 里可直接测）。
// 只放行安全协议与站内地址；以下都算可执行/误导链接：
//   javascript: / data: / //evil.com（协议相对）
//   /\evil.com —— URL 解析把反斜杠当斜杠，实际会跳到 evil.com
//   /%5cevil.com —— 同上，百分号编码的版本
// 抽出来单测的原因：markdown.tsx 带 JSX，Node 的原生类型剥离 import 不动它。

export function safeMarkdownUrl(raw: string): string | null {
  const url = raw.trim()
  if (!url) return null
  if (/^(https?:|mailto:)/i.test(url)) return url
  if (
    url.startsWith('#') ||
    (url.startsWith('/') && !url.startsWith('//') && !/\\|%5c/i.test(url))
  ) {
    return url
  }
  return null
}
