# Empire Dashboard → E2E Module publisher contract

The dashboard is intentionally composable, but the operator experience is one SPA. A project can publish a full Playwright HTML report, or only a tiny status file. The Empire shell embeds available reports inside the dashboard and still works when a publisher is partial.

## Preferred folder shape

Publish each independently-owned surface to:

```text
e2e/<project-id>/<surface-id>/
  index.html              # Playwright HTML report or custom surface UI
  status.json             # small machine-readable latest status
  results.csv             # append-only trend data
  test-results/           # optional traces/videos/screenshots
```

Existing external dashboards can also be registered by URL, e.g. Tally and PeopleClaw.

## status.json

```json
{
  "schema": "empire.e2e.status.v1",
  "project": "commerce",
  "surface": "fun-store",
  "status": "pass",
  "passed": 12,
  "failed": 0,
  "flaky": 0,
  "skipped": 1,
  "duration": 73422,
  "ts": "2026-05-13T08:32:00Z",
  "sha": "abc1234",
  "runUrl": "https://github.com/exisz/medusa/actions/runs/...",
  "reportUrl": "https://exisz.github.io/empire-dashboard/e2e/commerce/fun-store/"
}
```

Minimum useful fields: `passed`, `failed`, `duration`, `ts`.

## results.csv

```csv
timestamp,sha,duration,total,passed,failed
2026-05-13T08:32:00Z,abc1234,73422,13,12,0
```

## Publishing from another repo

Each project keeps its own test runner and secrets. To publish into this gateway repo, add a repo secret:

- `EMPIRE_DASHBOARD_PUBLISH_TOKEN` — PAT or fine-grained token with write access to `exisz/empire-dashboard` contents.

Then use `peaceiris/actions-gh-pages@v4` with:

```yaml
- name: Publish E2E surface to Empire Dashboard
  if: always()
  uses: peaceiris/actions-gh-pages@v4
  with:
    personal_token: ${{ secrets.EMPIRE_DASHBOARD_PUBLISH_TOKEN }}
    external_repository: exisz/empire-dashboard
    publish_branch: gh-pages
    publish_dir: ./public
    destination_dir: e2e/<project-id>/<surface-id>
    keep_files: true
```

Do not put payment tokens, test card details, webhook URLs, or login credentials in workflow YAML. Use GitHub Secrets. Test card numbers can be injected from secrets too when they are provider-specific.

## Micro-frontend rule

The gateway owns navigation, registry, cross-project summary, and the viewing frame. Each surface owns its own `index.html` and assets. The shell embeds the surface report in-place instead of sending the operator to a separate system.
