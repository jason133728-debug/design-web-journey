import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// 從專案根目錄執行：node tools/sync-site-data.mjs
// 使用 cwd 可避免 Windows 的「文件」資料夾映射成另一個磁碟代號後無法寫入。
const root = path.resolve(process.env.SITE_ROOT || process.cwd());
const outputRoot = process.env.SITE_OUTPUT_ROOT ? path.resolve(process.env.SITE_OUTPUT_ROOT) : root;
const checkOnly = process.argv.includes('--check');
const siteBase = 'https://jason133728-debug.github.io/design-web-journey';
const changedFiles = [];

const escapeHtml = value => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

const isoDate = value => value.replaceAll('.', '-');
const articleFile = articlePath => articlePath.replace(/^articles\//, '');

function loadArticleData() {
  const source = readFileSync(path.join(root, 'articles.js'), 'utf8');
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'articles.js' });

  const { ARTICLES: articles, HOMEPAGE_ARTICLES: homepageArticles, ARTICLE_SUMMARY: summary } = context.window;
  if (!Array.isArray(articles) || !articles.length) throw new Error('articles.js 沒有可用的文章資料。');

  const required = ['id', 'path', 'category', 'date', 'modified', 'readTime', 'title', 'excerpt', 'cover'];
  const ids = new Set();
  const paths = new Set();
  for (const article of articles) {
    for (const key of required) {
      if (!article[key]) throw new Error(`文章 ${article.id || '(無 id)'} 缺少 ${key}。`);
    }
    if (ids.has(article.id)) throw new Error(`文章 id 重複：${article.id}`);
    if (paths.has(article.path)) throw new Error(`文章網址重複：${article.path}`);
    ids.add(article.id);
    paths.add(article.path);
  }

  if (summary?.total !== articles.length) throw new Error('ARTICLE_SUMMARY 與文章總數不同步。');
  if (articles.filter(article => article.featured).length > 1) {
    throw new Error('只能設定一篇首頁精選文章。');
  }
  if (!Array.isArray(homepageArticles) || homepageArticles.length !== Math.min(3, articles.length)) {
    throw new Error('HOMEPAGE_ARTICLES 未由文章資料正確產生。');
  }
  return { articles, homepageArticles, summary };
}

function update(relativePath, transform) {
  const absolutePath = path.join(root, relativePath);
  const current = readFileSync(absolutePath, 'utf8');
  const next = transform(current);
  if (next === current) return;
  changedFiles.push(relativePath);
  if (!checkOnly) {
    const outputPath = path.join(outputRoot, relativePath);
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, next, 'utf8');
  }
}

function replaceSyncedBlock(source, name, html) {
  const start = `<!-- SYNC:${name}:START -->`;
  const end = `<!-- SYNC:${name}:END -->`;
  const pattern = new RegExp(`(^[ \\t]*)${start}[\\s\\S]*?^[ \\t]*${end}`, 'm');
  if (!pattern.test(source)) throw new Error(`找不到同步標記：${name}`);
  return source.replace(pattern, (_, indentation) => `${indentation}${start}\n${html}\n${indentation}${end}`);
}

function metaHtml(article) {
  return `<span>${escapeHtml(article.category)}</span><span>${escapeHtml(article.date)}</span><span>閱讀 ${escapeHtml(article.readTime)}</span>`;
}

function featuredHtml(article, href) {
  return `      <a class="featured-cover ${escapeHtml(article.cover)}" href="${href}" aria-label="閱讀：${escapeHtml(article.title)}"><span>01</span><i>KEEP LEARNING, KEEP MAKING</i></a>
      <div class="featured-copy"><p class="section-kicker" id="featured-title">本週靈感筆記</p><div class="article-meta">${metaHtml(article)}</div><h2><a href="${href}">${escapeHtml(article.title)}</a></h2><p>${escapeHtml(article.excerpt)}</p><a class="read-link" href="${href}">一起讀下去 <span>→</span></a></div>`;
}

function homepageCardsHtml(articles) {
  return articles.map((article, index) => {
    const href = article.path;
    return `        <article class="article-row fallback-article"><a class="article-number ${escapeHtml(article.cover)}" href="${href}" aria-label="閱讀：${escapeHtml(article.title)}">${String(index + 1).padStart(2, '0')}</a><div><div class="article-meta">${metaHtml(article)}</div><h3><a href="${href}">${escapeHtml(article.homeTitle || article.shortTitle || article.title)}</a></h3><p>${escapeHtml(article.excerpt)}</p></div><a class="row-arrow" href="${href}" aria-label="閱讀文章">↗</a></article>`;
  }).join('\n');
}

function archiveCardsHtml(articles) {
  return articles.map((article, index) => {
    const href = articleFile(article.path);
    return `        <article class="article-row fallback-article">
          <a class="article-number ${escapeHtml(article.cover)}" href="${href}" aria-label="閱讀：${escapeHtml(article.title)}">${String(index + 1).padStart(2, '0')}</a>
          <div><div class="article-meta">${metaHtml(article)}</div><h3><a href="${href}">${escapeHtml(article.title)}</a></h3><p>${escapeHtml(article.excerpt)}</p></div>
          <a class="row-arrow" href="${href}" aria-label="閱讀文章">↗</a>
        </article>`;
  }).join('\n');
}

