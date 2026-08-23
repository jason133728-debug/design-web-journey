const visitorCounterProductionEndpoint = 'https://design-web-journey-visitor-counter.design-web-journey-worker-deploy-20260823-121852.workers.dev/api/visits';
const visitorCounterIsLocalPreview = ['localhost', '127.0.0.1'].includes(window.location.hostname);

window.VISITOR_COUNTER_CONFIG = Object.freeze({
  // 部署 Cloudflare Worker 後，把上方 productionEndpoint 改成完整的 /api/visits 網址。
  endpoint: visitorCounterProductionEndpoint || (visitorCounterIsLocalPreview ? 'http://127.0.0.1:8787/api/visits' : ''),
  storageKey: 'design-web-journey:visitor-counted-on'
});
