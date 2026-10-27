# AEGIS 1.0 — Security audit (published, P5-T07)

Scope: full-matrix regression at 1.0 — kernel, all adapters, daemon, UI, dispatcher,
sandbox isolation, secret handling, prompt-injection suite (threat model: `docs/threat-model.md`).

## Findings
1. **Prompt injection via traces/logs (D-21).** PASS — every app-derived string is
   quarantined (`quarantine.ts`); red-team suite `packages/core/tests/security.test.ts`
   covers override instructions, delimiter breakouts, and smuggled merge approvals.
2. **Production secrets in sandboxes/runners (D-16).** PASS — `DirectBootReproAdapter`
   strips secret-like env vars and adds fixture env only; CI template documents
   model-keys-only secrets; `secrets.test.ts` asserts no secret value reaches adapter output.
3. **Heal without rollback.** PASS — HealAdapter contract requires rollback plan +
   executor; `conformHeal` enforces it for every adapter including third-party.
4. **Locked-test gaming (D-14).** PASS — TEST stage hashes the symptom test, mounts
   read-only (chmod 444), VERIFY rejects hash mismatches; `verifyLockedTestIntact`
   is checked before any suite result is trusted.
5. **Sandbox escape surface.** ACCEPTED WITH MITIGATION — repro runs target code in
   CI-runner/sandbox processes (no container boundary by default on direct-boot);
   mitigation: no secrets, fixture DB only, timeouts, and docker/k8s adapters for
   untrusted targets. Documented in `docs/threat-model.md`.
6. **Telemetry privacy (P5-T05).** PASS — off by default; on = 7 documented fields only.

## Verdict
No blocking findings. The five PASS items are enforced by CI tests; item 5 is a
documented accepted risk with mitigations, approved by the Orchestrator.
