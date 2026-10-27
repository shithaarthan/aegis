# AEGIS — Complete Project Plan

**The self-healing software project.** One product, two editions, every
deployment target. This is the unified master plan — the earlier docs
(`idea-1-self-healing-app.md`, `aegis-architecture.md`,
`aegis-lite-architecture.md`) remain as design references for their
respective editions.

---

## 1. Vision

Software breaks at 3am. Today the response is human: an alert fires, an
engineer reads a stack trace, reproduces, patches, tests, deploys. AEGIS
automates that loop: **when software fails, an agent diagnoses it, proves
the bug with a test, patches it, verifies the fix, and ships it — while
reporting everything it did.**

AEGIS is not a chatbot and not a monitoring dashboard. It is an autonomous
remediation system with non-negotiable safety rails: symptom-derived locked
tests, regression gates, human-in-the-loop by default, and a tamper-evident
audit trail (the Medical Record) for every heal.

**Positioning:** open-source core. "An immune system for your app — from a
workflow file to a live daemon."

## 2. One project, two editions

Both editions share one kernel (the pipeline, contracts, Medical Record,
safety rails). The user chooses an edition — and can migrate between them
without a rewrite, because only the adapters change.

| | **AEGIS Agent** (CI edition) | **AEGIS Live** (daemon edition) |
|---|---|---|
| Shape | an agent that wakes on a webhook, runs in your CI, opens a PR | an always-on daemon attached to your running app |
| Detection | error-tracker webhooks (Sentry/GlitchTip/Bugsnag), log scrapers | embedded sensors: exception hook, invariant checks, DOM observer, action log |
| Watch quality | exceptions, after the fact | everything incl. non-crash failures (bad state on HTTP 200, visual glitches) |
| Patch agent | Pi (`@mariozechner/pi-coding-agent`) or any coding agent | same agent layer, run daemon-side |
| Heals via | PR → merge → your platform deploys | in-place: hot-reload / service restart, with auto-rollback |
| Latency | minutes (fine — you were asleep) | seconds-to-a-minute, live |
| Human gate | PR by default (trust ladder up) | trust ladder up to auto-apply with rollback window |
| Runs on | GitHub Actions / GitLab CI (zero infra) | your VM, dedicated server, container, or PaaS worker |
| Cost profile | free tiers + tokens per incident | one always-on process + tokens per incident |

**Choosing (the `aegis init` wizard asks exactly this):**

| Your situation | Edition |
|---|---|
| App already deployed; want zero infra; PR-based flow | Agent |
| Serverless / functions / Workers app | Agent |
| Solo founder or small team, any host | Agent → graduate to Live later |
| Long-running app on a VM/dedicated server you control; want fastest recovery and non-crash detection | Live |
| Regulated / conservative org | Agent with PR-only trust, forever |

## 3. System architecture

```
                        ┌─────────────────────────────────────────────┐
                        │              AEGIS CORE (kernel)            │
                        │  pipeline FSM · incident store · contracts  │
                        │  medical record · safety rails · CLI        │
                        └───────▲─────────────────────────▲───────────┘
                Agent edition  │                         │  Live edition
        ┌──────────────────────┴────────┐     ┌───────────┴──────────────────┐
        │ CI runner (GitHub Actions/…)  │     │ AEGIS DAEMON (always on)     │
        │  webhook → triage → repro →   │     │  sensors in app · ingest ·   │
        │  Pi patch → verify → PR       │     │  sandbox pool · live heal +  │
        │  (runner = the sandbox)       │     │  auto-rollback · live UI     │
        └───────────────────────────────┘     └──────────────────────────────┘
```

The pipeline is identical in both — only each stage's *implementation* is an
adapter chosen from config:

```
DETECT → TRIAGE → SNAPSHOT/REPRODUCE → DIAGNOSE → TEST(lock)
      → PATCH → VERIFY → HEAL → REMEMBER
```

1. **DETECT** — adapter: error-webhook | log-scraper | embedded sensors
2. **TRIAGE** — dedupe by signature, noise gate, daily quota, ignore lists
3. **SNAPSHOT / REPRODUCE** — adapter: direct-boot | platform-CLI | wrangler/miniflare | docker-compose | none → diagnosis-only
4. **DIAGNOSE** — model call over stack + repo map + replay transcript
5. **TEST** — symptom-derived failing test, hashed and **locked read-only**
6. **PATCH** — coding agent (Pi default) under a written patch contract: minimal diff, tests read-only, ≤3 attempts, wall-clock budget
7. **VERIFY** — locked test green **and** existing suite green; optional visual diff module
8. **HEAL** — adapter: PR | hot-reload | service restart | rolling deploy — always with a rollback plan
9. **REMEMBER** — Medical Record entry + git commit; every model call, cost, and stage timing recorded

