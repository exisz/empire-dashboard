# Empire Dashboard

Empire-wide operational dashboard.

First module: **E2E** — a static JSON reader SPA that aggregates independently-published project E2E data.

- Shell: `index.html` + `assets/`
- Registry: `modules/e2e/projects.json`
- Publisher contract: `docs/e2e-publisher-contract.md`

Architecture: project repositories publish their own `status.json`, `summary.json`/`runs.json`, trend files, and optional raw report links at stable URLs. The dashboard reads those files at runtime and renders cards/tables itself; raw reports open in a new tab.
