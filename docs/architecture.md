# AEGIS architecture

Both editions share one kernel. Only the adapters change.

```
┌─────────────────────────────────────────────┐
│              AEGIS CORE (packages/core)     │
│  pipeline FSM · contracts · incident store  │
│  medical record · safety rails · CLI        │
└───────▲─────────────────────────▲───────────┘
Agent edition  │                         │  Live edition
CI runner      │                         │  Daemon + sensors + sandbox pool
webhook → triage → repro → Pi patch → verify → PR / in-place heal + rollback
```

Pipeline: `DETECT → TRIAGE → REPRODUCE → DIAGNOSE → TEST(lock) → PATCH → VERIFY → HEAL → REMEMBER`.
Terminal states `IRREPRODUCIBLE`, `PATCH_BUDGET_EXHAUSTED`, `REGRESSION` all produce
a diagnosis-only report marked **unverified**.

Key files:
- contracts: `packages/core/src/types.ts` (frozen; changes need an ADR)
- FSM: `packages/core/src/fsm.ts`
- pipeline runner: `packages/core/src/pipeline.ts`
- daemon: `packages/core/src/daemon-run.ts`
