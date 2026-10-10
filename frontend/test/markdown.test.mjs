// Markdown 正文口径的闸门（node test/markdown.test.mjs）
//
// 为什么这份文件里的判据一半是"源码钉子"：markdown.tsx 带 JSX，而 Node 的原生类型剥离
// 只剥类型、不转换 JSX，.mjs 测试根本 import 不动它。所以能真跑的是抽出来的纯模块
// markdownLines.ts（段落行的两种口径），渲染那头的约束用源码断言钉；
// **真实渲染结果是在本地站点上肉眼+DOM 断言验的，不在这条闸门里**，别把两边混为一谈。
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const FRONTEND = join(dirname(fileURLToPath(import.meta.url)), '..')

const lines = await import(
  pathToFileURL(join(FRONTEND, 'src', 'utils', 'markdownLines.ts')).href
)
const { joinParagraphLines, splitParagraphLines } = lines

const mdSrc = readFileSync(join(FRONTEND, 'src', 'utils', 'markdown.tsx'), 'utf8')
const appSrc = readFileSync(join(FRONTEND, 'src', 'App.tsx'), 'utf8')

// —— 两种口径本身 ——
assert.equal(joinParagraphLines(['a', 'b'], false), 'a b', 'case 1a: README 口径把折行拼回一行')
assert.equal(joinParagraphLines(['a', 'b'], true), 'a\nb', 'case 1b: breaks 口径保留换行')
// 默认口径产出的段落文本里不会再有 '\n' ⇒ 拆开永远是一项 ⇒ README 输出与加这个选项前逐字一致
assert.deepEqual(splitParagraphLines(joinParagraphLines(['a', 'b'], false)), ['a b'], 'case 1c: README 不产生硬换行')
assert.deepEqual(splitParagraphLines('a\nb\nc'), ['a', 'b', 'c'], 'case 1d: breaks 口径按行拆')
assert.deepEqual(splitParagraphLines(''), [''], 'case 1e: 空正文不炸（返回一项）')

// —— 渲染器确实按这两条口径走（源码钉子） ——
assert.doesNotMatch(mdSrc, /paragraph\.join\(/, 'case 2a: 不该再有裸的 paragraph.join，段落必须过口径函数')
assert.match(mdSrc, /kind: 'paragraph', text: joinParagraphLines\(paragraph, breaks\)/, 'case 2b: 段落拼接用 joinParagraphLines 并带上 breaks')
assert.match(mdSrc, /const segments = splitParagraphLines\(block\.text\)/, 'case 2c: 渲染前按 splitParagraphLines 拆行')
assert.match(mdSrc, /lineIndex > 0 \? <br \/> : null/, 'case 2d: 第二行起插硬换行')
assert.match(mdSrc, /function parseBlocks\(markdown: string, breaks: boolean\)/, 'case 2e: parseBlocks 必须显式接 breaks（不能有默认值让调用方漏传）')
assert.match(mdSrc, /parseBlocks\(markdown, options\?\.breaks === true\)/, 'case 2f: 不传 options 就是 false，README 口径不变')

// —— 调用面：正文走 breaks，README 不走 ——
const challengeCall = /renderMarkdown\(\s*challengeCopy\.text,\s*\{ breaks: true \}\s*\)/.test(appSrc)
const solutionCall = /renderMarkdown\(\s*solutionCopy\.text,\s*\{ breaks: true \}\s*\)/.test(appSrc)
assert.ok(challengeCall, 'case 3a: 挑战正文必须按 breaks 口径渲染，否则管理员的回车又被吞掉')
assert.ok(solutionCall, 'case 3b: 方案正文同上')
assert.doesNotMatch(appSrc, /<p>\{challengeCopy\.text\}/, 'case 3c: 不该再有把正文当纯文本塞进 <p> 的老写法')
assert.doesNotMatch(appSrc, /<p>\{solutionCopy\.text\}/, 'case 3d: 同上')
assert.match(appSrc, /renderMarkdown\(readmeText\)/, 'case 3e: README 保持默认口径（它是 80 列折行的）')
// 抽屉预览与前台同一口径，否则"预览里的样子"和"站点上的样子"又是两套
const previewCalls = appSrc.match(/renderMarkdown\(pair\.(?:zh|en), \{ breaks: true \}\)/g) || []
assert.equal(previewCalls.length, 2, 'case 3f: 抽屉两栏都要有只读预览，且与前台同口径')

// —— 安全底线：这条链路上不允许出现原始 HTML ——
// 判"属性用法"而不是这个词：代码注释里就写着"零 dangerouslySetInnerHTML"，按词匹配会被自己的注释绊倒。
assert.doesNotMatch(mdSrc, /dangerouslySetInnerHTML\s*=/, 'case 4a: 渲染器不许透传 HTML')
assert.doesNotMatch(appSrc, /dangerouslySetInnerHTML\s*=/, 'case 4b: 正文/预览也不许')

console.log('markdown：全部用例通过（段落两种口径 / 渲染器接线 / 正文走 breaks / README 口径不变 / 抽屉预览同口径 / 零原始 HTML）✓')
