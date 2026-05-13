# E2E module roadmap

## Phase 0 — gateway shell (done)

- Public Empire Dashboard shell on GitHub Pages
- E2E registry with existing dashboards:
  - Tally
  - PeopleClaw
- Planned slots for Commerce Stores, MapSpot, Xueran
- Publisher contract for independent project publishing

## Phase 1 — standardize publishers

Move each project toward the same output shape:

```text
e2e/<project>/<surface>/index.html
e2e/<project>/<surface>/status.json
e2e/<project>/<surface>/results.csv
```

Priority:

1. Commerce Stores — purchasing/payment-critical, 3 store surfaces
2. PeopleClaw — already close; migrate from standalone dashboard into gateway publishing
3. Tally — keep standalone dashboard, also publish/alias into gateway
4. MapSpot — convert artifact-only workflow into dashboard surface
5. Xueran — convert artifact-only workflow into dashboard surface

## Phase 2 — self-hosted runner policy

E2E workflows should run on self-hosted runners by default. GitHub-hosted runners remain acceptable only for:

- public OSS smoke tests with no secrets
- cheap non-payment tests
- temporary fallback while a labelled runner is unavailable

Suggested labels:

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

- Optional `surface.json` richer manifest for custom micro-frontends
- stale-run detection
- per-module navigation: E2E, Deploys, Incidents, Costs
- cross-repo publish token rotation guidance
- fail-open rendering for malformed project surfaces
