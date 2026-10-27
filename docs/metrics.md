# Metrics (from Medical Record data — no separate pipeline before P5 telemetry)

| Metric | Definition | Target |
|---|---|---|
| Heal rate | Healed-and-merged ÷ triaged | ≥50% by Phase 2 |
| Time-to-PR / time-to-heal | Median exception → PR (Agent); exception → verified live heal (Live) | ≤15 min Agent |
| Regression escape rate | Healed PRs later reverted or causing new incidents | <2% |
| Trust adoption | Share of installs per trust level | report only |
| Cost per heal | Median tokens + compute per healed incident | report per phase |
| Rollback success | Auto-rollbacks restoring health ÷ fired | 100% |

Phase-1 baseline: see `docs/evidence/phase-1.md`. Phase-2 matrix: `docs/evidence/phase-2.md`.
Per-incident token + cost accounting is mandatory in every incident card (D-13).
