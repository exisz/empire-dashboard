import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, Boxes, Clock3, ExternalLink, Gauge, LayoutDashboard, RadioTower, Search, ShieldCheck, Zap } from 'lucide-react';
import clsx from 'clsx';
import './styles.css';

const registryUrl = `${import.meta.env.BASE_URL}modules/e2e/projects.json`;

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
function normalizeState(value, failed = 0, flaky = 0) {
  const s = String(value || '').toLowerCase();
  if (['failed', 'fail', 'failure', 'red'].includes(s) || Number(failed) > 0) return 'failed';
  if (['flaky', 'flake', 'flakes', 'yellow'].includes(s) || Number(flaky) > 0) return 'flaky';
  if (['blocked', 'no-report', 'stale', 'planned'].includes(s)) return s;
  if (['empty', 'missing', 'unknown', 'none'].includes(s)) return 'no-report';
  if (['passed', 'pass', 'success', 'ok', 'green'].includes(s)) return 'passed';
  return 'passed';
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
  const flaky = asNumber(pwStats.flaky ?? source.flaky ?? source.flakes) ?? 0;
  const countedTotal = [passed, failed, skipped, flaky].filter(v => v !== undefined).reduce((a, b) => a + b, 0);
  const total = asNumber(source.total ?? source.tests) ?? (countedTotal || undefined);
  return {
    ...surface,
    state: normalizeState(source.status ?? source.state, failed, flaky),
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
const stateLabel = (s) => ({ passed: 'Passed', failed: 'Failed', flaky: 'Flaky', blocked: 'Blocked', 'no-report': 'No report', stale: 'Stale', planned: 'Planned' }[s] || 'No report');
const fmtDuration = (ms) => { const n = Number(ms || 0); if (!n) return '—'; return n >= 10000 ? `${Math.round(n / 1000)}s` : `${Math.round(n)}ms`; };
const fmtDate = (ts) => ts ? new Date(ts).toLocaleString() : 'not published yet';
function projectState(project) {
  const states = project.surfaces.map(s => s.state);
  return project.planned ? 'planned' : states.includes('failed') ? 'failed' : states.includes('flaky') ? 'flaky' : states.includes('blocked') ? 'blocked' : states.includes('stale') ? 'stale' : states.includes('passed') ? 'passed' : states.every(s => s === 'planned') ? 'planned' : 'no-report';
}
function StatusPill({ state }) {
  return <span className={clsx('status-pill', state)}><span className="status-dot" />{stateLabel(state)}</span>;
}
function SurfaceButton({ surface, active, onClick }) {
  return <button className={clsx('surface-button', active && 'active')} onClick={onClick}>
    <div className="surface-main"><span>{surface.name}</span><StatusPill state={surface.state} /></div>
    <div className="surface-meta"><span>{surface.passed ?? '—'} ok</span><span>{surface.failed ?? 0} fail</span><span>{surface.flaky ?? 0} flaky</span></div>
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

  function updateSurfaceStats(projectId, surfaceId, stats) {
    setProjects(current => current.map(project => project.id !== projectId ? project : {
      ...project,
      surfaces: project.surfaces.map(surface => surface.id !== surfaceId ? surface : {
        ...surface,
        ...stats,
        state: normalizeState(stats.state ?? surface.state, stats.failed ?? surface.failed, stats.flaky ?? surface.flaky)
      })
    }));
  }

  return <main className="console-shell">
    <section className="main-plane">
      <header className="empire-topbar">
        <div className="brand-row"><div className="brand-mark"><Boxes size={20} /></div><div><span>Empire</span><strong>Operations</strong></div></div>
        <nav className="module-stack">
          <button className="active"><LayoutDashboard size={16}/> E2E Module</button>
          <button disabled><RadioTower size={16}/> Deploy Radar</button>
          <button disabled><ShieldCheck size={16}/> Incidents</button>
          <button disabled><Gauge size={16}/> Cost Telemetry</button>
        </nav>
        <div className="topbar-links"><a href="docs/e2e-publisher-contract.md">Contract</a><a href="docs/e2e-roadmap.md">Roadmap</a></div>
      </header>
      <header className="command-bar">
        <div><div className="kicker"><Zap size={14}/> E2E</div><h1>Report console</h1></div>
        <div className="topbar-status"><div className="ops-card"><div className="ops-card-head"><Activity size={16}/><span>Fleet</span></div><strong>{live.length ? `${live.length - failing}/${live.length}` : '—'}</strong><p>{surfaces.length || '—'} surfaces · {testCount || 0} tests</p></div><div className="search-box"><Search size={16}/><input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search…" /></div></div>
      </header>

      <section className="work-grid">
        <div className="project-list">
          {error && <div className="empty">Registry offline: {error}</div>}
          {visibleProjects.map(project => <article className="project-group" key={project.id}>
            <div className="project-title"><div><h2>{project.name}</h2><span>{project.surfaces.length} surface{project.surfaces.length === 1 ? '' : 's'} · {project.repo || 'external'}</span></div><StatusPill state={projectState(project)} /></div>
            <div className="surface-list">{project.surfaces.map(surface => <SurfaceButton key={surface.id} surface={surface} active={selectedKey === keyOf(project, surface)} onClick={() => select(project, surface)} />)}</div>
          </article>)}
        </div>

        <div className="report-panel">
          {selected ? <ReportView project={selected.project} surface={selected.surface} onReportStats={updateSurfaceStats} /> : <div className="empty big">Select a surface</div>}
        </div>
      </section>
    </section>
  </main>;
}

function parseReportStats(json) {
  const stats = json?.stats;
  if (!stats) return null;
  return {
    total: Number(stats.total ?? 0) - Number(stats.skipped ?? 0),
    passed: Number(stats.expected ?? 0),
    failed: Number(stats.unexpected ?? 0),
    flaky: Number(stats.flaky ?? 0),
    skipped: Number(stats.skipped ?? 0),
    duration: stats.duration
  };
}
function flattenReportTests(json) {
  return (json?.files || []).flatMap(file => (file.tests || []).map(test => ({
    id: test.testId || `${file.fileName}:${test.line || ''}:${test.title}`,
    title: test.title,
    journey: (test.path || []).join(' › '),
    file: file.fileName,
    line: test.location?.line || test.line,
    projectName: test.projectName,
    status: test.outcome === 'unexpected' ? 'failed' : test.outcome === 'expected' ? 'passed' : test.outcome || 'unknown',
    duration: test.duration
  })));
}
function parseReportBundle(json) {
  if (!json) return null;
  return { stats: parseReportStats(json), tests: flattenReportTests(json), startTime: json.startTime, duration: json.duration };
}

const zipTextDecoder = new TextDecoder();
const u16 = (bytes, offset) => bytes[offset] | (bytes[offset + 1] << 8);
const u32 = (bytes, offset) => (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
function base64Bytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
async function inflateZipEntry(data, method) {
  if (method === 0) return data;
  if (method !== 8 || typeof DecompressionStream === 'undefined') return null;
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function readZipTextEntry(zipBytes, entryName) {
  let eocd = -1;
  for (let i = zipBytes.length - 22; i >= 0; i -= 1) {
    if (u32(zipBytes, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const entries = u16(zipBytes, eocd + 10);
  let cursor = u32(zipBytes, eocd + 16);
  for (let i = 0; i < entries; i += 1) {
    if (u32(zipBytes, cursor) !== 0x02014b50) return null;
    const method = u16(zipBytes, cursor + 10);
    const compressedSize = u32(zipBytes, cursor + 20);
    const nameLength = u16(zipBytes, cursor + 28);
    const extraLength = u16(zipBytes, cursor + 30);
    const commentLength = u16(zipBytes, cursor + 32);
    const localOffset = u32(zipBytes, cursor + 42);
    const name = zipTextDecoder.decode(zipBytes.slice(cursor + 46, cursor + 46 + nameLength));
    if (name === entryName) {
      const localNameLength = u16(zipBytes, localOffset + 26);
      const localExtraLength = u16(zipBytes, localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = zipBytes.slice(dataStart, dataStart + compressedSize);
      const inflated = await inflateZipEntry(compressed, method);
      return inflated ? zipTextDecoder.decode(inflated) : null;
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}
async function readReportBundleFromHtml(html) {
  const match = html.match(/id=["']playwrightReportBase64["'][^>]*>data:application\/zip;base64,([^<]+)/);
  if (!match) return null;
  const reportText = await readZipTextEntry(base64Bytes(match[1].trim()), 'report.json');
  return reportText ? parseReportBundle(JSON.parse(reportText)) : null;
}
function readReportStats(doc) {
  const text = doc?.body?.innerText || '';
  const pick = (label) => {
    const match = text.match(new RegExp(`${label}\\s*(\\d+)`, 'i'));
    return match ? Number(match[1]) : undefined;
  };
  const total = pick('All');
  const passed = pick('Passed');
  const failed = pick('Failed');
  const flaky = pick('Flaky');
  const skipped = pick('Skipped');
  if ([total, passed, failed, flaky, skipped].every(v => v === undefined)) return null;
  return { total, passed, failed: failed ?? 0, flaky: flaky ?? 0, skipped: skipped ?? 0 };
}

function ReportBundleView({ reportUrl, onStats }) {
  const [bundle, setBundle] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setBundle(null);
    setError('');
    fetch(reportUrl, { cache: 'no-store' })
      .then(r => r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(html => readReportBundleFromHtml(html))
      .then(next => {
        if (cancelled) return;
        if (!next) throw new Error('No embedded Playwright report bundle found');
        setBundle(next);
        if (next.stats) onStats?.({ ...next.stats, tests: next.tests, ts: next.startTime, duration: next.duration ?? next.stats.duration });
      })
      .catch(error => { if (!cancelled) setError(error.message || String(error)); });
    return () => { cancelled = true; };
  }, [reportUrl]);

  if (error) return <div className="report-native-view empty">Report bundle unavailable: {error}</div>;
  if (!bundle) return <div className="report-native-view empty">Loading Playwright report…</div>;

  const tests = bundle.tests || [];
  const ordered = [...tests].sort((a, b) => {
    const rank = { failed: 0, flaky: 1, skipped: 2, passed: 3 };
    return (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || (b.duration || 0) - (a.duration || 0);
  });
  return <div className="report-native-view">
    <div className="native-summary">
      <span><strong>{bundle.stats?.passed ?? 0}</strong> passed</span>
      <span><strong>{bundle.stats?.failed ?? 0}</strong> failed</span>
      <span><strong>{bundle.stats?.flaky ?? 0}</strong> flaky</span>
      <span><strong>{bundle.stats?.skipped ?? 0}</strong> skipped</span>
    </div>
    <div className="native-test-list">
      {ordered.map(test => <div className={clsx('native-test-row', test.status)} key={test.id}>
        <span className="native-status">{test.status}</span>
        <div className="native-test-main"><strong>{test.title}</strong><span>{test.journey || test.file}{test.line ? ` · ${test.file}:${test.line}` : ''}</span></div>
        <span className="native-duration">{fmtDuration(test.duration)}</span>
      </div>)}
    </div>
  </div>;
}

function DetailCard({ label, value, href }) {
  return <div className="detail-card"><span>{label}</span>{href && value !== '—' ? <a href={href} target="_blank" rel="noreferrer">{value}<ExternalLink size={13}/></a> : <strong>{value ?? '—'}</strong>}</div>;
}
function ReportView({ project, surface, onReportStats }) {
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
        {hasOfficialReport ? <ReportBundleView reportUrl={rawReportUrl} onStats={stats => onReportStats?.(project.id, surface.id, stats)} /> : <div className="provisioned"><h3>Official Playwright report not published yet</h3><p>This surface is registered. Publish the Playwright HTML report and JSON output from the project repo.</p><pre>{surface.href}</pre></div>}
      </section>
    </div>
  </>;
}

createRoot(document.getElementById('root')).render(<App />);
