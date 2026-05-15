import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, Boxes, Clock3, ExternalLink, Gauge, LayoutDashboard, RadioTower, Search, ShieldCheck, Zap } from 'lucide-react';
import clsx from 'clsx';
import { fleetSummary, fmtDate, fmtDuration, hydrateRegistry, keyOf, normalizeState, projectState, readReportBundleFromHtml, stateLabel } from './core/e2e.js';
import './styles.css';

const registryUrl = `${import.meta.env.BASE_URL}modules/e2e/projects.json`;

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
    fetch(registryUrl, { cache: 'no-store' })
      .then(response => response.json())
      .then(hydrateRegistry)
      .then(registry => {
        setProjects(registry.projects);
        if (!selectedKey && registry.projects[0]?.surfaces[0]) {
          const first = keyOf(registry.projects[0], registry.projects[0].surfaces[0]);
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
  const summary = fleetSummary(projects);
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
        <div className="brand-row"><div className="brand-mark"><Boxes size={20} /></div><div><span>Fleetdeck</span><strong>E2E Operations</strong></div></div>
        <nav className="module-stack">
          <button className="active"><LayoutDashboard size={16}/> E2E Module</button>
          <button disabled><RadioTower size={16}/> Deploy Radar</button>
          <button disabled><ShieldCheck size={16}/> Incidents</button>
          <button disabled><Gauge size={16}/> Cost Telemetry</button>
        </nav>
        <div className="topbar-links"><a href="docs/e2e-publisher-contract.md">Contract</a><a href="docs/e2e-roadmap.md">Roadmap</a></div>
      </header>
      <header className="command-bar">
        <div><div className="kicker"><Zap size={14}/> E2E</div><h1>Fleetdeck console</h1></div>
        <div className="topbar-status"><div className="ops-card"><div className="ops-card-head"><Activity size={16}/><span>Fleet</span></div><strong>{summary.live ? `${summary.healthy}/${summary.live}` : '—'}</strong><p>{summary.surfaces || '—'} surfaces · {summary.tests || 0} tests</p></div><div className="search-box"><Search size={16}/><input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search…" /></div></div>
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

function PlaywrightReportFrame({ reportUrl, title, onStats }) {
  useEffect(() => {
    let cancelled = false;
    fetch(reportUrl, { cache: 'no-store' })
      .then(r => r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(html => readReportBundleFromHtml(html))
      .then(bundle => {
        if (cancelled || !bundle?.stats) return;
        onStats?.({ ...bundle.stats, tests: bundle.tests, ts: bundle.startTime, duration: bundle.duration ?? bundle.stats.duration });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [reportUrl]);

  function handleLoad(event) {
    event.currentTarget.dataset.loaded = 'true';
  }

  const frameUrl = `${import.meta.env.BASE_URL}report-proxy.html?report=${encodeURIComponent(reportUrl)}`;
  return <iframe className="playwright-report-frame" title={title} src={frameUrl} onLoad={handleLoad} />;
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
        {hasOfficialReport ? <PlaywrightReportFrame title={`${project.name} ${surface.name} Playwright report`} reportUrl={rawReportUrl} onStats={stats => onReportStats?.(project.id, surface.id, stats)} /> : <div className="provisioned"><h3>Official Playwright report not published yet</h3><p>This surface is registered. Publish the Playwright HTML report and JSON output from the project repo.</p><pre>{surface.href}</pre></div>}
      </section>
    </div>
  </>;
}

createRoot(document.getElementById('root')).render(<App />);
