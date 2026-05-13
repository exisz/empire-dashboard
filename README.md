# Empire Dashboard

Empire-wide operational dashboard.

First module: **E2E** — a composable Playwright dashboard that aggregates independently-published project reports.

- Shell: `index.html` + `assets/`
- Registry: `modules/e2e/projects.json`
- Publisher contract: `docs/e2e-publisher-contract.md`

Architecture: the dashboard is a micro-frontend host. Each project can publish a full report UI into its own folder, while the root shell reads lightweight status/trend files.
