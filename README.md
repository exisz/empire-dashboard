# Fleetdeck

Empire-wide operational dashboard.

First module: **E2E** — one repo with two entrypoints over the same core data layer:

- **Web UI**: human operations shell at `https://projects.rollersoft.com.au/`, with real Playwright HTML reports embedded in an iframe.
- **CLI**: fast agent/cron/operator access to the same registry + Playwright report parser.

Shared logic lives in `src/core/e2e.js`; the React UI and CLI both use it.

## Fleetdeck CLI

```bash
# Fleet summary + surfaces needing attention
node src/cli/fleetdeck.js status

# Only failed/flaky/no-report surfaces
node src/cli/fleetdeck.js failures

# Machine-readable output for agents/cron/webhooks
node src/cli/fleetdeck.js failures --json

# Inspect one surface and print attention tests + dashboard/report links
node src/cli/fleetdeck.js inspect peopleclaw/admin
```

`package.json` exposes the `fleetdeck` bin entry when installed.

## Files

- Shell: `index.html` + `src/main.jsx` + `src/styles.css`
- Shared E2E core: `src/core/e2e.js`
- CLI: `src/cli/fleetdeck.js`
- Registry: `modules/e2e/projects.json`
- Publisher contract: `docs/e2e-publisher-contract.md`

Architecture: project repositories publish stable Playwright reports and machine-readable status artifacts. Fleetdeck normalizes those through the shared core, then serves both the Web UI and CLI from the same truth.
