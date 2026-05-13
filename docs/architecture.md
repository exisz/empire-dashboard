# Empire Dashboard architecture

## Current direction

Empire Dashboard is a static reader SPA. It does **not** run project tests, own project secrets, or get triggered by project repositories.

Each project repository independently runs its E2E workflow on the runner it chooses, publishes sanitized machine-readable JSON/CSV at stable URLs, and optionally publishes a raw Playwright/custom HTML report. Empire Dashboard fetches those files at runtime and renders the operational view itself.

The UX must feel like one system:

```text
Empire Dashboard static SPA
└── E2E Module
    ├── Tally / Cloud
    ├── Tally / Desktop macOS
    ├── PeopleClaw / Admin
    └── Commerce / MapSpot / Xueran planned surfaces
```

Primary UX is JSON-data-driven cards and tables, including the official Playwright JSON reporter test/spec tree. The official Playwright HTML report is the primary detailed test UI and is embedded in the SPA. Empire uses JSON for navigation, badges, summaries, freshness, and fallbacks instead of reimplementing Playwright’s full report UI.

## Layers

1. **Shell** — static SPA, global navigation, cross-project summaries, module routing.
2. **Registry** — `modules/e2e/projects.json`, listing projects, surfaces, data URLs, raw report URLs, and Actions URLs.
3. **Surface contract** — each publisher emits `status.json`, `summary.json` or `runs.json`, official Playwright JSON (`playwright-results.json` or `test-results/results.json`), trends/history JSON or CSV, and optional artifact/report URLs.
4. **Publishers** — independent repo workflows running on GitHub-hosted free runners or self-hosted runners per project policy.
5. **Artifacts** — static files on project-owned GitHub Pages or another stable static host.

## Current non-goals

- No `repository_dispatch` path from project repos into Empire Dashboard.
- No Empire-trigger-on-project-run workflow.
- No dashboard-owned cross-repo write token for project E2E output.
- No project secrets inside this dashboard repo.

A future centralized ingest workflow could validate and mirror project data, but that is optional and not the recommended current path. The current path is simpler: projects publish their own immutable/latest JSON outputs; Empire reads them.

## Improvements to make next

### 1. Split registry from code deploy

Right now changing the registry requires a dashboard repo commit. Better options:

- keep `projects.json` in this repo for v1 simplicity
- later allow module registries under `modules/e2e/registry.d/*.json`
- eventually let project publishers expose their own manifest URL that the static SPA reads

### 2. Normalize run history

Preferred shape for each project-owned publisher:

```text
latest/<project>/<surface>/status.json
latest/<project>/<surface>/summary.json
latest/<project>/<surface>/runs.json
latest/<project>/<surface>/history.csv or history.json
latest/<project>/<surface>/report/        # optional raw HTML report
```

Then the dashboard can show latest + history without parsing ad-hoc reports.

### 3. Keep external secrets out of the dashboard

The dashboard should never receive payment credentials, test user passwords, webhook tokens, or card data. Project workflows own those via GitHub Secrets/environment secrets. The dashboard only receives sanitized output.

### 4. Runner taxonomy

Use consistent labels when self-hosted runners are used:

```yaml
runs-on: [self-hosted, linux, x64, e2e]
```

Add project labels only when needed: `commerce`, `peopleclaw`, `tally-cloud`.

### 5. Module boundary

E2E is one module. Later modules should follow the same pattern:

- Deploys
- Incidents
- Costs
- SEO/Search
- Revenue

Each module gets a registry + data contract, but the shell stays one static reader SPA.
