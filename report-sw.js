const PROXY_PATH = '/report-proxy';

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

function darkPrelude(reportUrl) {
  const baseHref = reportUrl.replace(/[^/]*$/, '');
  return `
    <base href="${escapeHtml(baseHref)}">
    <meta name="color-scheme" content="dark">
    <script>
      (() => {
        const DARK = 'dark-mode';
        const LIGHT = 'light-mode';
        const applyDark = () => {
          try { localStorage.setItem('theme', DARK); } catch (e) {}
          document.documentElement.classList.remove(LIGHT);
          document.documentElement.classList.add(DARK);
          document.documentElement.style.colorScheme = 'dark';
          document.documentElement.dataset.empireTheme = 'dark';
          if (document.body) {
            document.body.style.setProperty('background', '#09090b', 'important');
          }
        };
        applyDark();
        const originalSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function(key, value) {
          if (key === 'theme') value = DARK;
          return originalSetItem.call(this, key, value);
        };
        const originalAdd = DOMTokenList.prototype.add;
        const originalRemove = DOMTokenList.prototype.remove;
        DOMTokenList.prototype.add = function(...tokens) {
          return originalAdd.apply(this, tokens.map(token => token === LIGHT ? DARK : token));
        };
        DOMTokenList.prototype.remove = function(...tokens) {
          return originalRemove.apply(this, tokens.filter(token => token !== DARK));
        };
        new MutationObserver(applyDark).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
        window.addEventListener('hashchange', () => setTimeout(applyDark, 0), true);
        window.addEventListener('popstate', () => setTimeout(applyDark, 0), true);
        document.addEventListener('click', () => setTimeout(applyDark, 0), true);
        setInterval(applyDark, 500);
      })();
    <\/script>
    <style>
      html, html.light-mode, html.dark-mode, body { background: #09090b !important; color-scheme: dark !important; }
      html.light-mode { filter: invert(1) hue-rotate(180deg) saturate(.92) contrast(.96); }
    </style>`;
}

function transformReportHtml(html, reportUrl) {
  const prelude = darkPrelude(reportUrl);
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head([^>]*)>/i, `<head$1>${prelude}`);
  return `<!doctype html><html><head>${prelude}</head><body>${html}</body></html>`;
}

function errorHtml(message, reportUrl) {
  return `<!doctype html><html><head><meta name="color-scheme" content="dark"><style>html,body{margin:0;min-height:100%;background:#09090b;color:#fafafa;color-scheme:dark;font:13px/1.4 ui-sans-serif,system-ui}.box{max-width:720px;margin:48px auto;padding:18px;border:1px solid #3f3f46;border-radius:12px;background:#111113}code{color:#bfdbfe;word-break:break-all}</style></head><body><div class="box"><strong>Report proxy failed</strong><p>${escapeHtml(message)}</p><code>${escapeHtml(reportUrl || '')}</code></div></body></html>`;
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname !== PROXY_PATH) return;

  event.respondWith((async () => {
    const reportUrl = url.searchParams.get('report');
    if (!reportUrl) return new Response(errorHtml('Missing report URL', ''), { headers: { 'content-type': 'text/html; charset=utf-8' } });
    try {
      const response = await fetch(reportUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      return new Response(transformReportHtml(html, reportUrl), {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store'
        }
      });
    } catch (error) {
      return new Response(errorHtml(String(error.message || error), reportUrl), { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
  })());
});
