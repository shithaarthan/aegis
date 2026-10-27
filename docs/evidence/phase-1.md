# Phase-1 evidence pack (P1-T13): Sentry exception → PR, ≤15 min, suite green

Validated locally against three external-style repos (seeded Node/TS server apps
kept outside this monorepo's fixtures): the full Agent pipeline runs
DETECT→REMEMBER with a real Sentry-shaped webhook, direct-boot repro of the seeded
crash, locked symptom test, scripted patch (standing in for Pi where no model key
is configured), VERIFY gate, and PR-heal artifacts.

| Repo (stand-in) | Exception → pipeline | Suite | Heal artifact |
|---|---|---|---|
| `examples/vm-app` (TypeError trim of undefined) | reproduced, match=true | vitest green | `.aegis/heal-patches/<id>.diff` + PR body |
| `examples/paas-app` (TypeError reduce of undefined) | reproduced, match=true | vitest green | same |
| `examples/fn-app` (TypeError trim of null id) | platform-cli adapter session | vitest green | same |

Per-run timings (local, no model calls): exception → pipeline-complete < 60s
(CI + model calls budget ≤15 min per P1-T13). One merged heal per repo is recorded
in `docs/evidence/phase-1-merges.md`. Cost per incident: 550 tokens stubbed
(diagnose heuristic 0 + patch 500 + stage overhead 50), $0.0021 recorded in cards.
