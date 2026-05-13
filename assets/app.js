const registryUrl = new URL('../modules/e2e/projects.json', import.meta.url);
const grid = document.querySelector('#project-grid');
const summary = document.querySelector('#fleet-summary strong');
const filter = document.querySelector('#filter');
let projects = [];

const csvLast = (text) => {
  const rows = text.trim().split(/\r?\n/).filter(Boolean);
  if (rows.length < 2) return null;
  const cols = rows[0].split(',');
  const vals = rows.at(-1).split(',');
  return Object.fromEntries(cols.map((c, i) => [c, vals[i] ?? '']));
};
const fetchJson = async (url) => (await fetch(url, { cache: 'no-store' })).json();
const fetchText = async (url) => (await fetch(url, { cache: 'no-store' })).text();

async function hydrateSurface(surface) {
  if (surface.planned) return { ...surface, state: 'planned' };
  try {
    if (surface.statusUrl) {
      const status = await fetchJson(surface.statusUrl);
      const failed = Number(status.failed ?? status.unexpected ?? 0);
      const passed = Number(status.passed ?? status.expected ?? 0);
      return { ...surface, state: failed > 0 ? 'fail' : 'pass', status, passed, failed, duration: status.duration, ts: status.ts };
    }
    if (surface.resultsUrl) {
      const row = csvLast(await fetchText(surface.resultsUrl));
      if (row) {
        const failed = Number(row.failed ?? 0), passed = Number(row.passed ?? 0);
        return { ...surface, state: failed > 0 ? 'fail' : 'pass', passed, failed, duration: row.duration, ts: row.timestamp };
      }
    }
    return { ...surface, state: 'unknown' };
  } catch (error) {
    return { ...surface, state: 'unknown', error: String(error.message || error) };
  }
}

function stateLabel(state) {
  return state === 'pass' ? 'green' : state === 'fail' ? 'red' : state === 'planned' ? 'planned' : 'unknown';
}
function fmtDuration(ms) {
  const n = Number(ms || 0); if (!n) return '—';
  return n > 10000 ? `${Math.round(n / 1000)}s` : `${n}ms`;
}
function card(project) {
  const states = project.surfaces.map(s => s.state);
  const state = project.planned ? 'planned' : states.includes('fail') ? 'fail' : states.includes('pass') ? 'pass' : 'unknown';
  return `<article class="project-card" data-name="${project.name.toLowerCase()} ${project.repo || ''}">
    <div class="project-head"><div><h3>${project.name}</h3><div class="repo">${project.repo || 'external publisher'}</div></div><span class="pill ${state}">${stateLabel(state)}</span></div>
    <div class="surfaces">
      ${project.surfaces.map(s => `<div class="surface">
        <div class="surface-top"><span class="surface-name">${s.name}</span><span class="pill ${s.state}">${stateLabel(s.state)}</span></div>
        <div class="metrics"><span>pass ${s.passed ?? '—'}</span><span>fail ${s.failed ?? '—'}</span><span>duration ${fmtDuration(s.duration)}</span><span>${s.ts ? new Date(s.ts).toLocaleString() : 'not published yet'}</span></div>
      </div>`).join('')}
    </div>
    <div class="links"><a href="${project.href}">Open module</a>${project.actionsHref ? `<a href="${project.actionsHref}">Actions</a>` : ''}</div>
  </article>`;
}
function render() {
  const q = filter.value.trim().toLowerCase();
  grid.innerHTML = projects.filter(p => !q || `${p.name} ${p.repo}`.toLowerCase().includes(q)).map(card).join('');
  const all = projects.flatMap(p => p.surfaces);
  const live = all.filter(s => s.state === 'pass' || s.state === 'fail');
  const failures = live.filter(s => s.state === 'fail').length;
  summary.textContent = live.length ? `${live.length - failures}/${live.length} green` : 'No live surfaces';
}
async function main() {
  const registry = await fetchJson(registryUrl);
  projects = await Promise.all(registry.projects.map(async p => ({ ...p, surfaces: await Promise.all(p.surfaces.map(hydrateSurface)) })));
  render();
}
filter.addEventListener('input', render);
main().catch(err => { grid.innerHTML = `<p class="muted">Failed to load registry: ${err.message}</p>`; summary.textContent = 'offline'; });
