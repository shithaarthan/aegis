# Changelog — Semver, packages versioned together until 1.0.

## 1.0.0 (2026-10-27)
- AEGIS 1.0: Agent + Live editions, full §5 deployment-target matrix incl. Kubernetes.
- Kernel: 9-stage FSM with terminal states, idempotent stages, kill-switch/budget gates.
- Medical Record: append-only hash-chained JSONL + human-readable incident cards.
- Trust ladder L0–L2 for Agent and Live; Live 15-minute auto-rollback watch + drill.
- Detect: Sentry (signed dispatcher), GlitchTip, Bugsnag, log-scraper, sensors-ingest, Workers logpush.
- Repro: direct-boot, docker-compose, platform CLI, wrangler/miniflare, k8s Job, pooled sandboxes, diagnosis-only fallback.
- Heal: PR (with incident card), hot-reload, restart, rolling, proposed-command; deploy verification.
- Hardening: prompt-injection red-team suite, sandbox secret review, published security audit.
- Extension API + conformance kit; first third-party adapter merged (Datadog detect).
- Install: `aegis init` wizard, `aegis attach`, GitHub/GitLab templates, compose bundle.
