#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { DEFAULT_UI_BASE, fleetSummary, fmtDuration, hydrateRegistry, keyOf, projectState, stateLabel, surfaceRows } from '../core/e2e.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

function usage() {
  console.log(`fleetdeck — Playwright fleet report console\n\nUsage:\n  fleetdeck status [--json]\n  fleetdeck failures [--json]\n  fleetdeck inspect <project/surface> [--json]\n  fleetdeck list [--json]\n\nOptions:\n  --registry <path-or-url>  Registry source (default: modules/e2e/projects.json)\n  --ui-base <url>          Dashboard deep-link base (default: ${DEFAULT_UI_BASE})\n  --json                   Emit JSON\n`);
}

function parseArgs(argv) {
  const options = { registry: path.join(repoRoot, 'modules/e2e/projects.json'), uiBase: DEFAULT_UI_BASE, json: false };
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') options.json = true;
    else if (arg === '--registry') options.registry = argv[++i];
    else if (arg.startsWith('--registry=')) options.registry = arg.slice('--registry='.length);
    else if (arg === '--ui-base') options.uiBase = argv[++i];
    else if (arg.startsWith('--ui-base=')) options.uiBase = arg.slice('--ui-base='.length);
    else if (arg === '-h' || arg === '--help') options.help = true;
    else positional.push(arg);
  }
  return { command: positional[0] || 'status', target: positional[1], options };
}

async function readRegistry(source) {
  if (/^https?:\/\//.test(source)) return (await (await fetch(source, { cache: 'no-store' })).json());
  return JSON.parse(await fs.readFile(path.resolve(source), 'utf8'));
}

function printRows(rows) {
  for (const row of rows) {
    const marker = row.state === 'failed' ? 'FAIL' : row.state === 'flaky' ? 'FLAKY' : row.state.toUpperCase();
    console.log(`${marker.padEnd(7)} ${row.key.padEnd(24)} ${String(row.passed ?? '—').padStart(3)} ok  ${String(row.failed ?? 0).padStart(2)} fail  ${String(row.flaky ?? 0).padStart(2)} flaky  ${row.uiUrl}`);
  }
}

function failingRows(rows) {
  return rows.filter(row => ['failed', 'flaky', 'blocked', 'stale', 'no-report'].includes(row.state));
}

function testRows(surface) {
  return (surface.tests || []).filter(test => ['failed', 'flaky', 'unexpected'].includes(test.status));
}

async function main() {
  const { command, target, options } = parseArgs(process.argv.slice(2));
  if (options.help) { usage(); return; }

  const registry = await hydrateRegistry(await readRegistry(options.registry));
  const rows = surfaceRows(registry.projects, options.uiBase);
  const summary = fleetSummary(registry.projects);

  if (command === 'status') {
    const payload = { summary, rows };
    if (options.json) console.log(JSON.stringify(payload, null, 2));
    else {
      console.log(`E2E fleet: ${summary.surfaces} surfaces · ${summary.failed} failed · ${summary.flaky} flaky · ${summary.tests} tests`);
      printRows(failingRows(rows));
    }
    return;
  }

  if (command === 'failures') {
    const failures = failingRows(rows);
    if (options.json) console.log(JSON.stringify({ summary, failures }, null, 2));
    else {
      console.log(`E2E failures: ${failures.length} surfaces need attention`);
      printRows(failures);
    }
    return;
  }

  if (command === 'list') {
    if (options.json) console.log(JSON.stringify({ rows }, null, 2));
    else printRows(rows);
    return;
  }

  if (command === 'inspect') {
    if (!target) throw new Error('inspect requires <project/surface>');
    const pair = registry.projects.flatMap(project => project.surfaces.map(surface => ({ project, surface }))).find(({ project, surface }) => keyOf(project, surface) === target);
    if (!pair) throw new Error(`unknown surface: ${target}`);
    const row = surfaceRows([pair.project], options.uiBase).find(item => item.key === target);
    const payload = { project: pair.project.name, projectState: projectState(pair.project), surface: pair.surface, row, attentionTests: testRows(pair.surface) };
    if (options.json) console.log(JSON.stringify(payload, null, 2));
    else {
      console.log(`${target} — ${stateLabel(pair.surface.state)}`);
      console.log(`${pair.surface.passed ?? '—'} ok · ${pair.surface.failed ?? 0} fail · ${pair.surface.flaky ?? 0} flaky · ${pair.surface.skipped ?? 0} skipped · ${fmtDuration(pair.surface.duration)}`);
      console.log(`UI: ${row.uiUrl}`);
      console.log(`Report: ${row.reportUrl}`);
      const tests = testRows(pair.surface);
      if (tests.length) {
        console.log('\nAttention tests:');
        for (const test of tests.slice(0, 20)) console.log(`- ${test.status}: ${test.title} (${test.file || 'unknown'}${test.line ? `:${test.line}` : ''})`);
      }
    }
    return;
  }

  usage();
  process.exitCode = 1;
}

main().catch(error => {
  console.error(`fleetdeck: ${error.message || error}`);
  process.exit(1);
});
