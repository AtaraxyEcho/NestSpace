// 探针用的双语载荷生成器。
// 为什么单独成文件而不是在 bash 里内联：Git Bash 会按本地码页改写命令行里的 CJK，
// 内联的中文还没进 node 就已经变成乱码，探针会把自己的传输问题误报成接口缺陷。
// 放在 UTF-8 源文件里就绕开了这一层。用法：node scripts/probe-bilingual-payload.mjs <输出路径>
import { writeFileSync } from 'node:fs'

const out = process.argv[2]
if (!out) {
  console.error('用法：node scripts/probe-bilingual-payload.mjs <输出路径>')
  process.exit(1)
}

writeFileSync(
  out,
  JSON.stringify({
    challenge: { en: 'probe english challenge', zh: '探针中文挑战' },
    solution: { en: 'probe english solution', zh: '探针中文方案' },
    // 只填一种语言的简介：PUT 之后必须还是"只有一种语言"，
    // 既不能被同塞两份，也不能因为 required 之类的前置校验被丢掉
    description: { en: 'probe description in english only', zh: '' },
  }),
  'utf8',
)
console.log(out)
