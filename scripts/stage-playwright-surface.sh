#!/usr/bin/env bash
set -euo pipefail
PROJECT="${PROJECT:?PROJECT required}"
SURFACE="${SURFACE:?SURFACE required}"
REPORT_DIR="${REPORT_DIR:-playwright-report}"
RESULTS_JSON="${RESULTS_JSON:-test-results/results.json}"
OUT="${OUT:-public}"
DEST="$OUT/e2e/$PROJECT/$SURFACE"
mkdir -p "$DEST"
if [[ -f "$REPORT_DIR/index.html" ]]; then
  cp -R "$REPORT_DIR"/. "$DEST"/
else
  cat > "$DEST/index.html" <<HTML
<!doctype html><meta charset="utf-8"><title>$PROJECT / $SURFACE</title><body><h1>No Playwright report</h1><p>See the GitHub Actions run.</p></body>
HTML
fi
if [[ -d test-results ]]; then cp -R test-results "$DEST/test-results"; fi
if [[ -f "$RESULTS_JSON" ]]; then
  jq -c --arg project "$PROJECT" --arg surface "$SURFACE" '{
    schema:"empire.e2e.status.v1", project:$project, surface:$surface,
    passed:(.stats.expected // 0), failed:(.stats.unexpected // 0), flaky:(.stats.flaky // 0), skipped:(.stats.skipped // 0),
    duration:(.stats.duration // 0), ts:(now|todateiso8601), sha:(env.GITHUB_SHA // ""),
    runUrl:((env.GITHUB_SERVER_URL // "https://github.com") + "/" + (env.GITHUB_REPOSITORY // "") + "/actions/runs/" + (env.GITHUB_RUN_ID // ""))
  }' "$RESULTS_JSON" > "$DEST/status.json"
else
  printf '{"schema":"empire.e2e.status.v1","project":"%s","surface":"%s","status":"unknown","passed":0,"failed":0,"duration":0,"ts":"%s"}\n' "$PROJECT" "$SURFACE" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$DEST/status.json"
fi
CSV="$DEST/results.csv"
[[ -f "$CSV" ]] || echo 'timestamp,sha,duration,total,passed,failed' > "$CSV"
if [[ -f "$DEST/status.json" ]]; then
  jq -r '[.ts,.sha,.duration,((.passed//0)+(.failed//0)+(.flaky//0)+(.skipped//0)),(.passed//0),(.failed//0)] | @csv' "$DEST/status.json" | tr -d '"' >> "$CSV"
fi
