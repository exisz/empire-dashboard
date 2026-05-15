export const DEFAULT_UI_BASE = 'https://projects.rollersoft.com.au/';

export function keyOf(project, surface) { return `${project.id}/${surface.id}`; }
export function surfaceUiUrl(project, surface, uiBase = DEFAULT_UI_BASE) { return `${uiBase.replace(/#.*$/, '').replace(/\/?$/, '/') }#${keyOf(project, surface)}`; }
export function stateLabel(state) { return ({ passed: 'Passed', failed: 'Failed', flaky: 'Flaky', blocked: 'Blocked', 'no-report': 'No report', stale: 'Stale', planned: 'Planned' }[state] || 'No report'); }
export function fmtDuration(ms) { const n = Number(ms || 0); if (!n) return '—'; return n >= 10000 ? `${Math.round(n / 1000)}s` : `${Math.round(n)}ms`; }
export function fmtDate(ts) { return ts ? new Date(ts).toLocaleString() : 'not published yet'; }

export function normalizeState(value, failed = 0, flaky = 0) {
  const state = String(value || '').toLowerCase();
  if (['failed', 'fail', 'failure', 'red'].includes(state) || Number(failed) > 0) return 'failed';
  if (['flaky', 'flake', 'flakes', 'yellow'].includes(state) || Number(flaky) > 0) return 'flaky';
  if (['blocked', 'no-report', 'stale', 'planned'].includes(state)) return state;
  if (['empty', 'missing', 'unknown', 'none'].includes(state)) return 'no-report';
  if (['passed', 'pass', 'success', 'ok', 'green'].includes(state)) return 'passed';
  return 'passed';
}

export function projectState(project) {
  const states = project.surfaces.map(surface => surface.state);
  return project.planned ? 'planned'
    : states.includes('failed') ? 'failed'
    : states.includes('flaky') ? 'flaky'
    : states.includes('blocked') ? 'blocked'
    : states.includes('stale') ? 'stale'
    : states.includes('passed') ? 'passed'
    : states.every(state => state === 'planned') ? 'planned'
    : 'no-report';
}

export function fleetSummary(projects) {
  const surfaces = projects.flatMap(project => project.surfaces.map(surface => ({ project, surface })));
  const live = surfaces.filter(({ surface }) => ['passed', 'failed', 'flaky', 'blocked', 'stale'].includes(surface.state));
  const failed = live.filter(({ surface }) => surface.state === 'failed').length;
  const flaky = live.filter(({ surface }) => surface.state === 'flaky').length;
  const planned = surfaces.filter(({ surface }) => surface.state === 'planned').length;
  const noReport = surfaces.filter(({ surface }) => surface.state === 'no-report').length;
  const tests = surfaces.reduce((sum, { surface }) => sum + (surface.total || surface.tests?.length || 0), 0);
  return { surfaces: surfaces.length, live: live.length, failed, flaky, planned, noReport, tests, healthy: live.length - failed - flaky };
}

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
  const columns = rows[0].split(',').map(column => column.trim());
  return rows.slice(1).map(row => Object.fromEntries(row.split(',').map((value, index) => [columns[index], value ?? ''])));
}

async function fetchJson(url) { const response = await fetch(url, { cache: 'no-store' }); if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`); return response.json(); }
async function fetchText(url) { const response = await fetch(url, { cache: 'no-store' }); if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`); return response.text(); }
async function optionalJson(url) { if (!url) return null; try { return await fetchJson(url); } catch { return null; } }
async function optionalText(url) { if (!url) return null; try { return await fetchText(url); } catch { return null; } }
function asNumber(value) { const n = Number(value); return Number.isFinite(n) ? n : undefined; }
function inferSibling(url, file) { return url?.replace(/[^/]+$/, file); }
function appendPath(url, path) { return url ? `${url.replace(/\/?$/, '/')}${path}` : undefined; }
function latestRun(runs) { const list = Array.isArray(runs) ? runs : Array.isArray(runs?.runs) ? runs.runs : []; return list[0] || list.at(-1) || null; }

function leafSuites(suite, parents = []) {
  const title = suite?.title || suite?.file || '';
  const nextParents = title ? [...parents, title] : parents;
  const specs = (suite?.specs || []).map(spec => ({ spec, parents: nextParents, file: spec.file || suite.file }));
  const children = (suite?.suites || []).flatMap(child => leafSuites(child, nextParents));
  return [...specs, ...children];
}