function paginationHtml(articles, index) {
  const newer = articles[index - 1];
  const older = articles[index + 1];
  const newerLink = newer
    ? `<a href="${articleFile(newer.path)}"><small>← 上一篇</small>${escapeHtml(newer.shortTitle || newer.title)}</a>`
    : '<span></span>';
  const olderLink = older
    ? `<a href="${articleFile(older.path)}"><small>下一篇 →</small>${escapeHtml(older.shortTitle || older.title)}</a>`
    : '<span></span>';
  return `<nav class="article-pagination" aria-label="文章分頁">${newerLink}${olderLink}</nav>`;
}

function syncArticlePage(source, article, articles, index) {
  const title = `${article.title}｜設計網頁之路`;
  const description = escapeHtml(article.excerpt);
  const published = isoDate(article.date);
  const modified = isoDate(article.modified);
  const pagination = paginationHtml(articles, index);

  let next = source
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${description}">`)
    .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${escapeHtml(title)}">`)
    .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${description}">`)
    .replace(/<meta property="article:published_time" content="[^"]*">/, `<meta property="article:published_time" content="${published}">`)
    .replace(/<meta property="article:modified_time" content="[^"]*">/, `<meta property="article:modified_time" content="${modified}">`)
    .replace(/"datePublished":"[^"]*"/, `"datePublished":"${published}"`)
    .replace(/"dateModified":"[^"]*"/, `"dateModified":"${modified}"`)
    .replace(/<div class="article-meta"><span>[\s\S]*?<\/span><span>[\s\S]*?<\/span><span>閱讀 [\s\S]*?<\/span><\/div>/, `<div class="article-meta">${metaHtml(article)}</div>`);

  if (/<nav class="article-pagination"[\s\S]*?<\/nav>/.test(next)) {
    next = next.replace(/<nav class="article-pagination"[\s\S]*?<\/nav>/, pagination);
  } else {
    next = next.replace('</article>', `</article>${pagination}`);
  }
  return next;
}

function sitemapXml(articles, summary) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    `  <url><loc>${siteBase}/</loc><lastmod>${summary.latestUpdatedIso}</lastmod><priority>1.0</priority></url>`,
    `  <url><loc>${siteBase}/articles/</loc><lastmod>${summary.latestUpdatedIso}</lastmod><priority>0.9</priority></url>`,
    ...articles.map(article => `  <url><loc>${siteBase}/${article.path}</loc><lastmod>${isoDate(article.modified)}</lastmod></url>`),
    `  <url><loc>${siteBase}/projects/personal-homepage.html</loc><lastmod>2026-07-14</lastmod></url>`,
    `  <url><loc>${siteBase}/projects/login-form.html</loc><lastmod>2026-07-14</lastmod></url>`,
    `  <url><loc>${siteBase}/projects/article-list.html</loc><lastmod>2026-07-14</lastmod></url>`,
    `  <url><loc>${siteBase}/projects/rwd-mobile.html</loc><lastmod>2026-07-14</lastmod></url>`,
    '</urlset>',
    ''
  ];
  return lines.join('\n');
}

const { articles, homepageArticles, summary } = loadArticleData();
const featured = homepageArticles.find(article => article.featured) || homepageArticles[0];
const homepageList = homepageArticles.filter(article => article.id !== featured.id);

update('index.html', source => {
  let next = replaceSyncedBlock(source, 'FEATURED', featuredHtml(featured, featured.path));
  next = replaceSyncedBlock(next, 'HOMEPAGE_ARTICLES', homepageCardsHtml(homepageList));
  next = next
    .replace(/(<a class="action-primary" href=")[^"]*(" data-latest-article-link>)/, `$1${articles[0].path}$2`)
    .replace(/(<dd data-article-total>)[\s\S]*?(<\/dd>)/, `$1${summary.total} 篇$2`)
    .replace(/(<a href="articles\/index\.html" data-article-total-link>)[\s\S]*?(<\/a>)/, `$1查看全部 ${summary.total} 篇 →$2`)
    .replace(/(<small id="site-last-updated">)[\s\S]*?(<\/small>)/, `$1內容狀態：持續更新中 · 最新文章 ${summary.latestUpdated}$2`);
  return next;
});

update(path.join('articles', 'index.html'), source => {
  let next = replaceSyncedBlock(source, 'ARCHIVE_ARTICLES', archiveCardsHtml(articles));
  next = next
    .replace(/(<p class="issue" id="archive-summary">)[\s\S]*?(<\/p>)/, `$1文章總覽 · ${summary.total} 篇學習紀錄$2`)
    .replace(/(<span id="article-count" aria-live="polite">)[\s\S]*?(<\/span>)/, `$1${summary.total} 篇$2`);
  return next;
});

update(path.join('projects', 'article-list.html'), source => source
  .replace(/文章總覽可搜尋全部 \d+ 篇/, `文章總覽可搜尋全部 ${summary.total} 篇`)
  .replace(/共整理 \d+ 篇/, `共整理 ${summary.total} 篇`));

for (const [index, article] of articles.entries()) {
  update(article.path, source => syncArticlePage(source, article, articles, index));
}

update('sitemap.xml', () => sitemapXml(articles, summary));

if (checkOnly && changedFiles.length) {
  console.error(`下列檔案尚未與 articles.js 同步：\n- ${changedFiles.join('\n- ')}`);
  process.exitCode = 1;
} else if (changedFiles.length) {
  console.log(`已同步 ${changedFiles.length} 個檔案：\n- ${changedFiles.join('\n- ')}`);
} else {
  console.log('網站內容已與 articles.js 同步。');
}
