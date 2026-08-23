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
- demos/login-form.html 的互動已外移到 demos/login-form.js。
- index.html 與 articles/index.html 的無 JavaScript 備援樣式已外移到 noscript.css。
- 4 個作品預覽 iframe 均使用 sandbox="allow-scripts"，不加入 allow-same-origin。
- iframe 中不啟動瀏覽計數器，避免 null Origin 造成預覽錯誤。
- 正式 Worker API 使用獨立 workers.dev 網域。

## 上線前整理狀態

1. 已完成：外移 demos/login-form.html 的 inline script。
2. 已完成：外移 2 段 noscript inline style，且不使用 unsafe-inline。
3. 已完成：4 個作品預覽 iframe 使用最小 sandbox="allow-scripts"。
4. 已完成靜態與 HTTP 檢查：18 個 HTML、2 個新資產與 4 個 iframe 來源可讀取。
5. 待完成：真實瀏覽器的 Console、互動與 360、390、768、1280、1440px 視覺檢查。
6. 已完成：根目錄新增 _headers，第一階段只設定 CSP Report-Only 與預覽站 noindex。
7. 待完成：Cloudflare Pages OAuth 授權、預覽部署與真實瀏覽器 Console 測試。
8. 暫不設定集中報告端點，不把瀏覽資料傳送至第三方服務。

## 建議 CSP

先在能控制 HTTP response headers 的環境使用 Report-Only：

```text
Content-Security-Policy-Report-Only:
  default-src 'self';
  base-uri 'self';
  object-src 'none';
  script-src 'self';
  script-src-attr 'none';
  style-src 'self' https://fonts.googleapis.com;
  style-src-attr 'none';
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
- script-src 與 style-src 不使用 unsafe-inline；既有可執行程式與備援樣式已全部外移。
- script-src-attr 與 style-src-attr 設為 none，禁止新增 inline event handler 與 style attribute。
- connect-src 只允許本站與正式計數器 Worker。
- Report-Only 需由 HTTP header 提供，不能由 meta CSP 取代。
- 若要集中接收違規報告，還必須設定 Reporting-Endpoints 與 report-to；未選定端點前不傳送報告到第三方服務。
- JSON-LD 必須在實際瀏覽器與搜尋結構化資料測試中確認未受影響。

## 託管路線判斷

- 目前 github.io 網址由 GitHub Pages 提供回應標頭；專案中的 _headers 檔不會改變該網址的 HTTP headers。
- 已核准採用最低風險做法：建立獨立 Cloudflare Pages 預覽站，在 pages.dev 網址套用 _headers，不切換目前 GitHub Pages。
- Cloudflare 反向代理需要自有網域，不能直接接管 github.io 網域。
- 建立公開 Pages 專案、產生新網址或切換正式網址前，必須再次確認託管選擇。

## Cloudflare Pages 第一階段 _headers

```text
/*
  Content-Security-Policy-Report-Only: default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self'; script-src-attr 'none'; style-src 'self' https://fonts.googleapis.com; style-src-attr 'none'; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://design-web-journey-visitor-counter.design-web-journey-worker-deploy-20260823-121852.workers.dev; frame-src 'self'; frame-ancestors 'self'; form-action 'self'; upgrade-insecure-requests
  X-Robots-Tag: noindex, nofollow
```

這份設定已新增至專案根目錄。第一輪只使用 Report-Only 與 noindex，不啟用強制 CSP；集中報告端點與其他會強制生效的安全標頭留待真實瀏覽器驗證後處理。

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
