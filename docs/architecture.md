# Empire Dashboard architecture

## Current direction

Empire Dashboard is a single SPA shell with composable modules. The first module is E2E.

The UX must feel like one system:

```text
Empire Dashboard
└── E2E Module
    ├── Tally / Cloud
    ├── Tally / Desktop macOS
    ├── PeopleClaw / Admin
    └── Commerce / Fun Store / Annie Time / Aussie Style
```

Projects may still publish from separate repos, but users should not feel bounced between separate dashboards. The SPA embeds surface reports and reads shared status/trend contracts.

## Layers

1. **Shell** — one SPA, global navigation, cross-project summaries, module routing.
2. **Registry** — `modules/e2e/projects.json`, listing projects, surfaces, status URLs, report URLs.
3. **Surface contract** — each publisher can emit `index.html`, `status.json`, `results.csv`, and optional traces/videos.
4. **Publishers** — independent repo workflows running on self-hosted CI runners.
5. **Artifacts** — static files on GitHub Pages for now.

## Improvements to make next

### 1. Split registry from code deploy

Right now changing the registry requires a dashboard repo commit. Better options:

- keep `projects.json` in this repo for v1 simplicity
- later allow module registries under `modules/e2e/registry.d/*.json`
- eventually let project publishers submit/update only their own manifest file

### 2. Add an ingestion workflow

Instead of every repo pushing directly to `gh-pages`, use one repository_dispatch API:

```text
project workflow -> repository_dispatch -> Empire ingest workflow -> gh-pages
```

Benefits:

- one write path
- validation before publish
- no race conditions between publishers
- easier audit trail

### 3. Store normalized run history

Current `results.csv` is good enough for static trends, but a normalized shape is better:

```text
runs/<project>/<surface>/<run-id>/manifest.json
runs/<project>/<surface>/<run-id>/report/
latest/<project>/<surface>/status.json
latest/<project>/<surface>/report/
```

Then the dashboard can show latest + history without relying on ad-hoc CSV parsing.

### 4. Keep external secrets out of the dashboard

The dashboard should never receive payment credentials, test user passwords, webhook tokens, or card data. Project workflows own those via GitHub Secrets/environment secrets. The dashboard only receives sanitized output.

### 5. Runner taxonomy

Use consistent labels:

```yaml
runs-on: [self-hosted, linux, x64, e2e]
```

Add project labels only when needed: `commerce`, `peopleclaw`, `tally-cloud`.

### 6. Module boundary

E2E is one module. Later modules should follow the same pattern:

- Deploys
- Incidents
- Costs
- SEO/Search
- Revenue

Each module gets a registry + surface contract, but the shell stays one SPA.
