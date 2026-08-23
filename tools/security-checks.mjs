import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const warnings = [];

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (['.git', '.wrangler'].includes(entry.name)) return [];
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

const files = walk(root);
const relativePath = file => path.relative(root, file).replaceAll('\\', '/');
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.jsonc', '.md', '.mjs', '.svg', '.txt', '.xml', '.yaml', '.yml']);
const textFiles = files.filter(file => textExtensions.has(path.extname(file).toLowerCase()) || path.basename(file) === '_headers');
const contents = new Map(textFiles.map(file => [relativePath(file), readFileSync(file, 'utf8')]));

const sensitiveFilePatterns = [
  /(^|\/)\.env(?:\.|$)/i,
  /\.(?:key|pem)$/i,
  /(^|\/)(?:credentials|id_rsa)(?:\.|$)/i
];

for (const file of files.map(relativePath)) {
  if (sensitiveFilePatterns.some(pattern => pattern.test(file))) {
    failures.push(`${file}: sensitive filename must not be committed`);
  }
}

const secretPatterns = [
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/],
  ['private key', /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/],
  ['Cloudflare token assignment', /\bCLOUDFLARE_API_TOKEN\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/],
  ['Bearer token', /\bBearer\s+[A-Za-z0-9._~-]{24,}/i]
];

for (const [file, text] of contents) {
  for (const [label, pattern] of secretPatterns) {
    if (pattern.test(text)) failures.push(`${file}: possible ${label}`);
  }
}

