import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, AlertTriangle, Boxes, CircleDot, Clock3, ExternalLink, Gauge, GitBranch, LayoutDashboard, RadioTower, Search, ShieldCheck, Workflow, Zap } from 'lucide-react';
import clsx from 'clsx';
import './styles.css';

const registryUrl = `${import.meta.env.BASE_URL}modules/e2e/projects.json`;
const STATES = ['passed', 'failed', 'blocked', 'no-report', 'stale', 'planned'];

function trendRows(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (/^[{[]/.test(trimmed)) {
    try {
      const data = JSON.parse(trimmed);
      return Array.isArray(data) ? data : Array.isArray(data.runs) ? data.runs : Array.isArray(data.history) ? data.history : [];
    } catch {}
  }
  const rows = trimmed.split(/\r?\n/).filter(Boolean);
  if (rows.length < 2) return [];
  const cols = rows[0].split(',').map(c => c.trim());
  return rows.slice(1).map(row => Object.fromEntries(row.split(',').map((v, i) => [cols[i], v ?? ''])));
}
async function fetchJson(url) { return (await fetch(url, { cache: 'no-store' })).json(); }
async function fetchText(url) { return (await fetch(url, { cache: 'no-store' })).text(); }
async function optionalJson(url) { if (!url) return null; try { return await fetchJson(url); } catch { return null; } }
async function optionalText(url) { if (!url) return null; try { return await fetchText(url); } catch { return null; } }
function asNumber(value) { const n = Number(value); return Number.isFinite(n) ? n : undefined; }
function inferSibling(url, file) { return url?.replace(/[^/]+$/, file); }
function appendPath(url, path) { return url ? `${url.replace(/\/?$/, '/')}${path}` : undefined; }
function normalizeState(value, failed = 0) {
  const s = String(value || '').toLowerCase();
  if (['passed', 'failed', 'blocked', 'no-report', 'stale', 'planned'].includes(s)) return s;
  if (['pass', 'success', 'ok', 'green'].includes(s)) return 'passed';
  if (['fail', 'failure', 'red'].includes(s)) return 'failed';
  if (['empty', 'missing', 'unknown', 'none'].includes(s)) return 'no-report';
  return Number(failed) > 0 ? 'failed' : 'passed';
}
function latestRun(runs) {
  const list = Array.isArray(runs) ? runs : Array.isArray(runs?.runs) ? runs.runs : [];
  return list[0] || list.at(-1) || null;
}
function leafSuites(suite, parents = []) {
  const title = suite?.title || suite?.file || '';
  const nextParents = title ? [...parents, title] : parents;
  const specs = (suite?.specs || []).map(spec => ({ spec, parents: nextParents, file: spec.file || suite.file }));
  const children = (suite?.suites || []).flatMap(child => leafSuites(child, nextParents));
  return [...specs, ...children];
}
function normalizePlaywright(json) {
  if (!json) return { stats: null, tests: [], errors: [] };
  const tests = (json.suites || []).flatMap(suite => leafSuites(suite)).map(({ spec, parents, file }) => {
    const test = spec.tests?.[0] || {};
    const result = test.results?.at(-1) || test.results?.[0] || {};
    const status = test.status || result.status || (spec.ok ? 'passed' : 'failed');
    const failed = ['failed', 'timedOut', 'interrupted', 'unexpected'].includes(status) || spec.ok === false;
    const skipped = status === 'skipped';
    const flaky = test.status === 'flaky' || (test.results || []).length > 1 && !failed;
    return {
      id: spec.id,
      title: spec.title,
      journey: parents.filter(Boolean).join(' › '),
      file: spec.file || file,
      line: spec.line,
      projectName: test.projectName,
      status: skipped ? 'skipped' : flaky ? 'flaky' : failed ? 'failed' : 'passed',
      duration: result.duration,
      retry: result.retry,
      error: result.error?.message || result.errors?.[0]?.message,
      attachments: result.attachments || []
    };
  });
  return { stats: json.stats || null, tests, errors: json.errors || [] };
}
function pickStatus(status, summary, run, row, surface, playwright) {
  const pwStats = playwright?.stats || {};
  const source = status || summary || run || row || pwStats || {};
  const failed = asNumber(pwStats.unexpected ?? source.failed ?? source.unexpected ?? source.failures) ?? 0;
  const passed = asNumber(pwStats.expected ?? source.passed ?? source.expected ?? source.successes) ?? undefined;
  const skipped = asNumber(pwStats.skipped ?? source.skipped ?? source.pending) ?? undefined;
  const flaky = asNumber(pwStats.flaky ?? source.flaky ?? source.flakes) ?? undefined;
  const countedTotal = [passed, failed, skipped, flaky].filter(v => v !== undefined).reduce((a, b) => a + b, 0);
  const total = asNumber(source.total ?? source.tests) ?? (countedTotal || undefined);
  return {
    ...surface,
    state: normalizeState(source.status ?? source.state, failed),
    status,
    summary,
    playwright,
    tests: playwright?.tests || summary?.tests || run?.tests || [],
    latestRun: run,
    trendRows: row ? [row] : [],
    passed,
    failed,
    skipped,
    flaky,
    total,
    duration: pwStats.duration ?? source.duration ?? source.durationMs ?? source.elapsedMs,
    ts: source.ts ?? source.timestamp ?? source.updatedAt ?? source.completedAt ?? pwStats.startTime,
    sha: source.sha ?? source.commit,
    runUrl: source.runUrl ?? source.actionsUrl ?? surface.runUrl,
    reportUrl: source.reportUrl ?? source.rawReportUrl ?? surface.reportUrl ?? surface.href,
    lastGoodReportUrl: source.lastGoodReportUrl ?? source.lastKnownGoodReportUrl ?? surface.lastGoodReportUrl,
    note: source.note ?? source.message
  };
}
async function hydrateSurface(surface) {
  if (surface.planned) return { ...surface, state: 'planned', reportUrl: surface.reportUrl ?? surface.href };

  const statusUrl = surface.statusUrl;
  const summaryUrl = surface.summaryUrl || inferSibling(statusUrl, 'summary.json');
  const runsUrl = surface.runsUrl || inferSibling(statusUrl, 'runs.json');
  const trendUrl = surface.trendsUrl || surface.historyUrl || surface.resultsUrl || inferSibling(statusUrl, 'history.csv');
  const playwrightJsonUrl = surface.playwrightJsonUrl || surface.resultsJsonUrl || inferSibling(statusUrl, 'test-results/results.json') || appendPath(surface.href, 'test-results/results.json');

  const [status, summary, runs, trendText, playwrightRaw] = await Promise.all([
    optionalJson(statusUrl),
    optionalJson(summaryUrl),
    optionalJson(runsUrl),
    optionalText(trendUrl),
    optionalJson(playwrightJsonUrl)
  ]);
  const rows = trendText ? trendRows(trendText) : [];
  const row = rows.at(-1) || null;
  const playwright = normalizePlaywright(playwrightRaw);
  const hydrated = pickStatus(status, summary, latestRun(runs), row, surface, playwright);
  hydrated.trendRows = rows.slice(-6);
  hydrated.dataUrls = { statusUrl, summaryUrl, runsUrl, trendUrl, playwrightJsonUrl };

  if (!status && !summary && !runs && !row && !playwrightRaw) return { ...hydrated, state: 'no-report', error: 'No machine-readable E2E data published yet.' };
  return hydrated;
}
const keyOf = (p, s) => `${p.id}/${s.id}`;
const stateLabel = (s) => ({ passed: 'Passed', failed: 'Failed', blocked: 'Blocked', 'no-report': 'No report', stale: 'Stale', planned: 'Planned' }[s] || 'No report');
const fmtDuration = (ms) => { const n = Number(ms || 0); if (!n) return '—'; return n >= 10000 ? `${Math.round(n / 1000)}s` : `${Math.round(n)}ms`; };
const fmtDate = (ts) => ts ? new Date(ts).toLocaleString() : 'not published yet';
function projectState(project) {
  const states = project.surfaces.map(s => s.state);
  return project.planned ? 'planned' : states.includes('failed') ? 'failed' : states.includes('blocked') ? 'blocked' : states.includes('stale') ? 'stale' : states.includes('passed') ? 'passed' : states.every(s => s === 'planned') ? 'planned' : 'no-report';
}
function StatusPill({ state }) {
  return <span className={clsx('status-pill', state)}><span className="status-dot" />{stateLabel(state)}</span>;
}
function MetricCard({ icon: Icon, label, value, tone }) {
  return <div className={clsx('metric-card', tone)}><Icon size={17} /><div><span>{label}</span><strong>{value}</strong></div></div>;
}
function SurfaceButton({ surface, active, onClick }) {
  return <button className={clsx('surface-button', active && 'active')} onClick={onClick}>
    <div className="surface-main"><span>{surface.name}</span><StatusPill state={surface.state} /></div>
    <div className="surface-meta"><span>P {surface.passed ?? '—'}</span><span>F {surface.failed ?? '—'}</span><span>{fmtDuration(surface.duration)}</span></div>
  </button>;
}
function App() {
  const [projects, setProjects] = useState([]);
  const [selectedKey, setSelectedKey] = useState(location.hash.replace(/^#/, ''));
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchJson(registryUrl)
      .then(async registry => {
        const hydrated = await Promise.all(registry.projects.map(async p => ({ ...p, surfaces: await Promise.all(p.surfaces.map(hydrateSurface)) })));
        setProjects(hydrated);
        if (!selectedKey && hydrated[0]?.surfaces[0]) {
          const first = keyOf(hydrated[0], hydrated[0].surfaces[0]);
          setSelectedKey(first); history.replaceState(null, '', `#${first}`);
        }
      })
      .catch(e => setError(e.message || String(e)));
  }, []);
  useEffect(() => {
    const fn = () => setSelectedKey(location.hash.replace(/^#/, ''));
    addEventListener('hashchange', fn); return () => removeEventListener('hashchange', fn);
  }, []);

  const surfaces = projects.flatMap(p => p.surfaces.map(s => ({ project: p, surface: s })));
  const live = surfaces.filter(({ surface }) => ['passed', 'failed', 'blocked', 'stale'].includes(surface.state));
  const failing = live.filter(({ surface }) => surface.state === 'failed').length;
  const planned = surfaces.filter(({ surface }) => surface.state === 'planned').length;
  const noReport = surfaces.filter(({ surface }) => surface.state === 'no-report').length;
  const testCount = surfaces.reduce((n, { surface }) => n + (surface.tests?.length || 0), 0);
  const selected = surfaces.find(({ project, surface }) => keyOf(project, surface) === selectedKey) || surfaces[0];
  const visibleProjects = projects.filter(p => `${p.name} ${p.repo}`.toLowerCase().includes(filter.toLowerCase()));

  function select(project, surface) {
    const key = keyOf(project, surface);
    setSelectedKey(key); history.replaceState(null, '', `#${key}`);
  }

  return <main className="console-shell">
    <aside className="sidebar">
      <div className="brand-row"><div className="brand-mark"><Boxes size={20} /></div><div><span>Empire</span><strong>Operations</strong></div></div>
      <nav className="module-stack">
        <button className="active"><LayoutDashboard size={16}/> E2E Module</button>
        <button disabled><RadioTower size={16}/> Deploy Radar</button>
        <button disabled><ShieldCheck size={16}/> Incidents</button>
        <button disabled><Gauge size={16}/> Cost Telemetry</button>
      </nav>
      <div className="ops-card">
        <div className="ops-card-head"><Activity size={16}/><span>Fleet Signal</span></div>
        <strong>{live.length ? `${live.length - failing}/${live.length}` : '—'}</strong>
        <p>{surfaces.length || '—'} surfaces registered · {planned} planned · {noReport} no report</p>
      </div>
      <div className="sidebar-links"><a href="docs/e2e-publisher-contract.md">Publisher contract</a><a href="docs/e2e-roadmap.md">E2E roadmap</a></div>
    </aside>

    <section className="main-plane">
      <header className="command-bar">
        <div><div className="kicker"><Zap size={14}/> Empire Dashboard / E2E</div><h1>JSON-fed test operations console</h1></div>
        <div className="search-box"><Search size={16}/><input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search projects…" /></div>
      </header>

      <section className="metrics-grid">
        <MetricCard icon={CircleDot} label="Data surfaces" value={live.length || '—'} />
        <MetricCard icon={AlertTriangle} label="Failed" value={failing} tone={failing ? 'danger' : 'good'} />
        <MetricCard icon={Workflow} label="Test flows" value={testCount || '—'} />
        <MetricCard icon={GitBranch} label="Mode" value="Playwright JSON" />
      </section>

      <section className="work-grid">
        <div className="project-list">
          {error && <div className="empty">Registry offline: {error}</div>}
          {visibleProjects.map(project => <article className="project-group" key={project.id}>
            <div className="project-title"><div><h2>{project.name}</h2><span>{project.repo || 'external publisher'}</span></div><StatusPill state={projectState(project)} /></div>
            <div className="surface-list">{project.surfaces.map(surface => <SurfaceButton key={surface.id} surface={surface} active={selectedKey === keyOf(project, surface)} onClick={() => select(project, surface)} />)}</div>
          </article>)}
        </div>

        <div className="report-panel">
          {selected ? <ReportView project={selected.project} surface={selected.surface} /> : <div className="empty big">Select a surface</div>}
        </div>
      </section>
    </section>
  </main>;
}
function DetailCard({ label, value, href }) {
  return <div className="detail-card"><span>{label}</span>{href && value !== '—' ? <a href={href} target="_blank" rel="noreferrer">{value}<ExternalLink size={13}/></a> : <strong>{value ?? '—'}</strong>}</div>;
}
function ReportView({ project, surface }) {
  const rawReportUrl = surface.reportUrl || surface.href;
  const rows = surface.trendRows || [];
  const tests = surface.tests || [];
  const hasOfficialReport = rawReportUrl && surface.state !== 'planned';
  return <>
    <div className="report-head">
      <div><div className="kicker">{project.name}</div><h2>{surface.name}</h2><div className="report-stats"><StatusPill state={surface.state}/><span>{fmtDate(surface.ts)}</span><span>{tests.length ? `${tests.length} specs indexed` : 'official Playwright report'}</span>{surface.note && <span>{surface.note}</span>}</div></div>
      <div className="report-actions">{rawReportUrl && <a href={rawReportUrl} target="_blank" rel="noreferrer">Open official report <ExternalLink size={13}/></a>}{project.actionsHref && <a href={project.actionsHref} target="_blank" rel="noreferrer">Actions <ExternalLink size={13}/></a>}</div>
    </div>
    <div className="report-frame-shell">
      <aside className="report-summary">
        <DetailCard label="Status" value={stateLabel(surface.state)} />
        <DetailCard label="Passed" value={surface.passed ?? '—'} />
        <DetailCard label="Failed" value={surface.failed ?? '—'} />
        <DetailCard label="Skipped / flaky" value={`${surface.skipped ?? '—'} / ${surface.flaky ?? '—'}`} />
        <DetailCard label="Total" value={surface.total ?? '—'} />
        <DetailCard label="Duration" value={fmtDuration(surface.duration)} />
        <DetailCard label="Timestamp" value={fmtDate(surface.ts)} />
        <DetailCard label="Run" value={surface.runUrl ? 'Open run' : '—'} href={surface.runUrl} />
        <DetailCard label="Last good" value={surface.lastGoodReportUrl ? 'Open last known good' : '—'} href={surface.lastGoodReportUrl} />
        {rows.length > 0 && <div className="mini-trends"><div className="table-title"><Clock3 size={14}/> Recent runs</div>{rows.slice(-4).map((row, i) => <div className="mini-row" key={i}><span>{row.timestamp || row.ts || '—'}</span><strong>{row.failed || 0} failed</strong></div>)}</div>}
      </aside>
      <section className="official-report-panel">
        {hasOfficialReport ? <iframe title={`${project.name} ${surface.name} Playwright report`} src={rawReportUrl} /> : <div className="provisioned"><h3>Official Playwright report not published yet</h3><p>This surface is registered. Publish the Playwright HTML report and JSON output from the project repo.</p><pre>{surface.href}</pre></div>}
      </section>
    </div>
  </>;
}

createRoot(document.getElementById('root')).render(<App />);