Terminal failure states (IRREPRODUCIBLE, PATCH_BUDGET_EXHAUSTED,
REGRESSION) all map to honest escalation: a diagnosis-only report marked
*unverified*, never a silent failure.

## 4. Deployment-target matrix (the "runs anywhere" promise)

**Where the *target app* runs → which adapters apply:**

| App deployment | Detection | Repro adapter | Heal path |
|---|---|---|---|
| Dedicated server / VM (long-running process) | embedded sensors *(best)* or webhook | boot directly in sandbox with fixture DB | hot-reload / process-manager restart (systemd, pm2) / PR |
| Docker / compose | sensors or webhook | compose project in sandbox | rolling container replace / PR |
| Kubernetes *(phase 5)* | sensors or webhook | k8s Job sandbox | rolling deploy / PR |
| PaaS (Railway / Render / Fly) | webhook | direct boot or platform image | PR → git deploy |
| Serverless functions (Vercel / Netlify / Lambda) | webhook | platform CLI dev mode | PR → git deploy |
| Cloudflare Workers / Pages | webhook / logpush | `wrangler dev` (miniflare, local bindings) | PR → CI `wrangler deploy` |
| Static SPA + API | API webhook + optional DOM sensors | Playwright (SPA) + API adapter | PR → platform deploy |

**Where *AEGIS itself* runs:**

| Edition | Supported hosts |
|---|---|
| Agent | GitHub Actions, GitLab CI (any CI with ephemeral runners) |
| Live | same VM/server as the app (recommended — enables sensors + hot-heal), separate machine, Docker compose bundle, PaaS worker (Railway/Render) |

Key property: **AEGIS lives next to the repo and/or the machine — never
inside the app's runtime.** Serverless targets are fully supported because
reproduction happens through adapters on Aegis's own runner, and healing
flows through git.

## 5. Agent & model layer

- **Default harness: Pi** (`@mariozechner/pi-coding-agent`) — open-source,
  minimal, extensible, headless-capable, with a **unified LLM API**: one key
  swap changes the brain. The patch contract ships as a Pi extension /
  prompt template.
- **Pluggable agents:** any coding agent that can run headless on a Linux
  runner can fill the PATCH slot (interface: takes task context, returns a
  diff). The kernel never assumes a specific agent or vendor.
- **Model policy:** provider-agnostic — hosted APIs, open-weights on
  dedicated endpoints, or local models. Per-incident token accounting is
  reported in every incident card.
- **Language-agnostic toward the app:** AEGIS reads and runs the app
  (git + process adapters); it never requires the app to be written in
  Aegis's language. Embedded-sensor SDKs are the only per-language artifact
  (Node/TS first, Python next).

## 6. Trust ladder & safety system (universal)

| Level | Agent edition | Live edition |
|---|---|---|
| 0 — default | PR only, human merges | PR + proposed apply command |
| 1 | auto-merge if suite green **and** diff ≤ N files | auto-apply with health-check window |
| 2 | auto-merge any green diff | auto-apply + auto-rollback watch |

