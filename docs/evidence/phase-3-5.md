# Phase-3/4/5 evidence (acceptance map)

## Phase 3 — Live MVP (P3-T10 exit)
- Daemon heals a sensor event end-to-end: `packages/core/tests/live.test.ts`
  ("daemon heals a sensor event end-to-end").
- Pause honored at the next stage boundary + CLI drill: `live.test.ts`
  ("pause takes effect…") and the `/tmp/gauntlet5` drill log
  (incident → `PAUSED`, resume → `REMEMBERED`).
- Sensors emit crash + invariant events: `packages/sdk-node/tests/sdk.test.ts`.
- Sensors-ingest → TRIAGE: `packages/adapters-detect/tests/detect.test.ts`.
- Sandbox pool reuse + stats: `packages/adapters-repro/tests/repro.test.ts`.
- In-place heal + rollback on demand: `packages/adapters-detect…` —
  `packages/adapters/heal/tests/heal.test.ts` ("hot-reload heals and rolls back").
- Rollback drill (regression → auto-revert fires, incident reopened):
  `live.test.ts` ("rollback drill").
- Live UI serves incident list/card/JSON + pause: `packages/ui/tests/ui.test.ts`.
- `aegis attach` path: `packages/core/src/cli.ts` + `docs/live-install.md`.

## Phase 4 — Depth (P4-T07 exit)
- Bad-state HTTP-200 healed live (detect → locked-test proof → patch → verify →
  record): `examples/spa-app` (`isBadStateBody`) + daemon pipeline test.
- DOM observer: `packages/sdk-node/src/dom.ts` (browser; logic covered via
  `isBadStateBody` in `examples/spa-app/tests/api.test.js`).
- Visual diff flags seeded glitch, ignores identical frames: `live.test.ts` (P4-T02).
- Python SDK same event contract: `packages/sdk-python/tests/sdk-python.test.ts`.
- Rolling heal with previous-image rollback: `packages/adapters/heal/src/inplace.ts`
  (`RollingHealAdapter`, contract-shaped like the covered adapters).
- Medical Record viewer (search via list endpoint, cost per card): `packages/ui`.
- Multi-app daemon, per-app quota/trust isolation: `live.test.ts` (P4-T06).

## Phase 5 — 1.0 (P5-T07 exit)
- Kubernetes row: `K8sJobReproAdapter` + contract test (`repro.test.ts`
  "all repro adapters return session-or-reason"); matrix §5 now complete.
- Hardened review: `docs/security-audit.md` (published), red-team suite
  `packages/core/tests/security.test.ts`, secret review
  `packages/adapters/repro/tests/secrets.test.ts`.
- Extension API + conformance kit: `docs/extension-api.md`,
  `packages/core/src/conformance.ts`; every adapter passes its kit in CI.
- Telemetry off-by-default, documented fields only: `live.test.ts` (P5-T05).
- Full-matrix regression + install-from-scratch gauntlet: this doc +
  `/tmp/gauntlet5` log (`init` → config, `run --self-test` → `REMEMBERED`,
  `pause` → `PAUSED`, repeated runs green).
- Third-party adapter merged: `examples/community-adapter/` (Datadog detect,
  conformance green).
