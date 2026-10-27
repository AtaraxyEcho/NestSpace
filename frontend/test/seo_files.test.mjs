// 搜索引擎文件的闸门（node test/seo_files.test.mjs）
//
// sitemap 与 robots 的 Sitemap 行一旦格式错了，站长平台会整份拒收；
// 详情页 head 的文案又是 Worker 与测试共用的纯函数，所以整张表钉住。
import { strict as assert } from 'node:assert'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..')
const {
  toSitemapLastmod,
  buildSitemap,
  withSitemapDirective,
  metaDescription,
  brandFromTitle,
  buildProjectSeo,
  buildHomeNoscript,
} = await import(pathToFileURL(join(HERE, 'src', 'utils', 'seoFiles.ts')).href)

const cases = []
const check = (name, fn) => cases.push([name, fn])

check('lastmod：SQLite UTC 转 W3C，日期原样，垃圾值省略', () => {
  assert.equal(toSitemapLastmod('2026-10-21 08:09:22'), '2026-10-21T08:09:22Z')
  assert.equal(toSitemapLastmod('2026-10-21T08:09:22Z'), '2026-10-21T08:09:22Z')
  assert.equal(toSitemapLastmod('2026-10-21'), '2026-10-21')
  assert.equal(toSitemapLastmod(''), '')
  assert.equal(toSitemapLastmod('2026.10'), '', '展示用的点分日期不是 sitemap 时间')
  assert.equal(toSitemapLastmod('not-a-date'), '')
})

check('sitemap：声明、命名空间、根路径与项目路径', () => {
  const xml = buildSitemap('https://nestspace.online/', [
    { path: '/', lastmod: '2026-10-21T08:09:22Z' },
    { path: '/project/005' },
  ])
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n/)
  assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/)
  assert.match(xml, /<loc>https:\/\/nestspace\.online\/<\/loc><lastmod>2026-10-21T08:09:22Z<\/lastmod>/)
  assert.match(xml, /<loc>https:\/\/nestspace\.online\/project\/005<\/loc>/)
  assert.ok(xml.endsWith('</urlset>\n'))
  assert.equal((xml.match(/<url>/g) ?? []).length, 2)
})

check('sitemap：路径补前导斜杠、XML 特殊字符转义', () => {
  const xml = buildSitemap('https://example.com', [
    { path: 'project/a&b' },
    { path: '/project/<x>' },
  ])
  assert.match(xml, /<loc>https:\/\/example\.com\/project\/a&amp;b<\/loc>/)
  assert.match(xml, /<loc>https:\/\/example\.com\/project\/&lt;x&gt;<\/loc>/)
})

check('robots：追加 Sitemap 行、去旧行、重复执行不堆叠', () => {
  const robots = 'User-agent: *\nAllow: /\nDisallow: /admin\n'
  const once = withSitemapDirective(robots, 'https://nestspace.online')
  assert.match(once, /^User-agent: \*\nAllow: \/\nDisallow: \/admin\n\nSitemap: https:\/\/nestspace\.online\/sitemap\.xml\n$/)
  const twice = withSitemapDirective(once, 'https://nestspace.online/')
  assert.equal(twice, once)
  assert.equal((twice.match(/^Sitemap:/gm) ?? []).length, 1)
})

check('robots：已有指向别的域名的 Sitemap 行会被替换', () => {
  const robots = 'User-agent: *\nAllow: /\nSitemap: https://old.example/sitemap.xml\n'
  const out = withSitemapDirective(robots, 'https://nestspace.online')
  assert.doesNotMatch(out, /old\.example/)
  assert.match(out, /Sitemap: https:\/\/nestspace\.online\/sitemap\.xml/)
})

check('摘要：短文本原样、换行压平、长英文按整词截断、长中文按字数截断', () => {
  assert.equal(metaDescription('  a   b\nc  '), 'a b c')
  assert.equal(metaDescription('short'), 'short')
  const longEn =
    'A deterministic image pipeline that turns a folder of source material into a production-ready set without configuration-heavy steps.'
  const cutEn = metaDescription(longEn, 60)
  assert.ok(cutEn.length <= 60)
  assert.ok(cutEn.endsWith('…'))
  assert.ok(!cutEn.includes('  '))
  const longZh = '把一整目录的源素材变成确定、可上线的图片集，不靠繁重配置，也不靠反复试错。'.repeat(3)
  const cutZh = metaDescription(longZh, 40)
  assert.equal(cutZh.length, 40)
  assert.ok(cutZh.endsWith('…'))
})