**Auto-rollback (Live edition's license to operate):** after any in-place
heal, the daemon watches health checks, invariants, and synthetic probes
for a window (default 15 min). Any regression → automatic `git revert`,
reload, incident reopened. A heal is only *recorded* as healed after the
window passes clean.

Non-negotiable rails at every level: locked symptom-derived tests; existing
suite must stay green; sandboxes/CI runners get no production secrets;
daily incident quota; per-run token ceiling; kill switch (`aegis pause`)
effective instantly since every execution is stateless against a queue.

## 7. Repository layout (monorepo)

```
aegis/
├── packages/
│   ├── core/            # pipeline FSM, contracts, incident store, medical
│   │                    # record, safety rails, CLI (`aegis init|run|pause`)
│   ├── adapters/
│   │   ├── detect/      # sentry-webhook, glitchtip, log-scraper, sensors-ingest
│   │   ├── repro/       # direct-boot, docker, wrangler, vercel-dev, none
│   │   └── heal/        # pr, hot-reload, restart, rolling
│   ├── agent-pi/        # Pi integration + patch-contract extension
│   ├── sdk-node/        # embedded sensors for Node/TS apps (Live)
│   └── ui/              # Live edition dashboard + medical record viewer
├── templates/
│   ├── workflow-github/ # one-file Agent edition install
│   └── compose-live/    # one-command Live edition install
├── examples/            # sample apps per deployment target (vm, fn, worker…)
└── docs/
```

**Install UX:**
- Agent edition: `npx aegis init` → answers 3 questions (where app runs,
  error source, trust level) → commits `.github/workflows/aegis.yml` + config.
- Live edition: `curl -fsSL aegis.sh | sh` or a compose bundle on your VM →
  `aegis attach <app>` instruments and begins watching.

## 8. Roadmap

**Phase 0 — Kernel foundations**
Core pipeline FSM, incident contracts, Medical Record format, CLI skeleton,
decision docs hardened from the two architecture references.
*Exit:* an incident can flow end-to-end through the FSM with a stub agent.

**Phase 1 — AEGIS Agent MVP (the fastest path to real users)**
Sentry webhook → Cloudflare Worker dispatcher (or GH webhook directly) →
GitHub Actions → Pi patch → PR with incident card. Server-app repro adapter
(direct boot) only. Trust level 0–1.
*Exit:* 3 real external repos heal a real exception end-to-end; ≤15 min
exception-to-PR; one merged heal with green CI in each.

**Phase 2 — Coverage**
Repro adapters: Vercel/Netlify functions, Cloudflare Workers (wrangler),
docker-compose, PaaS images. GlitchTip/Bugsnag sources. GitLab CI. Trust
level 2. Diagnosis-only mode polish. Quota/budget dashboards in incident
cards.
*Exit:* the deployment matrix (§4) is fully green in integration tests.

**Phase 3 — AEGIS Live MVP**
Daemon + Node sensor SDK (exception hook, invariant checks, action log) +
sandbox pool + in-place heal with auto-rollback window + live pipeline UI.
Target: direct-boot apps on VMs/dedicated servers first.
*Exit:* a seeded failure heals in-place on a running VM app with session
intact and a passing rollback drill (regression injected post-heal → auto
revert fires).

**Phase 4 — Depth**
DOM observer + screenshot-diff module (visual failure class); Python sensor
SDK; docker rolling-replace heal; Medical Record viewer as first-class UI;
multi-app daemon.
*Exit:* a non-crash failure (bad state, HTTP 200) healed live — the class
no error tracker can even see.

**Phase 5 — 1.0 and scale**
Kubernetes target (Job sandbox, rolling deploy), hardened security review
(sandbox escape, secret handling, prompt-injection from stack traces),
extension API for community adapters/agents, hosted-dispatcher option,
usage telemetry (opt-in).
*Exit:* 1.0 tag, security audit published, third-party adapter merged.

## 9. Success metrics

- **Heal rate:** incidents healed-and-merged ÷ incidents triaged (target ≥50% by Phase 2)
- **Time-to-PR / time-to-heal:** median exception → PR (Agent), → live heal (Live)
- **Regression escape rate:** healed PRs that later reverted or caused new incidents (target <2%)
- **Trust adoption:** share of users at each trust level over time
- **Cost per heal:** median tokens + compute per incident

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Agent games the test | symptom-derived test hashed & locked read-only (structural, not polite) |
| PR/incident spam | fingerprint dedupe + daily quota + ignore lists in TRIAGE |
| Bad patch reaches users | trust ladder, suite gates, Live auto-rollback window |
| Prompt injection via stack traces/logs | untrusted data quarantined in prompts, sandboxed runner, no secrets, diff review gates |
| Flaky repro across targets | adapter contract + 2-strike diagnosis-only fallback |
| Model cost runaway | per-run ceilings, quotas, cheap-model defaults for triage/diagnose |
| "Another AIOps tool" skepticism | Medical Record as default-public proof; every heal auditable in git |

## 11. What changed vs the earlier docs

- Hackathon-specific elements removed: Meta-model mandates, demo beats,
  judge scorecards, 10-day build plan. Models/agents are now a pluggable
  layer (Pi default).
- The two architectures became **editions of one product** on a shared
  kernel, chosen by config (`aegis init`), not separate projects.
- Added: full deployment-target matrix (VM/dedicated/container/PaaS/
  functions/Workers), auto-rollback safety for live heals, install UX,
  phased roadmap with exit criteria, and success metrics.
