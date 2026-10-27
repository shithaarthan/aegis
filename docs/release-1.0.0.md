# AEGIS 1.0.0 — Release notes

**An immune system for your app — from a workflow file to a live daemon.**

## What shipped
- **Two editions, one kernel:** AEGIS Agent (Sentry → GitHub Actions → PR) and
  AEGIS Live (sensor daemon, in-place heal, 15-min auto-rollback watch).
- **Full deployment-target matrix** (§5): VM, Docker/compose, Kubernetes,
  PaaS, serverless, Cloudflare Workers, static SPA + API.
- **Non-negotiable safety:** locked symptom-derived tests, suite must stay green,
  trust ladder L0–L2, daily quota + token ceilings, kill switch, tamper-evident
  Medical Record for every incident, no production secrets in sandboxes.
- **Proof, not promises:** 60 tests green (uncached), install-from-scratch
  gauntlet, published security audit, first third-party adapter (Datadog).

## Install
```sh
git clone <repo-url> && cd aegis && pnpm install && pnpm build
npx aegis init   # Agent — 3 questions → .aegis/config.yml + workflow
aegis attach /srv/my-app   # Live — sensor install + daemon
```

## Verify
```sh
pnpm test        # 17 tasks green
node packages/core/dist/cli.js run --self-test   # incident → REMEMBERED
```

## Publishing this release (maintainer)
```sh
gh repo create aegis --public --source=. --remote=origin --push
git push -u origin main --tags
gh release create v1.0.0 --title "AEGIS 1.0.0" --notes-file docs/release-1.0.0.md
```

## Metrics baseline (Phase 1, local)
Exception → pipeline-complete < 60s (no model calls); ≤15 min budget with model
calls in CI. Cost per incident ≈ $0.0021 (stubbed models; real costs recorded
per incident card). Heal rate target ≥50% by Phase 2 adoption; regression
escape target <2%; rollback success 100% (any failure = P1 bug).
