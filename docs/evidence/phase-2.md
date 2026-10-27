# Phase-2 evidence (P2-T09): matrix suite green

`packages/adapters-repro/tests/repro.test.ts` ("P2-T09 matrix integration suite")
exercises every row of §5 except Kubernetes (P5) on seeded example apps:

| Target | Example | Adapter | Result |
|---|---|---|---|
| VM / dedicated | `examples/vm-app` | direct-boot | crash reproduced, match=true |
| PaaS | `examples/paas-app` | direct-boot | crash reproduced |
| Docker/compose | `examples/compose-app` | docker-compose | session-or-honest-reason (contract) |
| Serverless | `examples/fn-app` | platform-cli | session-or-honest-reason (contract) |
| Workers | `examples/worker-app` | wrangler | session-or-honest-reason (contract) |
| Static SPA + API | `examples/spa-app` | none → diagnosis-only | labeled unverified |

Kubernetes (`k8s-job`) is covered in Phase 5 with the same contract. GlitchTip,
Bugsnag, log-scraper, and Workers-logpush detect adapters pass `conformDetect`.
GitLab template: `templates/gitlab/aegis.gitlab-ci.yml`. Trust L2 gate +
quota/budget surfacing verified in `packages/core/tests/core.test.ts`.
