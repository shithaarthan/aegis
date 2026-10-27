# Contracts (frozen Phase-0 surface)

All cross-package communication uses these contracts only. No package imports
another package's internals.

- **Incident** (`packages/core/src/types.ts`): id, signature fingerprint, source,
  edition, repo/app identity, timestamps, occurrence count, status, severity,
  evidence refs, environment snapshot ref, diagnosis, locked-test ref + hash,
  patch attempts, verification results, heal/rollback results, token/cost totals,
  stage timings, trust level, Medical Record link.
- **Stage envelope**: incident id, config snapshot, inputs-by-reference, budget
  remaining, kill-switch check in; outcome (advance/terminal/retry), artifacts,
  timing, cost, human-readable summary out. Stages are idempotent.
- **Adapter interfaces**: Detect (normalize only, health check, never writes the
  store), Repro (runnable sandbox session or failure reason + 2-strike rule),
  Heal (verified diff in, rollback plan + executor out), Patch agent
  (task context in, diff or failure out).
- **Patch contract**: minimal diff, locked tests read-only, existing tests stay
  green and unweakened, no new dependencies without justification, ≤3 attempts,
  20-minute wall clock.
- **Medical Record entry**: full incident summary + timeline with timings/costs,
  hash-chained to the previous entry (tamper-evident), plus a human-readable card.
