# CSP 與安全標頭實施方案

更新日期：2026-08-23
適用網站：設計網頁之路

## 目標

在不破壞文章、作品預覽、Google Fonts 與瀏覽計數器的前提下，為網站增加瀏覽器端第二層防護。第一階段只觀察與驗證，確認沒有誤擋後才正式強制。

## 目前基線

- GitHub Pages 已強制 HTTPS 並提供 HSTS。
- 公開頁面目前沒有 CSP、X-Frame-Options、X-Content-Type-Options、Referrer-Policy 或 Permissions-Policy。
- 網站沒有外部可執行 JavaScript；外部資源只有 Google Fonts。
- 作品頁會用同來源 iframe 預覽首頁或登入示範，因此 framing 必須允許 self。
- demos/login-form.html 尚有一段可執行 inline script。
- index.html 與 articles/index.html 各有一段 noscript inline style。
- 正式 Worker API 使用獨立 workers.dev 網域。

## 上線前必要整理

1. 將 demos/login-form.html 的 inline script 移到獨立 JavaScript 檔。
2. 將 index.html 與 articles/index.html 的 noscript inline style 改為外部備援樣式表，避免使用 unsafe-inline。
3. 逐一替 4 個作品預覽 iframe 加上最小 sandbox 權限，先測試 sandbox="allow-scripts"；不得直接加入 allow-same-origin，除非功能驗證證明必要。
4. 在 18 個 HTML 頁面確認 Google Fonts、JSON-LD、文章搜尋、行動版選單與作品預覽都能正常運作。
5. 保留目前 Worker Origin 與 Rate Limit 測試。

## 建議 CSP

先在能控制 HTTP response headers 的環境使用 Report-Only：

```text
Content-Security-Policy-Report-Only:
  default-src 'self';
  base-uri 'self';
  object-src 'none';
  script-src 'self';
  style-src 'self' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com;
  img-src 'self' data:;
  connect-src 'self' https://design-web-journey-visitor-counter.design-web-journey-worker-deploy-20260823-121852.workers.dev;
  frame-src 'self';
  frame-ancestors 'self';
  form-action 'self';
  upgrade-insecure-requests
```

說明：

- frame-ancestors 使用 self，讓自己的作品頁仍可預覽自己的頁面，同時阻止其他網域任意嵌入。
- script-src 不使用 unsafe-inline。登入示範的 inline script 必須先外移。
- style-src 不使用 unsafe-inline。兩段 noscript inline style 必須先外移。
- connect-src 只允許本站與正式計數器 Worker。
- Report-Only 需由 HTTP header 提供；不要只靠 meta CSP。
- JSON-LD 必須在實際瀏覽器與搜尋結構化資料測試中確認未受影響。

## 建議其他標頭

```text
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
Cross-Origin-Opener-Policy: same-origin
```

暫不直接設定 Cross-Origin-Resource-Policy；先確認 Google Fonts、分享圖片與同來源 iframe 的相容性。

Worker JSON API 保留：

```text
Cache-Control: no-store
X-Content-Type-Options: nosniff
```

並建議增加：

```text
Referrer-Policy: no-referrer
X-Robots-Tag: noindex
```

## 分階段流程

### 第 1 階段：Report-Only

- 在 Cloudflare Pages、Cloudflare 反向代理或其他可控制 response headers 的主機設定 CSP Report-Only。
- 測試 360、390、768、1280、1440px。
- 檢查首頁、文章總覽、9 篇文章、4 個作品頁、登入示範與 404。
- 檢查 Console 是否出現 CSP 違規。
- 不在此階段啟用正式阻擋。

### 第 2 階段：正式強制

只有在第 1 階段所有必要功能通過後，才把 Content-Security-Policy-Report-Only 改成 Content-Security-Policy。

### 第 3 階段：持續檢查

- 新增外部網域、iframe、表單或 JavaScript 前先更新 CSP 測試。
- GitHub workflow 持續禁止外部可執行 script、HTTP 資源與未審查的動態 HTML。
- 每次部署後抽查安全標頭與 Worker Origin。

## 回復策略

- 每次只新增或收緊一組標頭。
- 上線前保留原設定與 SHA-256 備份。
- 若正式 CSP 造成主要功能中斷，回復到前一版標頭，不修改文章或網站資料。
