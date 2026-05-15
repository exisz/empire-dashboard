# E2E module roadmap

## Phase 0 — static reader shell (done)

- Public Fleetdeck shell on GitHub Pages
- E2E registry with existing dashboards:
  - Tally
  - PeopleClaw
- Planned slots for Commerce Stores, MapSpot, Xueran
- Publisher contract for independent project-owned publishing
- Primary dashboard UX renders from JSON/CSV data, not iframes

## Phase 1 — standardize project publishers

Move each project toward the same project-owned output shape:

```text
e2e/<project>/<surface>/status.json
e2e/<project>/<surface>/summary.json or runs.json
e2e/<project>/<surface>/history.csv or history.json
e2e/<project>/<surface>/report/       # optional raw HTML report link only
```

Priority:

1. Commerce Stores — purchasing/payment-critical, 3 store surfaces
2. PeopleClaw — add `status.json`/`summary.json` beside existing trend output
3. Tally — keep standalone dashboard, publish/alias machine-readable JSON per surface
4. MapSpot — convert artifact-only workflow into JSON-published dashboard surface
5. Xueran — convert artifact-only workflow into JSON-published dashboard surface

## Phase 2 — self-hosted/free runner policy

E2E workflows run in each project repo. GitHub free hosted runners are acceptable for public/non-secret smoke tests. Self-hosted runners should be used for private, payment, browser, or environment-specific tests.

Suggested self-hosted labels:

```yaml
runs-on: [self-hosted, linux, x64, e2e]
```

Project-specific labels may be added, e.g. `commerce`, `peopleclaw`, `tally-cloud`.

## Phase 3 — commerce payment coverage

Commerce E2E should run independently per store:

- `commerce / fun-store`
- `commerce / annie-time`
- `commerce / aussie-style`

Required test areas:

- landing/product browse
- cart mutation
- checkout form validation
- test-card payment path
- order confirmation
- post-purchase smoke checks

All credentials, test card data, and payment-provider keys must live in GitHub Secrets or environment-scoped secrets.

## Phase 4 — dashboard composition hardening

- stale-run detection using publisher freshness policy
- richer trend/history tables
- fail-open rendering for malformed project data
- optional future ingest/mirroring workflow for validation only
- per-module navigation: E2E, Deploys, Incidents, Costs
