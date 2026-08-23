(() => {
  if (window.self !== window.top) return;

  const counterSection = document.querySelector('#visitor-counter');
  const countElement = document.querySelector('#visitor-count');
  const statusElement = document.querySelector('#visitor-count-status');
  const valueElement = document.querySelector('.visitor-counter-value');
  const config = window.VISITOR_COUNTER_CONFIG || {};
  const endpoint = String(config.endpoint || '').trim();

  if (!counterSection || !countElement || !statusElement || !valueElement || !endpoint) return;

  let endpointUrl;
  try {
    endpointUrl = new URL(endpoint);
  } catch {
    return;
  }

  const isLocalEndpoint = ['localhost', '127.0.0.1'].includes(endpointUrl.hostname);
  if (endpointUrl.protocol !== 'https:' && !(isLocalEndpoint && endpointUrl.protocol === 'http:')) return;

  counterSection.hidden = false;

  const storageKey = String(config.storageKey || 'design-web-journey:visitor-counted-on');
  const numberFormatter = new Intl.NumberFormat('zh-TW');
  const todayInTaipei = () => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date());
    const value = type => parts.find(part => part.type === type)?.value || '';
    return `${value('year')}-${value('month')}-${value('day')}`;
  };

  async function loadCount() {
    const today = todayInTaipei();
    let storedDay = null;
    let storageAvailable = true;

    try {
      storedDay = window.localStorage.getItem(storageKey);
    } catch {
      storageAvailable = false;
    }

    const shouldIncrement = storageAvailable && storedDay !== today;

    if (shouldIncrement) {
      try {
        window.localStorage.setItem(storageKey, today);
      } catch {
        storageAvailable = false;
      }
    }

    try {
      const response = await fetch(endpointUrl.href, {
        method: shouldIncrement && storageAvailable ? 'POST' : 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        credentials: 'omit'
      });

      if (!response.ok) throw new Error(`Visitor counter returned ${response.status}`);

      const data = await response.json();
      if (!Number.isSafeInteger(data.count) || data.count < 0) {
        throw new Error('Visitor counter returned an invalid count');
      }

      countElement.textContent = numberFormatter.format(data.count);
      statusElement.textContent = shouldIncrement && storageAvailable
        ? '今天已計入一次；同一裝置每日最多計一次。'
        : '同一裝置每日最多計一次；本站程式不寫入 IP、Cookie 或個人資料。';
    } catch {
      if (shouldIncrement && storageAvailable) {
        try {
          if (window.localStorage.getItem(storageKey) === today) {
            window.localStorage.removeItem(storageKey);
          }
        } catch {
          // 儲存空間不可用時不再重試，避免影響網站其他功能。
        }
      }

      valueElement.classList.add('is-error');
      countElement.textContent = '—';
      statusElement.textContent = '瀏覽紀錄暫時無法讀取，網站其他內容仍可正常使用。';
    }
  }

  loadCount();
})();
