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
        const applyDark = () => {
          try { localStorage.setItem('theme', 'dark-mode'); } catch (e) {}
          const root = document.documentElement;
          if (root.classList.contains('light-mode')) root.classList.remove('light-mode');
          if (!root.classList.contains('dark-mode')) root.classList.add('dark-mode');
          if (root.style.colorScheme !== 'dark') root.style.colorScheme = 'dark';
        };
        applyDark();
        window.addEventListener('hashchange', () => requestAnimationFrame(applyDark), { passive: true });
        window.addEventListener('popstate', () => requestAnimationFrame(applyDark), { passive: true });
      })();
    <\/script>
    <style>
      html, body { background: #09090b !important; color-scheme: dark !important; }
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
