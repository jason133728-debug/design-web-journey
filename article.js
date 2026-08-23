const root = document.querySelector('#article-root');
const id = new URLSearchParams(location.search).get('id');
const articles = Array.isArray(window.ARTICLES) ? window.ARTICLES : [];
const article = articles.find(item => item.id === id);
const HTML_ESCAPES = Object.freeze({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' });
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => HTML_ESCAPES[character]);
const safeClassToken = value => /^[A-Za-z0-9_-]+$/.test(String(value ?? '')) ? String(value) : '';
const safeArticlePath = value => /^articles\/[a-z0-9-]+\.html$/i.test(String(value ?? '')) ? String(value) : '';
const articleHref = item => safeArticlePath(item.path) || 'articles/index.html';
if (article && safeArticlePath(article.path)) {
  const canonical = document.createElement('link');
  canonical.rel = 'canonical';
  canonical.href = new URL(article.path, location.href).href;
  document.head.append(canonical);
  location.replace(article.path);
} else if (!article) {
  document.title = '找不到文章｜設計網頁之路';
  document.querySelector('meta[name="description"]').content = '找不到指定文章，文章可能仍在整理中或已經移動。';
  root.innerHTML = `<section class="not-found"><p>文章整理中</p><h1>找不到這篇文章，<br>它可能仍在整理中。</h1><a href="articles/index.html">← 回到所有文章</a></section>`;
} else {
  document.title = `${article.title}｜設計網頁之路`;
  document.querySelector('meta[name="description"]').content = article.excerpt;
  const index = articles.indexOf(article), prev = articles[index - 1], next = articles[index + 1];
  const body = (Array.isArray(article.content) ? article.content : []).map(([type, text]) => type === 'h2' ? `<h2>${escapeHTML(text)}</h2>` : type === 'quote' ? `<blockquote>${escapeHTML(text)}</blockquote>` : `<p>${escapeHTML(text)}</p>`).join('');
  const related = articles.filter(a => a.category === article.category && a.id !== article.id).slice(0,2);
  root.innerHTML = `<article class="article-page"><header class="article-hero"><div class="article-meta"><span>${escapeHTML(article.category)}</span><span>${escapeHTML(article.date)}</span><span>閱讀 ${escapeHTML(article.readTime)}</span></div><h1>${escapeHTML(article.title)}</h1><p>${escapeHTML(article.excerpt)}</p></header><div class="article-cover ${safeClassToken(article.cover)}"><span>${String(index+1).padStart(2,'0')}</span><i>DESIGNING THE WEB</i></div><div class="article-body">${body}</div><footer class="article-end"><p>設計網頁之路 · 學習筆記</p></footer></article>
  <nav class="article-pagination" aria-label="文章分頁">${prev?`<a href="${escapeHTML(articleHref(prev))}"><small>← 上一篇</small>${escapeHTML(prev.title)}</a>`:'<span></span>'}${next?`<a href="${escapeHTML(articleHref(next))}"><small>下一篇 →</small>${escapeHTML(next.title)}</a>`:'<span></span>'}</nav>
  ${related.length?`<section class="related"><h2>同分類文章</h2><div>${related.map(a=>`<a href="${escapeHTML(articleHref(a))}"><span>${escapeHTML(a.category)} · ${escapeHTML(a.date)}</span><b>${escapeHTML(a.title)}</b></a>`).join('')}</div></section>`:''}`;
}
