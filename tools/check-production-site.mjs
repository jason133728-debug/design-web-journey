const baseUrl = new URL('https://jason133728-debug.github.io/design-web-journey/');
const minimumHstsSeconds = 31_536_000;
const failures = [];

const pageChecks = [
  ['', '設計網頁之路｜HTML、CSS 與網頁設計學習筆記'],
  ['articles/', '全部文章｜設計網頁之路'],
  ['articles/web-design-basics.html', '網頁設計入門：12 個新手最常問的問題｜設計網頁之路'],
  ['articles/learn-codex.html', '先學會操作 Codex：我的網頁設計第一步｜設計網頁之路'],
  ['articles/why-build-site.html', '為什麼我要建立這個網站｜設計網頁之路'],
  ['articles/less-but-clearer.html', '一個好看的頁面，不等於放進更多東西｜設計網頁之路'],
  ['articles/responsive-design.html', '手機版不是把桌面內容全部往下堆｜設計網頁之路'],
  ['articles/search-and-filter.html', '第一次讓頁面真的動起來：搜尋與分類｜設計網頁之路'],
  ['articles/first-webpage.html', '我的第一個網頁練習｜設計網頁之路'],
  ['articles/important-details.html', '那些畫面完成後，我才注意到的小細節｜設計網頁之路'],
  ['articles/learning-by-finishing.html', '比起一直收藏教學，我更需要完成一個作品｜設計網頁之路'],
  ['projects/personal-homepage.html', '個人首頁練習紀錄｜設計網頁之路'],
  ['projects/login-form.html', '登入頁練習紀錄｜設計網頁之路'],
  ['projects/article-list.html', '卡片式文章列表練習紀錄｜設計網頁之路'],
  ['projects/rwd-mobile.html', 'RWD 手機版練習紀錄｜設計網頁之路'],
  ['demos/login-form.html', '登入頁練習示範｜設計網頁之路'],
  ['404.html', '找不到頁面｜設計網頁之路']
];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function titleFrom(html) {
  return html.match(/<title>(.*?)<\/title>/is)?.[1]?.trim() || '';
}

function hstsMaxAge(value) {
  const match = String(value || '').match(/(?:^|;)\s*max-age=(\d+)/i);
  return match ? Number(match[1]) : 0;
}

async function request(url, options = {}) {
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        signal: AbortSignal.timeout(15_000)
      });

      if (attempt === 3 || (response.status !== 429 && response.status < 500)) {
        return response;
      }

      await response.arrayBuffer();
      lastError = new Error('HTTP ' + response.status);
    } catch (error) {
      lastError = error;
      if (attempt === 3) throw error;
    }

    await new Promise(resolve => setTimeout(resolve, attempt * 500));
  }

  throw lastError;
}

function collectInternalTargets(html, pageUrl, targets) {
  for (const match of html.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi)) {
    const value = match[1].trim();
    if (
      !value ||
      value.startsWith('#') ||
      /^(?:mailto|tel|javascript):/i.test(value)
    ) {
      continue;
    }

    let target;
    try {
      target = new URL(value, pageUrl);
    } catch {
      failures.push(pageUrl.pathname + ': invalid URL ' + value);
      continue;
    }

    if (
      target.origin === baseUrl.origin &&
      target.pathname.startsWith(baseUrl.pathname)
    ) {
      target.hash = '';
      targets.add(target.href);
    }
  }
}

const internalTargets = new Set();

for (const [path, expectedTitle] of pageChecks) {
  const pageUrl = new URL(path, baseUrl);

  try {
    const response = await request(pageUrl);
    const html = await response.text();
    const label = path || '/';

    check(response.status === 200, label + ': expected HTTP 200, got ' + response.status);
    check(titleFrom(html) === expectedTitle, label + ': document title changed');
    check(
      hstsMaxAge(response.headers.get('strict-transport-security')) >= minimumHstsSeconds,
      label + ': HSTS is missing or shorter than one year'
    );
    check(
      !response.headers.has('content-security-policy'),
      label + ': enforced CSP must remain disabled during the planning stage'
    );
    check(
      !response.headers.has('content-security-policy-report-only'),
      label + ': GitHub Pages unexpectedly serves a Report-Only CSP'
    );
    check(
      !response.headers.has('x-robots-tag'),
      label + ': production GitHub Pages must remain indexable'
    );

    collectInternalTargets(html, pageUrl, internalTargets);
  } catch (error) {
    failures.push((path || '/') + ': request failed: ' + error.message);
  }
}

for (const target of internalTargets) {
  try {
    const response = await request(target, { method: 'HEAD' });
    check(response.status === 200, target + ': expected HTTP 200, got ' + response.status);
  } catch (error) {
    failures.push(target + ': internal target request failed: ' + error.message);
  }
}

const missingUrl = new URL('__production-monitor-missing-route__', baseUrl);
try {
  const missing = await request(missingUrl);
  check(missing.status === 404, 'missing route: expected HTTP 404, got ' + missing.status);
} catch (error) {
  failures.push('missing route request failed: ' + error.message);
}

if (failures.length) {
  for (const failure of failures) console.error('::error::' + failure);
  throw new Error('Production site checks failed with ' + failures.length + ' issue(s).');
}

console.log(
  'Production site checks passed: ' +
  pageChecks.length +
  ' routes, ' +
  internalTargets.size +
  ' internal targets, HSTS, indexability, CSP planning state, and custom 404.'
);
