const archiveArticles = Array.isArray(window.ARTICLES) ? window.ARTICLES : [];
const archiveList = document.querySelector('#archive-list');
const archiveEmpty = document.querySelector('#archive-empty');
const archiveSearch = document.querySelector('#archive-search');
const archiveCount = document.querySelector('#article-count');
const archiveTools = document.querySelector('.article-tools');
const archiveSummary = window.ARTICLE_SUMMARY || { total: archiveArticles.length };
let archiveCategory = '全部';

const HTML_ESCAPES = Object.freeze({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' });
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => HTML_ESCAPES[character]);
const safeClassToken = value => /^[A-Za-z0-9_-]+$/.test(String(value ?? '')) ? String(value) : '';
const safeArticlePath = value => /^articles\/[a-z0-9-]+\.html$/i.test(String(value ?? '')) ? String(value) : '';
const hasArchiveData = archiveArticles.length > 0 && archiveArticles.every(article => safeArticlePath(article.path));

const archiveSummaryText = document.querySelector('#archive-summary');
if (archiveSummaryText) archiveSummaryText.textContent = `文章總覽 · ${archiveSummary.total} 篇學習紀錄`;

const archiveHref = article => safeArticlePath(article.path).replace(/^articles\//, '') || '../index.html#articles';
const archiveMeta = article => `<span>${escapeHTML(article.category)}</span><span>${escapeHTML(article.date)}</span><span>閱讀 ${escapeHTML(article.readTime)}</span>`;

function clearArchiveSearch() {
  archiveSearch.value = '';
  archiveCategory = '全部';
  document.querySelectorAll('.filter').forEach(item => {
    const selected = item.dataset.category === '全部';
    item.classList.toggle('active', selected);
    item.setAttribute('aria-pressed', String(selected));
  });
  renderArchive();
  archiveSearch.focus();
}

function setArchiveEmptyState(isEmpty) {
  if (!isEmpty) {
    archiveEmpty.replaceChildren();
    archiveEmpty.hidden = true;
    return;
  }

  const message = document.createElement('p');
  message.textContent = '沒有找到符合條件的文章。';
  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.id = 'archive-clear';
  clearButton.textContent = '清除搜尋';
  clearButton.addEventListener('click', clearArchiveSearch);
  archiveEmpty.replaceChildren(message, clearButton);
  archiveEmpty.hidden = false;
}

function renderArchive() {
  const term = archiveSearch.value.trim().toLowerCase();
  const results = archiveArticles.filter(article =>
    (archiveCategory === '全部' || article.category === archiveCategory) &&
    `${article.title}${article.excerpt}${article.category}`.toLowerCase().includes(term)
  );

  archiveCount.textContent = `${results.length} 篇`;
  archiveList.innerHTML = results.map((article, index) => `
    <article class="article-row">
      <a class="article-number ${safeClassToken(article.cover)}" href="${escapeHTML(archiveHref(article))}" aria-label="閱讀：${escapeHTML(article.title)}">${String(index + 1).padStart(2, '0')}</a>
      <div><div class="article-meta">${archiveMeta(article)}</div><h3><a href="${escapeHTML(archiveHref(article))}">${escapeHTML(article.title)}</a></h3><p>${escapeHTML(article.excerpt)}</p></div>
      <a class="row-arrow" href="${escapeHTML(archiveHref(article))}" aria-label="閱讀文章">↗</a>
    </article>`).join('');
  setArchiveEmptyState(results.length === 0);
}

if (hasArchiveData) {
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

  renderArchive();
} else {
  archiveCount.textContent = `${archiveList.querySelectorAll('.article-row').length} 篇`;
  setArchiveEmptyState(false);
  archiveTools.hidden = true;
}
