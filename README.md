# AEGIS — the self-healing software project

**When software fails, an agent diagnoses it, proves the bug with a test, patches it,
verifies the fix, and ships it — while reporting everything it did.**

One product, two editions, every deployment target. Open-source core (MIT).

| | **AEGIS Agent** (CI edition) | **AEGIS Live** (daemon edition) |
|---|---|---|
| Shape | wakes on webhook, runs in CI, opens a PR | always-on daemon attached to your app |
| Detection | Sentry/GlitchTip/Bugsnag webhooks, log scrapers | embedded sensors: exceptions, invariants, DOM, action log |
| Heals via | PR → merge → platform deploys | in-place + 15-min auto-rollback watch |
| Runs on | GitHub Actions / GitLab CI | your VM, container, or PaaS worker |

## Quickstart (Agent)

```sh
npx aegis init        # 3 questions → .aegis/config.yml + workflow
aegis run --self-test # synthetic incident proves the wiring
```

## Quickstart (Live)

```sh
curl -fsSL https://example.com/aegis.sh | sh
aegis attach /srv/my-app
```

## Layout

- `packages/core` — pipeline FSM, contracts, store, Medical Record, safety, CLI
- `packages/adapters/{detect,repro,heal}` — error sources, sandboxes, heal paths
- `packages/agent-pi` — Pi patch integration (pluggable agent interface)
- `packages/sdk-node`, `packages/sdk-python` — embedded sensors
- `packages/ui` — Live dashboard + Medical Record viewer
- `dispatcher/` — Cloudflare Worker: Sentry webhook → GitHub dispatch
- `templates/` — GitHub Actions, GitLab CI, compose-live installs
- `examples/` — seeded-bug apps per deployment target + third-party adapter

## Safety (non-negotiable)

Locked symptom-derived tests, suite must stay green, human-in-the-loop by default
(trust ladder), tamper-evident Medical Record for every incident, kill switch
(`aegis pause`), daily quota + token ceilings, no production secrets in sandboxes.

Docs: `docs/architecture.md` · `docs/contracts.md` · `docs/trust-ladder.md` ·
`docs/threat-model.md` · `docs/extension-api.md` · `docs/security-audit.md`.

## Releases

Semver, packages versioned together until 1.0. This checkout is **1.0.0**:
full target matrix, Live auto-rollback, published security audit, and a merged
third-party adapter (`examples/community-adapter`).
