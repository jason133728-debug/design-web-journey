const articles = window.ARTICLES;
const featured = articles.find(article => article.featured);
const list = document.querySelector('#article-list');
const empty = document.querySelector('#empty-state');
const search = document.querySelector('#search-input');
let activeCategory = '全部';

const meta = article => `<span>${article.category}</span><span>${article.date}</span><span>閱讀 ${article.readTime}</span>`;
document.querySelector('#featured').innerHTML = `
  <a class="featured-cover ${featured.cover}" href="article.html?id=${featured.id}" aria-label="閱讀：${featured.title}"><span>01</span><i>LESS, BUT CLEARER</i></a>
  <div class="featured-copy"><p class="section-kicker" id="featured-title">本期選讀</p><div class="article-meta">${meta(featured)}</div><h2><a href="article.html?id=${featured.id}">${featured.title}</a></h2><p>${featured.excerpt}</p><a class="read-link" href="article.html?id=${featured.id}">繼續閱讀 <span>→</span></a></div>`;

function render() {
  const term = search.value.trim().toLowerCase();
  const results = articles.filter(a => (activeCategory === '全部' || a.category === activeCategory) && `${a.title}${a.excerpt}${a.category}`.toLowerCase().includes(term));
  document.querySelector('#article-count').textContent = `${results.length} 篇`;
  list.innerHTML = results.map((a, i) => `<article class="article-row"><a class="article-number ${a.cover}" href="article.html?id=${a.id}" aria-label="閱讀：${a.title}">${String(i + 1).padStart(2,'0')}</a><div><div class="article-meta">${meta(a)}</div><h3><a href="article.html?id=${a.id}">${a.title}</a></h3><p>${a.excerpt}</p></div><a class="row-arrow" href="article.html?id=${a.id}" aria-label="閱讀文章">↗</a></article>`).join('');
  empty.hidden = results.length > 0;
}
document.querySelectorAll('.filter').forEach(button => button.addEventListener('click', () => {
  activeCategory = button.dataset.category;
  document.querySelectorAll('.filter').forEach(b => { const selected = b === button; b.classList.toggle('active', selected); b.setAttribute('aria-pressed', selected); });
  render();
}));
search.addEventListener('input', render);
document.querySelector('#clear-search').addEventListener('click', () => { search.value=''; activeCategory='全部'; document.querySelector('.filter[data-category="全部"]').click(); search.focus(); });
const menu = document.querySelector('.menu-button'), nav = document.querySelector('#site-nav');
menu.addEventListener('click', () => { const open=nav.classList.toggle('open'); menu.setAttribute('aria-expanded', open); });
nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => { nav.classList.remove('open'); menu.setAttribute('aria-expanded','false'); }));
document.querySelector('#subscribe-form').addEventListener('submit', e => { e.preventDefault(); e.currentTarget.querySelector('.form-message').textContent='謝謝你。這是展示版本，電子報功能尚未啟用。'; });
render();
