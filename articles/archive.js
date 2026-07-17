const archiveArticles = Array.isArray(window.ARTICLES) ? window.ARTICLES : [];
const archivePaths = window.ARTICLE_PATHS || {};
const archiveList = document.querySelector('#archive-list');
const archiveEmpty = document.querySelector('#archive-empty');
const archiveSearch = document.querySelector('#archive-search');
const archiveCount = document.querySelector('#article-count');
let archiveCategory = '全部';

const archiveHref = article => (archivePaths[article.id] || '').replace(/^articles\//, '') || '../index.html#articles';
const archiveMeta = article => `<span>${article.category}</span><span>${article.date}</span><span>閱讀 ${article.readTime}</span>`;

function renderArchive() {
  const term = archiveSearch.value.trim().toLowerCase();
  const results = archiveArticles.filter(article =>
    (archiveCategory === '全部' || article.category === archiveCategory) &&
    `${article.title}${article.excerpt}${article.category}`.toLowerCase().includes(term)
  );

  archiveCount.textContent = `${results.length} 篇`;
  archiveList.innerHTML = results.map((article, index) => `
    <article class="article-row">
      <a class="article-number ${article.cover}" href="${archiveHref(article)}" aria-label="閱讀：${article.title}">${String(index + 1).padStart(2, '0')}</a>
      <div><div class="article-meta">${archiveMeta(article)}</div><h3><a href="${archiveHref(article)}">${article.title}</a></h3><p>${article.excerpt}</p></div>
      <a class="row-arrow" href="${archiveHref(article)}" aria-label="閱讀文章">↗</a>
    </article>`).join('');
  archiveEmpty.hidden = results.length > 0;
}

document.querySelectorAll('.filter').forEach(button => button.addEventListener('click', () => {
  archiveCategory = button.dataset.category;
  document.querySelectorAll('.filter').forEach(item => {
    const selected = item === button;
    item.classList.toggle('active', selected);
    item.setAttribute('aria-pressed', String(selected));
  });
  renderArchive();
}));

archiveSearch.addEventListener('input', renderArchive);
document.querySelector('#archive-clear').addEventListener('click', () => {
  archiveSearch.value = '';
  archiveCategory = '全部';
  document.querySelectorAll('.filter').forEach(item => {
    const selected = item.dataset.category === '全部';
    item.classList.toggle('active', selected);
    item.setAttribute('aria-pressed', String(selected));
  });
  renderArchive();
  archiveSearch.focus();
});

renderArchive();
