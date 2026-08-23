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
const textFiles = files.filter(file => textExtensions.has(path.extname(file).toLowerCase()) || path.basename(file) === "_headers");
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

  for (const match of text.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi)) {
    const value = match[1].trim();
    if (/^http:\/\//i.test(value)) failures.push(`${file}: insecure HTTP resource ${value}`);
    if (/^javascript:/i.test(value)) failures.push(`${file}: javascript URL is forbidden`);
  }

  for (const match of text.matchAll(/<script\b([^>]*)>/gi)) {
    const tag = match[0];
    const src = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1] || '';
    if (/^https?:\/\//i.test(src)) failures.push(`${file}: external executable script is not allowed (${src})`);
  }

  for (const match of text.matchAll(/<a\b[^>]*target\s*=\s*["']_blank["'][^>]*>/gi)) {
    if (!/\brel\s*=\s*["'][^"']*(?:noopener|noreferrer)/i.test(match[0])) {
      failures.push(`${file}: target="_blank" is missing noopener or noreferrer`);
    }
  }

  const inlineStyleBlocks = [...text.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi)].length;
  if (inlineStyleBlocks) failures.push(file + ": inline style blocks are not allowed");
  const inlineStyleAttributes = [...text.matchAll(/\sstyle\s*=/gi)].length;
  if (inlineStyleAttributes) failures.push(file + ": inline style attributes are not allowed");
  const inlineEventHandlers = [...text.matchAll(/\son[a-z]+\s*=/gi)].length;
  if (inlineEventHandlers) failures.push(file + ": inline event handlers are not allowed");

  let activeInlineScripts = 0;
  for (const match of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attributes = match[1];
    if (/\bsrc\s*=/i.test(attributes) || /type\s*=\s*["']application\/ld\+json["']/i.test(attributes)) continue;
    if (match[2].trim()) activeInlineScripts += 1;
  }

  if (activeInlineScripts) failures.push(file + ": active inline scripts are not allowed");

  for (const match of text.matchAll(/<iframe\b[^>]*>/gi)) {
    const sandboxAttributes = [...match[0].matchAll(/\bsandbox\s*=\s*"([^"]*)"/gi)];
    if (sandboxAttributes.length !== 1 || sandboxAttributes[0][1].trim() !== "allow-scripts") {
      failures.push(file + ": every iframe must use exactly one sandbox=\"allow-scripts\" attribute");
    }
  }
}

const pagesHeadersPath = "_headers";
const pagesHeadersText = contents.get(pagesHeadersPath) || "";
if (!pagesHeadersText) {
  failures.push(pagesHeadersPath + ": missing Cloudflare Pages header configuration");
} else {
  if (!/^\s*Content-Security-Policy-Report-Only:/m.test(pagesHeadersText)) {
    failures.push(pagesHeadersPath + ": CSP Report-Only header is missing");
  }
  if (/^\s*Content-Security-Policy:/m.test(pagesHeadersText)) {
    failures.push(pagesHeadersPath + ": enforced CSP must not be enabled during the report-only stage");
  }
  for (const directive of ["default-src \"self\"", "object-src \"none\"", "script-src-attr \"none\"", "style-src-attr \"none\"", "frame-ancestors \"self\""]) {
    const normalized = directive.replaceAll("\"", "'");
    if (!pagesHeadersText.includes(normalized)) failures.push(pagesHeadersPath + ": missing directive " + normalized);
  }
  if (/unsafe-inline|unsafe-eval/.test(pagesHeadersText)) failures.push(pagesHeadersPath + ": unsafe CSP source is forbidden");
  if (!/^\s*X-Robots-Tag:\s*noindex, nofollow\s*$/mi.test(pagesHeadersText)) {
    failures.push(pagesHeadersPath + ": preview site must remain noindex");
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
  "crypto.subtle.digest('SHA-256'"
]) {
  if (!workerText.includes(marker)) failures.push(`${workerPath}: missing security marker ${marker}`);
}

const workflowPath = '.github/workflows/security-checks.yml';
const workflowText = contents.get(workflowPath) || '';
if (!/permissions:\s*\n\s+contents:\s*read/.test(workflowText)) {
  failures.push(`${workflowPath}: GITHUB_TOKEN permissions must be contents: read`);
}
if (!/persist-credentials:\s*false/.test(workflowText)) {
  failures.push(`${workflowPath}: checkout credentials must not persist`);
}
const usesLines = workflowText.match(/^\s*uses:\s*.+$/gm) || [];
if (!usesLines.length || usesLines.some(line => !/@[0-9a-f]{40}(?:\s+#.*)?$/.test(line.trim()))) {
  failures.push(`${workflowPath}: every action must be pinned to a full commit SHA`);
}

for (const warning of warnings) console.warn(`::warning::${warning}`);

if (failures.length) {
  for (const failure of failures) console.error(`::error::${failure}`);
  console.error(`Security checks failed with ${failures.length} issue(s).`);
  process.exit(1);
}

console.log(`Security checks passed: ${files.length} files checked, ${warnings.length} reviewed warning(s).`);
