# Threat model v1 (Security review owner)

## Assets
Production apps, production secrets, the app's git history, CI minutes, model keys.

## Attackers / vectors
1. **Prompt injection via stack traces/logs/app output (D-21).** All app-derived
   text is untrusted: quarantined with explicit delimiters in every prompt, never
   interpreted as instructions; sandboxed execution; no secrets in sandbox;
   outgoing diffs always pass VERIFY gates regardless of trust level.
   Covered by `packages/core/src/quarantine.ts` + red-team suite (P5-T02).
2. **Sandbox escape / secret exfiltration.** Sandboxes and CI runners get **no
   production secrets, ever** (D-16). `DirectBootReproAdapter` strips secret-like
   env vars and only adds fixture env. Pool isolation reviewed in P3-T04.
3. **Bad patch reaches users.** Trust ladder (D-17) + VERIFY gates (locked test +
   suite green) + Live auto-rollback window (D-18).
4. **PR/incident spam.** Fingerprint dedupe (D-20) + daily quota (D-16) in TRIAGE.
5. **Model cost runaway.** Per-run token ceilings + per-incident accounting (D-13, D-16).
6. **Supply chain.** No native deps; lockfile committed; extension API adapters
   run the conformance kit before merge (P5-T03).

## Non-goals
AEGIS does not sandbox the patch agent beyond runner isolation; the VERIFY gate
is the enforcement point (a gamed test fails closed: heal rejected).
