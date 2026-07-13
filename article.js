const root = document.querySelector('#article-root');
const id = new URLSearchParams(location.search).get('id');
const articles = window.ARTICLES;
const article = articles.find(item => item.id === id);
const articlePaths = {'learning-codex-first':'articles/learn-codex.html','blank-page-first-step':'articles/why-build-site.html','first-webpage':'articles/first-webpage.html','good-page-not-more':'articles/less-but-clearer.html','responsive-is-priority':'articles/responsive-design.html','first-interaction':'articles/search-and-filter.html','details-i-missed':'articles/important-details.html','learning-by-finishing':'articles/learning-by-finishing.html'};
const articleHref = item => articlePaths[item.id] || 'index.html#articles';
if (!article) {
  document.title = '找不到文章｜設計網頁之路';
  document.querySelector('meta[name="description"]').content = '找不到指定文章，文章可能仍在整理中或已經移動。';
  root.innerHTML = `<section class="not-found"><p>文章整理中</p><h1>找不到這篇文章，<br>它可能仍在整理中。</h1><a href="index.html#articles">← 回到所有文章</a></section>`;
} else {
  document.title = `${article.title}｜設計網頁之路`;
  document.querySelector('meta[name="description"]').content = article.excerpt;
  const index = articles.indexOf(article), prev = articles[index - 1], next = articles[index + 1];
  const body = article.content.map(([type,text]) => type === 'h2' ? `<h2>${text}</h2>` : type === 'quote' ? `<blockquote>${text}</blockquote>` : `<p>${text}</p>`).join('');
  const related = articles.filter(a => a.category === article.category && a.id !== article.id).slice(0,2);
  root.innerHTML = `<article class="article-page"><header class="article-hero"><div class="article-meta"><span>${article.category}</span><span>${article.date}</span><span>閱讀 ${article.readTime}</span></div><h1>${article.title}</h1><p>${article.excerpt}</p></header><div class="article-cover ${article.cover}"><span>${String(index+1).padStart(2,'0')}</span><i>DESIGNING THE WEB</i></div><div class="article-body">${body}</div><footer class="article-end"><p>設計網頁之路 · 學習筆記</p></footer></article>
  <nav class="article-pagination" aria-label="文章分頁">${prev?`<a href="${articleHref(prev)}"><small>← 上一篇</small>${prev.title}</a>`:'<span></span>'}${next?`<a href="${articleHref(next)}"><small>下一篇 →</small>${next.title}</a>`:'<span></span>'}</nav>
  ${related.length?`<section class="related"><h2>同分類文章</h2><div>${related.map(a=>`<a href="${articleHref(a)}"><span>${a.category} · ${a.date}</span><b>${a.title}</b></a>`).join('')}</div></section>`:''}`;
}