check('站点名：有点/破折号取前缀，没有就退回字标，再退回 NestSpace', () => {
  assert.equal(brandFromTitle('NestSpace · AtaraxyEcho 的开源项目', 'NESTSPACE'), 'NestSpace')
  assert.equal(brandFromTitle('NestSpace — AtaraxyEcho 的开源项目', 'NESTSPACE'), 'NestSpace')
  assert.equal(brandFromTitle('NestSpace AtaraxyEcho 的开源项目', 'NESTSPACE'), 'NESTSPACE')
  assert.equal(brandFromTitle('', ''), 'NestSpace')
})

check('详情页 SEO：中英标题、英文摘要优先、缺英文回退中文', () => {
  const en = buildProjectSeo(
    {
      name: 'Aperture',
      cn: '光圈档案',
      descriptionEn: 'A quiet image pipeline for focused work.',
      descriptionZh: '为专注创作而生的安静图像管线。',
      repository: 'https://github.com/AtaraxyEcho/Aperture',
    },
    'NestSpace',
  )
  assert.equal(en.title, 'Aperture（光圈档案） · NestSpace')
  assert.equal(en.description, 'A quiet image pipeline for focused work.')

  const zh = buildProjectSeo(
    { name: 'Aperture', cn: '', descriptionEn: '', descriptionZh: '中文摘要', repository: '' },
    '',
  )
  assert.equal(zh.title, 'Aperture · NestSpace')
  assert.equal(zh.description, '中文摘要')

  const sameName = buildProjectSeo(
    { name: 'OmniNest', cn: 'OmniNest', descriptionEn: '', descriptionZh: '', repository: '' },
    'NestSpace',
  )
  assert.equal(sameName.title, 'OmniNest · NestSpace', '中英文名相同不重复括号')
  assert.match(sameName.noscript, /<h1>OmniNest<\/h1>/)
  assert.doesNotMatch(sameName.noscript, /OmniNest（OmniNest）/)
})

check('详情页 noscript：转义正文与仓库地址，非法仓库地址不生成链接', () => {
  const seo = buildProjectSeo(
    {
      name: 'A<B',
      cn: '光&圈',
      descriptionEn: 'x < y & z',
      descriptionZh: '',
      repository: 'https://github.com/a?b=1&c=2',
    },
    'Nest<Space>',
  )
  assert.match(seo.noscript, /^<noscript><main id="seo-fallback"><h1>A&lt;B（光&amp;圈）<\/h1>/)
  assert.match(seo.noscript, /x &lt; y &amp; z/)
  assert.match(seo.noscript, /href="https:\/\/github\.com\/a\?b=1&amp;c=2"/)
  assert.match(seo.noscript, /Nest&lt;Space&gt;/)

  const bad = buildProjectSeo(
    { name: 'X', cn: '', descriptionEn: '', descriptionZh: '', repository: 'javascript:alert(1)' },
    'NestSpace',
  )
  assert.doesNotMatch(bad.noscript, /javascript:/)
  assert.doesNotMatch(bad.noscript, /GitHub/)
  assert.match(bad.noscript, /<a href="\/">NestSpace<\/a>/)
})

check('首页 noscript：标题与描述都转义，空描述不生成空段落', () => {
  const html = buildHomeNoscript('Nest & Space', 'a < b')
  assert.match(html, /<h1>Nest &amp; Space<\/h1>/)
  assert.match(html, /<p>a &lt; b<\/p>/)
  const empty = buildHomeNoscript('NestSpace', '')
  assert.match(empty, /<main id="seo-fallback"><h1>NestSpace<\/h1><\/main>/)
  assert.doesNotMatch(empty, /<p><\/p>/)
})

let failed = 0
for (const [name, fn] of cases) {
  try {
    fn()
  } catch (err) {
    failed += 1
    console.error(`  ✗ ${name}\n    ${err.message}`)
  }
}
if (failed) {
  console.error(`seo_files：${failed}/${cases.length} 个用例失败`)
  process.exit(1)
}
console.log(`seo_files：全部 ${cases.length} 个用例通过 ✓`)
