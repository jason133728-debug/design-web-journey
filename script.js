const allArticles = Array.isArray(window.ARTICLES) ? window.ARTICLES : [];
const articles = Array.isArray(window.HOMEPAGE_ARTICLES) ? window.HOMEPAGE_ARTICLES : allArticles.slice(0, 3);
const featured = articles.find(article => article.featured) || articles[0];
const list = document.querySelector('#article-list');
const empty = document.querySelector('#empty-state');
const search = document.querySelector('#search-input');
const articleTools = document.querySelector('.article-tools');
let activeCategory = '全部';

const meta = article => `<span>${article.category}</span><span>${article.date}</span><span>閱讀 ${article.readTime}</span>`;
const articlePaths = window.ARTICLE_PATHS || {};
const articleHref = article => articlePaths[article.id] || '#articles';

if (featured) {
  document.querySelector('#featured').innerHTML = `
    <a class="featured-cover ${featured.cover}" href="${articleHref(featured)}" aria-label="閱讀：${featured.title}"><span>01</span><i>KEEP LEARNING, KEEP MAKING</i></a>
    <div class="featured-copy"><p class="section-kicker" id="featured-title">本週靈感筆記</p><div class="article-meta">${meta(featured)}</div><h2><a href="${articleHref(featured)}">${featured.title}</a></h2><p>${featured.excerpt}</p><a class="read-link" href="${articleHref(featured)}">一起讀下去 <span>→</span></a></div>`;
} else {
  document.querySelector('#featured').hidden = false;
}

function render() {
  if (!articles.length) {
    document.querySelector('#article-count').textContent = `${list.querySelectorAll('.article-row').length} 篇`;
    empty.hidden = true;
    articleTools.hidden = true;
    return;
  }
  const term = search.value.trim().toLowerCase();
  const source = term || activeCategory !== '全部'
    ? allArticles
    : articles.filter(article => article.id !== featured?.id);
  const results = source.filter(article =>
    (activeCategory === '全部' || article.category === activeCategory) &&
    `${article.title}${article.excerpt}${article.category}`.toLowerCase().includes(term)
  );
  document.querySelector('#article-count').textContent = `${results.length} 篇`;
  list.innerHTML = results.map((article, index) => `
    <article class="article-row">
      <a class="article-number ${article.cover}" href="${articleHref(article)}" aria-label="閱讀：${article.title}">${String(index + 1).padStart(2, '0')}</a>
      <div><div class="article-meta">${meta(article)}</div><h3><a href="${articleHref(article)}">${article.homeTitle || article.title}</a></h3><p>${article.excerpt}</p></div>
      <a class="row-arrow" href="${articleHref(article)}" aria-label="閱讀文章">↗</a>
    </article>`).join('');
  empty.hidden = results.length !== 0;
}

document.querySelectorAll('.filter').forEach(button => button.addEventListener('click', () => {
  activeCategory = button.dataset.category;
  document.querySelectorAll('.filter').forEach(item => {
    const selected = item === button;
    item.classList.toggle('active', selected);
    item.setAttribute('aria-pressed', String(selected));
  });
  render();
}));
search.addEventListener('input', render);
document.querySelector('#clear-search').addEventListener('click', () => {
  search.value = '';
  activeCategory = '全部';
  document.querySelectorAll('.filter').forEach(item => {
    const selected = item.dataset.category === '全部';
    item.classList.toggle('active', selected);
    item.setAttribute('aria-pressed', String(selected));
  });
  render();
  search.focus();
});

const menu = document.querySelector('.menu-button');
const nav = document.querySelector('#site-nav');
menu.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  menu.setAttribute('aria-expanded', String(open));
});
nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  nav.classList.remove('open');
  menu.setAttribute('aria-expanded', 'false');
}));

const subscribeForm = document.querySelector('#subscribe-form');
if (subscribeForm) {
  subscribeForm.addEventListener('submit', event => event.preventDefault());
}
render();
