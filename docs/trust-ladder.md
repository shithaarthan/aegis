# Trust ladder

| Level | Agent edition | Live edition |
|---|---|---|
| 0 (default) | PR only, human merges | PR + proposed apply command, human applies |
| 1 | auto-merge iff suite green **and** diff ≤ 5 files **and** ≤ 300 lines | auto-apply with 15-min health watch |
| 2 | auto-merge any green diff | auto-apply + auto-rollback watch |

Rules:
- Raising a level is a **human-only** action (edit `.aegis/config.yml`); never agent-initiated.
- Locks, suite gates, and diff gates apply at **every** level (D-17).
- Enforcement lives in `packages/core/src/trust.ts` (`decideTrust`) and is covered
  by contract tests. Oversize green diffs at L1 fall back to PR-only.
