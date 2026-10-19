import { Fragment } from 'react'
import type { ReactNode } from 'react'
import {
  exceedsInlineParseLimit,
  joinParagraphLines,
  splitParagraphLines,
} from './markdownLines'
import { safeMarkdownUrl } from './markdownUrls'

// 极简 Markdown 渲染器：只解析本项目 README 会用到的语法，全程产出 React 元素，
// 既不解析也不透传任何原始 HTML，因此不存在 HTML 注入面。
// 支持：h1-h4、围栏代码块 ```、无序/有序列表、引用、分隔线、简单表格、段落；
// 行内：**粗体**、*斜体*、`行内代码`、[文字](链接)、![图片](链接)（渲染为链接）。
// options.breaks=true 时段落内的单个换行渲染成硬换行（后台正文用），默认 false（README 用）。

type ListItemNode = { text: string; children: ListBlockData[] }
type ListBlockData = { ordered: boolean; start: number; items: ListItemNode[] }

type Block =
  | { kind: 'heading'; level: 1 | 2 | 3 | 4; text: string; id: string }
  | { kind: 'paragraph'; text: string }
  | ({ kind: 'list' } & ListBlockData)
  | { kind: 'quote'; text: string }
  | { kind: 'code'; lang: string; lines: string[] }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'hr' }

export type MarkdownHeading = { id: string; level: number; text: string }

const FENCE = /^`{3,}(\S*)\s*$/
const HEADING = /^(#{1,6})\s+(.*)$/
const HR = /^(-{3,}|\*{3,}|_{3,})\s*$/
const QUOTE = /^>\s?/
const BULLET = /^\s*[-*+]\s+/
const NUMBERED = /^\s*\d+[.)]\s+/
const TABLE_SEP = /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[`*_[\]()#!]/g, '')
      .replace(/[^\w\u4e00-\u9fff]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'section'
  )
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function isBlockStart(line: string): boolean {
  const trimmed = line.trim()
  return (
    FENCE.test(trimmed) ||
    HEADING.test(line) ||
    HR.test(trimmed) ||
    QUOTE.test(line) ||
    BULLET.test(line) ||
    NUMBERED.test(line)
  )
}