const forbiddenJavaScript = [
  ['dynamic code execution', /\beval\s*\(/],
  ['Function constructor', /\bnew\s+Function\s*\(/],
  ['DOM document writer', /\bdocument\.write\s*\(/],
  ['outerHTML assignment', /\.outerHTML\s*=/],
  ['insertAdjacentHTML()', /\.insertAdjacentHTML\s*\(/]
];

const expectedInnerHTML = new Map([
  ['script.js', 2],
  ['articles/archive.js', 1],
  ['article.js', 2]
]);

for (const [file, text] of contents) {
  if (!/\.m?js$/i.test(file)) continue;
  for (const [label, pattern] of forbiddenJavaScript) {
    if (pattern.test(text)) failures.push(`${file}: forbidden JavaScript primitive ${label}`);
  }

  const innerHTMLCount = (text.match(/\.innerHTML\s*=/g) || []).length;
  const expected = expectedInnerHTML.get(file) || 0;
  if (innerHTMLCount !== expected) {
    failures.push(`${file}: innerHTML assignment count is ${innerHTMLCount}; reviewed baseline is ${expected}`);
  }
  if (expected > 0 && (!text.includes('escapeHTML') || !text.includes('safeArticlePath'))) {
    failures.push(`${file}: reviewed dynamic HTML helpers are missing`);
  }
}

for (const [file, text] of contents) {
  if (!file.endsWith('.html')) continue;

  for (const match of text.matchAll(/\b(?:action|formaction|href|poster|src)\s*=\s*["']([^"']+)["']/gi)) {
    const value = match[1].trim();
    if (/^http:\/\//i.test(value)) failures.push(`${file}: insecure HTTP resource ${value}`);
    if (/^\/\//.test(value)) failures.push(`${file}: protocol-relative resource is not allowed (${value})`);
    if (/^javascript:/i.test(value)) failures.push(`${file}: javascript URL is forbidden`);
  }

  for (const match of text.matchAll(/\bsrcset\s*=\s*["']([^"']+)["']/gi)) {
    for (const candidate of match[1].split(',')) {
      const value = candidate.trim().split(/\s+/)[0] || '';
      if (/^http:\/\//i.test(value)) failures.push(`${file}: insecure HTTP srcset resource ${value}`);
      if (/^\/\//.test(value)) failures.push(`${file}: protocol-relative srcset resource is not allowed (${value})`);
    }
  }

  for (const match of text.matchAll(/<script\b([^>]*)>/gi)) {
    const tag = match[0];
    const src = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1] || '';
    if (/^(?:https?:)?\/\//i.test(src)) failures.push(`${file}: external executable script is not allowed (${src})`);
  }

  for (const match of text.matchAll(/<a\b[^>]*target\s*=\s*["']_blank["'][^>]*>/gi)) {
    if (!/\brel\s*=\s*["'][^"']*(?:noopener|noreferrer)/i.test(match[0])) {
      failures.push(`${file}: target="_blank" is missing noopener or noreferrer`);
    }
  }

  const inlineStyleBlocks = [...text.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi)].length;
  if (inlineStyleBlocks) failures.push(`${file}: inline style blocks are not allowed`);
  const inlineStyleAttributes = [...text.matchAll(/\sstyle\s*=/gi)].length;
  if (inlineStyleAttributes) failures.push(`${file}: inline style attributes are not allowed`);
  const inlineEventHandlers = [...text.matchAll(/\son[a-z]+\s*=/gi)].length;
  if (inlineEventHandlers) failures.push(`${file}: inline event handlers are not allowed`);

  let activeInlineScripts = 0;
  for (const match of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attributes = match[1];
    if (/\bsrc\s*=/i.test(attributes) || /type\s*=\s*["']application\/ld\+json["']/i.test(attributes)) continue;
    if (match[2].trim()) activeInlineScripts += 1;
  }

  if (activeInlineScripts) failures.push(`${file}: active inline scripts are not allowed`);

  for (const match of text.matchAll(/<iframe\b[^>]*>/gi)) {
    const sandboxAttributes = [...match[0].matchAll(/\bsandbox\s*=\s*"([^"]*)"/gi)];
    if (sandboxAttributes.length !== 1 || sandboxAttributes[0][1].trim() !== 'allow-scripts') {
      failures.push(`${file}: every iframe must use exactly one sandbox="allow-scripts" attribute`);
    }
    if (/\bsrcdoc\s*=/i.test(match[0])) failures.push(`${file}: iframe srcdoc is not allowed`);
    const src = match[0].match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1]?.trim() || '';
    if (!src || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(src)) {
      failures.push(`${file}: iframe source must be an explicit same-origin relative path`);
    }
  }
}

for (const [file, text] of contents) {
  if (!file.endsWith('.css')) continue;
  if (/@import\b/i.test(text)) failures.push(`${file}: CSS @import is not allowed`);
  if (/url\(\s*["']?http:\/\//i.test(text)) failures.push(`${file}: insecure HTTP CSS resource is not allowed`);
  if (/url\(\s*["']?\/\//i.test(text)) failures.push(`${file}: protocol-relative CSS resource is not allowed`);
}

const pagesHeadersPath = '_headers';
const pagesHeadersText = contents.get(pagesHeadersPath) || '';
if (!pagesHeadersText) {
  failures.push(`${pagesHeadersPath}: missing Cloudflare Pages header configuration`);
} else {
  if (!/^\s*Content-Security-Policy-Report-Only:/m.test(pagesHeadersText)) {
    failures.push(`${pagesHeadersPath}: CSP Report-Only header is missing`);
  }
  if (/^\s*Content-Security-Policy:/m.test(pagesHeadersText)) {
    failures.push(`${pagesHeadersPath}: enforced CSP must not be enabled during the report-only stage`);
  }
  for (const directive of ['default-src "self"', 'object-src "none"', 'script-src-attr "none"', 'style-src-attr "none"', 'frame-ancestors "self"']) {
    const normalized = directive.replaceAll('"', "'");
    if (!pagesHeadersText.includes(normalized)) failures.push(`${pagesHeadersPath}: missing directive ${normalized}`);
  }
  if (/unsafe-inline|unsafe-eval/.test(pagesHeadersText)) failures.push(`${pagesHeadersPath}: unsafe CSP source is forbidden`);
  if (!/^\s*X-Robots-Tag:\s*noindex, nofollow\s*$/mi.test(pagesHeadersText)) {
    failures.push(`${pagesHeadersPath}: preview site must remain noindex`);
  }
}

const workerConfigPath = 'wrangler.visitor-counter.jsonc';
const workerConfigText = contents.get(workerConfigPath);
if (!workerConfigText) {
  failures.push(`${workerConfigPath}: missing`);
} else {
  try {
    const config = JSON.parse(workerConfigText);
    const origins = String(config.vars?.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
    const expectedOrigins = ['https://jason133728-debug.github.io'];
    if (JSON.stringify(origins) !== JSON.stringify(expectedOrigins)) {
      failures.push(`${workerConfigPath}: production ALLOWED_ORIGINS must contain only ${expectedOrigins[0]}`);
    }
    const limiter = config.ratelimits?.find(item => item.name === 'VISITOR_RATE_LIMITER');
    if (!limiter || limiter.simple?.limit !== 10 || limiter.simple?.period !== 60) {
      failures.push(`${workerConfigPath}: expected 10 requests per 60 seconds rate limit`);
    }
  } catch {
    failures.push(`${workerConfigPath}: invalid JSONC configuration`);
  }
}

const workerPath = 'tools/visitor-counter-worker.js';
const workerText = contents.get(workerPath) || '';
for (const marker of [
  "request.method === 'POST' && !isAllowedOrigin",
  'VISITOR_RATE_LIMITER.limit({ key })',
  "request.headers.get('CF-Connecting-IP')",
  "crypto.subtle.digest('SHA-256'",
  "'Referrer-Policy': 'no-referrer'",
  "'X-Frame-Options': 'DENY'",
  "'X-Robots-Tag': 'noindex'"
]) {
  if (!workerText.includes(marker)) failures.push(`${workerPath}: missing security marker ${marker}`);
}

const workflowPath = '.github/workflows/security-checks.yml';
if (!contents.get(workflowPath)) failures.push(`${workflowPath}: missing`);

const workflowPaths = [...contents.keys()].filter(file => /^\.github\/workflows\/.*\.ya?ml$/i.test(file));
for (const file of workflowPaths) {
  const text = contents.get(file) || '';
  if (!/permissions:\s*\n\s+contents:\s*read/.test(text)) {
    failures.push(`${file}: GITHUB_TOKEN permissions must be contents: read`);
  }
  if (!/persist-credentials:\s*false/.test(text)) {
    failures.push(`${file}: checkout credentials must not persist`);
  }
  const usesLines = text.match(/^\s*uses:\s*.+$/gm) || [];
  if (!usesLines.length || usesLines.some(line => !/@[0-9a-f]{40}(?:\s+#.*)?$/.test(line.trim()))) {
    failures.push(`${file}: every action must be pinned to a full commit SHA`);
  }
}

const productionWorkflowPath = '.github/workflows/production-security-checks.yml';
const productionWorkflowText = contents.get(productionWorkflowPath) || '';
for (const marker of ['schedule:', 'workflow_dispatch:', 'node tools/check-production-worker.mjs']) {
  if (!productionWorkflowText.includes(marker)) failures.push(`${productionWorkflowPath}: missing ${marker}`);
}

const productionCheckPath = 'tools/check-production-worker.mjs';
const productionCheckText = contents.get(productionCheckPath) || '';
for (const marker of [
  'https://design-web-journey-visitor-counter.design-web-journey-worker-deploy-20260823-121852.workers.dev/api/visits',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  "request('OPTIONS',",
  "request('GET',"
]) {
  if (!productionCheckText.includes(marker)) failures.push(`${productionCheckPath}: missing ${marker}`);
}

const dependabotPath = '.github/dependabot.yml';
const dependabotText = contents.get(dependabotPath) || '';
for (const marker of ['version: 2', 'package-ecosystem: github-actions', 'interval: weekly']) {
  if (!dependabotText.includes(marker)) failures.push(`${dependabotPath}: missing ${marker}`);
}

const securityPolicyPath = 'SECURITY.md';
const securityPolicyText = contents.get(securityPolicyPath) || '';
for (const marker of ['## 支援範圍', '## 回報安全問題', '不要在公開 Issue']) {
  if (!securityPolicyText.includes(marker)) failures.push(`${securityPolicyPath}: missing ${marker}`);
}

for (const warning of warnings) console.warn(`::warning::${warning}`);

if (failures.length) {
  for (const failure of failures) console.error(`::error::${failure}`);
  console.error(`Security checks failed with ${failures.length} issue(s).`);
  process.exit(1);
}

console.log(`Security checks passed: ${files.length} files checked, ${warnings.length} reviewed warning(s).`);
