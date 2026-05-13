# Empire Dashboard → E2E Module publisher contract

Empire Dashboard is a static reader SPA. Project repositories own their E2E execution and publish sanitized data at stable URLs. The dashboard reads those JSON/CSV files at runtime and renders the primary UX itself.

Raw Playwright/custom HTML reports are optional artifacts. They should be exposed as links that open in a new tab; they are not embedded as the primary operator view.

## Preferred project-published files

Publish each independently-owned surface to a stable project-owned location, for example:

```text
e2e/<project-id>/<surface-id>/
  status.json             # latest machine-readable state
  summary.json            # latest aggregate counts/timing, or...
  runs.json               # recent runs list with latest run first
  history.csv             # trend data, or history.json/trends.json
  report/ or index.html   # optional raw HTML report/artifact
  test-results/           # optional traces/videos/screenshots
```

Legacy publishers can keep using `status.json` + `results.csv`; the dashboard will render the minimal data it can find.

## Required state vocabulary

Publishers should use these states:

- `passed` — latest completed run passed.
- `failed` — latest completed run failed.
- `blocked` — workflow could not execute because of an external dependency, missing secret, runner outage, deploy outage, or known prerequisite issue.
- `no-report` — no machine-readable latest report is available.
- `stale` — latest report exists but is older than the publisher's freshness policy.
- `planned` — dashboard slot exists but the publisher is not live yet.

Compatibility aliases such as `pass`/`fail` may be accepted by the SPA, but publishers should emit the canonical values above.

**Last-known-good rule:** `blocked` and `no-report` must not overwrite the last-known-good report pointer. Keep `lastGoodReportUrl` / `lastKnownGoodReportUrl` pointing at the last `passed` raw report or artifact until a newer `passed` run exists.

## status.json

```json
{
  "schema": "empire.e2e.status.v1",
  "project": "commerce",
  "surface": "fun-store",
  "status": "passed",
  "ts": "2026-05-13T08:32:00Z",
  "sha": "abc1234",
  "runUrl": "https://github.com/exisz/medusa/actions/runs/...",
  "reportUrl": "https://exisz.github.io/medusa/e2e/fun-store/report/",
  "lastGoodReportUrl": "https://exisz.github.io/medusa/e2e/fun-store/report/"
}
```

Minimum useful fields: `status`, `ts`, and either `runUrl` or `reportUrl`.

## Playwright official JSON

Empire Dashboard should support the official Playwright JSON reporter shape. Preferred publisher command:

```bash
npx playwright test --reporter=html,json
# or set PLAYWRIGHT_JSON_OUTPUT_NAME=public/latest/<project>/<surface>/playwright-results.json
```

Supported paths in registry:

```json
{
  "playwrightJsonUrl": "https://example.github.io/project/latest/web/playwright-results.json"
}
```

The dashboard reads `stats`, `suites[].specs[]`, nested suites, test projects, retries, durations, errors, attachments, and renders the user-journey/spec list itself. The official Playwright HTML report remains the primary detailed UI and should be embedded by Empire; JSON powers summary/navigation.

Important: keep Playwright HTML, traces, videos, screenshots as optional artifact links; publish sanitized JSON for the Empire UI.

## summary.json

```json
{
  "schema": "empire.e2e.summary.v1",
  "project": "commerce",
  "surface": "fun-store",
  "status": "passed",
  "total": 13,
  "passed": 12,
  "failed": 0,
  "flaky": 0,
  "skipped": 1,
  "durationMs": 73422,
  "ts": "2026-05-13T08:32:00Z",
  "sha": "abc1234",
  "runUrl": "https://github.com/exisz/medusa/actions/runs/...",
  "reportUrl": "https://exisz.github.io/medusa/e2e/fun-store/report/",
  "lastGoodReportUrl": "https://exisz.github.io/medusa/e2e/fun-store/report/"
}
```

## runs.json

```json
{
  "schema": "empire.e2e.runs.v1",
  "runs": [
    {
      "id": "1234567890",
      "status": "passed",
      "timestamp": "2026-05-13T08:32:00Z",
      "sha": "abc1234",
      "total": 13,
      "passed": 12,
      "failed": 0,
      "durationMs": 73422,
      "runUrl": "https://github.com/exisz/medusa/actions/runs/1234567890",
      "reportUrl": "https://exisz.github.io/medusa/e2e/fun-store/report/"
    }
  ]
}
```

## trends/history

CSV is acceptable:

```csv
timestamp,sha,duration,total,passed,failed,status,runUrl,reportUrl
2026-05-13T08:32:00Z,abc1234,73422,13,12,0,passed,https://github.com/exisz/medusa/actions/runs/1234567890,https://exisz.github.io/medusa/e2e/fun-store/report/
```

JSON is also acceptable as either `{ "runs": [...] }` or an array of run objects.

## Optional artifact fields

Any latest/status/summary/run object may include. For user journeys / flows, prefer `tests[]` or the official Playwright JSON above:

- `runUrl` — CI run URL.
- `reportUrl` / `rawReportUrl` — raw HTML report/artifact URL.
- `lastGoodReportUrl` / `lastKnownGoodReportUrl` — last passed raw report URL.
- `traceUrl`, `videoUrl`, `screenshotsUrl` — optional debugging artifacts.
- `note` / `message` — short sanitized operator note.

## Publishing model

Each project keeps its own test runner, secrets, schedule, and runner selection. Use GitHub Secrets/environment secrets for credentials, payment-provider keys, login users, and test card data.

For now, do **not** wire project repos to trigger Empire Dashboard via `repository_dispatch`, and do **not** publish into this repo as the default path. Publish data to the project repo's own GitHub Pages or another stable static host, then register the URLs in `modules/e2e/projects.json`.

A future Empire ingest workflow may mirror/validate project data, but it should be treated as optional infrastructure, not the current recommendation.