// README 里的 HTML 多用于排版（徽章、居中块、<br>），而本渲染器不解析 HTML。
// 若原样保留，读者会看到 `<div align="center">` 这类标签文本；
// 因此只对**围栏代码块之外**的行做清理，代码块内的内容一字不动。
// 行内代码（反引号片段）同样要先摘出来：它常用来演示 <标签> 用法，不能被顺手删掉。
function stripHtmlNoise(line: string): string {
  // 超长行直接原样放过：这里的正则在"一长串没有 > 的 <"上会平方级退化（见 markdownLines.ts 的上限说明）
  if (exceedsInlineParseLimit(line)) return line
  const codeSpans: string[] = []
  const masked = line.replace(/`[^`]*`/g, (span) => {
    codeSpans.push(span)
    return `\u0000${codeSpans.length - 1}\u0000`
  })

  const cleaned = masked
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")

  return cleaned.replace(/\u0000(\d+)\u0000/g, (_, index) => codeSpans[Number(index)] ?? '')
}

function sanitizeBlockHtml(lines: string[]): string[] {
  let inFence = false
  return lines.map((line) => {
    if (FENCE.test(line.trim())) {
      inFence = !inFence
      return line
    }
    return inFence ? line : stripHtmlNoise(line)
  })
}

// 列表按缩进递归解析：同级项成一个列表，缩进更深的行归到上一项的子列表，
// 同时保留有序列表的起始序号（`3.` 开头就渲染成 <ol start="3">）。
function parseList(
  lines: string[],
  start: number,
  indent: number,
): { block: ListBlockData; next: number } {
  const first = lines[start]
  const ordered = NUMBERED.test(first)
  const startNumber = ordered ? Number(/^\s*(\d+)/.exec(first)?.[1] ?? 1) : 1
  const items: ListItemNode[] = []
  const indentOf = (value: string) => /^\s*/.exec(value)?.[0].length ?? 0
  let i = start

  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) break
    if (!BULLET.test(line) && !NUMBERED.test(line)) break
    const lineIndent = indentOf(line)
    if (lineIndent < indent) break
    // 同级上出现了另一种列表符号 → 交给外层开新列表
    if (lineIndent === indent && NUMBERED.test(line) !== ordered) break

    if (lineIndent > indent && items.length > 0) {
      const nested = parseList(lines, i, lineIndent)
      items[items.length - 1].children.push(nested.block)
      i = nested.next
      continue
    }

    items.push({ text: line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, ''), children: [] })
    i++
    // 缩进更深的非列表行视为该项的续行
    while (
      i < lines.length &&
      lines[i].trim() &&
      !BULLET.test(lines[i]) &&
      !NUMBERED.test(lines[i]) &&
      indentOf(lines[i]) > indent
    ) {
      items[items.length - 1].text += ` ${lines[i].trim()}`
      i++
    }
  }

  return { block: { ordered, start: startNumber, items }, next: i }
}

function parseBlocks(markdown: string, breaks: boolean): Block[] {
  const lines = sanitizeBlockHtml(markdown.replace(/\r\n?/g, '\n').split('\n'))
  const blocks: Block[] = []
  const usedIds = new Map<string, number>()
  let i = 0

  const nextHeadingId = (text: string) => {
    const base = slugify(text)
    const seen = usedIds.get(base) ?? 0
    usedIds.set(base, seen + 1)
    return seen === 0 ? base : `${base}-${seen + 1}`
  }

  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }

    const fence = FENCE.exec(line.trim())
    if (fence) {
      const lang = fence[1] ?? ''
      const body: string[] = []
      i++
      while (i < lines.length && !FENCE.test(lines[i].trim())) {
        body.push(lines[i])
        i++
      }
      i++
      blocks.push({ kind: 'code', lang, lines: body })
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      const level = Math.min(4, heading[1].length) as 1 | 2 | 3 | 4
      const text = heading[2].trim()
      blocks.push({ kind: 'heading', level, text, id: nextHeadingId(text) })
      i++
      continue
    }

    if (HR.test(line.trim())) {
      blocks.push({ kind: 'hr' })
      i++
      continue
    }

    if (QUOTE.test(line)) {
      const quote: string[] = []
      while (i < lines.length && QUOTE.test(lines[i])) {
        quote.push(lines[i].replace(QUOTE, ''))
        i++
      }
      blocks.push({ kind: 'quote', text: quote.join(' ') })
      continue
    }

    if (
      line.includes('|') &&
      i + 1 < lines.length &&
      TABLE_SEP.test(lines[i + 1]) &&
      lines[i + 1].includes('|')
    ) {
      const head = splitTableRow(line)
      const rows: string[][] = []
      i += 2
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        const row = splitTableRow(lines[i])
        // 单元格数与表头不一致就当作表格结束，避免把紧随其后、恰好含 | 的正文吞成表行
        if (row.length !== head.length) break
        rows.push(row)
        i++
      }
      blocks.push({ kind: 'table', head, rows })
      continue
    }

    if (BULLET.test(line) || NUMBERED.test(line)) {
      const parsed = parseList(lines, i, /^\s*/.exec(line)?.[0].length ?? 0)
      blocks.push({ kind: 'list', ...parsed.block })
      i = parsed.next
      continue
    }

    const paragraph: string[] = [line]
    i++
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
      paragraph.push(lines[i])
      i++
    }
    blocks.push({ kind: 'paragraph', text: joinParagraphLines(paragraph, breaks) })
  }

  return blocks
}

const INLINE = /(`[^`]+`)|(!?\[[^\]]*\]\([^)\s]+(?:\s"[^"]*")?\))|(\*\*[^*]+\*\*)|(\*[^*]+\*)/g

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  // 同上：行内正则对没有闭合符的 [ / * 是平方级扫描，超长段直接按纯文本交出去
  if (exceedsInlineParseLimit(text)) return [text]
  const nodes: ReactNode[] = []
  let last = 0
  let index = 0
  let match: RegExpExecArray | null
  INLINE.lastIndex = 0

  while ((match = INLINE.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index))
    const token = match[0]
    const key = `${keyPrefix}-${index++}`

    if (token.startsWith('`')) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>)
    } else if (token.startsWith('![') || token.startsWith('[')) {
      const isImage = token.startsWith('![')
      const label = /^!?\[([^\]]*)\]/.exec(token)?.[1] ?? ''
      const rawUrl = /\(([^)\s]+)/.exec(token)?.[1] ?? ''
      const href = safeMarkdownUrl(rawUrl)
      const caption = label || rawUrl
      nodes.push(
        href ? (
          <a key={key} href={href} target="_blank" rel="noopener noreferrer">
            {isImage ? `[图片] ${caption}` : caption}
          </a>
        ) : (
          <span key={key}>{caption}</span>
        ),
      )
    } else if (token.startsWith('**')) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>)
    } else {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>)
    }

    last = match.index + token.length
  }

  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