export function normalizePlaywrightJson(json) {
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

export function parseReportStats(json) {
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

export function flattenReportTests(json) {
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

export function parseReportBundle(json) {
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
export async function readZipTextEntry(zipBytes, entryName) {
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

export async function readReportBundleFromHtml(html) {
  const match = html.match(/id=["']playwrightReportBase64["'][^>]*>data:application\/zip;base64,([^<]+)/);
  if (!match) return null;
  const reportText = await readZipTextEntry(base64Bytes(match[1].trim()), 'report.json');
  return reportText ? parseReportBundle(JSON.parse(reportText)) : null;
}

async function optionalReportBundle(reportUrl) {
  if (!reportUrl) return null;
  try { return await readReportBundleFromHtml(await fetchText(reportUrl)); } catch { return null; }
}

export function pickStatus(status, summary, run, row, surface, playwright, reportBundle) {
  const pwStats = playwright?.stats || {};
  const bundleStats = reportBundle?.stats || {};
  const source = status || summary || run || row || pwStats || bundleStats || {};
  const failed = asNumber(bundleStats.failed ?? pwStats.unexpected ?? source.failed ?? source.unexpected ?? source.failures) ?? 0;
  const passed = asNumber(bundleStats.passed ?? pwStats.expected ?? source.passed ?? source.expected ?? source.successes) ?? undefined;
  const skipped = asNumber(bundleStats.skipped ?? pwStats.skipped ?? source.skipped ?? source.pending) ?? undefined;
  const flaky = asNumber(bundleStats.flaky ?? pwStats.flaky ?? source.flaky ?? source.flakes) ?? 0;
  const countedTotal = [passed, failed, skipped, flaky].filter(value => value !== undefined).reduce((a, b) => a + b, 0);
  const total = asNumber(bundleStats.total ?? source.total ?? source.tests) ?? (countedTotal || undefined);
  return {
    ...surface,
    state: normalizeState(source.status ?? source.state, failed, flaky),
    status,
    summary,
    playwright,
    reportBundle,
    tests: reportBundle?.tests || playwright?.tests || summary?.tests || run?.tests || [],
    latestRun: run,
    trendRows: row ? [row] : [],
    passed,
    failed,
    skipped,
    flaky,
    total,
    duration: reportBundle?.duration ?? bundleStats.duration ?? pwStats.duration ?? source.duration ?? source.durationMs ?? source.elapsedMs,
    ts: reportBundle?.startTime ?? source.ts ?? source.timestamp ?? source.updatedAt ?? source.completedAt ?? pwStats.startTime,
    sha: source.sha ?? source.commit,
    runUrl: source.runUrl ?? source.actionsUrl ?? surface.runUrl,
    reportUrl: source.reportUrl ?? source.rawReportUrl ?? surface.reportUrl ?? surface.href,
    lastGoodReportUrl: source.lastGoodReportUrl ?? source.lastKnownGoodReportUrl ?? surface.lastGoodReportUrl,
    note: source.note ?? source.message
  };
}

export async function hydrateSurface(surface) {
  if (surface.planned) return { ...surface, state: 'planned', reportUrl: surface.reportUrl ?? surface.href };
  const statusUrl = surface.statusUrl;
  const summaryUrl = surface.summaryUrl || inferSibling(statusUrl, 'summary.json');
  const runsUrl = surface.runsUrl || inferSibling(statusUrl, 'runs.json');
  const trendUrl = surface.trendsUrl || surface.historyUrl || surface.resultsUrl || inferSibling(statusUrl, 'history.csv');
  const playwrightJsonUrl = surface.playwrightJsonUrl || surface.resultsJsonUrl || inferSibling(statusUrl, 'test-results/results.json') || appendPath(surface.href, 'test-results/results.json');
  const reportUrl = surface.reportUrl || surface.href;

  const [status, summary, runs, trendText, playwrightRaw, reportBundle] = await Promise.all([
    optionalJson(statusUrl),
    optionalJson(summaryUrl),
    optionalJson(runsUrl),
    optionalText(trendUrl),
    optionalJson(playwrightJsonUrl),
    optionalReportBundle(reportUrl)
  ]);
  const rows = trendText ? trendRows(trendText) : [];
  const row = rows.at(-1) || null;
  const playwright = normalizePlaywrightJson(playwrightRaw);
  const hydrated = pickStatus(status, summary, latestRun(runs), row, surface, playwright, reportBundle);
  hydrated.trendRows = rows.slice(-6);
  hydrated.dataUrls = { statusUrl, summaryUrl, runsUrl, trendUrl, playwrightJsonUrl };
  if (!status && !summary && !runs && !row && !playwrightRaw && !reportBundle) return { ...hydrated, state: 'no-report', error: 'No machine-readable E2E data published yet.' };
  return hydrated;
}

export async function hydrateRegistry(registry, options = {}) {
  const projects = await Promise.all((registry.projects || []).map(async project => ({
    ...project,
    surfaces: await Promise.all((project.surfaces || []).map(hydrateSurface))
  })));
  return { ...registry, projects, generatedAt: options.generatedAt || new Date().toISOString() };
}

export function surfaceRows(projects, uiBase = DEFAULT_UI_BASE) {
  return projects.flatMap(project => project.surfaces.map(surface => ({
    key: keyOf(project, surface),
    project: project.name,
    repo: project.repo,
    surface: surface.name,
    state: surface.state,
    passed: surface.passed,
    failed: surface.failed,
    flaky: surface.flaky,
    skipped: surface.skipped,
    total: surface.total,
    duration: surface.duration,
    ts: surface.ts,
    uiUrl: surfaceUiUrl(project, surface, uiBase),
    reportUrl: surface.reportUrl || surface.href,
    actionsUrl: project.actionsHref
  })));
}
