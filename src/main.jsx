import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, AlertTriangle, Boxes, CircleDot, ExternalLink, Gauge, GitBranch, LayoutDashboard, RadioTower, Search, ShieldCheck, Workflow, Zap } from 'lucide-react';
import clsx from 'clsx';
import './styles.css';

const registryUrl = `${import.meta.env.BASE_URL}modules/e2e/projects.json`;

function csvLast(text) {
  const rows = text.trim().split(/\r?\n/).filter(Boolean);
  if (rows.length < 2) return null;
  const cols = rows[0].split(',');
  const vals = rows.at(-1).split(',');
  return Object.fromEntries(cols.map((c, i) => [c, vals[i] ?? '']));
}
async function fetchJson(url) { return (await fetch(url, { cache: 'no-store' })).json(); }
async function fetchText(url) { return (await fetch(url, { cache: 'no-store' })).text(); }
async function detectReportState(surface, hydrated) {
  try {
    const html = await fetchText(surface.href);
    if (/No Playwright report|No report available|Placeholder/i.test(html)) {
      return { ...hydrated, state: 'empty', reportEmpty: true };
    }
  } catch {}
  return hydrated;
}
async function hydrateSurface(surface) {
  if (surface.planned) return { ...surface, state: 'planned' };
  try {
    if (surface.statusUrl) {
      const status = await fetchJson(surface.statusUrl);
      const failed = Number(status.failed ?? status.unexpected ?? 0);
      const passed = Number(status.passed ?? status.expected ?? 0);
      return detectReportState(surface, { ...surface, state: failed > 0 ? 'fail' : 'pass', status, passed, failed, duration: status.duration, ts: status.ts });
    }
    if (surface.resultsUrl) {
      const row = csvLast(await fetchText(surface.resultsUrl));
      if (row) {
        const failed = Number(row.failed ?? 0), passed = Number(row.passed ?? 0);
        return detectReportState(surface, { ...surface, state: failed > 0 ? 'fail' : 'pass', passed, failed, duration: row.duration, ts: row.timestamp });
      }
    }
    return detectReportState(surface, { ...surface, state: 'unknown' });
  } catch (error) {
    return { ...surface, state: 'unknown', error: String(error.message || error) };
  }
}
const keyOf = (p, s) => `${p.id}/${s.id}`;
const stateLabel = (s) => s === 'pass' ? 'Operational' : s === 'fail' ? 'Failing' : s === 'empty' ? 'No Report' : s === 'planned' ? 'Provisioned' : 'Unknown';
const fmtDuration = (ms) => { const n = Number(ms || 0); if (!n) return '—'; return n > 10000 ? `${Math.round(n / 1000)}s` : `${n}ms`; };
function projectState(project) {
  const states = project.surfaces.map(s => s.state);
  return project.planned ? 'planned' : states.includes('fail') ? 'fail' : states.includes('pass') ? 'pass' : 'unknown';
}
function StatusPill({ state }) {
  return <span className={clsx('status-pill', state)}><span className="status-dot" />{stateLabel(state)}</span>;
}
function MetricCard({ icon: Icon, label, value, tone }) {
  return <div className={clsx('metric-card', tone)}><Icon size={17} /><div><span>{label}</span><strong>{value}</strong></div></div>;
}
function SurfaceButton({ project, surface, active, onClick }) {
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
  const live = surfaces.filter(({ surface }) => ['pass', 'fail'].includes(surface.state));
  const failing = live.filter(({ surface }) => surface.state === 'fail').length;
  const planned = surfaces.filter(({ surface }) => surface.state === 'planned').length;
  const empty = surfaces.filter(({ surface }) => surface.state === 'empty').length;
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
        <p>{surfaces.length || '—'} surfaces registered · {planned} provisioned · {empty} no report</p>
      </div>
      <div className="sidebar-links"><a href="docs/e2e-publisher-contract.md">Publisher contract</a><a href="docs/e2e-roadmap.md">E2E roadmap</a></div>
    </aside>

    <section className="main-plane">
      <header className="command-bar">
        <div><div className="kicker"><Zap size={14}/> Empire Dashboard / E2E</div><h1>Unified test operations console</h1></div>
        <div className="search-box"><Search size={16}/><input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search projects…" /></div>
      </header>

      <section className="metrics-grid">
        <MetricCard icon={CircleDot} label="Live surfaces" value={live.length || '—'} />
        <MetricCard icon={AlertTriangle} label="Failing" value={failing} tone={failing ? 'danger' : 'good'} />
        <MetricCard icon={Workflow} label="No report" value={empty} tone={empty ? 'warn' : ''} />
        <MetricCard icon={GitBranch} label="Mode" value="Composed SPA" />
      </section>

      <section className="work-grid">
        <div className="project-list">
          {error && <div className="empty">Registry offline: {error}</div>}
          {visibleProjects.map(project => <article className="project-group" key={project.id}>
            <div className="project-title"><div><h2>{project.name}</h2><span>{project.repo || 'external publisher'}</span></div><StatusPill state={projectState(project)} /></div>
            <div className="surface-list">{project.surfaces.map(surface => <SurfaceButton key={surface.id} project={project} surface={surface} active={selectedKey === keyOf(project, surface)} onClick={() => select(project, surface)} />)}</div>
          </article>)}
        </div>

        <div className="report-panel">
          {selected ? <ReportView project={selected.project} surface={selected.surface} /> : <div className="empty big">Select a surface</div>}
        </div>
      </section>
    </section>
  </main>;
}
function ReportView({ project, surface }) {
  const planned = surface.state === 'planned';
  return <>
    <div className="report-head">
      <div><div className="kicker">{project.name}</div><h2>{surface.name}</h2><div className="report-stats"><StatusPill state={surface.state}/><span>pass {surface.passed ?? '—'}</span><span>fail {surface.failed ?? '—'}</span><span>{fmtDuration(surface.duration)}</span><span>{surface.ts ? new Date(surface.ts).toLocaleString() : 'not published yet'}</span></div></div>
      <div className="report-actions"><a href={surface.href} target="_blank" rel="noreferrer">Raw report <ExternalLink size={13}/></a>{project.actionsHref && <a href={project.actionsHref} target="_blank" rel="noreferrer">Actions <ExternalLink size={13}/></a>}</div>
    </div>
    <div className="report-body">
      {planned ? <div className="provisioned"><h3>Surface provisioned</h3><p>This slot already exists in the Empire SPA. The project publisher should drop <code>index.html</code>, <code>status.json</code>, and <code>results.csv</code> to this destination.</p><pre>{surface.href}</pre></div> : <iframe title={`${project.name} ${surface.name}`} src={surface.href} />}
    </div>
  </>;
}

createRoot(document.getElementById('root')).render(<App />);