/** 递归渲染列表：子列表嵌在父项内部，有序列表保留起始序号 */
function renderListNodes(block: ListBlockData, keyPrefix: string): ReactNode {
  const items = block.items.map((item, index) => {
    const itemKey = `${keyPrefix}-${index}`
    return (
      <li key={itemKey}>
        {renderInline(item.text, itemKey)}
        {item.children.map((child, childIndex) =>
          renderListNodes(child, `${itemKey}-${childIndex}`),
        )}
      </li>
    )
  })

  return block.ordered ? (
    <ol key={keyPrefix} start={block.start > 1 ? block.start : undefined}>
      {items}
    </ol>
  ) : (
    <ul key={keyPrefix}>{items}</ul>
  )
}

/**
 * 渲染 Markdown，同时回传标题列表供「ON THIS PAGE」目录使用。
 * options.breaks=true：段落内的单个换行渲染成硬换行（后台正文用）；默认 false 保持 README 的
 * 空白折行口径。
 */
export function renderMarkdown(
  markdown: string,
  options?: { breaks?: boolean },
): {
  nodes: ReactNode
  headings: MarkdownHeading[]
} {
  const blocks = parseBlocks(markdown, options?.breaks === true)
  const headings: MarkdownHeading[] = []
  const nodes: ReactNode[] = []

  blocks.forEach((block, blockIndex) => {
    const key = `b${blockIndex}`
    switch (block.kind) {
      case 'heading': {
        headings.push({ id: block.id, level: block.level, text: block.text })
        const content = renderInline(block.text, key)
        if (block.level === 1) nodes.push(<h1 key={key} id={block.id}>{content}</h1>)
        else if (block.level === 2) nodes.push(<h2 key={key} id={block.id}>{content}</h2>)
        else if (block.level === 3) nodes.push(<h3 key={key} id={block.id}>{content}</h3>)
        else nodes.push(<h4 key={key} id={block.id}>{content}</h4>)
        break
      }
      case 'paragraph': {
        // 默认口径下这里只有一项（换行已被拼成空格），所以 README 的输出与加 breaks 前逐字一致
        const segments = splitParagraphLines(block.text)
        nodes.push(
          <p key={key}>
            {segments.map((segment, lineIndex) => (
              <Fragment key={`${key}-ln${lineIndex}`}>
                {lineIndex > 0 ? <br /> : null}
                {renderInline(segment, `${key}-ln${lineIndex}`)}
              </Fragment>
            ))}
          </p>,
        )
        break
      }
      case 'list':
        nodes.push(renderListNodes(block, key))
        break
      case 'quote':
        nodes.push(<blockquote key={key}>{renderInline(block.text, key)}</blockquote>)
        break
      case 'code':
        nodes.push(
          <pre key={key} data-lang={block.lang}>
            <code>{block.lines.join('\n')}</code>
          </pre>,
        )
        break
      case 'table':
        nodes.push(
          <div className="md-table-wrap" key={key}>
            <table>
              <thead>
                <tr>
                  {block.head.map((cell, cellIndex) => (
                    <th key={`${key}-h${cellIndex}`}>{renderInline(cell, `${key}-h${cellIndex}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rowIndex) => (
                  <tr key={`${key}-r${rowIndex}`}>
                    {row.map((cell, cellIndex) => (
                      <td key={`${key}-r${rowIndex}c${cellIndex}`}>
                        {renderInline(cell, `${key}-r${rowIndex}c${cellIndex}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        )
        break
      case 'hr':
        nodes.push(<hr key={key} />)
        break
    }
  })

  return { nodes, headings }
}
